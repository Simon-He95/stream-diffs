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
