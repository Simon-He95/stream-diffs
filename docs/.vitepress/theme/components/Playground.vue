<script setup lang="ts">
import type { DiffLineAnnotation, DiffSurfaceController, DiffSurfaceInput, SelectedLineRange } from 'stream-diffs'
import { createDiffSurface } from 'stream-diffs'
import { useData, withBase } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { codeSamples } from '../data/samples'
import CodePane from './CodePane.vue'

interface Annotation {
  author: string
  body: string
}

const { isDark } = useData()

const sampleId = ref(codeSamples[0].id)
const sample = computed(() => codeSamples.find(item => item.id === sampleId.value) ?? codeSamples[0])
const original = ref(sample.value.original)
const modified = ref(sample.value.modified)
const fileName = ref(sample.value.fileName)
const language = ref(sample.value.language)

const diffStyle = ref<'unified' | 'split'>('unified')
const wrap = ref(true)
const lineNumbers = ref(true)
const annotationsOn = ref(true)
const tokenHoverOn = ref(true)
const selectionOn = ref(true)

const host = ref<HTMLElement>()
const status = ref('Preparing the renderer')
const error = ref('')
const hunkCount = ref(0)
const hoveredToken = ref('')
const selectedRange = ref('')
const resolved = ref('')
const hunkLabel = computed(() => `${hunkCount.value} hunk${hunkCount.value === 1 ? '' : 's'}`)
const remainingLabel = computed(() => `${hunkCount.value} hunk${hunkCount.value === 1 ? '' : 's'} left`)
const editing = ref(false)
const preparing = ref(false)
const busy = ref(false)
const canUndo = ref(false)
const canRedo = ref(false)

const theme = { dark: 'pierre-dark', light: 'pierre-light' } as const

let surface: DiffSurfaceController<Annotation> | undefined
let disposed = false
let scheduleTimer: ReturnType<typeof setTimeout> | undefined
let syncChain: Promise<void> = Promise.resolve()

const annotationList = computed<DiffLineAnnotation<Annotation>[]>(() => {
  const annotation = sample.value.annotation
  if (!annotationsOn.value || !annotation)
    return []
  return [{
    side: annotation.side,
    lineNumber: annotation.lineNumber,
    metadata: { author: annotation.author, body: annotation.body },
  }]
})

const selectionLabel = computed(() => {
  if (!selectedRange.value)
    return ''
  return selectedRange.value
})

const previewNotice = computed(() => {
  if (editing.value)
    return 'The editor owns the document until you stop the session.'
  return 'Edit either side. The diff refreshes after a short pause.'
})

function buildInput(): DiffSurfaceInput<Annotation> {
  return {
    kind: 'diff',
    oldFile: { name: fileName.value, contents: original.value, lang: language.value },
    newFile: { name: fileName.value, contents: modified.value, lang: language.value },
    annotations: annotationList.value,
    options: {
      theme,
      themeType: isDark.value ? 'dark' : 'light',
      diffStyle: diffStyle.value,
      diffIndicators: 'bars',
      lineDiffType: 'word-alt',
      disableLineNumbers: !lineNumbers.value,
      overflow: wrap.value ? 'wrap' : 'scroll',
      enableLineSelection: selectionOn.value,
      useTokenTransformer: true,
      renderAnnotation(annotation) {
        const node = document.createElement('div')
        node.className = 'sd-annotation'
        const author = document.createElement('strong')
        author.textContent = `${annotation.metadata.author}`
        const body = document.createElement('span')
        body.textContent = annotation.metadata.body
        node.append(author, body)
        return node
      },
      onTokenEnter(token) {
        if (!tokenHoverOn.value)
          return
        const text = token.tokenText.trim() || 'whitespace'
        hoveredToken.value = `${text} on line ${token.lineNumber}`
      },
      onTokenLeave() {
        hoveredToken.value = ''
      },
      onLineSelected(range: SelectedLineRange | null) {
        if (!range) {
          selectedRange.value = ''
          return
        }
        selectedRange.value = `${range.side ?? 'both'} lines ${range.start}-${range.end}`
      },
    },
  }
}

function setStatus(message: string) {
  status.value = message
}

function captureHunks() {
  const hunks = surface?.getDiff()?.hunks ?? []
  hunkCount.value = hunks.filter(hunk => hunk.hunkContent?.some(content => content.type !== 'context')).length
}

async function runSync() {
  if (!host.value || disposed)
    return
  busy.value = true
  error.value = ''
  try {
    if (!surface) {
      surface = createDiffSurface<Annotation>(buildInput())
      await surface.mount(host.value)
    }
    else {
      await surface.update(buildInput())
    }
    captureHunks()
    setStatus(hunkCount.value === 0 ? 'No changes between these sources' : `Rendered ${hunkCount.value} hunk${hunkCount.value === 1 ? '' : 's'}`)
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    setStatus('Render failed')
  }
  finally {
    busy.value = false
  }
}

function queueSync(delay = 180) {
  if (scheduleTimer)
    clearTimeout(scheduleTimer)
  scheduleTimer = setTimeout(() => {
    syncChain = syncChain.then(runSync)
  }, delay)
}

function applySample(id: string) {
  if (preparing.value)
    return
  const next = codeSamples.find(item => item.id === id)
  if (!next)
    return
  cancelEditing('discard')
  sampleId.value = next.id
  fileName.value = next.fileName
  language.value = next.language
  original.value = next.original
  modified.value = next.modified
  resolved.value = ''
  selectedRange.value = ''
  hoveredToken.value = ''
  setStatus(`Loaded ${next.label}`)
  queueSync(40)
}

function resetDemo() {
  applySample(sample.value.id)
}

async function startEditing() {
  if (!surface || editing.value || preparing.value)
    return
  preparing.value = true
  busy.value = true
  setStatus('Preparing a hydrated editor session')
  try {
    await surface.startEditing({
      onChange() {
        canUndo.value = surface?.canUndo() ?? false
        canRedo.value = surface?.canRedo() ?? false
        setStatus('Editing the after side')
      },
    }, `stream-diffs-playground-${sampleId.value}`)
    editing.value = true
    canUndo.value = surface.canUndo()
    canRedo.value = surface.canRedo()
    surface.focusEditor({ lineNumber: 1 })
    setStatus('Edit session ready. Type in the diff.')
  }
  catch (cause) {
    editing.value = false
    error.value = cause instanceof Error ? cause.message : String(cause)
    setStatus('Could not start the editor')
  }
  finally {
    preparing.value = false
    busy.value = false
  }
}

function stopEditing(reason: 'complete' | 'discard' = 'complete') {
  if (!surface || !editing.value)
    return
  const text = surface.getEditingText()
  surface.stopEditing(reason)
  editing.value = false
  canUndo.value = false
  canRedo.value = false
  if (reason === 'complete' && text != null) {
    modified.value = text
    setStatus('Edit session complete. Rebuilding the diff.')
    queueSync(40)
  }
  else {
    setStatus('Edit session discarded')
    queueSync(40)
  }
}

function cancelEditing(reason: 'complete' | 'discard') {
  if (surface && editing.value)
    stopEditing(reason)
  editing.value = false
}

function undo() {
  surface?.undo()
  canUndo.value = surface?.canUndo() ?? false
  canRedo.value = surface?.canRedo() ?? false
}

function redo() {
  surface?.redo()
  canUndo.value = surface?.canUndo() ?? false
  canRedo.value = surface?.canRedo() ?? false
}

function acceptReject(action: 'accept' | 'reject') {
  if (!surface)
    return
  if (editing.value)
    stopEditing('discard')
  const diff = surface.getDiff()
  if (!diff || hunkCount.value === 0) {
    setStatus('Nothing left to accept or reject')
    return
  }
  surface.acceptReject(0, action)
  captureHunks()
  resolved.value = surface.getResolvedFile()?.contents ?? ''
  setStatus(
    hunkCount.value === 0
      ? `${action === 'accept' ? 'Accepted' : 'Rejected'} hunk 1. No changed hunks remain.`
      : `${action === 'accept' ? 'Accepted' : 'Rejected'} hunk 1. ${remainingLabel.value}.`,
  )
}

function onSiteThemeChange(dark: boolean) {
  if (!surface)
    return
  surface.setThemeType(dark ? 'dark' : 'light')
}

watch([original, modified, language], () => {
  if (!editing.value && !preparing.value)
    queueSync()
})

watch([diffStyle, wrap, lineNumbers, annotationsOn, tokenHoverOn, selectionOn], () => {
  if (!editing.value && !preparing.value)
    queueSync(40)
})

watch(isDark, onSiteThemeChange)

watch(sampleId, (id) => {
  if (typeof window === 'undefined')
    return
  const url = new URL(window.location.href)
  url.searchParams.set('sample', id)
  window.history.replaceState({}, '', url)
})

onMounted(() => {
  const requested = new URLSearchParams(window.location.search).get('sample')
  if (requested && codeSamples.some(item => item.id === requested) && requested !== sampleId.value) {
    applySample(requested)
  }
  queueSync(0)
})

onBeforeUnmount(() => {
  disposed = true
  if (scheduleTimer)
    clearTimeout(scheduleTimer)
  editing.value = false
  surface?.dispose()
  surface = undefined
})
</script>

<template>
  <div class="sd-playground">
    <header class="sd-page-head">
      <p class="sd-page-kicker">Playground</p>
      <h1>Change the code. Watch the diff.</h1>
      <p class="sd-page-lede">
        Two live sources, one real renderer. Edit the inputs, switch layouts, annotate lines, then start an inline edit session on the rendered diff.
      </p>
    </header>

    <div class="sd-workbench">
      <div class="sd-workbench-main">
        <div class="sd-source-grid">
          <CodePane
            v-model="original"
            label="Before"
            :file-name="fileName"
            :language="language"
            :disabled="editing"
          />
          <CodePane
            v-model="modified"
            label="After"
            :file-name="fileName"
            :language="language"
            :disabled="editing"
          />
        </div>
        <p class="sd-hint">
          {{ previewNotice }}
        </p>

        <section class="sd-render" aria-label="Rendered diff">
          <div class="sd-render-head">
            <div class="sd-render-title">
              <span>Rendered diff</span>
              <span class="sd-chip">{{ hunkLabel }}</span>
              <span v-if="busy" class="sd-chip sd-chip-busy">working</span>
            </div>
            <div class="sd-render-actions">
              <button type="button" class="sd-btn sd-btn-quiet" :disabled="hunkCount === 0" @click="acceptReject('accept')">
                Accept hunk
              </button>
              <button type="button" class="sd-btn sd-btn-quiet" :disabled="hunkCount === 0" @click="acceptReject('reject')">
                Reject hunk
              </button>
              <button
                type="button"
                class="sd-btn sd-btn-primary"
                :disabled="busy"
                @click="editing ? stopEditing('complete') : startEditing()"
              >
                {{ editing ? 'Stop editing' : 'Edit inline' }}
              </button>
            </div>
          </div>

          <div v-if="editing" class="sd-edit-bar">
            <span class="sd-edit-state">Editing is live in the rendered surface</span>
            <span class="sd-edit-actions">
              <button type="button" class="sd-btn sd-btn-quiet" :disabled="!canUndo" @click="undo">
                Undo
              </button>
              <button type="button" class="sd-btn sd-btn-quiet" :disabled="!canRedo" @click="redo">
                Redo
              </button>
              <button type="button" class="sd-btn sd-btn-quiet" @click="stopEditing('discard')">
                Discard
              </button>
            </span>
          </div>

          <div ref="host" class="sd-render-host" />

          <p v-if="error" class="sd-error">
            {{ error }}
          </p>

          <div class="sd-render-status" aria-live="polite">
            <span>{{ status }}</span>
            <span v-if="hoveredToken" class="sd-status-item">token: {{ hoveredToken }}</span>
            <span v-if="selectionLabel" class="sd-status-item">selection: {{ selectionLabel }}</span>
          </div>

          <details v-if="resolved" class="sd-resolved">
            <summary>Resolved file after accept or reject</summary>
            <pre>{{ resolved }}</pre>
          </details>
        </section>
      </div>

      <aside class="sd-controls" :class="{ 'is-preparing': preparing }" aria-label="Playground controls">
        <div class="sd-control-group">
          <label class="sd-control-label" for="sd-sample">Example</label>
          <select id="sd-sample" class="sd-select" :value="sampleId" @change="applySample(($event.target as HTMLSelectElement).value)">
            <option v-for="item in codeSamples" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </select>
          <p class="sd-control-help">
            {{ sample.blurb }}
          </p>
        </div>

        <div class="sd-control-group">
          <label class="sd-control-label" for="sd-language">Language</label>
          <select id="sd-language" v-model="language" class="sd-select">
            <option value="typescript">TypeScript</option>
            <option value="tsx">TSX</option>
            <option value="javascript">JavaScript</option>
            <option value="vue">Vue</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
            <option value="sql">SQL</option>
            <option value="bash">Bash</option>
            <option value="yaml">YAML</option>
          </select>
        </div>

        <div class="sd-control-group">
          <span class="sd-control-label">Layout</span>
          <div class="sd-segmented" role="group" aria-label="Diff layout">
            <button type="button" :class="{ active: diffStyle === 'unified' }" @click="diffStyle = 'unified'">
              Unified
            </button>
            <button type="button" :class="{ active: diffStyle === 'split' }" @click="diffStyle = 'split'">
              Split
            </button>
          </div>
        </div>

        <div class="sd-control-group">
          <span class="sd-control-label">Options</span>
          <label class="sd-toggle">
            <input v-model="lineNumbers" type="checkbox">
            <span>Line numbers</span>
          </label>
          <label class="sd-toggle">
            <input v-model="wrap" type="checkbox">
            <span>Wrap long lines</span>
          </label>
          <label class="sd-toggle">
            <input v-model="annotationsOn" type="checkbox">
            <span>Annotations</span>
          </label>
          <label class="sd-toggle">
            <input v-model="tokenHoverOn" type="checkbox">
            <span>Token hover</span>
          </label>
          <label class="sd-toggle">
            <input v-model="selectionOn" type="checkbox">
            <span>Line selection</span>
          </label>
        </div>

        <div class="sd-control-group">
          <span class="sd-control-label">Actions</span>
          <button type="button" class="sd-btn sd-btn-quiet sd-btn-wide" @click="resetDemo">
            Reset this example
          </button>
          <a class="sd-text-link" :href="withBase('/guide/editing.html')">
            How editing works
          </a>
        </div>

        <p class="sd-control-note">
          Rendering and editing run on this page with the public controller API.
        </p>
      </aside>
    </div>
  </div>
</template>
