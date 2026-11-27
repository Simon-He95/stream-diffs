<script setup lang="ts">
import type { CodeStreamController } from 'stream-diffs'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createCodeStream } from 'stream-diffs'

const host = ref<HTMLElement>()
const state = ref<'idle' | 'streaming' | 'ready' | 'error'>('idle')
const errorMessage = ref('')
const reducedMotion = ref(false)

let stream: CodeStreamController | undefined
let runId = 0
let disposed = false

const fileName = 'src/billing/categorizeCharge.ts'
const modified = `export type Band = 'refund' | 'standard' | 'large' | 'review'

export function categorizeCharge(amount: number): Band {
  if (!Number.isFinite(amount))
    throw new TypeError('amount must be a finite number')
  if (amount < 0)
    return 'refund'
  if (amount > 5_000)
    return 'review'
  return amount > 500 ? 'large' : 'standard'
}
`
const theme = { dark: 'pierre-dark', light: 'pierre-light' } as const

function chunks(source: string) {
  const result: string[] = []
  let cursor = 0
  while (cursor < source.length) {
    const size = 3 + ((cursor * 7 + 5) % 9)
    result.push(source.slice(cursor, cursor + size))
    cursor += size
  }
  return result
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

async function play() {
  if (!host.value)
    return
  const current = ++runId
  errorMessage.value = ''
  state.value = 'streaming'
  stream?.dispose()
  stream = undefined
  host.value.replaceChildren()

  const controller = createCodeStream({
    fileName,
    language: 'typescript',
    theme,
    themeType: 'dark',
    lineNumbers: true,
    showHeader: false,
    maxHeight: 318,
    autoScroll: 'near-bottom',
    onError(error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      state.value = 'error'
    },
  })

  try {
    await controller.mount(host.value)
    if (disposed || current !== runId) {
      controller.dispose()
      return
    }
    stream = controller

    for (const chunk of chunks(modified)) {
      if (disposed || current !== runId)
        return
      controller.append(chunk)
      if (!reducedMotion.value)
        await nextFrame()
    }

    if (disposed || current !== runId)
      return
    await controller.finalize({
      view: 'file',
      theme,
      themeType: 'dark',
      enableLineSelection: true,
      overflow: 'scroll',
    })
    await controller.whenVisualReady()
    if (!disposed && current === runId)
      state.value = 'ready'
  }
  catch (error) {
    if (disposed || current !== runId)
      return
    errorMessage.value = error instanceof Error ? error.message : String(error)
    state.value = 'error'
  }
}

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  void play()
})

onBeforeUnmount(() => {
  disposed = true
  runId += 1
  stream?.dispose()
})
</script>

<template>
  <div class="sd-hero-demo">
    <div class="sd-demo-toolbar">
      <div class="sd-demo-file">
        <span class="sd-demo-mark" aria-hidden="true">&gt;</span>
        <code>{{ fileName }}</code>
      </div>
      <div class="sd-demo-status" :data-state="state">
        <span class="sd-demo-dot" aria-hidden="true" />
        <span>{{ state === 'ready' ? 'highlighted' : state === 'error' ? 'render failed' : 'streaming' }}</span>
        <button class="sd-demo-replay" type="button" @click="play">
          Replay
        </button>
      </div>
    </div>
    <div ref="host" class="sd-demo-host" aria-label="Live streaming and highlighting demo" />
    <p v-if="errorMessage" class="sd-demo-error">
      {{ errorMessage }}
    </p>
  </div>
</template>
