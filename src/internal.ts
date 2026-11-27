export class TextAccumulator {
  private chunks: string[] = []
  private cached = ''
  private dirty = false
  length = 0

  append(chunk: string) {
    if (!chunk)
      return
    this.chunks.push(chunk)
    this.length += chunk.length
    this.dirty = true
    if (this.chunks.length > 256)
      this.compact()
  }

  clear(initial = '') {
    this.chunks = initial ? [initial] : []
    this.cached = initial
    this.dirty = false
    this.length = initial.length
  }

  toString() {
    if (this.dirty) {
      this.cached = this.chunks.join('')
      this.dirty = false
    }
    return this.cached
  }

  private compact() {
    this.chunks = [this.chunks.join('')]
  }
}

export function createShell(container: HTMLElement, maxHeight?: number | string) {
  container.replaceChildren()
  const shell = document.createElement('div')
  shell.className = 'stream-diffs-shell'
  shell.style.overflow = 'auto'
  shell.style.maxHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight ?? 'none'
  const surface = document.createElement('div')
  surface.className = 'stream-diffs-surface'
  shell.appendChild(surface)
  container.appendChild(shell)
  return { shell, surface }
}

export function fileContents(name: string, contents: string, language?: string) {
  return { name, contents, lang: language }
}

const STREAM_MONO_FALLBACK = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'
const STREAM_HEADER_FONT_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif'

export function streamCodeFont() {
  return `var(--diffs-font-family, ${STREAM_MONO_FALLBACK})`
}

export function streamCodeSize() {
  return 'var(--diffs-font-size, 13px)'
}

export function streamLineHeight() {
  return 'var(--diffs-line-height, 20px)'
}

/**
 * The streaming header mirrors the height, inset, icon size, and typography of
 * the @pierre/diffs file header. The final render replaces this node with the
 * real header, so the first code line never moves.
 */
export function createStreamHeader(fileName: string): HTMLElement {
  const header = document.createElement('div')
  header.className = 'stream-diffs-header'
  header.dataset.streamDiffsState = 'streaming'
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'height:44px',
    'padding:0 16px',
    'box-sizing:border-box',
    'font-family:var(--diffs-header-font-family, ' + STREAM_HEADER_FONT_FALLBACK + ')',
    'font-size:13px',
    'line-height:20px',
    'overflow:hidden',
    'white-space:nowrap',
  ].join(';')

  const icon = document.createElement('span')
  icon.setAttribute('aria-hidden', 'true')
  icon.style.cssText = 'width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;opacity:.8'
  icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 5 3 8l2.5 3M10.5 5 13 8l-2.5 3"/></svg>'

  const title = document.createElement('span')
  title.className = 'stream-diffs-header-title'
  title.textContent = fileName
  title.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
  header.append(icon, title)
  return header
}

export function createStreamGutter(wrap: boolean): { el: HTMLDivElement, text: HTMLSpanElement } {
  const gutter = document.createElement('div')
  gutter.className = 'stream-diffs-gutter'
  gutter.setAttribute('aria-hidden', 'true')
  gutter.style.cssText = [
    'flex:none',
    `padding:${wrap ? '0' : '8px'} 1ch 8px 2ch`,
    'border-right:2px solid transparent',
    'box-sizing:border-box',
    'font-family:' + streamCodeFont(),
    `font-size:${streamCodeSize()}`,
    `line-height:${streamLineHeight()}`,
    'text-align:right',
    'white-space:pre',
    'user-select:none',
    'pointer-events:none',
    'opacity:.55',
    wrap ? 'visibility:hidden' : 'visibility:visible',
  ].join(';')
  const text = document.createElement('span')
  text.className = 'stream-diffs-gutter-text'
  // Match @pierre/diffs' minimum number column from the first chunk. If the
  // plain gutter only grows when line 10 arrives, the code column shifts right
  // mid-stream and finalize lands at a different x.
  text.style.cssText = 'display:block;white-space:pre;font-variant-numeric:tabular-nums;text-align:right;min-width:var(--diffs-min-number-column-width,var(--diffs-min-number-column-width-default,2ch))'
  text.textContent = '1'
  gutter.append(text)
  return { el: gutter, text }
}


const incompatibleWorkerManagers = new WeakSet<object>()

/**
 * `@pierre/diffs@1.7` calls worker-pool methods that older pools do not have
 * (`shouldHighlightOnMainThread`, `setFileResultCache`, ...). A host that
 * installs a second copy of Diffs and injects its pool used to crash mid-render;
 * fall back to main-thread highlighting instead and explain how to fix it.
 */
export function compatibleWorkerManager<T extends object>(workerManager: T | undefined): T | undefined {
  if (!workerManager)
    return undefined

  const candidate = workerManager as Record<string, unknown>
  const compatible = typeof candidate.isWorkingPool === 'function'
    && typeof candidate.shouldHighlightOnMainThread === 'function'
    && typeof candidate.setFileResultCache === 'function'
    && typeof candidate.getPreferredHighlighter === 'function'
  if (compatible)
    return workerManager

  if (!incompatibleWorkerManagers.has(workerManager)) {
    incompatibleWorkerManagers.add(workerManager)
    console.warn(
      '[stream-diffs] Ignoring an incompatible @pierre/diffs WorkerPoolManager. '
      + 'Create the pool from the same @pierre/diffs@^1.7 copy stream-diffs uses, '
      + 'or highlighting falls back to the main thread.',
    )
  }
  return undefined
}
