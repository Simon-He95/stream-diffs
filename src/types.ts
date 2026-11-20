import type {
  DiffLineAnnotation,
  File,
  FileContents,
  FileDiff,
  FileDiffMetadata,
  FileDiffOptions,
  FileOptions,
  FileStreamOptions,
  LineAnnotation,
  MergeConflictResolution,
  ParsePatchOptions,
  SelectedLineRange,
  ThemeTypes,
  UnresolvedFileOptions,
  UnresolvedFile,
} from '@pierre/diffs'
import type { WorkerPoolManager } from '@pierre/diffs/worker'
import type { PreferredHighlighterOption } from './preferredHighlighter'

/** Options that accept the app-wide `auto` short-circuit in addition to a backend name. */
type WithAutoHighlighter<T> = Omit<T, 'preferredHighlighter'> & { preferredHighlighter?: PreferredHighlighterOption }

export type {
  AnnotationSide,
  DiffAcceptRejectHunkConfig,
  DiffAcceptRejectHunkType,
  DiffLineAnnotation,
  DiffTokenEventBaseProps,
  FileContents,
  FileDiffMetadata,
  FileDiffOptions,
  FileOptions,
  LineAnnotation,
  MergeConflictActionPayload,
  MergeConflictResolution,
  OnDiffLineClickProps,
  OnLineClickProps,
  ParsePatchOptions,
  SelectedLineRange,
  SelectionSide,
  ThemeTypes,
  TokenEventBase,
  UnresolvedFileOptions,
} from '@pierre/diffs'
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

export interface FileViewInput<LAnnotation = unknown> {
  kind: 'file'
  file: FileContents
  annotations?: LineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileOptions<LAnnotation, undefined>>
  workerManager?: WorkerPoolManager
}

export interface DiffViewInput<LAnnotation = unknown> {
  kind: 'diff'
  oldFile: FileContents
  newFile: FileContents
  annotations?: DiffLineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileDiffOptions<LAnnotation, undefined>>
  workerManager?: WorkerPoolManager
}

export interface ParsedDiffViewInput<LAnnotation = unknown> {
  kind: 'diff'
  fileDiff: FileDiffMetadata
  annotations?: DiffLineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileDiffOptions<LAnnotation, undefined>>
  workerManager?: WorkerPoolManager
}

export interface PatchViewInput<LAnnotation = unknown> {
  kind: 'patch'
  patch: string
  patchIndex?: number
  fileIndex?: number
  annotations?: DiffLineAnnotation<LAnnotation>[]
  options?: WithAutoHighlighter<FileDiffOptions<LAnnotation, undefined>>
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

export type DiffSurfaceInput<LAnnotation = unknown>
  = | FileViewInput<LAnnotation>
    | DiffViewInput<LAnnotation>
    | ParsedDiffViewInput<LAnnotation>
    | PatchViewInput<LAnnotation>
    | MergeConflictViewInput<LAnnotation>

export interface DiffSurfaceController<LAnnotation = unknown> {
  mount(container: HTMLElement): Promise<void>
  update(input: DiffSurfaceInput<LAnnotation>): Promise<void>
  updateFile(file: FileContents, annotations?: LineAnnotation<LAnnotation>[]): Promise<void>
  updateDiff(oldFile: FileContents, newFile: FileContents, annotations?: DiffLineAnnotation<LAnnotation>[]): Promise<void>
  updateParsedDiff(fileDiff: FileDiffMetadata, annotations?: DiffLineAnnotation<LAnnotation>[]): Promise<void>
  updatePatch(patch: string, fileIndex?: number, annotations?: DiffLineAnnotation<LAnnotation>[], patchIndex?: number): Promise<void>
  updateMergeConflict(file: FileContents, annotations?: DiffLineAnnotation<LAnnotation>[]): Promise<void>
  setSelectedLines(range: SelectedLineRange | null): void
  setAnnotations(annotations: LineAnnotation<LAnnotation>[] | DiffLineAnnotation<LAnnotation>[]): void
  setThemeType(themeType: ThemeTypes): void
  setTheme(theme: FileOptions<LAnnotation, undefined>['theme']): Promise<void>
  setOptions(options: FileOptions<LAnnotation, undefined> | FileDiffOptions<LAnnotation, undefined> | UnresolvedFileOptions<LAnnotation>): Promise<void>
  acceptReject(hunkIndex: number, action: 'accept' | 'reject' | 'both' | { type: 'accept' | 'reject' | 'both', changeIndex: number }): FileDiffMetadata
  resolveConflict(conflictIndex: number, resolution: MergeConflictResolution): FileContents | undefined
  getResolvedFile(): FileContents | undefined
  getDiff(): FileDiffMetadata | undefined
  getInput(): DiffSurfaceInput<LAnnotation>
  getNativeInstance(): File<LAnnotation> | FileDiff<LAnnotation> | UnresolvedFile<LAnnotation> | undefined
  prepareForEditing(): Promise<void>
  onDidRender(listener: () => void): { dispose(): void }
  whenVisualReady(): Promise<boolean>
  dispose(): void
}
