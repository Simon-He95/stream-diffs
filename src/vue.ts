import type { DiffLineAnnotation, FileOptions, LineAnnotation, UnresolvedFileOptions } from '@pierre/diffs'
import type { WorkerPoolManager } from '@pierre/diffs/worker'
import type { PropType } from 'vue'
import type { DiffSurfaceController } from './DiffSurfaceController'
import type { CodeStreamController } from './CodeStreamController'
import type { DiffStreamController } from './DiffStreamController'
import type { CodeStreamOptions, DiffStreamOptions } from './types'
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createCodeStream } from './CodeStreamController'
import { createDiffSurface } from './DiffSurfaceController'
import { createDiffStream } from './DiffStreamController'

function observeActualVisibility(target: () => HTMLElement | undefined, onVisible: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible()
    return () => {}
  }

  const element = target()
  if (!element)
    return () => {}

  let observer: IntersectionObserver | undefined
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
      return
    observer?.disconnect()
    observer = undefined
    onVisible()
  })
  observer.observe(element)
  return () => observer?.disconnect()
}

export const StreamCode = defineComponent({
  name: 'StreamCode',
  props: {
    code: { type: String, default: '' },
    language: { type: String, default: 'text' },
    fileName: String,
    loading: { type: Boolean, default: false },
    lineNumbers: { type: Boolean, default: true },
    wrap: { type: Boolean, default: false },
    maxHeight: [Number, String],
    theme: [String, Object],
    options: { type: Object as PropType<CodeStreamOptions>, default: () => ({}) },
    fileOptions: { type: Object as PropType<FileOptions<unknown>>, default: () => ({}) },
    annotations: { type: Array as PropType<LineAnnotation<unknown>[]>, default: () => [] },
    workerManager: Object as PropType<WorkerPoolManager>,
  },
  setup(props, { expose }) {
    const root = ref<HTMLElement>()
    let controller: CodeStreamController | undefined
    let visible = false
    let stopVisibility = () => {}
    const finalizeWhenReady = async () => {
      if (!visible || props.loading || controller?.getState() !== 'streaming')
        return
      await controller.finalize({ view: 'file', ...props.fileOptions, annotations: props.annotations })
    }
    onMounted(async () => {
      controller = createCodeStream({
        ...props.options,
        language: props.language,
        fileName: props.fileName,
        lineNumbers: props.lineNumbers,
        wrap: props.wrap,
        maxHeight: props.maxHeight,
        theme: props.theme as any,
        workerManager: props.workerManager,
      })
      controller.append(props.code)
      await controller.mount(root.value!)
      stopVisibility = observeActualVisibility(() => root.value, () => {
        visible = true
        void finalizeWhenReady()
      })
      await finalizeWhenReady()
    })
    watch(() => props.code, async (code) => {
      if (!controller)
        return
      const current = controller.getText()
      if (code.startsWith(current))
        controller.append(code.slice(current.length))
      else {
        await controller.reset(code)
        await finalizeWhenReady()
      }
    })
    watch(() => props.language, language => void controller?.setLanguage(language))
    watch(() => props.theme, theme => void controller?.setTheme(theme as any))
    watch(() => props.loading, () => void finalizeWhenReady())
    watch(() => props.annotations, annotations => controller?.getFinalizedSurface()?.setAnnotations(annotations), { deep: true })
    watch(() => props.fileOptions, options => void controller?.getFinalizedSurface()?.setOptions(options), { deep: true })
    onBeforeUnmount(() => {
      stopVisibility()
      controller?.dispose()
    })
    expose({ getController: () => controller })
    return () => h('div', { ref: root, class: 'stream-diffs-vue-code' })
  },
})

export const StreamDiff = defineComponent({
  name: 'StreamDiff',
  props: {
    original: { type: String, required: true },
    modified: { type: String, required: true },
    language: { type: String, default: 'text' },
    fileName: { type: String, default: 'file.txt' },
    loading: { type: Boolean, default: false },
    diffStyle: { type: String as () => 'unified' | 'split', default: 'unified' },
    options: { type: Object as PropType<DiffStreamOptions<unknown>>, default: () => ({}) },
    annotations: { type: Array as PropType<DiffLineAnnotation<unknown>[]>, default: () => [] },
    workerManager: Object as PropType<WorkerPoolManager>,
  },
  setup(props, { expose }) {
    const root = ref<HTMLElement>()
    let controller: DiffStreamController | undefined
    let visible = false
    let stopVisibility = () => {}
    const finalizeWhenReady = async () => {
      if (!visible || props.loading || controller?.getState() !== 'streaming')
        return
      await controller.finalize(props.annotations)
    }
    onMounted(async () => {
      controller = createDiffStream({
        ...props.options,
        fileName: props.fileName,
        language: props.language,
        diffStyle: props.diffStyle,
        workerManager: props.workerManager,
      })
      await controller.mount(root.value!, props.original, props.modified)
      stopVisibility = observeActualVisibility(() => root.value, () => {
        visible = true
        void finalizeWhenReady()
      })
      await finalizeWhenReady()
    })
    watch([() => props.original, () => props.modified], ([original, modified]) => {
      void controller?.update(original, modified)
    })
    watch(() => props.language, language => void controller?.setLanguage(language))
    watch(() => props.loading, () => void finalizeWhenReady())
    watch(() => props.annotations, annotations => controller?.getFinalizedSurface()?.setAnnotations(annotations), { deep: true })
    onBeforeUnmount(() => {
      stopVisibility()
      controller?.dispose()
    })
    expose({ getController: () => controller })
    return () => h('div', { ref: root, class: 'stream-diffs-vue-diff' })
  },
})

export const StreamMergeConflict = defineComponent({
  name: 'StreamMergeConflict',
  props: {
    code: { type: String, required: true },
    language: { type: String, default: 'text' },
    fileName: { type: String, default: 'file.txt' },
    options: { type: Object as PropType<UnresolvedFileOptions<unknown>>, default: () => ({}) },
    annotations: { type: Array as PropType<DiffLineAnnotation<unknown>[]>, default: () => [] },
    workerManager: Object as PropType<WorkerPoolManager>,
  },
  setup(props, { expose }) {
    const root = ref<HTMLElement>()
    let controller: DiffSurfaceController | undefined
    const file = (contents: string) => ({ name: props.fileName, contents, lang: props.language })
    onMounted(async () => {
      controller = createDiffSurface({
        kind: 'merge-conflict',
        file: file(props.code),
        annotations: props.annotations,
        workerManager: props.workerManager,
        options: props.options,
      })
      await controller.mount(root.value!)
    })
    watch([() => props.code, () => props.language, () => props.fileName, () => props.annotations], ([code, _language, _fileName, annotations]) => void controller?.updateMergeConflict(file(code), annotations))
    watch(() => props.options, options => void controller?.setOptions(options), { deep: true })
    onBeforeUnmount(() => controller?.dispose())
    expose({ getController: () => controller })
    return () => h('div', { ref: root, class: 'stream-diffs-vue-merge-conflict' })
  },
})

export default { StreamCode, StreamDiff, StreamMergeConflict }
