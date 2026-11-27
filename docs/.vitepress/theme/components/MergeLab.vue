<script setup lang="ts">
import type { DiffSurfaceController } from 'stream-diffs'
import { createDiffSurface } from 'stream-diffs'
import { useData } from 'vitepress'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mergeSample } from '../data/samples'
import CodePane from './CodePane.vue'

const { isDark } = useData()
const source = ref(mergeSample.contents)
const status = ref('Preparing the merge surface')
const error = ref('')
const resolved = ref('')
const remaining = ref(0)
const host = ref<HTMLElement>()

const theme = { dark: 'pierre-dark', light: 'pierre-light' } as const

let surface: DiffSurfaceController | undefined
let disposed = false

function markerCount(value: string) {
  return (value.match(/^<<<<<<< /gm) ?? []).length
}

function createSurface() {
  return createDiffSurface({
    kind: 'merge-conflict',
    file: { name: mergeSample.fileName, contents: source.value, lang: mergeSample.language },
    options: {
      theme,
      themeType: isDark.value ? 'dark' : 'light',
      mergeConflictActionsType: 'default',
      expandUnchanged: true,
      useTokenTransformer: true,
      overflow: 'wrap',
      disableFileHeader: false,
    },
  })
}

function mountSurface() {
  if (!host.value || disposed)
    return
  error.value = ''
  remaining.value = markerCount(source.value)
  surface = createSurface()
  surface.mount(host.value)
    .then(() => {
      status.value = remaining.value
        ? `${remaining.value} conflict${remaining.value === 1 ? '' : 's'} ready to resolve`
        : 'No conflict markers found in this file'
    })
    .catch((cause) => {
      error.value = cause instanceof Error ? cause.message : String(cause)
      status.value = 'Could not render this conflict file'
    })
}

function resolveWith(resolution: 'current' | 'incoming' | 'both') {
  if (!surface)
    return
  const file = surface.resolveConflict(0, resolution)
  remaining.value = Math.max(0, remaining.value - 1)
  if (file) {
    resolved.value = file.contents
    status.value = `Resolved one conflict as ${resolution}. ${remaining.value} remaining in this demo.`
  }
  else {
    status.value = 'No conflict left to resolve'
  }
}

function reset() {
  surface?.dispose()
  surface = undefined
  resolved.value = ''
  source.value = mergeSample.contents
  remaining.value = markerCount(source.value)
  status.value = 'Rebuilding the merge surface'
  mountSurface()
}

watch(isDark, (dark) => {
  surface?.setThemeType(dark ? 'dark' : 'light')
})

onMounted(mountSurface)

onBeforeUnmount(() => {
  disposed = true
  surface?.dispose()
  surface = undefined
})
</script>

<template>
  <div class="sd-merge-lab">
    <div class="sd-merge-grid">
      <div class="sd-merge-input">
        <CodePane
          v-model="source"
          label="Conflict file"
          :file-name="mergeSample.fileName"
          :language="mergeSample.language"
        />
        <p class="sd-hint">
          Git conflict markers are parsed on mount. The buttons below call the same resolver your app would call after a review.
        </p>
        <div class="sd-merge-actions">
          <button type="button" class="sd-btn sd-btn-quiet" :disabled="remaining === 0" @click="resolveWith('current')">
            Resolve current
          </button>
          <button type="button" class="sd-btn sd-btn-quiet" :disabled="remaining === 0" @click="resolveWith('incoming')">
            Resolve incoming
          </button>
          <button type="button" class="sd-btn sd-btn-primary" :disabled="remaining === 0" @click="resolveWith('both')">
            Keep both
          </button>
          <button type="button" class="sd-btn sd-btn-quiet" @click="reset">
            Reset
          </button>
        </div>
      </div>

      <section class="sd-merge-output" aria-label="Rendered merge conflict">
        <div class="sd-render-head">
          <div class="sd-render-title">
            <span>Resolve in the surface</span>
            <span class="sd-chip">{{ remaining }} left</span>
          </div>
        </div>
        <div ref="host" class="sd-render-host" />
        <p v-if="error" class="sd-error">
          {{ error }}
        </p>
        <div class="sd-render-status" aria-live="polite">
          <span>{{ status }}</span>
        </div>
        <details v-if="resolved" class="sd-resolved" open>
          <summary>Latest resolved file</summary>
          <pre>{{ resolved }}</pre>
        </details>
      </section>
    </div>
  </div>
</template>
