import type { DiffLineAnnotation, FileDiffOptions, FileOptions, LineAnnotation } from '@pierre/diffs'
import type { DiffSurfaceController } from './DiffSurfaceController'
import type { CodeStreamOptions, CodeStreamState, CodeStreamStats, FinalizeOptions } from './types'
import { createDiffSurface } from './DiffSurfaceController'
import { createShell, fileContents, TextAccumulator } from './internal'

/**
 * Keeps streaming updates in one plain `<pre>`. Syntax highlighting is only
 * created by finalize(), after the caller decides the block is complete.
 */
export class CodeStreamController {
  private state: CodeStreamState = 'idle'
  private stats: CodeStreamStats = {
    characters: 0,
    lines: 0,
    writes: 0,
    resets: 0,
    renderMode: 'plain-text',
    overflowed: false,
  }
  private text = new TextAccumulator()
  private pending: string[] = []
  private scheduled?: number
  private generation = 0
  private container?: HTMLElement
  private shell?: HTMLElement
  private surface?: HTMLElement
  private finalizedSurface?: DiffSurfaceController<any>
  private plainText?: HTMLPreElement
  private finalizePromise?: Promise<void>
  private renderListeners = new Set<() => void>()
  private finalizedRenderSubscription?: { dispose(): void }

  constructor(private options: CodeStreamOptions = {}) {}

  async mount(container: HTMLElement) {
    if (this.state === 'disposed')
      throw new Error('Cannot mount a disposed code stream. Create a new controller instead.')

    ++this.generation
    this.cancelScheduledFlush()
    this.finalizedSurface?.dispose()
    this.finalizedRenderSubscription?.dispose()
    this.container?.replaceChildren()
    this.finalizedSurface = undefined
    this.finalizedRenderSubscription = undefined
    this.plainText = undefined
    this.pending = []

    this.setState('mounting')
    this.container = container
    const { shell, surface } = createShell(container, this.options.maxHeight)
    this.shell = shell
    this.surface = surface
    this.mountPlainText(surface)
    this.stats.startedAt ??= performance.now()
    this.setState('streaming')
  }

  append(chunk: string) {
    if (!chunk)
      return
    if (this.state === 'finalized' || this.state === 'finalizing' || this.state === 'disposed')
      throw new Error(`Cannot append while stream is ${this.state}`)

    this.text.append(chunk)
    this.stats.characters = this.text.length
    this.stats.lines += countNewlines(chunk) + (this.stats.lines === 0 ? 1 : 0)
    this.pending.push(chunk)
    this.scheduleFlush()
  }

  updateSnapshot(content: string) {
    const previous = this.text.toString()
    if (content.startsWith(previous)) {
      this.append(content.slice(previous.length))
      return
    }
    const behavior = this.options.nonAppendBehavior ?? 'reset'
    if (behavior === 'ignore')
      return
    if (behavior === 'throw')
      throw new Error('Snapshot violates the append-only stream contract')
    return this.reset(content)
  }

  async consume(source: ReadableStream<string> | AsyncIterable<string>) {
    try {
      if (Symbol.asyncIterator in source) {
        for await (const chunk of source as AsyncIterable<string>)
          this.append(chunk)
      }
      else {
        const reader = (source as ReadableStream<string>).getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done)
              break
            this.append(value)
          }
        }
        finally {
          reader.releaseLock()
        }
      }
    }
    catch (error) {
      this.fail(error)
      throw error
    }
  }

  async flush() {
    this.cancelScheduledFlush()
    if (!this.pending.length)
      return

    const shouldFollow = this.shouldFollowViewport()
    const batch = this.pending.join('')
    this.pending.length = 0
    this.plainText?.append(batch)
    this.stats.writes++
    this.followViewport(shouldFollow)
    this.emitRender()
  }

  finalize<LAnnotation = unknown>(options: FinalizeOptions<LAnnotation> = { view: 'stream' }) {
    if (this.state === 'finalized')
      return Promise.resolve()
    if (this.finalizePromise)
      return this.finalizePromise
    const promise = this.performFinalize(options).finally(() => {
      if (this.finalizePromise === promise)
        this.finalizePromise = undefined
    })
    this.finalizePromise = promise
    return promise
  }

  private async performFinalize<LAnnotation>(options: FinalizeOptions<LAnnotation>) {
    if (this.state === 'disposed')
      throw new Error('Cannot finalize a disposed code stream')

    const generation = this.generation
    this.setState('finalizing')
    await this.flush()
    if (generation !== this.generation)
      return

    this.stats.finalizedAt = performance.now()
    if (!options.view || options.view === 'stream') {
      this.setState('finalized')
      return
    }

    const surface = this.surface
    if (!surface)
      throw new Error('Mount the stream before finalizing to a file or diff view')

    const name = this.options.fileName ?? `code.${this.options.language ?? 'txt'}`
    const current = fileContents(name, this.getText(), this.options.language)
    let finalizedSurface: DiffSurfaceController<any>
    if (options.view === 'file') {
      const fileFinalize = options as {
        view: 'file'
        annotations?: LineAnnotation<LAnnotation>[]
        workerManager?: CodeStreamOptions['workerManager']
      } & Partial<FileOptions<LAnnotation>>
      const { annotations, workerManager, view: _, ...fileOptions } = fileFinalize
      finalizedSurface = createDiffSurface({
        kind: 'file',
        file: current,
        annotations,
        options: fileOptions,
        workerManager: workerManager ?? this.options.workerManager,
      })
    }
    else {
      const diffFinalize = options as {
        view: 'diff'
        original: string
        annotations?: DiffLineAnnotation<LAnnotation>[]
        workerManager?: CodeStreamOptions['workerManager']
      } & Partial<FileDiffOptions<LAnnotation>>
      const { annotations, original, workerManager, view: _, ...diffOptions } = diffFinalize
      finalizedSurface = createDiffSurface({
        kind: 'diff',
        oldFile: fileContents(name, original, this.options.language),
        newFile: current,
        annotations,
        options: diffOptions,
        workerManager: workerManager ?? this.options.workerManager,
      })
    }

    const staging = document.createElement('div')
    staging.className = 'stream-diffs-finalized'
    await finalizedSurface.mount(staging)
    if (generation !== this.generation) {
      finalizedSurface.dispose()
      return
    }

    const shell = this.shell
    const scrollTop = shell?.scrollTop ?? 0
    const distanceToBottom = shell
      ? shell.scrollHeight - shell.scrollTop - shell.clientHeight
      : 0
    surface.replaceWith(staging)
    this.surface = staging
    this.plainText = undefined
    this.finalizedSurface = finalizedSurface
    this.finalizedRenderSubscription = finalizedSurface.onDidRender(() => this.emitRender())
    if (shell) {
      if (this.options.autoScroll === 'always' || (this.options.autoScroll !== 'never' && distanceToBottom <= (this.options.autoScrollThresholdPx ?? 32)))
        shell.scrollTop = shell.scrollHeight
      else
        shell.scrollTop = scrollTop
    }
    this.setState('finalized')
    this.emitRender()
  }

  async reset(initialContent = '') {
    const container = this.container
    ++this.generation
    this.cancelScheduledFlush()
    this.finalizedSurface?.dispose()
    this.finalizedRenderSubscription?.dispose()
    this.finalizedSurface = undefined
    this.finalizedRenderSubscription = undefined
    this.plainText = undefined
    this.pending = []
    this.finalizePromise = undefined
    this.text.clear()
    this.stats.resets++
    this.stats.characters = 0
    this.stats.lines = 0
    this.stats.renderMode = 'plain-text'
    this.stats.overflowed = false
    this.setState('idle')
    if (initialContent)
      this.append(initialContent)
    if (container)
      await this.mount(container)
  }

  setThemeType(type: 'system' | 'dark' | 'light') {
    this.finalizedSurface?.setThemeType(type)
  }

  async setTheme(theme: CodeStreamOptions['theme']) {
    this.options.theme = theme
    if (this.finalizedSurface)
      await this.finalizedSurface.setTheme(theme)
  }

  async setLanguage(language: string) {
    if (language === this.options.language)
      return
    this.options.language = language
    if (!this.finalizedSurface)
      return

    const input = this.finalizedSurface.getInput()
    if (input.kind === 'file')
      await this.finalizedSurface.updateFile({ ...input.file, lang: language }, input.annotations)
    else if (input.kind === 'diff' && 'oldFile' in input) {
      await this.finalizedSurface.updateDiff(
        { ...input.oldFile, lang: language },
        { ...input.newFile, lang: language },
        input.annotations,
      )
    }
  }

  getText() {
    return this.text.toString()
  }

  getState() {
    return this.state
  }

  getStats() {
    return { ...this.stats }
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
    this.cancelScheduledFlush()
    this.finalizedSurface?.dispose()
    this.finalizedRenderSubscription?.dispose()
    this.container?.replaceChildren()
    this.plainText = undefined
    this.container = undefined
    this.surface = undefined
    this.shell = undefined
    this.finalizedSurface = undefined
    this.finalizedRenderSubscription = undefined
    this.finalizePromise = undefined
    this.renderListeners.clear()
    this.setState('disposed')
  }

  private scheduleFlush() {
    if (this.scheduled != null || !this.plainText)
      return
    const strategy = this.options.flushStrategy ?? 'raf'
    if (strategy === 'raf' && typeof requestAnimationFrame === 'function')
      this.scheduled = requestAnimationFrame(() => void this.flush())
    else
      this.scheduled = globalThis.setTimeout(() => void this.flush(), strategy === 'raf' ? 0 : strategy.intervalMs) as unknown as number
  }

  private cancelScheduledFlush() {
    if (this.scheduled == null)
      return
    if (typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this.scheduled)
    clearTimeout(this.scheduled)
    this.scheduled = undefined
  }

  private shouldFollowViewport() {
    const shell = this.shell
    if (!shell || this.options.autoScroll === 'never')
      return false
    if (this.options.autoScroll === 'always')
      return true
    return shell.scrollHeight - shell.scrollTop - shell.clientHeight <= (this.options.autoScrollThresholdPx ?? 32)
  }

  private followViewport(shouldFollow = this.shouldFollowViewport()) {
    if (this.shell && shouldFollow)
      this.shell.scrollTop = this.shell.scrollHeight
  }

  private mountPlainText(surface: HTMLElement) {
    const pre = document.createElement('pre')
    pre.className = 'stream-diffs-plain-text'
    pre.dataset.streamDiffsState = 'streaming'
    pre.style.margin = '0'
    pre.style.whiteSpace = this.options.wrap ? 'pre-wrap' : 'pre'
    pre.style.overflowWrap = this.options.wrap ? 'anywhere' : 'normal'
    pre.textContent = this.getText()
    surface.replaceChildren(pre)
    this.plainText = pre
  }

  private setState(state: CodeStreamState) {
    this.state = state
    this.options.onStateChange?.(state)
  }

  private emitRender() {
    for (const listener of this.renderListeners)
      listener()
  }

  private fail(error: unknown) {
    if (this.state === 'disposed')
      return
    this.setState('error')
    this.options.onError?.(error)
  }
}

function countNewlines(value: string) {
  let count = 0
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10)
      count++
  }
  return count
}

export function createCodeStream(options?: CodeStreamOptions) {
  return new CodeStreamController(options)
}
