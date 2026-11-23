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
  FileStreamOptions,
  LineAnnotation,
  LineExpansion,
  MergeConflictResolution,
  ParsePatchOptions,
  SelectedLineRange,
  SelectionSide,
  ThemeTypes,
  UnresolvedFileOptions,
  UnresolvedFile,
} from '@pierre/diffs'
import type { Editor, EditorActiveLineOptions, EditorFocusOptions, EditorOptions, EditorViewState, Range, TextEdit } from '@pierre/diffs/edit'
import type { WorkerPoolManager } from '@pierre/diffs/worker'
import type { PreferredHighlighterOption } from './preferredHighlighter'

/** Options that accept the app-wide `auto` short-circuit in addition to a backend name. */
type WithAutoHighlighter<T> = Omit<T, 'preferredHighlighter'> & { preferredHighlighter?: PreferredHighlighterOption }

export type {
  AnnotationSide,
  DiffAcceptRejectHunkConfig,
  DiffAcceptRejectHunkType,
  DiffLineAnnotation,
  DiffLib,
  DiffTokenEventBaseProps,
  DiffsI18nConfig,
  DiffsMessageKey,
  DiffsMessages,
  ExpandedHunksMap,
  ExpansionDirections,
  FileContents,
  FileDiffMetadata,
  FileDiffOptions,
  FileOptions,
  LineAnnotation,
  LineExpansion,
  MergeConflictActionPayload,
  MergeConflictResolution,
  OnDiffLineClickProps,
  OnLineClickProps,
  ParseDiffOptions,
  ParsePatchOptions,
  SelectedLineRange,
  SelectionSide,
  ThemeTypes,
  TokenEventBase,
  UnresolvedFileOptions,
} from '@pierre/diffs'
export type {
  Editor,
  EditorActiveLineOptions,
  EditorCaret,
  EditorChange,
  EditorChangeEvent,
  EditorEditCompleteEvent,
  EditorFocusOptions,
  EditorInitialState,
  EditorOptions,
  EditorSelection,
  EditorViewState,
  Range as EditorRange,
  TextEdit,
} from '@pierre/diffs/edit'
export type { WorkerPoolManager } from '@pierre/diffs/worker'

export type CodeStreamState
  = | 'idle'
    | 'mounting'
    | 'streaming'
    | 'finalizing'
    | 'finalized'
    | 'error'
    | 'disposed'

export interface CodeStreamStats {
  characters: number
  lines: number
  writes: number
  resets: number
  renderMode: 'highlighted' | 'plain-text'
  overflowed: boolean
  startedAt?: number
  finalizedAt?: number
}

export interface CodeStreamLimits {
  maxStreamingLines?: number
  maxStreamingChars?: number
  overflowBehavior?: 'plain-text' | 'stop-highlighting'
}

export interface CodeStreamOptions extends Omit<FileStreamOptions, 'lang' | 'onStreamAbort'> {
  fileName?: string
  language?: string
  lineNumbers?: boolean
  wrap?: boolean
  maxHeight?: number | string
  autoScroll?: 'always' | 'near-bottom' | 'never'
  autoScrollThresholdPx?: number
  flushStrategy?: 'raf' | { intervalMs: number }
  nonAppendBehavior?: 'reset' | 'throw' | 'ignore'
  workerManager?: WorkerPoolManager
  limits?: CodeStreamLimits | false
  onStateChange?: (state: CodeStreamState) => void
  onOverflow?: (stats: CodeStreamStats) => void
  onError?: (error: unknown) => void
}

export interface DiffStreamOptions<LAnnotation = unknown> extends Omit<FileDiffOptions<LAnnotation, undefined>, 'lang' | 'preferredHighlighter'> {
  preferredHighlighter?: PreferredHighlighterOption
  fileName?: string
  language?: string
  diffStyle?: 'unified' | 'split'
  lineNumbers?: boolean
  wrap?: boolean
  maxHeight?: number | string
  autoScroll?: 'always' | 'near-bottom' | 'never'
  autoScrollThresholdPx?: number
  workerManager?: WorkerPoolManager
  onStateChange?: (state: CodeStreamState) => void
  onError?: (error: unknown) => void
}

export type FinalizeOptions<LAnnotation = unknown>
  = | { view?: 'stream' }
    | ({ view: 'file', annotations?: LineAnnotation<LAnnotation>[], workerManager?: WorkerPoolManager } & Partial<WithAutoHighlighter<FileOptions<LAnnotation, undefined>>>)
    | ({
      view: 'diff'
      original: string
      diffStyle?: 'unified' | 'split'
      annotations?: DiffLineAnnotation<LAnnotation>[]
      workerManager?: WorkerPoolManager
    } & Partial<WithAutoHighlighter<FileDiffOptions<LAnnotation, undefined>>>)

export interface FileViewInput<LAnnotation = unknown, Caret = undefined> {
  kind: 'file'
  file: FileContents
  annotations?: LineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileOptions<LAnnotation, Caret>>
  workerManager?: WorkerPoolManager
}

export interface DiffViewInput<LAnnotation = unknown, Caret = undefined> {
  kind: 'diff'
  oldFile: FileContents
  newFile: FileContents
  annotations?: DiffLineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileDiffOptions<LAnnotation, Caret>>
  workerManager?: WorkerPoolManager
}

export interface ParsedDiffViewInput<LAnnotation = unknown, Caret = undefined> {
  kind: 'diff'
  fileDiff: FileDiffMetadata
  annotations?: DiffLineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileDiffOptions<LAnnotation, Caret>>
  workerManager?: WorkerPoolManager
}

export interface PatchViewInput<LAnnotation = unknown, Caret = undefined> {
  kind: 'patch'
  patch: string
  patchIndex?: number
  fileIndex?: number
  annotations?: DiffLineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileDiffOptions<LAnnotation, Caret>>
  /** Passed to `parsePatchFiles`; carries cache keys and strict-parse flags. */
  parsePatchOptions?: ParsePatchOptions
  workerManager?: WorkerPoolManager
}

export interface MergeConflictViewInput<LAnnotation = unknown> {
  kind: 'merge-conflict'
  file: FileContents
  annotations?: DiffLineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<UnresolvedFileOptions<LAnnotation>>
  workerManager?: WorkerPoolManager
}

export type DiffSurfaceInput<LAnnotation = unknown, Caret = undefined>
  = | FileViewInput<LAnnotation, Caret>
    | DiffViewInput<LAnnotation, Caret>
    | ParsedDiffViewInput<LAnnotation, Caret>
    | PatchViewInput<LAnnotation, Caret>
    | MergeConflictViewInput<LAnnotation>

/** Editable native surfaces: plain files and file diffs, never merge conflicts. */
export type DiffSurfaceEditorType = 'file' | 'file-diff'

export type DiffSurfaceEditor<LAnnotation = unknown, Caret = undefined>
  = | Editor<'file', LAnnotation, Caret>
    | Editor<'file-diff', LAnnotation, Caret>

export type DiffSurfaceEditorOptions<LAnnotation = unknown, Caret = undefined>
  = EditorOptions<DiffSurfaceEditorType, LAnnotation, Caret>

export type DiffSurfaceEditingReason = 'discard' | 'complete'

export interface DiffSurfaceController<LAnnotation = unknown, Caret = undefined> {
  mount(container: HTMLElement): Promise<void>
  update(input: DiffSurfaceInput<LAnnotation, Caret>): Promise<void>
  updateFile(file: FileContents, annotations?: LineAnnotation<LAnnotation>[]): Promise<void>
  updateDiff(oldFile: FileContents, newFile: FileContents, annotations?: DiffLineAnnotation<LAnnotation>[]): Promise<void>
  updateParsedDiff(fileDiff: FileDiffMetadata, annotations?: DiffLineAnnotation<LAnnotation>[]): Promise<void>
  updatePatch(patch: string, fileIndex?: number, annotations?: DiffLineAnnotation<LAnnotation>[], patchIndex?: number): Promise<void>
  updateMergeConflict(file: FileContents, annotations?: DiffLineAnnotation<LAnnotation>[]): Promise<void>
  setSelectedLines(range: SelectedLineRange | null): void
  setAnnotations(annotations: LineAnnotation<LAnnotation>[] | DiffLineAnnotation<LAnnotation>[]): void
  setThemeType(themeType: ThemeTypes): void
  setTheme(theme: FileOptions<LAnnotation, Caret>['theme']): Promise<void>
  setOptions(options: FileOptions<LAnnotation, Caret> | FileDiffOptions<LAnnotation, Caret> | UnresolvedFileOptions<LAnnotation>): Promise<void>
  acceptReject(hunkIndex: number, action: 'accept' | 'reject' | 'both' | { type: 'accept' | 'reject' | 'both', changeIndex: number }): FileDiffMetadata
  resolveConflict(conflictIndex: number, resolution: MergeConflictResolution): FileContents | undefined
  getResolvedFile(): FileContents | undefined
  getDiff(): FileDiffMetadata | undefined
  getInput(): DiffSurfaceInput<LAnnotation, Caret>
  getNativeInstance(): File<LAnnotation, Caret> | FileDiff<LAnnotation, Caret> | UnresolvedFile<LAnnotation> | undefined
  prepareForEditing(): Promise<void>
  isReadyToEdit(): boolean

  /**
   * Attaches an upstream editor to this surface. Call it after `mount()` and
   * after any controller update; `update()`, `setOptions()`, `setTheme()`,
   * `acceptReject()`, and `dispose()` replace the native instance and end the
   * session. `setThemeType()` and `setAnnotations()` update the live instance
   * and keep the session.
   */
  startEditing(options?: DiffSurfaceEditorOptions<LAnnotation, Caret>, editStateKey?: string): Promise<DiffSurfaceEditor<LAnnotation, Caret>>
  stopEditing(reason?: DiffSurfaceEditingReason): void
  isEditing(): boolean
  getEditor(): DiffSurfaceEditor<LAnnotation, Caret> | undefined
  getEditingFile(): FileContents | undefined
  getEditingText(): string | undefined
  canUndo(): boolean
  canRedo(): boolean
  undo(): void
  redo(): void
  applyEdits(edits: TextEdit[], updateHistory?: boolean): void
  focusEditor(options?: EditorFocusOptions): void
  blurEditor(): void
  getEditorViewState(): EditorViewState | undefined
  setEditorViewState(state: EditorViewState): void
  setEditorSelections(selections: (Range & { direction: 'none' | 'backward' | 'forward' })[]): void

  revealLine(lineNumber: number, side?: SelectionSide): boolean
  expandLine(target: LineExpansion): void
  expandHunk(hunkIndex: number, direction: ExpansionDirections, expansionLineCountOverride?: number): void
  setEditorActiveLine(lineNumber: number | null, options?: EditorActiveLineOptions): void
  getNearestRenderableLine(lineNumber: number, direction: 'up' | 'down'): number | undefined
  isLineInCollapsedContext(lineNumber: number, side?: SelectionSide, expandedHunks?: ExpandedHunksMap): boolean
  getCodeScrollLeft(): number
  setCodeScrollLeft(position: number): void

  onDidRender(listener: () => void): { dispose(): void }
  whenVisualReady(): Promise<boolean>
  dispose(): void
}
