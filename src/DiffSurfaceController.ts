import type {
  DiffLineAnnotation,
  ExpandedHunksMap,
  ExpansionDirections,
  File,
  FileContents,
  FileDiff,
  FileDiffMetadata,
  FileDiffOptions,
  FileOptions,
  LineAnnotation,
  LineExpansion,
  SelectedLineRange,
  SelectionSide,
  UnresolvedFileOptions,
  UnresolvedFile,
} from '@pierre/diffs'
import type { EditorActiveLineOptions, EditorFocusOptions, EditorViewState, Range, TextEdit } from '@pierre/diffs/edit'
import type {
  DiffSurfaceController as Controller,
  DiffSurfaceEditor,
  DiffSurfaceEditorOptions,
  DiffSurfaceEditingReason,
  DiffSurfaceInput,
} from './types'
import { compatibleWorkerManager, createShell } from './internal'
import { resolvePreferredHighlighter } from './preferredHighlighter'

type PierreInstance<LAnnotation, Caret = undefined> = File<LAnnotation, Caret> | FileDiff<LAnnotation, Caret> | UnresolvedFile<LAnnotation>
type SurfaceOptionsUnion<LAnnotation, Caret> = NonNullable<DiffSurfaceInput<LAnnotation, Caret>['options']>

interface EditingSession<LAnnotation, Caret> {
  editor: DiffSurfaceEditor<LAnnotation, Caret>
  detach: () => void
}

export class DiffSurfaceController<LAnnotation = unknown, Caret = undefined> implements Controller<LAnnotation, Caret> {
  private container?: HTMLElement
  private surface?: HTMLElement
  private instance?: PierreInstance<LAnnotation, Caret>
  private diff?: FileDiffMetadata
  private selectedLines: SelectedLineRange | null = null
  private disposed = false
  private renderListeners = new Set<() => void>()
  private visualRevision = 0
  private visualReadyPromise: Promise<boolean> = Promise.resolve(false)
  private resolveVisualReady?: (ready: boolean) => void
  private editingSession?: EditingSession<LAnnotation, Caret>
  private editingPromise?: Promise<DiffSurfaceEditor<LAnnotation, Caret>>
  private editingGeneration = 0

  constructor(private input: DiffSurfaceInput<LAnnotation, Caret>) {}

  async mount(container: HTMLElement) {
    this.disposed = false
    this.container = container
    this.surface = createShell(container).surface
    await this.render()
  }

  async update(input: DiffSurfaceInput<LAnnotation, Caret>) {
    this.input = input
    if (this.surface)
      await this.render(true)
  }

  updateFile(file: FileContents, annotations?: LineAnnotation<LAnnotation>[]) {
    return this.update({
      kind: 'file',
      file,
      annotations,
      options: this.input.kind === 'file' ? this.input.options : undefined,
      workerManager: this.input.kind === 'file' ? this.input.workerManager : undefined,
    })
  }

  updateDiff(oldFile: FileContents, newFile: FileContents, annotations?: DiffLineAnnotation<LAnnotation>[]) {
    return this.update({
      kind: 'diff',
      oldFile,
      newFile,
      annotations,
      options: isDiffInput(this.input) ? this.input.options : undefined,
      workerManager: isDiffInput(this.input) ? this.input.workerManager : undefined,
    })
  }

  updateParsedDiff(fileDiff: FileDiffMetadata, annotations?: DiffLineAnnotation<LAnnotation>[]) {
    return this.update({
      kind: 'diff',
      fileDiff,
      annotations,
      options: isDiffInput(this.input) ? this.input.options : undefined,
      workerManager: isDiffInput(this.input) ? this.input.workerManager : undefined,
    })
  }

  updatePatch(patch: string, fileIndex = 0, annotations?: DiffLineAnnotation<LAnnotation>[], patchIndex = 0) {
    return this.update({
      kind: 'patch',
      patch,
      patchIndex,
      fileIndex,
      annotations,
      options: this.input.kind === 'patch' ? this.input.options : undefined,
      parsePatchOptions: this.input.kind === 'patch' ? this.input.parsePatchOptions : undefined,
      workerManager: this.input.kind === 'patch' ? this.input.workerManager : undefined,
    })
  }

  updateMergeConflict(file: FileContents, annotations?: DiffLineAnnotation<LAnnotation>[]) {
    return this.update({
      kind: 'merge-conflict',
      file,
      annotations,
      options: this.input.kind === 'merge-conflict' ? this.input.options : undefined,
      workerManager: this.input.kind === 'merge-conflict' ? this.input.workerManager : undefined,
    })
  }

  setSelectedLines(range: SelectedLineRange | null) {
    this.selectedLines = range
    this.instance?.setSelectedLines(range)
  }

  setAnnotations(annotations: LineAnnotation<LAnnotation>[] | DiffLineAnnotation<LAnnotation>[]) {
    if (!this.instance)
      return
    if (this.input.kind === 'file') {
      this.input.annotations = annotations as LineAnnotation<LAnnotation>[]
      ;(this.instance as File<LAnnotation, Caret>).setLineAnnotations(this.input.annotations)
    }
    else {
      this.input.annotations = annotations as DiffLineAnnotation<LAnnotation>[]
      ;(this.instance as FileDiff<LAnnotation, Caret>).setLineAnnotations(this.input.annotations)
    }
    this.emitRender()
  }

  setThemeType(themeType: 'system' | 'light' | 'dark') {
    if (this.input.options)
      this.input.options = { ...this.input.options, themeType }
    else
      this.input.options = { themeType } as any
    this.instance?.setThemeType(themeType)
  }

  async setTheme(theme: any) {
    if (this.input.options)
      this.input.options = { ...this.input.options, theme }
    else
      this.input.options = { theme } as any
    if (this.surface)
      await this.render(false)
  }

  async setOptions(options: NonNullable<DiffSurfaceInput<LAnnotation, Caret>['options']>) {
    this.input.options = options as any
    if (this.surface)
      await this.render(false)
  }

  acceptReject(hunkIndex: number, action: 'accept' | 'reject' | 'both' | { type: 'accept' | 'reject' | 'both', changeIndex: number }) {
    if (!isDiffInput(this.input) || !this.diff)
      throw new Error('acceptReject() requires a diff view')
    this.stopEditing('discard')
    const { diffAcceptRejectHunk } = this.module!
    this.diff = diffAcceptRejectHunk(this.diff, hunkIndex, action)
    ;(this.instance as FileDiff<LAnnotation, Caret>).render({
      fileDiff: this.diff,
      containerWrapper: this.surface,
      lineAnnotations: this.input.annotations,
    })
    return this.diff
  }

  resolveConflict(conflictIndex: number, resolution: 'current' | 'incoming' | 'both') {
    if (this.input.kind !== 'merge-conflict')
      throw new Error('resolveConflict() requires a merge-conflict view')
    const result = (this.instance as UnresolvedFile<LAnnotation>).resolveConflict(conflictIndex, resolution)
    if (result) {
      this.input.file = result.file
      this.diff = result.fileDiff
    }
    return result?.file
  }

  getResolvedFile() {
    if (!isDiffInput(this.input) || !this.diff || this.diff.isPartial)
      return undefined
    const source = 'newFile' in this.input ? this.input.newFile : undefined
    return {
      name: source?.name ?? this.diff.name,
      contents: this.diff.additionLines.join(''),
      lang: source?.lang ?? this.diff.lang,
    }
  }

  getDiff() {
    return this.diff
  }

  getInput() {
    return this.input
  }

  getNativeInstance() {
    return this.instance
  }

  /**
   * Hydrates a partial diff before an editor attaches to it. Upstream requires
   * complete file contents for both sides, so a `kind: 'patch'` surface only
   * becomes editable when `options.loadDiffFiles` can supply them. Resolves
   * immediately for File surfaces and already-complete diffs. Since
   * `@pierre/diffs@1.7`, this also waits for an in-flight worker-pool
   * highlight, so an edit session starts from highlighted rows.
   */
  async prepareForEditing() {
    const instance = this.instance as { prepareForEditing?: () => Promise<void> } | undefined
    await instance?.prepareForEditing?.()
  }

  /**
   * Whether `startEditing()` can attach immediately. False while a partial
   * diff is still hydrating or a worker-pool highlight is in flight.
   */
  isReadyToEdit() {
    if (this.disposed || this.input.kind === 'merge-conflict')
      return false
    const instance = this.instance as { isReadyToEdit?: () => boolean } | undefined
    return instance?.isReadyToEdit?.() ?? false
  }

  /**
   * Attaches the upstream editor to this surface and returns it. The editor
   * code is loaded lazily, so read-only hosts never pay for it.
   *
   * Resolves only after `prepareForEditing()` and the editor's first render
   * sync has attached it, so `getEditingText()`/`applyEdits()` are immediately
   * usable. Calling it again while a session is active returns the same editor.
   */
  async startEditing(options: DiffSurfaceEditorOptions<LAnnotation, Caret> = {}, editStateKey?: string) {
    if (this.disposed)
      throw new Error('Cannot start editing a disposed surface')
    if (this.input.kind === 'merge-conflict')
      throw new Error('Merge-conflict surfaces are not editable')
    if (this.editingSession)
      return this.editingSession.editor
    if (this.editingPromise)
      return this.editingPromise

    const generation = ++this.editingGeneration
    const promise = (async () => {
      await this.prepareForEditing()
      if (this.disposed)
        throw new Error('Cannot start editing a disposed surface')
      const instance = this.instance
      if (!instance)
        throw new Error('Mount the surface before starting an edit session')
      if (this.input.kind !== 'file' && !isDiffInput(this.input))
        throw new Error('Only file and diff surfaces are editable')

      const { Editor } = await import('@pierre/diffs/edit')
      const type = this.input.kind === 'file' ? 'file' : 'file-diff'

      let resolveAttached!: () => void
      let rejectAttached!: (error: Error) => void
      const attached = new Promise<void>((resolve, reject) => {
        resolveAttached = resolve
        rejectAttached = reject
      })
      const attachTimeout = setTimeout(() => {
        rejectAttached(new Error('The editor did not attach to the surface in time'))
      }, 10_000)
      const userOnAttach = options.onAttach
      const editorOptions = {
        ...options,
        onAttach(editor: unknown, fileInstance: unknown) {
          try {
            userOnAttach?.(editor as never, fileInstance as never)
          }
          finally {
            resolveAttached()
          }
        },
      }
      const editor = new Editor(type, editorOptions as any, editStateKey) as DiffSurfaceEditor<LAnnotation, Caret>
      if (this.disposed || generation !== this.editingGeneration || instance !== this.instance) {
        clearTimeout(attachTimeout)
        editor.cleanUp('discard')
        throw new Error('The surface was replaced before the editor attached')
      }
      let detach: () => void
      try {
        detach = (editor.edit as (target: unknown) => () => void)(instance)
        await attached
      }
      catch (error) {
        clearTimeout(attachTimeout)
        editor.cleanUp('discard')
        throw error
      }
      clearTimeout(attachTimeout)
      if (this.disposed || generation !== this.editingGeneration || instance !== this.instance) {
        editor.cleanUp('discard')
        throw new Error('The surface was replaced before the editor attached')
      }
      this.editingSession = { editor, detach }
      return editor
    })().finally(() => {
      if (this.editingPromise === promise)
        this.editingPromise = undefined
    })

    this.editingPromise = promise
    return promise
  }

  /**
   * Ends the active edit session. `complete` keeps the edited document in the
   * native instance (the default); `discard` reverts to the last render input.
   */
  stopEditing(reason: DiffSurfaceEditingReason = 'complete') {
    ++this.editingGeneration
    const session = this.editingSession
    this.editingSession = undefined
    this.editingPromise = undefined
    session?.editor.cleanUp(reason)
  }

  isEditing() {
    return this.editingSession != null
  }

  getEditor() {
    return this.editingSession?.editor
  }

  getEditingFile() {
    return this.editingSession?.editor.getFile()
  }

  getEditingText() {
    return this.editingSession?.editor.getText()
  }

  canUndo() {
    return this.editingSession?.editor.canUndo ?? false
  }

  canRedo() {
    return this.editingSession?.editor.canRedo ?? false
  }

  undo() {
    this.editingSession?.editor.undo()
  }

  redo() {
    this.editingSession?.editor.redo()
  }

  applyEdits(edits: TextEdit[], updateHistory = true) {
    this.editingSession?.editor.applyEdits(edits, updateHistory)
  }

  focusEditor(options?: EditorFocusOptions) {
    this.editingSession?.editor.focus(options)
  }

  blurEditor() {
    this.editingSession?.editor.blur()
  }

  getEditorViewState() {
    return this.editingSession?.editor.getViewState()
  }

  setEditorViewState(state: EditorViewState) {
    this.editingSession?.editor.setViewState(state)
  }

  setEditorSelections(selections: (Range & { direction: 'none' | 'backward' | 'forward' })[]) {
    this.editingSession?.editor.setSelections(selections)
  }

  /** Reveal a line in a diff, expanding collapsed context when needed. */
  revealLine(lineNumber: number, side?: SelectionSide) {
    const instance = this.instance as { revealLine?: (line: number, side?: SelectionSide) => boolean } | undefined
    return instance?.revealLine?.(lineNumber, side) ?? false
  }

  /** Expand one overlong/truncated line; see upstream `LineCuts`. */
  expandLine(target: LineExpansion) {
    const instance = this.instance as { expandLine?: (target: LineExpansion) => void } | undefined
    instance?.expandLine?.(target)
  }

  /** Expand a diff hunk in one or both directions. */
  expandHunk(hunkIndex: number, direction: ExpansionDirections, expansionLineCountOverride?: number) {
    const instance = this.instance as { expandHunk?: (hunkIndex: number, direction: ExpansionDirections, override?: number) => void } | undefined
    instance?.expandHunk?.(hunkIndex, direction, expansionLineCountOverride)
  }

  setEditorActiveLine(lineNumber: number | null, options?: EditorActiveLineOptions) {
    this.instance?.setEditorActiveLine(lineNumber, options)
  }

  getNearestRenderableLine(lineNumber: number, direction: 'up' | 'down') {
    const instance = this.instance as { getNearestRenderableLine?: (line: number, direction: 'up' | 'down') => number | undefined } | undefined
    return instance?.getNearestRenderableLine?.(lineNumber, direction)
  }

  isLineInCollapsedContext(lineNumber: number, side?: SelectionSide, expandedHunks?: ExpandedHunksMap) {
    const instance = this.instance as { isLineInCollapsedContext?: (line: number, side?: SelectionSide, expandedHunks?: ExpandedHunksMap) => boolean } | undefined
    return instance?.isLineInCollapsedContext?.(lineNumber, side, expandedHunks) ?? false
  }

  getCodeScrollLeft() {
    return this.instance?.getCodeScrollLeft() ?? 0
  }

  setCodeScrollLeft(position: number) {
    this.instance?.setCodeScrollLeft(position)
  }

  onDidRender(listener: () => void) {
    this.renderListeners.add(listener)
    return { dispose: () => this.renderListeners.delete(listener) }
  }

  async whenVisualReady() {
    let pending = this.visualReadyPromise
    for (;;) {
      const ready = await pending
      if (pending === this.visualReadyPromise)
        return ready
      pending = this.visualReadyPromise
    }
  }

  dispose() {
    this.disposed = true
    this.stopEditing('discard')
    this.invalidateVisualReady()
    this.instance?.cleanUp()
    this.instance = undefined
    this.surface = undefined
    this.container?.replaceChildren()
    this.container = undefined
    this.renderListeners.clear()
  }

  private module?: typeof import('@pierre/diffs')

  /**
   * Replaces `preferredHighlighter: 'auto'` with the resolved backend before the
   * native instance is created. The decision itself is app-wide and cached.
   */
  private async applyAutoHighlighter() {
    const options = this.input.options as { preferredHighlighter?: string, theme?: any } | undefined
    if (options?.preferredHighlighter !== 'auto')
      return

    const lang = this.input.kind === 'file' || this.input.kind === 'merge-conflict'
      ? this.input.file.lang
      : this.diff?.lang
    const resolved = await resolvePreferredHighlighter({
      themes: options.theme,
      langs: lang == null ? undefined : [lang],
    })
    if (this.input.options === options)
      this.input.options = { ...options, preferredHighlighter: resolved } as SurfaceOptionsUnion<LAnnotation, Caret>
  }

  private async render(resetDiff = true) {
    const surface = this.surface
    if (!surface || this.disposed)
      return
    this.stopEditing('discard')
    const visualRevision = this.beginVisualRender()
    const mod = this.module ??= await import('@pierre/diffs')
    if (this.disposed || surface !== this.surface)
      return

    await this.applyAutoHighlighter()
    if (this.disposed || surface !== this.surface)
      return

    this.instance?.cleanUp()
    surface.replaceChildren()
    if (this.input.kind === 'file') {
      const instance = new mod.File<LAnnotation, Caret>(withInternalPostRender(this.input.options as FileOptions<LAnnotation, Caret> | undefined, () => this.markVisualReady(visualRevision)), compatibleWorkerManager(this.input.workerManager))
      instance.render({ file: this.input.file, containerWrapper: surface, lineAnnotations: this.input.annotations })
      this.instance = instance
      instance.setSelectedLines(this.selectedLines)
      this.diff = undefined
      return
    }
    if (isDiffInput(this.input)) {
      if (resetDiff || !this.diff) {
        if (this.input.kind === 'patch') {
          const parsed = mod.parsePatchFiles(this.input.patch, this.input.parsePatchOptions)
          const patch = parsed[this.input.patchIndex ?? 0]
          if (!patch)
            throw new Error(`Patch does not contain patch index ${this.input.patchIndex ?? 0}`)
          const fileDiff = patch.files[this.input.fileIndex ?? 0]
          if (!fileDiff)
            throw new Error(`Patch does not contain file index ${this.input.fileIndex ?? 0}`)
          this.diff = fileDiff
        }
        else if ('fileDiff' in this.input) {
          this.diff = this.input.fileDiff
        }
        else {
          this.diff = mod.parseDiffFromFile(
            this.input.oldFile,
            this.input.newFile,
            (this.input.options as FileDiffOptions<LAnnotation, Caret> | undefined)?.parseDiffOptions,
          )
        }
      }
      const instance = new mod.FileDiff<LAnnotation, Caret>(withInternalPostRender(this.input.options as FileDiffOptions<LAnnotation, Caret> | undefined, () => this.markVisualReady(visualRevision)), compatibleWorkerManager(this.input.workerManager))
      instance.render({ fileDiff: this.diff, containerWrapper: surface, lineAnnotations: this.input.annotations })
      this.instance = instance
      instance.setSelectedLines(this.selectedLines)
      return
    }
    const instance = new mod.UnresolvedFile<LAnnotation>(withInternalPostRender(this.input.options as UnresolvedFileOptions<LAnnotation> | undefined, () => this.markVisualReady(visualRevision)), compatibleWorkerManager(this.input.workerManager))
    instance.render({ file: this.input.file, containerWrapper: surface, lineAnnotations: this.input.annotations })
    this.instance = instance
    instance.setSelectedLines(this.selectedLines)
    this.diff = instance.fileDiff
  }

  private emitRender() {
    for (const listener of this.renderListeners)
      listener()
  }

  private beginVisualRender() {
    this.resolveVisualReady?.(false)
    const revision = ++this.visualRevision
    this.visualReadyPromise = new Promise<boolean>((resolve) => {
      this.resolveVisualReady = resolve
    })
    return revision
  }

  private markVisualReady(revision: number) {
    if (this.disposed || revision !== this.visualRevision)
      return
    this.resolveVisualReady?.(true)
    this.resolveVisualReady = undefined
    this.emitRender()
  }

  private invalidateVisualReady() {
    this.visualRevision++
    this.resolveVisualReady?.(false)
    this.resolveVisualReady = undefined
  }
}

export function createDiffSurface<LAnnotation = unknown, Caret = undefined>(input: DiffSurfaceInput<LAnnotation, Caret>) {
  return new DiffSurfaceController<LAnnotation, Caret>(input)
}

function withTokenTransformer<T extends Record<string, any> | undefined>(options: T): T {
  if (!options || options.useTokenTransformer === true)
    return options
  if (!options.onTokenClick && !options.onTokenEnter && !options.onTokenLeave)
    return options
  return { ...options, useTokenTransformer: true }
}

function withInternalPostRender<T extends Record<string, any> | undefined>(options: T, onRender: () => void): T {
  const transformed = withTokenTransformer(options)
  const userPostRender = transformed?.onPostRender
  return {
    ...transformed,
    onPostRender(...args: any[]) {
      userPostRender?.(...args)
      onRender()
    },
  } as T
}

function isDiffInput<LAnnotation, Caret = undefined>(input: DiffSurfaceInput<LAnnotation, Caret>) {
  return input.kind === 'diff' || input.kind === 'patch'
}
