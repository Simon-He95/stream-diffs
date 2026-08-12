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
  private visualRevision = 0
  private visualReadyPromise: Promise<boolean> = Promise.resolve(false)
  private resolveVisualReady?: (ready: boolean) => void
  private themeHeightHold?: { surface: HTMLElement; visualRevision: number; previousMinHeight: string }
  private renderedInput: DiffSurfaceInput<LAnnotation>

  constructor(private input: DiffSurfaceInput<LAnnotation>) {
    this.renderedInput = input
  }

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
    if (this.input.options)
      this.input.options = { ...this.input.options, themeType }
    else
      this.input.options = { themeType } as any
    this.instance?.setThemeType(themeType)
  }

  async setTheme(theme: any) {
    const input: DiffSurfaceInput<LAnnotation> = {
      ...this.input,
      options: {
        ...this.input.options,
        theme,
      },
    } as DiffSurfaceInput<LAnnotation>
    const surface = this.surface
    if (!surface || this.disposed) {
      this.input = input
      return
    }

    const visualRevision = this.beginVisualRender()
    this.input = input
    const visualReady = this.visualReadyPromise
    const previousHold = this.themeHeightHold
    const previousMinHeight = previousHold?.surface === surface
      ? previousHold.previousMinHeight
      : surface.style.minHeight
    const currentRect = surface.getBoundingClientRect()
    const currentHeight = Math.ceil(currentRect.height || Number.parseFloat(surface.style.minHeight) || 0)
    this.releaseThemeHeightHold()
    if (currentHeight > 0) {
      surface.style.minHeight = `${currentHeight}px`
      this.themeHeightHold = { surface, visualRevision, previousMinHeight }
    }

    const isCurrent = () =>
      !this.disposed && surface === this.surface && visualRevision === this.visualRevision
    let staging: HTMLElement | undefined
    let instance: PierreInstance<LAnnotation> | undefined
    try {
      const mod = this.module ??= await import('@pierre/diffs')
      // Pre-register the target theme on the shared highlighter before
      // rendering: the pristine flow renders the new theme with a highlighter
      // that only knows the previous theme, so the switch silently stays on
      // the old theme (and the rebuilt surface causes a redraw flash).
      await mod.resolveThemes(mod.getThemes(input.options?.theme))
      if (!isCurrent()) {
        this.releaseThemeHeightHold(visualRevision)
        return
      }
      const stagingParent = surface.parentElement
      if (!stagingParent)
        throw new Error('Theme handoff requires a connected surface')
      staging = createThemeStagingSurface(surface, currentRect.width || surface.clientWidth)
      stagingParent.append(staging)
      const rendered = this.renderInto(mod, staging, input, false, visualRevision, this.diff)
      instance = rendered.instance
      if (!(await visualReady) || !isCurrent()) {
        instance.cleanUp()
        staging.remove()
        this.releaseThemeHeightHold(visualRevision)
        return
      }
      let measurable = await waitForMeasurableLayout(staging, isCurrent)
      while (!measurable && isCurrent()) {
        // The off-screen staging cannot be measured while the surface is
        // hidden (route switch, minimized window); retry in batches instead
        // of failing and permanently keeping the old theme. dispose()/a newer
        // revision cancel via isCurrent().
        measurable = await waitForMeasurableLayout(staging, isCurrent)
      }
      if (!isCurrent()) {
        instance.cleanUp()
        staging.remove()
        this.releaseThemeHeightHold(visualRevision)
        return
      }
      const previousInstance = this.instance
      surface.replaceChildren(...Array.from(staging.childNodes))
      staging.remove()
      staging = undefined
      this.instance = instance
      this.diff = rendered.diff
      this.renderedInput = input
      previousInstance?.cleanUp()
      this.emitRender()
      await waitForVisualFrame()
      if (visualRevision === this.visualRevision) {
        this.releaseThemeHeightHold(visualRevision)
        this.emitRender()
      }
    }
    catch (error) {
      instance?.cleanUp()
      staging?.remove()
      this.releaseThemeHeightHold(visualRevision)
      if (visualRevision === this.visualRevision) {
        this.input = this.renderedInput
        this.invalidateVisualReady()
        throw error
      }
    }
  }

  private releaseThemeHeightHold(visualRevision?: number) {
    const hold = this.themeHeightHold
    if (!hold || (visualRevision !== undefined && hold.visualRevision !== visualRevision))
      return
    hold.surface.style.minHeight = hold.previousMinHeight
    this.themeHeightHold = undefined
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
    this.releaseThemeHeightHold()
    this.invalidateVisualReady()
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
    this.releaseThemeHeightHold()
    const visualRevision = this.beginVisualRender()
    const input = this.input
    const mod = this.module ??= await import('@pierre/diffs')
    if (this.disposed || surface !== this.surface || visualRevision !== this.visualRevision)
      return

    this.instance?.cleanUp()
    surface.replaceChildren()
    const rendered = this.renderInto(mod, surface, input, resetDiff, visualRevision, this.diff)
    if (this.disposed || surface !== this.surface || visualRevision !== this.visualRevision) {
      rendered.instance.cleanUp()
      return
    }
    this.instance = rendered.instance
    this.diff = rendered.diff
    this.renderedInput = input
  }

  private renderInto(
    mod: typeof import('@pierre/diffs'),
    surface: HTMLElement,
    input: DiffSurfaceInput<LAnnotation>,
    resetDiff: boolean,
    visualRevision: number,
    currentDiff: FileDiffMetadata | undefined,
  ): { instance: PierreInstance<LAnnotation>; diff: FileDiffMetadata | undefined } {
    if (input.kind === 'file') {
      const instance = new mod.File<LAnnotation>(
        withInternalPostRender(input.options, () => this.markVisualReady(visualRevision)),
        input.workerManager,
      )
      this.renderInstance(instance, {
        file: input.file,
        containerWrapper: surface,
        lineAnnotations: input.annotations,
      })
      return { instance, diff: undefined }
    }
    if (isDiffInput(input)) {
      let diff = currentDiff
      if (resetDiff || !diff) {
        if (input.kind === 'patch') {
          const parsed = mod.parsePatchFiles(input.patch)
          const patch = parsed[input.patchIndex ?? 0]
          if (!patch)
            throw new Error(`Patch does not contain patch index ${input.patchIndex ?? 0}`)
          const fileDiff = patch.files[input.fileIndex ?? 0]
          if (!fileDiff)
            throw new Error(`Patch does not contain file index ${input.fileIndex ?? 0}`)
          diff = fileDiff
        }
        else if ('fileDiff' in input) {
          diff = input.fileDiff
        }
        else {
          diff = mod.parseDiffFromFile(
            input.oldFile,
            input.newFile,
            input.options?.parseDiffOptions,
          )
        }
      }
      const instance = new mod.FileDiff<LAnnotation>(
        withInternalPostRender(input.options, () => this.markVisualReady(visualRevision)),
        input.workerManager,
      )
      this.renderInstance(instance, {
        fileDiff: diff,
        containerWrapper: surface,
        lineAnnotations: input.annotations,
      })
      return { instance, diff }
    }
    const instance = new mod.UnresolvedFile<LAnnotation>(
      withInternalPostRender(input.options, () => this.markVisualReady(visualRevision)),
      input.workerManager,
    )
    this.renderInstance(instance, {
      file: input.file,
      containerWrapper: surface,
      lineAnnotations: input.annotations,
    })
    return { instance, diff: instance.fileDiff }
  }

  private renderInstance(instance: PierreInstance<LAnnotation>, renderInput: any) {
    try {
      ;(instance as any).render(renderInput)
      instance.setSelectedLines(this.selectedLines)
    }
    catch (error) {
      instance.cleanUp()
      throw error
    }
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

function waitForVisualFrame(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
    return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    let frame: number | undefined
    let timeout: number | undefined
    const done = () => {
      if (settled)
        return
      settled = true
      if (frame !== undefined)
        window.cancelAnimationFrame(frame)
      if (timeout !== undefined)
        window.clearTimeout(timeout)
      resolve()
    }
    frame = window.requestAnimationFrame(done)
    timeout = window.setTimeout(done, 50)
  })
}

async function waitForMeasurableLayout(surface: HTMLElement, isCurrent: () => boolean): Promise<boolean> {
  let previousHeight = 0
  let stableFrames = 0
  for (let frame = 0; frame < 120; frame += 1) {
    if (!isCurrent())
      return false
    const pre = surface.querySelector('diffs-container')?.shadowRoot?.querySelector('pre')
    const height = Math.ceil(surface.getBoundingClientRect().height || 0)
    if (pre && height > 0) {
      stableFrames = height === previousHeight ? stableFrames + 1 : 1
      previousHeight = height
      if (stableFrames >= 2)
        return true
    }
    else {
      previousHeight = 0
      stableFrames = 0
    }
    await waitForVisualFrame()
  }
  return false
}

function createThemeStagingSurface(surface: HTMLElement, width: number): HTMLElement {
  const staging = surface.cloneNode(false) as HTMLElement
  staging.style.position = 'fixed'
  staging.style.visibility = 'hidden'
  staging.style.pointerEvents = 'none'
  staging.style.left = '-100000px'
  staging.style.top = '0'
  staging.style.width = `${Math.max(1, Math.ceil(width))}px`
  staging.style.minHeight = ''
  return staging
}
