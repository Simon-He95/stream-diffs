import type { DiffLineAnnotation } from '@pierre/diffs'
import type { DiffSurfaceController } from './DiffSurfaceController'
import type { CodeStreamState, DiffStreamOptions } from './types'
import { createDiffSurface } from './DiffSurfaceController'
import { createShell, fileContents } from './internal'

/**
 * A low-cost diff placeholder. It never tokenizes while either side changes;
 * finalize() swaps the same shell to a single @pierre/diffs render.
 */
export class DiffStreamController<LAnnotation = unknown> {
  private state: CodeStreamState = 'idle'
  private generation = 0
  private original = ''
  private modified = ''
  private container?: HTMLElement
  private shell?: HTMLElement
  private surface?: HTMLElement
  private finalizedSurface?: DiffSurfaceController<LAnnotation>
  private finalizePromise?: Promise<DiffSurfaceController<LAnnotation> | undefined>
  private renderListeners = new Set<() => void>()
  private finalizedRenderSubscription?: { dispose(): void }

  constructor(private options: DiffStreamOptions<LAnnotation> = {}) {}

  async mount(container: HTMLElement, original = this.original, modified = this.modified) {
    if (this.state === 'disposed')
      throw new Error('Cannot mount a disposed diff stream. Create a new controller instead.')

    ++this.generation
    this.original = original
    this.modified = modified
    this.finalizedSurface?.dispose()
    this.finalizedRenderSubscription?.dispose()
    this.container?.replaceChildren()
    this.finalizedSurface = undefined
    this.finalizedRenderSubscription = undefined

    this.setState('mounting')
    this.container = container
    const { shell, surface } = createShell(container, this.options.maxHeight)
    this.shell = shell
    this.surface = surface
    this.renderPre()
    this.setState('streaming')
  }

  update(original: string, modified: string) {
    if (this.state === 'disposed')
      throw new Error('Cannot update a disposed diff stream')
    this.original = original
    this.modified = modified
    if (this.finalizedSurface)
      return this.finalizedSurface.updateDiff(this.asFile(original), this.asFile(modified))
    this.renderPre()
    this.emitRender()
    return Promise.resolve()
  }

  finalize(annotations?: DiffLineAnnotation<LAnnotation>[]) {
    if (this.state === 'finalized')
      return Promise.resolve(this.finalizedSurface)
    if (this.finalizePromise)
      return this.finalizePromise
    const promise = this.performFinalize(annotations).finally(() => {
      if (this.finalizePromise === promise)
        this.finalizePromise = undefined
    })
    this.finalizePromise = promise
    return promise
  }

  private async performFinalize(annotations?: DiffLineAnnotation<LAnnotation>[]) {
    if (this.state === 'disposed')
      throw new Error('Cannot finalize a disposed diff stream')
    const surface = this.surface
    if (!surface)
      throw new Error('Mount the diff stream before finalizing it')

    const generation = this.generation
    this.setState('finalizing')
    const finalized = createDiffSurface<LAnnotation>({
      kind: 'diff',
      oldFile: this.asFile(this.original),
      newFile: this.asFile(this.modified),
      annotations,
      options: { ...this.options, diffStyle: this.options.diffStyle ?? 'unified' },
      workerManager: this.options.workerManager,
    })
    const staging = document.createElement('div')
    staging.className = 'stream-diffs-finalized'
    await finalized.mount(staging)
    if (generation !== this.generation) {
      finalized.dispose()
      return undefined
    }

    const shell = this.shell
    const scrollTop = shell?.scrollTop ?? 0
    surface.replaceWith(staging)
    this.surface = staging
    this.finalizedSurface = finalized
    this.finalizedRenderSubscription = finalized.onDidRender(() => this.emitRender())
    if (shell)
      shell.scrollTop = scrollTop
    this.setState('finalized')
    this.emitRender()
    return finalized
  }

  setThemeType(type: 'system' | 'light' | 'dark') {
    this.options.themeType = type
    this.finalizedSurface?.setThemeType(type)
  }

  async setTheme(theme: DiffStreamOptions<LAnnotation>['theme']) {
    this.options.theme = theme
    if (this.finalizedSurface)
      await this.finalizedSurface.setTheme(theme)
  }

  async setLanguage(language: string) {
    if (language === this.options.language)
      return
    this.options.language = language
    if (this.finalizedSurface) {
      const input = this.finalizedSurface.getInput()
      if (input.kind === 'diff' && 'oldFile' in input) {
        await this.finalizedSurface.updateDiff(
          { ...input.oldFile, lang: language },
          { ...input.newFile, lang: language },
          input.annotations,
        )
      }
      return
    }
    this.renderPre()
  }

  getOriginal() {
    return this.original
  }

  getModified() {
    return this.modified
  }

  getState() {
    return this.state
  }

  getElement() {
    return this.shell
  }

  getFinalizedSurface() {
    return this.finalizedSurface
  }

  onDidRender(listener: () => void) {
    this.renderListeners.add(listener)
    return { dispose: () => this.renderListeners.delete(listener) }
  }

  dispose() {
    ++this.generation
    this.finalizedSurface?.dispose()
    this.finalizedRenderSubscription?.dispose()
    this.container?.replaceChildren()
    this.container = undefined
    this.shell = undefined
    this.surface = undefined
    this.finalizedSurface = undefined
    this.finalizedRenderSubscription = undefined
    this.finalizePromise = undefined
    this.renderListeners.clear()
    this.setState('disposed')
  }

  private renderPre() {
    const surface = this.surface
    if (!surface || this.finalizedSurface)
      return
    const root = document.createElement('div')
    root.className = `stream-diffs-diff-pre stream-diffs-diff-pre--${this.options.diffStyle ?? 'unified'}`
    root.dataset.streamDiffsState = 'streaming'
    root.style.minWidth = 'max-content'

    if ((this.options.diffStyle ?? 'unified') === 'split') {
      root.style.display = 'grid'
      root.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1fr)'
      root.append(this.createPre(this.original, 'deletions'), this.createPre(this.modified, 'additions'))
    }
    else {
      root.append(this.createPre(createUnifiedPreview(this.original, this.modified), 'unified'))
    }
    surface.replaceChildren(root)
  }

  private createPre(text: string, side: 'deletions' | 'additions' | 'unified') {
    const pre = document.createElement('pre')
    pre.className = `stream-diffs-diff-pre__pane stream-diffs-diff-pre__pane--${side}`
    pre.dataset.side = side
    pre.style.margin = '0'
    pre.style.whiteSpace = this.options.wrap ? 'pre-wrap' : 'pre'
    pre.style.overflowWrap = this.options.wrap ? 'anywhere' : 'normal'
    pre.textContent = text
    return pre
  }

  private asFile(contents: string) {
    return fileContents(this.options.fileName ?? `code.${this.options.language ?? 'txt'}`, contents, this.options.language)
  }

  private setState(state: CodeStreamState) {
    this.state = state
    this.options.onStateChange?.(state)
  }

  private emitRender() {
    for (const listener of this.renderListeners)
      listener()
  }
}

function createUnifiedPreview(original: string, modified: string) {
  const before = original.split('\n')
  const after = modified.split('\n')
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix++

  let suffix = 0
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix++
  }

  const lines = [
    ...before.slice(0, prefix).map(line => `  ${line}`),
    ...before.slice(prefix, before.length - suffix).map(line => `- ${line}`),
    ...after.slice(prefix, after.length - suffix).map(line => `+ ${line}`),
    ...before.slice(before.length - suffix).map(line => `  ${line}`),
  ]
  return lines.join('\n')
}

export function createDiffStream<LAnnotation = unknown>(options?: DiffStreamOptions<LAnnotation>) {
  return new DiffStreamController(options)
}
