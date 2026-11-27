import type { DiffLineAnnotation, FileDiffOptions, FileOptions, LineAnnotation } from '@pierre/diffs'
import type { DiffSurfaceController } from './DiffSurfaceController'
import type { CodeStreamOptions, CodeStreamState, CodeStreamStats, FinalizeOptions } from './types'
import { createDiffSurface } from './DiffSurfaceController'
import {
  compatibleWorkerManager,
  createShell,
  createStreamGutter,
  createStreamHeader,
  fileContents,
  streamCodeFont,
  streamCodeSize,
  streamLineHeight,
  TextAccumulator,
} from './internal'

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
  private gutter?: { el: HTMLDivElement, text: HTMLSpanElement }
  private gutterLineCount = 1
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
    this.gutter = undefined
    this.gutterLineCount = 1
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
    this.syncGutter()
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
      } & Partial<FileOptions<LAnnotation, undefined>>
      const { annotations, workerManager, view: _, ...fileOptions } = fileFinalize
      finalizedSurface = createDiffSurface({
        kind: 'file',
        file: current,
        annotations,
        options: {
          theme: this.options.theme,
          themeType: this.options.themeType,
          disableLineNumbers: this.options.lineNumbers === false,
          disableFileHeader: this.options.showHeader === false,
          overflow: this.options.wrap ? 'wrap' : 'scroll',
          ...fileOptions,
        },
        workerManager: compatibleWorkerManager(workerManager ?? this.options.workerManager),
      })
    }
    else {
      const diffFinalize = options as {
        view: 'diff'
        original: string
        annotations?: DiffLineAnnotation<LAnnotation>[]
        workerManager?: CodeStreamOptions['workerManager']
      } & Partial<FileDiffOptions<LAnnotation, undefined>>
      const { annotations, original, workerManager, view: _, ...diffOptions } = diffFinalize
      finalizedSurface = createDiffSurface({
        kind: 'diff',
        oldFile: fileContents(name, original, this.options.language),
        newFile: current,
        annotations,
        options: {
          theme: this.options.theme,
          themeType: this.options.themeType,
          disableLineNumbers: this.options.lineNumbers === false,
          disableFileHeader: this.options.showHeader === false,
          overflow: this.options.wrap ? 'wrap' : 'scroll',
          ...diffOptions,
        },
        workerManager: compatibleWorkerManager(workerManager ?? this.options.workerManager),
      })
    }

    const staging = document.createElement('div')
    staging.className = 'stream-diffs-finalized'
    // Keep the plain text in normal flow and stage the highlighted surface over
    // it. The swap only happens after the native render is visually ready, so a
    // cold Shiki render never flashes an empty final surface.
    staging.style.position = 'absolute'
    staging.style.inset = '0'
    staging.style.opacity = '0'
    staging.style.pointerEvents = 'none'
    surface.style.position = 'relative'
    surface.append(staging)

    const shell = this.shell
    const scrollTop = shell?.scrollTop ?? 0
    const distanceToBottom = shell
      ? shell.scrollHeight - shell.scrollTop - shell.clientHeight
      : 0
    const follow = this.options.autoScroll === 'always'
      || (this.options.autoScroll !== 'never' && distanceToBottom <= (this.options.autoScrollThresholdPx ?? 32))

    let committed = false
    const commit = () => {
      if (committed || generation !== this.generation)
        return
      committed = true

      const finish = () => {
        if (generation !== this.generation)
          return
        for (const child of [...surface.children]) {
          if (child !== staging)
            child.remove()
        }
        staging.style.position = ''
        staging.style.inset = ''
        staging.style.opacity = ''
        staging.style.pointerEvents = ''
        staging.style.transition = ''
        staging.style.willChange = ''
        this.plainText = undefined
        this.gutter = undefined
        this.gutterLineCount = 1
        if (shell)
          shell.scrollTop = follow ? shell.scrollHeight : scrollTop
        this.emitRender()
      }

      // Crossfade the ready highlighted surface over the plain text. The plain
      // layer stays fully painted underneath, so finalization never exposes an
      // empty or dimmed frame before the syntax colors arrive.
      if (!this.plainText || prefersReducedMotion()) {
        finish()
        return
      }

      this.plainText.dataset.streamDiffsState = 'finalizing'
      staging.style.transition = `opacity ${FINALIZE_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
      staging.style.willChange = 'opacity'
      requestAnimationFrame(() => {
        if (generation !== this.generation)
          return
        staging.style.opacity = '1'
      })
      setTimeout(finish, FINALIZE_FADE_MS + 40)
    }

    this.finalizedSurface = finalizedSurface
    this.finalizedRenderSubscription = finalizedSurface.onDidRender(() => {
      this.emitRender()
      commit()
    })

    await finalizedSurface.mount(staging)
    if (generation !== this.generation) {
      finalizedSurface.dispose()
      return
    }
    // In tests or custom renderers the post-render hook may never fire. The
    // readiness promise settles on the real renderer; the onDidRender listener
    // above commits first when it can.
    void finalizedSurface.whenVisualReady().then(() => commit()).catch(() => commit())

    this.stats.renderMode = 'highlighted'
    this.setState('finalized')
    this.emitRender()
  }

  async whenVisualReady() {
    if (!this.finalizedSurface)
      return false
    return this.finalizedSurface.whenVisualReady()
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
    this.gutter = undefined
    this.gutterLineCount = 1
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
    this.options.themeType = type
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
    this.gutter = undefined
    this.gutterLineCount = 1
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
    const wrap = Boolean(this.options.wrap)
    const showHeader = this.options.showHeader !== false
    const showLineNumbers = this.options.lineNumbers !== false

    const frame = document.createElement('div')
    frame.className = 'stream-diffs-stream'
    if (showHeader)
      frame.append(createStreamHeader(this.fileName()))

    const body = document.createElement('div')
    body.className = 'stream-diffs-body'
    body.style.cssText = 'display:flex;align-items:flex-start;min-width:100%;box-sizing:border-box'

    if (showLineNumbers) {
      const gutter = createStreamGutter(wrap)
      this.gutter = gutter
      body.append(gutter.el)
    }

    const pre = document.createElement('pre')
    pre.className = 'stream-diffs-plain-text'
    pre.dataset.streamDiffsState = 'streaming'
    pre.style.cssText = [
      'flex:1 1 auto',
      'min-width:0',
      'margin:0',
      `padding:${wrap ? '0' : '8px'} 1ch 8px ${wrap ? '0' : '1ch'}`,
      'box-sizing:border-box',
      `font-family:${streamCodeFont()}`,
      `font-size:${streamCodeSize()}`,
      `line-height:${streamLineHeight()}`,
      'tab-size:var(--diffs-tab-size, 2)',
      'font-variant-ligatures:none',
      `white-space:${wrap ? 'pre-wrap' : 'pre'}`,
      `overflow-wrap:${wrap ? 'anywhere' : 'normal'}`,
      'background:transparent',
      'color:inherit',
    ].join(';')
    pre.textContent = this.getText()
    body.append(pre)

    frame.append(body)
    surface.replaceChildren(frame)
    this.plainText = pre
    this.gutterLineCount = 1
    this.syncGutter()
  }

  private fileName() {
    return this.options.fileName ?? `code.${this.options.language ?? 'txt'}`
  }

  private syncGutter() {
    if (!this.gutter)
      return
    const target = Math.max(1, this.stats.lines)
    if (target <= this.gutterLineCount)
      return
    let numbers = ''
    for (let line = this.gutterLineCount + 1; line <= target; line++)
      numbers += `\n${line}`
    this.gutter.text.append(numbers)
    this.gutterLineCount = target
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

const FINALIZE_FADE_MS = 220

function prefersReducedMotion() {
  return typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
