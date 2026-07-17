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
  let visualRevision = 0
  let themeType: 'system' | 'light' | 'dark' = 'system'
  let appliedTheme = resolveTheme(options)
  let appliedThemePairKey = getThemePairKey(options)

  const shared = {
    disableLineNumbers: options.lineNumbers === false,
    overflow: options.wordWrap === 'on' ? 'wrap' as const : 'scroll' as const,
    enableLineSelection: options.enableLineSelection,
  }
  const sharedOptions = () => ({
    ...shared,
    theme: appliedTheme,
    themeType,
  })

  async function createEditor(target: HTMLElement, code: string, lang: string) {
    cleanupEditor()
    const revision = visualRevision
    applyEditorStyles(target, options)
    container = target
    language = lang
    if (shouldRenderMergeConflict(code))
      return createMergeConflictEditor(target, code, lang)
    if (options.stream === false)
      return createStaticFileEditor(target, code, lang)
    const createdStream = new CodeStreamController({
      ...sharedOptions(),
      ...pickPierreOptions(options),
      fileName: `code.${lang || 'txt'}`,
      language: lang,
      maxHeight: options.MAX_HEIGHT,
      autoScroll: options.autoScrollOnUpdate === false ? 'never' : 'near-bottom',
      autoScrollThresholdPx: options.autoScrollThresholdPx,
      workerManager: options.workerManager,
    })
    stream = createdStream
    createdStream.append(code)
    await createdStream.mount(target)
    if (revision !== visualRevision || stream !== createdStream || container !== target) {
      createdStream.dispose()
      throw new Error('Editor creation was cancelled')
    }
    options.onController?.(createdStream)
    editorAdapter = createEditorAdapter(
      () => createdStream.getText(),
      target,
      () => createdStream.getFinalizedSurface(),
      listener => createdStream.onDidRender(listener),
    )
    return editorAdapter
  }

  async function createDiffEditor(target: HTMLElement, oldCode: string, newCode: string, lang: string) {
    cleanupEditor()
    const revision = visualRevision
    applyEditorStyles(target, options)
    container = target
    language = lang
    original = oldCode
    modified = newCode
    let createdSurface: DiffSurfaceController | undefined
    let createdDiffStream: DiffStreamController | undefined
    if (options.stream === false) {
      createdSurface = createDiffSurface({
        kind: 'diff',
        oldFile: asFile(oldCode),
        newFile: asFile(newCode),
        annotations: options.lineAnnotations as any,
        workerManager: options.workerManager,
        options: {
          ...sharedOptions(),
          diffStyle: options.diffStyle ?? (options.renderSideBySide === false ? 'unified' : 'split'),
          ...pickPierreOptions(options),
        },
      })
      surface = createdSurface
      await createdSurface.mount(target)
      if (revision !== visualRevision || surface !== createdSurface || container !== target) {
        createdSurface.dispose()
        throw new Error('Editor creation was cancelled')
      }
      options.onController?.(createdSurface)
    }
    else {
      createdDiffStream = new DiffStreamController({
        ...sharedOptions(),
        ...pickPierreOptions(options),
        fileName: `code.${lang || 'txt'}`,
        language: lang,
        diffStyle: options.diffStyle ?? (options.renderSideBySide === false ? 'unified' : 'split'),
        maxHeight: options.MAX_HEIGHT,
        wrap: options.wordWrap === 'on',
        workerManager: options.workerManager,
      })
      diffStream = createdDiffStream
      await createdDiffStream.mount(target, oldCode, newCode)
      if (revision !== visualRevision || diffStream !== createdDiffStream || container !== target) {
        createdDiffStream.dispose()
        throw new Error('Editor creation was cancelled')
      }
      options.onController?.(createdDiffStream)
    }
    diffAdapter = createDiffAdapter(
      () => original,
      () => modified,
      target,
      () => createdSurface ?? createdDiffStream?.getFinalizedSurface(),
    )
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
    visualRevision++
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
    const revision = visualRevision
    container = target
    language = lang
    const createdSurface = createDiffSurface({
      kind: 'file',
      file: asFile(code),
      annotations: options.lineAnnotations as any,
      workerManager: options.workerManager,
      options: { ...sharedOptions(), ...pickPierreOptions(options) },
    })
    surface = createdSurface
    await createdSurface.mount(target)
    if (revision !== visualRevision || surface !== createdSurface || container !== target) {
      createdSurface.dispose()
      throw new Error('Editor creation was cancelled')
    }
    options.onController?.(createdSurface)
    editorAdapter = createEditorAdapter(
      () => getSurfaceFileContents(createdSurface) ?? code,
      target,
      () => createdSurface,
      listener => createdSurface.onDidRender(listener),
    )
    return editorAdapter
  }

  async function createMergeConflictEditor(target: HTMLElement, code: string, lang: string) {
    cleanupEditor()
    const revision = visualRevision
    container = target
    language = lang
    const createdSurface = createDiffSurface({
      kind: 'merge-conflict',
      file: asFile(code),
      annotations: options.lineAnnotations as any,
      workerManager: options.workerManager,
      options: { ...sharedOptions(), ...pickPierreOptions(options) },
    })
    surface = createdSurface
    await createdSurface.mount(target)
    if (revision !== visualRevision || surface !== createdSurface || container !== target) {
      createdSurface.dispose()
      throw new Error('Editor creation was cancelled')
    }
    options.onController?.(createdSurface)
    editorAdapter = createEditorAdapter(
      () => getSurfaceFileContents(createdSurface) ?? code,
      target,
      () => createdSurface,
      listener => createdSurface.onDidRender(listener),
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
        await applyThemePairIfChanged()
        themeType = 'dark'
        stream?.setThemeType('dark')
        diffStream?.setThemeType('dark')
        surface?.setThemeType('dark')
        return
      }
      if (themes?.[1] === nextTheme) {
        await applyThemePairIfChanged()
        themeType = 'light'
        stream?.setThemeType('light')
        diffStream?.setThemeType('light')
        surface?.setThemeType('light')
        return
      }
    }
    appliedThemePairKey = undefined
    appliedTheme = nextTheme
    await applyTheme(nextTheme)
  }

  async function applyThemePairIfChanged() {
    const pairKey = getThemePairKey(options)
    if (!pairKey || pairKey === appliedThemePairKey)
      return
    appliedThemePairKey = pairKey
    appliedTheme = resolveTheme(options)
    await applyTheme(appliedTheme)
  }

  async function applyTheme(nextTheme: any) {
    await stream?.setTheme(nextTheme)
    await diffStream?.setTheme(nextTheme)
    await surface?.setTheme(nextTheme)
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
        theme: appliedTheme,
        themeType,
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
    getCurrentTheme: () => appliedTheme,
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
    whenVisualReady: async () => {
      const target = container
      const revision = visualRevision
      const renderedSurface = surface ?? stream?.getFinalizedSurface() ?? diffStream?.getFinalizedSurface()
      if (!renderedSurface || !await renderedSurface.whenVisualReady())
        return false
      return waitForVisualReady(
        target,
        () => revision === visualRevision
          && target === container
          && renderedSurface === (surface ?? stream?.getFinalizedSurface() ?? diffStream?.getFinalizedSurface()),
        () => isSurfaceRenderComplete(surface ?? stream?.getFinalizedSurface() ?? diffStream?.getFinalizedSurface()),
      )
    },
  }
}

async function waitForVisualReady(
  container: HTMLElement | undefined,
  isCurrent: () => boolean,
  isRenderComplete: () => boolean,
) {
  if (!container || typeof window === 'undefined')
    return false

  let previousSignature = ''
  let previousPre: HTMLElement | undefined
  let stableFrames = 0
  for (let frame = 0; frame < 120; frame += 1) {
    if (!isCurrent())
      return false
    const shell = container.querySelector<HTMLElement>('.stream-diffs-shell')
    const diffs = shell?.querySelector<HTMLElement>('diffs-container')
    const shadow = diffs?.shadowRoot
    const pre = shadow?.querySelector<HTMLElement>('pre')
    const rect = shell?.getBoundingClientRect()
    const text = pre?.textContent ?? ''
    const painted = !!rect && rect.width > 0 && rect.height > 0 && !!pre

    if (painted && isRenderComplete()) {
      const signature = `${Math.round(rect.width)}:${Math.round(rect.height)}:${pre.scrollWidth}:${pre.scrollHeight}:${text.length}`
      stableFrames = pre === previousPre && signature === previousSignature ? stableFrames + 1 : 1
      previousPre = pre
      previousSignature = signature
      if (stableFrames >= 2)
        return true
    }
    else {
      previousSignature = ''
      previousPre = undefined
      stableFrames = 0
    }

    await nextVisualFrame()
  }
  return false
}

function isSurfaceRenderComplete(surface: DiffSurfaceController | undefined) {
  if (!surface)
    return true

  const instance = surface.getNativeInstance() as any
  const renderer = instance?.fileRenderer ?? instance?.hunksRenderer
  if (!renderer)
    return true
  const cache = renderer.renderCache
  if (!cache?.result)
    return false
  if (cache.highlighted === true)
    return true

  const input = surface.getInput()
  const language = input.kind === 'file' || input.kind === 'merge-conflict'
    ? input.file.lang
    : 'oldFile' in input
      ? input.oldFile.lang ?? input.newFile.lang
      : surface.getDiff()?.lang
  if (isPlainTextLanguage(language))
    return true

  const tokenizeMaxLength = Number(renderer.getTokenizeMaxLength?.() ?? 100_000)
  if (input.kind === 'file' || input.kind === 'merge-conflict')
    return countLines(input.file.contents) > tokenizeMaxLength

  const diff = surface.getDiff()
  return !!diff && Math.max(diff.additionLines.length, diff.deletionLines.length) > tokenizeMaxLength
}

function isPlainTextLanguage(language: string | undefined) {
  return !language || ['text', 'txt', 'plain', 'plaintext'].includes(language.toLowerCase())
}

function countLines(value: string) {
  if (!value)
    return 0
  let lines = 1
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10)
      lines += 1
  }
  return lines
}

function nextVisualFrame() {
  return new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled)
        return
      settled = true
      window.clearTimeout(timeout)
      window.cancelAnimationFrame(frame)
      resolve()
    }
    const frame = window.requestAnimationFrame(done)
    const timeout = window.setTimeout(done, 50)
  })
}

function resolveTheme(options: StreamDiffsRuntimeOptions) {
  if (options.themes?.length && typeof options.themes[0] === 'string' && typeof options.themes[1] === 'string')
    return { dark: options.themes[0], light: options.themes[1] }
  return (options.theme ?? undefined) as any
}

function getThemePairKey(options: StreamDiffsRuntimeOptions) {
  if (typeof options.themes?.[0] !== 'string' || typeof options.themes?.[1] !== 'string')
    return undefined
  return `${options.themes[0]}\n${options.themes[1]}`
}

function pickPierreOptions(options: StreamDiffsRuntimeOptions) {
  const hostKeys = new Set([
    'MAX_HEIGHT', 'theme', 'themes', 'readOnly', 'lineNumbers', 'wordWrap',
    'renderSideBySide', 'autoScrollOnUpdate', 'autoScrollThresholdPx',
    'stream', 'mergeConflict', 'lineAnnotations', 'onController',
    'workerManager', 'languages', 'onThemeChange',
  ])
  const nativeOptions = Object.fromEntries(Object.entries(options).filter(([key]) => !hostKeys.has(key)))
  const legacyFolding = options.diffHideUnchangedRegions
  delete nativeOptions.diffHideUnchangedRegions

  const foldingOptions = typeof legacyFolding === 'object' && legacyFolding
    ? legacyFolding as Record<string, unknown>
    : undefined
  const foldingEnabled = foldingOptions?.enabled !== false

  if (legacyFolding === false || (foldingOptions && !foldingEnabled)) {
    nativeOptions.expandUnchanged ??= true
  }
  else if (legacyFolding === true || foldingOptions) {
    nativeOptions.expandUnchanged ??= false
    if (foldingOptions) {
      const context = Number(foldingOptions.contextLineCount)
      if (Number.isFinite(context) && context >= 0) {
        nativeOptions.parseDiffOptions = {
          context,
          ...(nativeOptions.parseDiffOptions as Record<string, unknown> | undefined),
        }
      }
      const minimumLineCount = Number(foldingOptions.minimumLineCount)
      if (Number.isFinite(minimumLineCount) && minimumLineCount >= 1)
        nativeOptions.collapsedContextThreshold ??= Math.max(0, Math.floor(minimumLineCount) - 1)
    }
  }

  return nativeOptions
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
