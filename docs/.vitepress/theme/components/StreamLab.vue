<script setup lang="ts">
import type { CodeStreamController, CodeStreamStats } from 'stream-diffs'
import { createCodeStream } from 'stream-diffs'
import { useData, withBase } from 'vitepress'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CodePane from './CodePane.vue'

const { isDark } = useData()

interface StreamSample {
  id: string
  label: string
  fileName: string
  language: string
  original: string
  source: string
}

const samples: StreamSample[] = [
  {
    id: 'invoice',
    label: 'TypeScript function',
    fileName: 'src/billing/loadInvoice.ts',
    language: 'typescript',
    original: `export async function loadInvoice(id: string) {
  const response = await fetch(\`/api/invoices/\${id}\`)
  return response.json()
}
`,
    source: `export async function loadInvoice(id: string) {
  if (!id.trim())
    throw new Error('Missing invoice id')

  const response = await fetch(\`/api/invoices/\${id}\`)
  if (!response.ok)
    throw new Error(\`Invoice request failed: \${response.status}\`)
  return response.json()
}
`,
  },
  {
    id: 'python',
    label: 'Python worker',
    fileName: 'workers/sync_orders.py',
    language: 'python',
    original: `def fetch_orders(client):
    page = 1
    while True:
        batch = client.orders(page=page, per_page=100)
        if not batch:
            break
        yield from batch
        page += 1
`,
    source: `def fetch_orders(client):
    cursor = None
    seen_cursors = set()

    while True:
        batch = client.orders(cursor=cursor, limit=100)
        yield from batch.items

        if not batch.next_cursor:
            break
        if batch.next_cursor in seen_cursors:
            raise RuntimeError("Pagination cursor repeated")
        seen_cursors.add(batch.next_cursor)
        cursor = batch.next_cursor
`,
  },
  {
    id: 'sql',
    label: 'SQL migration',
    fileName: 'migrations/0042_events.sql',
    language: 'sql',
    original: `select id, payload, created_at
from events
where created_at > now() - interval '7 days';
`,
    source: `create index concurrently if not exists events_created_at_idx
  on events (created_at desc);

select id, payload, created_at
from events
where created_at > now() - interval '7 days'
order by created_at desc
limit 100;
`,
  },
  {
    id: 'markdown',
    label: 'Markdown answer',
    fileName: 'answers/onboarding.md',
    language: 'markdown',
    original: `# Setting up the workspace

Run the installer and follow the prompts.
`,
    source: `# Setting up the workspace

Run the installer, choose a workspace name, then invite one teammate.
The first render should finish in under 400 ms on a standard laptop.

## Verify the install

1. Open the sample project.
2. Confirm that the diff surface is interactive.
3. Run \`pnpm test\` to check the local toolchain.
`,
  },
]

const sampleId = ref(samples[0].id)
const sample = computed(() => samples.find(item => item.id === sampleId.value) ?? samples[0])
const source = ref(samples[0].source)
const fileName = ref(samples[0].fileName)
const language = ref(samples[0].language)
const original = ref(samples[0].original)
const speed = ref(22)
const finishAs = ref<'file' | 'diff'>('file')
const phase = ref<'idle' | 'streaming' | 'paused' | 'done' | 'error'>('idle')
const message = ref('Press Start to stream this file')
const copied = ref(false)
const paused = ref(false)
const stats = ref<CodeStreamStats>({ characters: 0, lines: 0, writes: 0, resets: 0, renderMode: 'plain-text', overflowed: false })
const elapsed = ref(0)
const host = ref<HTMLElement>()

const theme = { dark: 'pierre-dark', light: 'pierre-light' } as const

let controller: CodeStreamController | undefined
let runId = 0
let disposed = false
let pausedFlag = false
let finishRequested = false
let startedAt = 0
let statsTimer: ReturnType<typeof setInterval> | undefined
let copyTimer: ReturnType<typeof setTimeout> | undefined

const themed = computed(() => (isDark.value ? 'dark' : 'light'))
const framesPerChunk = computed(() => speed.value <= 10 ? 1 : speed.value <= 22 ? 2 : 4)

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

function chunks(value: string) {
  const result: string[] = []
  let cursor = 0
  while (cursor < value.length) {
    const size = 4 + ((cursor * 5 + 3) % 8)
    result.push(value.slice(cursor, cursor + size))
    cursor += size
  }
  return result
}

function refreshStats() {
  if (!controller)
    return
  stats.value = controller.getStats()
  elapsed.value = startedAt ? Math.round(performance.now() - startedAt) : 0
}

function stopStatsTimer() {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = undefined
  }
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(source.value)
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => copied.value = false, 1400)
  }
  catch {
    message.value = 'Clipboard is unavailable in this browser'
  }
}

function applySample(id: string) {
  const next = samples.find(item => item.id === id)
  if (!next)
    return
  sampleId.value = next.id
  fileName.value = next.fileName
  language.value = next.language
  original.value = next.original
  source.value = next.source
  phase.value = 'idle'
  message.value = `Loaded ${next.label}`
  void start()
}

async function start() {
  if (!host.value || disposed)
    return
  const current = ++runId
  pausedFlag = false
  paused.value = false
  finishRequested = false
  phase.value = 'streaming'
  copied.value = false
  message.value = 'Streaming plain text while chunks arrive'
  controller?.dispose()
  controller = undefined
  host.value.replaceChildren()
  startedAt = performance.now()
  elapsed.value = 0

  const next = createCodeStream({
    fileName: fileName.value,
    language: language.value,
    theme,
    themeType: themed.value,
    lineNumbers: true,
    showHeader: false,
    maxHeight: 380,
    autoScroll: 'always',
    onStateChange(state) {
      if (state === 'error')
        phase.value = 'error'
    },
    onError(error) {
      phase.value = 'error'
      message.value = error instanceof Error ? error.message : String(error)
    },
  })

  try {
    await next.mount(host.value)
    if (disposed || current !== runId) {
      next.dispose()
      return
    }
    controller = next

    stopStatsTimer()
    statsTimer = setInterval(refreshStats, 120)

    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const chunk of chunks(source.value)) {
      if (disposed || current !== runId)
        return
      if (finishRequested)
        break
      while (pausedFlag && !finishRequested && current === runId)
        await nextFrame()
      if (disposed || current !== runId || finishRequested)
        break
      next.append(chunk)
      refreshStats()
      if (!instant) {
        for (let frame = 0; frame < framesPerChunk.value; frame++)
          await nextFrame()
      }
    }

    if (disposed || current !== runId)
      return
    refreshStats()
    message.value = finishAs.value === 'diff' ? 'Finalizing an accurate diff' : 'Finalizing an interactive file'
    if (finishAs.value === 'diff') {
      await next.finalize({
        view: 'diff',
        original: original.value,
        diffStyle: 'split',
        theme,
        themeType: themed.value,
        enableLineSelection: true,
        diffIndicators: 'bars',
        lineDiffType: 'word-alt',
        overflow: 'wrap',
      })
    }
    else {
      await next.finalize({
        view: 'file',
        theme,
        themeType: themed.value,
        enableLineSelection: true,
        overflow: 'scroll',
        useTokenTransformer: true,
      })
    }
    if (disposed || current !== runId)
      return
    await next.whenVisualReady()
    if (disposed || current !== runId)
      return
    stopStatsTimer()
    refreshStats()
    phase.value = 'done'
    message.value = 'Final surface is interactive. Select lines or inspect the diff.'
  }
  catch (error) {
    if (disposed || current !== runId)
      return
    stopStatsTimer()
    phase.value = 'error'
    message.value = error instanceof Error ? error.message : String(error)
  }
}

function togglePause() {
  if (phase.value === 'streaming') {
    pausedFlag = true
    paused.value = true
    phase.value = 'paused'
    message.value = 'Paused. Resume or finish the stream.'
  }
  else if (phase.value === 'paused') {
    pausedFlag = false
    paused.value = false
    phase.value = 'streaming'
    message.value = 'Streaming again'
  }
}

function finishNow() {
  if (phase.value !== 'streaming' && phase.value !== 'paused')
    return
  pausedFlag = false
  paused.value = false
  finishRequested = true
  message.value = 'Finishing with the text received so far'
}

function reset() {
  ++runId
  stopStatsTimer()
  pausedFlag = false
  paused.value = false
  finishRequested = false
  controller?.dispose()
  controller = undefined
  if (host.value)
    host.value.replaceChildren()
  stats.value = { characters: 0, lines: 0, writes: 0, resets: 0, renderMode: 'plain-text', overflowed: false }
  elapsed.value = 0
  phase.value = 'idle'
  copied.value = false
  message.value = 'Reset. Press Start to stream again.'
}

function customize() {
  phase.value = 'idle'
  message.value = 'Custom source ready. Press Start to stream it.'
}

watch(isDark, () => {
  controller?.setThemeType(isDark.value ? 'dark' : 'light')
})

onMounted(async () => {
  await nextTick()
  await nextFrame()
  if (!disposed && phase.value === 'idle')
    void start()
})

onBeforeUnmount(() => {
  disposed = true
  ++runId
  stopStatsTimer()
  clearTimeout(copyTimer)
  controller?.dispose()
  controller = undefined
})
</script>

<template>
  <div class="sd-stream-lab">
    <div class="sd-stream-head">
      <div>
        <h2>Streaming lab</h2>
        <p>Stream deltas as plain text, then finalize into a highlighted file or diff.</p>
      </div>
      <a class="sd-text-link" :href="withBase('/guide/streaming.html')">Streaming guide</a>
    </div>

    <div class="sd-stream-toolbar">
      <div class="sd-control-group sd-control-inline">
        <label class="sd-control-label" for="sd-stream-sample">Sample</label>
        <select id="sd-stream-sample" class="sd-select" :value="sampleId" @change="applySample(($event.target as HTMLSelectElement).value)">
          <option v-for="item in samples" :key="item.id" :value="item.id">
            {{ item.label }}
          </option>
        </select>
      </div>

      <div class="sd-control-group sd-control-inline">
        <label class="sd-control-label" for="sd-stream-speed">Speed</label>
        <select id="sd-stream-speed" v-model.number="speed" class="sd-select">
          <option :value="10">Fast</option>
          <option :value="22">Normal</option>
          <option :value="45">Slow</option>
        </select>
      </div>

      <div class="sd-control-group sd-control-inline">
        <span class="sd-control-label">Finish as</span>
        <div class="sd-segmented" role="group" aria-label="Finalize target">
          <button type="button" :class="{ active: finishAs === 'diff' }" @click="finishAs = 'diff'">
            Diff
          </button>
          <button type="button" :class="{ active: finishAs === 'file' }" @click="finishAs = 'file'">
            File
          </button>
        </div>
      </div>

      <div class="sd-stream-actions">
        <button type="button" class="sd-btn sd-btn-primary" :disabled="phase === 'streaming'" @click="start">
          {{ phase === 'done' || phase === 'error' ? 'Replay' : 'Start' }}
        </button>
        <button type="button" class="sd-btn sd-btn-quiet" :disabled="phase !== 'streaming' && phase !== 'paused'" @click="togglePause">
          {{ paused ? 'Resume' : 'Pause' }}
        </button>
        <button type="button" class="sd-btn sd-btn-quiet" :disabled="phase !== 'streaming' && phase !== 'paused'" @click="finishNow">
          Finish now
        </button>
        <button type="button" class="sd-btn sd-btn-quiet" @click="reset">
          Reset
        </button>
      </div>
    </div>

    <div class="sd-stream-grid">
      <div class="sd-stream-source">
        <CodePane
          v-model="source"
          label="Source to stream"
          :file-name="fileName"
          :language="language"
          :disabled="phase === 'streaming' || phase === 'paused'"
        />
        <p class="sd-hint">
          Edit the source, then press Start. The final diff compares against the sample baseline.
        </p>
        <button type="button" class="sd-btn sd-btn-wide" :disabled="phase === 'streaming' || phase === 'paused'" @click="customize">
          Use this source
        </button>
      </div>

      <section class="sd-stream-output" aria-label="Streamed output">
        <div class="sd-render-head">
          <div class="sd-render-title">
            <span>Output</span>
            <span class="sd-chip" :data-phase="phase">{{ phase }}</span>
            <span class="sd-chip">{{ stats.renderMode }}</span>
          </div>
          <div class="sd-stream-head-actions">
            <span class="sd-stream-message">{{ message }}</span>
            <button v-if="phase === 'done'" class="sd-copy-output" type="button" @click="copyOutput">
              {{ copied ? 'Copied' : 'Copy output' }}
            </button>
          </div>
        </div>
        <div ref="host" class="sd-render-host sd-stream-host" />
        <div class="sd-stats">
          <span><strong>{{ stats.characters }}</strong> chars</span>
          <span><strong>{{ stats.lines }}</strong> lines</span>
          <span><strong>{{ stats.writes }}</strong> writes</span>
          <span><strong>{{ elapsed }}</strong> ms</span>
        </div>
      </section>
    </div>
  </div>
</template>
