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
