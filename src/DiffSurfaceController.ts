import type {
  DiffLineAnnotation,
  File,
  FileContents,
  FileDiff,
  FileDiffMetadata,
  LineAnnotation,
  SelectedLineRange,
  UnresolvedFile,
} from '@pierre/diffs'
import type { DiffSurfaceController as Controller, DiffSurfaceInput } from './types'
import { createShell } from './internal'

type PierreInstance<LAnnotation> = File<LAnnotation> | FileDiff<LAnnotation> | UnresolvedFile<LAnnotation>

export class DiffSurfaceController<LAnnotation = unknown> implements Controller<LAnnotation> {
  private container?: HTMLElement
  private surface?: HTMLElement
  private instance?: PierreInstance<LAnnotation>
  private diff?: FileDiffMetadata
  private selectedLines: SelectedLineRange | null = null
  private disposed = false
  private renderListeners = new Set<() => void>()

  constructor(private input: DiffSurfaceInput<LAnnotation>) {}

  async mount(container: HTMLElement) {
    this.disposed = false
    this.container = container
    this.surface = createShell(container).surface
    await this.render()
  }

  async update(input: DiffSurfaceInput<LAnnotation>) {
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
      ;(this.instance as File<LAnnotation>).setLineAnnotations(this.input.annotations)
    }
    else {
      this.input.annotations = annotations as DiffLineAnnotation<LAnnotation>[]
      ;(this.instance as FileDiff<LAnnotation>).setLineAnnotations(this.input.annotations)
    }
    this.emitRender()
  }

  setThemeType(themeType: 'system' | 'light' | 'dark') {
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

  async setOptions(options: NonNullable<DiffSurfaceInput<LAnnotation>['options']>) {
    this.input.options = options as any
    if (this.surface)
      await this.render(false)
  }

  acceptReject(hunkIndex: number, action: 'accept' | 'reject' | 'both' | { type: 'accept' | 'reject' | 'both', changeIndex: number }) {
    if (!isDiffInput(this.input) || !this.diff)
      throw new Error('acceptReject() requires a diff view')
    const { diffAcceptRejectHunk } = this.module!
    this.diff = diffAcceptRejectHunk(this.diff, hunkIndex, action)
    ;(this.instance as FileDiff<LAnnotation>).render({
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

  onDidRender(listener: () => void) {
    this.renderListeners.add(listener)
    return { dispose: () => this.renderListeners.delete(listener) }
  }

  dispose() {
    this.disposed = true
    this.instance?.cleanUp()
    this.instance = undefined
    this.surface = undefined
    this.container?.replaceChildren()
    this.container = undefined
    this.renderListeners.clear()
  }

  private module?: typeof import('@pierre/diffs')

  private async render(resetDiff = true) {
    const surface = this.surface
    if (!surface || this.disposed)
      return
    const mod = this.module ??= await import('@pierre/diffs')
    if (this.disposed || surface !== this.surface)
      return

    this.instance?.cleanUp()
    surface.replaceChildren()
    if (this.input.kind === 'file') {
      const instance = new mod.File<LAnnotation>(withInternalPostRender(this.input.options, () => this.emitRender()), this.input.workerManager)
      instance.render({ file: this.input.file, containerWrapper: surface, lineAnnotations: this.input.annotations })
      this.instance = instance
      instance.setSelectedLines(this.selectedLines)
      this.diff = undefined
      this.emitRender()
      return
    }
    if (isDiffInput(this.input)) {
      if (resetDiff || !this.diff) {
        if (this.input.kind === 'patch') {
          const parsed = mod.parsePatchFiles(this.input.patch)
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
            this.input.options?.parseDiffOptions,
          )
        }
      }
      const instance = new mod.FileDiff<LAnnotation>(withInternalPostRender(this.input.options, () => this.emitRender()), this.input.workerManager)
      instance.render({ fileDiff: this.diff, containerWrapper: surface, lineAnnotations: this.input.annotations })
      this.instance = instance
      instance.setSelectedLines(this.selectedLines)
      this.emitRender()
      return
    }
    const instance = new mod.UnresolvedFile<LAnnotation>(withInternalPostRender(this.input.options, () => this.emitRender()), this.input.workerManager)
    instance.render({ file: this.input.file, containerWrapper: surface, lineAnnotations: this.input.annotations })
    this.instance = instance
    instance.setSelectedLines(this.selectedLines)
    this.diff = instance.fileDiff
    this.emitRender()
  }

  private emitRender() {
    for (const listener of this.renderListeners)
      listener()
  }
}

export function createDiffSurface<LAnnotation = unknown>(input: DiffSurfaceInput<LAnnotation>) {
  return new DiffSurfaceController(input)
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

function isDiffInput<LAnnotation>(input: DiffSurfaceInput<LAnnotation>) {
  return input.kind === 'diff' || input.kind === 'patch'
}
