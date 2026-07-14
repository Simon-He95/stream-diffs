import type { FileContents } from '@pierre/diffs'
import type { WorkerPoolManager } from '@pierre/diffs/worker'
import { CodeStreamController } from './CodeStreamController'
import { DiffStreamController } from './DiffStreamController'
import { createDiffSurface, DiffSurfaceController } from './DiffSurfaceController'
import { fileContents } from './internal'

export interface StreamDiffsRuntimeOptions {
  MAX_HEIGHT?: number | string
  theme?: string | Record<string, unknown>
  themes?: Array<string | Record<string, unknown>>
  readOnly?: boolean
  lineNumbers?: boolean
  wordWrap?: 'on' | 'off' | string
  renderSideBySide?: boolean
  diffStyle?: 'unified' | 'split'
  autoScrollOnUpdate?: boolean
  autoScrollThresholdPx?: number
  enableLineSelection?: boolean
  stream?: boolean
  mergeConflict?: boolean
  lineAnnotations?: unknown[]
  onController?: (controller: CodeStreamController | DiffStreamController | DiffSurfaceController) => void
  workerManager?: WorkerPoolManager
  [key: string]: unknown
}

export function useMonaco(options: StreamDiffsRuntimeOptions = {}) {
  let stream: CodeStreamController | undefined
  let diffStream: DiffStreamController | undefined
  let surface: DiffSurfaceController | undefined
  let editorAdapter: ReturnType<typeof createEditorAdapter> | undefined
  let diffAdapter: ReturnType<typeof createDiffAdapter> | undefined
  let language = 'text'
  let original = ''
  let modified = ''
  let container: HTMLElement | undefined

  const theme = resolveTheme(options)
  const shared = {
    theme,
    themeType: 'system' as const,
    disableLineNumbers: options.lineNumbers === false,
    overflow: options.wordWrap === 'on' ? 'wrap' as const : 'scroll' as const,
    enableLineSelection: options.enableLineSelection,
  }

  async function createEditor(target: HTMLElement, code: string, lang: string) {
    cleanupEditor()
    applyEditorStyles(target, options)
    container = target
    language = lang
    if (shouldRenderMergeConflict(code))
      return createMergeConflictEditor(target, code, lang)
    if (options.stream === false)
      return createStaticFileEditor(target, code, lang)
    stream = new CodeStreamController({
      ...shared,
      ...pickPierreOptions(options),
      fileName: `code.${lang || 'txt'}`,
      language: lang,
      maxHeight: options.MAX_HEIGHT,
      autoScroll: options.autoScrollOnUpdate === false ? 'never' : 'near-bottom',
      autoScrollThresholdPx: options.autoScrollThresholdPx,
      workerManager: options.workerManager,
    })
    stream.append(code)
    await stream.mount(target)
    options.onController?.(stream)
    editorAdapter = createEditorAdapter(
      () => stream?.getText() ?? '',
      target,
      () => stream?.getFinalizedSurface(),
      listener => stream!.onDidRender(listener),
    )
    return editorAdapter
  }

  async function createDiffEditor(target: HTMLElement, oldCode: string, newCode: string, lang: string) {
    cleanupEditor()
    applyEditorStyles(target, options)
    container = target
    language = lang
    original = oldCode
    modified = newCode
    if (options.stream === false) {
      surface = createDiffSurface({
        kind: 'diff',
        oldFile: asFile(oldCode),
        newFile: asFile(newCode),
        annotations: options.lineAnnotations as any,
        workerManager: options.workerManager,
        options: {
          ...shared,
          diffStyle: options.diffStyle ?? (options.renderSideBySide === false ? 'unified' : 'split'),
          ...pickPierreOptions(options),
        },
      })
      await surface.mount(target)
      options.onController?.(surface)
    }
    else {
      diffStream = new DiffStreamController({
        ...shared,
        ...pickPierreOptions(options),
        fileName: `code.${lang || 'txt'}`,
        language: lang,
        diffStyle: options.diffStyle ?? (options.renderSideBySide === false ? 'unified' : 'split'),
        maxHeight: options.MAX_HEIGHT,
        wrap: options.wordWrap === 'on',
        workerManager: options.workerManager,
      })
      await diffStream.mount(target, oldCode, newCode)
      options.onController?.(diffStream)
    }
    diffAdapter = createDiffAdapter(() => original, () => modified, target, () => surface ?? diffStream?.getFinalizedSurface())
    return diffAdapter
  }

  async function updateCode(code: string, lang = language) {
    if (shouldRenderMergeConflict(code)) {
      if (surface?.getInput().kind === 'merge-conflict') {
        language = lang
        await surface.updateMergeConflict(asFile(code), options.lineAnnotations as any)
      }
      else if (container) {
        await createMergeConflictEditor(container, code, lang)
      }
      return
    }
    if (options.stream === false) {
      if (surface?.getInput().kind === 'file') {
        language = lang
        await surface.updateFile(asFile(code), options.lineAnnotations as any)
      }
      else if (container) {
        await createStaticFileEditor(container, code, lang)
      }
      return
    }
    if (!stream) {
      if (container)
        await createEditor(container, code, lang)
      return
    }
    if (stream.getState() === 'finalized') {
      if (code !== stream.getText())
        await stream.reset(code)
      return
    }
    if (lang !== language) {
      language = lang
      await stream.setLanguage(lang)
      if (code !== stream.getText())
        await stream.reset(code)
      return
    }
    const previous = stream.getText()
    if (code.startsWith(previous))
      stream.append(code.slice(previous.length))
    else
      await stream.reset(code)
  }

  async function updateDiff(oldCode: string, newCode: string, lang = language) {
    original = oldCode
    modified = newCode
    language = lang
    if (diffStream) {
      await diffStream.update(oldCode, newCode)
      return
    }
    if (!surface) {
      if (container)
        await createDiffEditor(container, oldCode, newCode, lang)
      return
    }
    await surface.updateDiff(asFile(oldCode), asFile(newCode))
  }

  function cleanupEditor() {
    stream?.dispose()
    diffStream?.dispose()
    if (!diffStream)
      surface?.dispose()
    stream = undefined
    diffStream = undefined
    surface = undefined
    editorAdapter = undefined
    diffAdapter = undefined
    container = undefined
  }

  async function createStaticFileEditor(target: HTMLElement, code: string, lang: string) {
    cleanupEditor()
    container = target
    language = lang
    surface = createDiffSurface({
      kind: 'file',
      file: asFile(code),
      annotations: options.lineAnnotations as any,
      workerManager: options.workerManager,
      options: { ...shared, ...pickPierreOptions(options) },
    })
    await surface.mount(target)
    options.onController?.(surface)
    editorAdapter = createEditorAdapter(
      () => getSurfaceFileContents(surface) ?? code,
      target,
      () => surface,
      listener => surface!.onDidRender(listener),
    )
    return editorAdapter
  }

  async function createMergeConflictEditor(target: HTMLElement, code: string, lang: string) {
    cleanupEditor()
    container = target
    language = lang
    surface = createDiffSurface({
      kind: 'merge-conflict',
      file: asFile(code),
      annotations: options.lineAnnotations as any,
      workerManager: options.workerManager,
      options: { ...shared, ...pickPierreOptions(options) },
    })
    await surface.mount(target)
    options.onController?.(surface)
    editorAdapter = createEditorAdapter(
      () => getSurfaceFileContents(surface) ?? code,
      target,
      () => surface,
      listener => surface!.onDidRender(listener),
    )
    return editorAdapter
  }

  function shouldRenderMergeConflict(code: string) {
    if (options.mergeConflict === false)
      return false
    return /^<<<<<<< .+$/m.test(code) && /^=======$/m.test(code) && /^>>>>>>> .+$/m.test(code)
  }

  async function setTheme(nextTheme: string | Record<string, unknown> | undefined) {
    if (!nextTheme)
      return
    if (typeof nextTheme === 'string') {
      const themes = options.themes
      if (themes?.[0] === nextTheme) {
        stream?.setThemeType('dark')
        diffStream?.setThemeType('dark')
        surface?.setThemeType('dark')
        return
      }
      if (themes?.[1] === nextTheme) {
        stream?.setThemeType('light')
        diffStream?.setThemeType('light')
        surface?.setThemeType('light')
        return
      }
    }
    await stream?.setTheme(nextTheme as any)
    await diffStream?.setTheme(nextTheme as any)
    await surface?.setTheme(nextTheme as any)
  }

  function asFile(contents: string): FileContents {
    return fileContents(`code.${language || 'txt'}`, contents, language)
  }

  return {
    runtimeKind: 'stream-diffs' as const,
    createEditor,
    createDiffEditor,
    updateCode,
    appendCode(chunk: string) {
      stream?.append(chunk)
    },
    async finalizeCode() {
      if (!stream || stream.getState() === 'finalized')
        return stream?.getFinalizedSurface()
      const nativeOptions = pickPierreOptions(options)
      delete nativeOptions.lineAnnotations
      await stream.finalize({
        view: 'file',
        ...nativeOptions,
        annotations: options.lineAnnotations as any,
        workerManager: options.workerManager,
      })
      return stream.getFinalizedSurface()
    },
    async finalizeDiff() {
      if (!diffStream)
        return surface
      surface = await diffStream.finalize(options.lineAnnotations as any)
      return surface
    },
    updateDiff,
    updateOriginal(code: string, lang = language) {
      return updateDiff(code, modified, lang)
    },
    updateModified(code: string, lang = language) {
      return updateDiff(original, code, lang)
    },
    appendOriginal(chunk: string, lang = language) {
      return updateDiff(original + chunk, modified, lang)
    },
    appendModified(chunk: string, lang = language) {
      return updateDiff(original, modified + chunk, lang)
    },
    cleanupEditor,
    safeClean: cleanupEditor,
    setTheme,
    async setLanguage(next: string) {
      language = next
      await stream?.setLanguage(next)
      await diffStream?.setLanguage(next)
      if (surface && !diffStream) {
        const input = surface.getInput()
        if (input.kind === 'file' || input.kind === 'merge-conflict')
          await surface.update({ ...input, file: { ...input.file, lang: next } })
        else if (input.kind === 'diff' && 'oldFile' in input) {
          await surface.update({
            ...input,
            oldFile: { ...input.oldFile, lang: next },
            newFile: { ...input.newFile, lang: next },
          })
        }
      }
    },
    getCurrentTheme: () => options.theme,
    getEditor: () => EDITOR_NAMESPACE,
    getEditorView: () => editorAdapter ?? null,
    getDiffEditorView: () => diffAdapter ?? null,
    getDiffModels: () => ({
      original: createModel(() => original),
      modified: createModel(() => surface?.getResolvedFile()?.contents ?? diffStream?.getModified() ?? modified),
    }),
    getCode: () => {
      const input = surface?.getInput()
      if (input?.kind === 'diff' || input?.kind === 'patch')
        return { original, modified: surface?.getResolvedFile()?.contents ?? modified }
      if (input?.kind === 'file' || input?.kind === 'merge-conflict')
        return input.file.contents
      if (diffStream)
        return { original: diffStream.getOriginal(), modified: diffStream.getModified() }
      return stream?.getText() ?? null
    },
    refreshDiffPresentation: () => surface?.update(surface.getInput()),
  }
}

function resolveTheme(options: StreamDiffsRuntimeOptions) {
  if (options.themes?.length && typeof options.themes[0] === 'string' && typeof options.themes[1] === 'string')
    return { dark: options.themes[0], light: options.themes[1] }
  return options.theme as any
}

function pickPierreOptions(options: StreamDiffsRuntimeOptions) {
  const hostKeys = new Set([
    'MAX_HEIGHT', 'theme', 'themes', 'readOnly', 'lineNumbers', 'wordWrap',
    'renderSideBySide', 'autoScrollOnUpdate', 'autoScrollThresholdPx',
    'stream', 'mergeConflict', 'lineAnnotations', 'onController',
    'workerManager', 'languages', 'onThemeChange',
  ])
  return Object.fromEntries(Object.entries(options).filter(([key]) => !hostKeys.has(key)))
}

function createModel(getValue: () => string) {
  return {
    getValue,
    getLineCount: () => getValue().split('\n').length,
  }
}

function getSurfaceFileContents(surface?: DiffSurfaceController) {
  const input = surface?.getInput()
  return input?.kind === 'file' || input?.kind === 'merge-conflict' ? input.file.contents : undefined
}

function createEditorAdapter(
  getValue: () => string,
  container: HTMLElement,
  getSurface: () => DiffSurfaceController | undefined = () => undefined,
  subscribeRender?: (listener: () => void) => { dispose(): void },
) {
  const readFontSize = () => Number.parseFloat(container.style.fontSize) || 14
  return {
    getModel: () => createModel(getValue),
    getContentHeight: () => container.querySelector<HTMLElement>('.stream-diffs-shell')?.scrollHeight ?? container.scrollHeight,
    layout: () => {},
    getOption(key: unknown) {
      if (key === EDITOR_OPTION.fontInfo)
        return { fontSize: readFontSize() }
      if (key === EDITOR_OPTION.lineHeight)
        return Number.parseFloat(container.style.lineHeight) || Math.round(readFontSize() * 1.5)
      return undefined
    },
    updateOptions(next: Record<string, unknown>) {
      applyEditorStyles(container, next)
    },
    onDidContentSizeChange: (listener: () => void) => subscribeRender?.(listener) ?? { dispose() {} },
    onDidLayoutChange: (listener: () => void) => subscribeRender?.(listener) ?? { dispose() {} },
    setSelectedLines: (range: any) => getSurface()?.setSelectedLines(range),
    setAnnotations: (annotations: any[]) => getSurface()?.setAnnotations(annotations),
    acceptReject: (hunkIndex: number, action: any) => getSurface()?.acceptReject(hunkIndex, action),
    resolveConflict: (conflictIndex: number, resolution: any) => getSurface()?.resolveConflict(conflictIndex, resolution),
  }
}

function createDiffAdapter(
  getOriginal: () => string,
  getModified: () => string,
  container: HTMLElement,
  getSurface: () => DiffSurfaceController | undefined,
) {
  return {
    ...createEditorAdapter(getModified, container, getSurface, listener => getSurface()?.onDidRender(listener) ?? { dispose() {} }),
    getOriginalEditor: () => createEditorAdapter(getOriginal, container, getSurface, listener => getSurface()?.onDidRender(listener) ?? { dispose() {} }),
    getModifiedEditor: () => createEditorAdapter(getModified, container, getSurface, listener => getSurface()?.onDidRender(listener) ?? { dispose() {} }),
    getLineChanges: () => getSurface()?.getDiff()?.hunks.map(hunk => ({
      originalStartLineNumber: hunk.deletionStart,
      originalEndLineNumber: hunk.deletionStart + hunk.deletionCount - 1,
      modifiedStartLineNumber: hunk.additionStart,
      modifiedEndLineNumber: hunk.additionStart + hunk.additionCount - 1,
    })) ?? [],
    onDidUpdateDiff: (listener: () => void) => getSurface()?.onDidRender(listener) ?? { dispose() {} },
  }
}

const EDITOR_OPTION = {
  fontInfo: 0,
  lineHeight: 1,
} as const

const EDITOR_NAMESPACE = { EditorOption: EDITOR_OPTION }

function applyEditorStyles(container: HTMLElement, options: Record<string, unknown>) {
  const { style } = container
  if (typeof options.fontSize === 'number') {
    style.fontSize = `${options.fontSize}px`
    style.setProperty('--diffs-font-size', `${options.fontSize}px`)
  }
  if (typeof options.lineHeight === 'number') {
    style.lineHeight = `${options.lineHeight}px`
    style.setProperty('--diffs-line-height', `${options.lineHeight}px`)
  }
  if (typeof options.fontFamily === 'string') {
    style.fontFamily = options.fontFamily
    style.setProperty('--diffs-font-family', options.fontFamily)
  }
}

export async function preloadMonacoWorkers() {
  return undefined
}

export async function preloadStreamDiffs() {
  return true
}

export function detectLanguage(code: string) {
  if (/^\s*</.test(code))
    return 'html'
  if (/\b(interface|type|enum)\s+\w+|:\s*(string|number|boolean)\b/.test(code))
    return 'typescript'
  if (/\b(const|let|function|import|export)\b/.test(code))
    return 'javascript'
  if (/\b(def|from|lambda|None|True|False)\b/.test(code))
    return 'python'
  return 'text'
}
