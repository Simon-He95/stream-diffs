import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fileRenders: [] as any[],
  diffRenders: [] as any[],
}))

vi.mock('@pierre/diffs', () => {
  class Base {
    options: any
    selected: any
    annotations: any[] = []
    workerManager: any
    cleaned = 0
    constructor(options: any, workerManager?: any) {
      this.options = options
      this.workerManager = workerManager
    }
    setSelectedLines(value: any) { this.selected = value }
    setLineAnnotations(value: any[]) { this.annotations = value }
    setThemeType(value: string) { this.options = { ...this.options, themeType: value } }
    cleanUp() { this.cleaned++ }
  }
  function makeContainer(props: any) {
    if (props.containerWrapper && !props.containerWrapper.querySelector('diffs-container')) {
      const node = document.createElement('diffs-container')
      node.attachShadow({ mode: 'open' }).innerHTML = '<pre>rendered</pre>'
      props.containerWrapper.appendChild(node)
    }
  }
  class File extends Base {
    render(props: any) {
      makeContainer(props)
      mocks.fileRenders.push({ ...props, containerWrapper: undefined })
      return true
    }
  }
  class FileDiff extends Base {
    render(props: any) {
      makeContainer(props)
      mocks.diffRenders.push({ ...props, containerWrapper: undefined })
      return true
    }
  }
  class UnresolvedFile extends FileDiff {
    render(props: any) {
      makeContainer(props)
      mocks.diffRenders.push({ ...props, containerWrapper: undefined })
      return true
    }
  }
  function parseDiffFromFile(oldFile: any, newFile: any) {
    return {
      name: newFile.name,
      type: 'change',
      hunks: [{ deletionStart: 1, deletionCount: 1, additionStart: 1, additionCount: 1 }],
      deletionLines: oldFile.contents.split('\n'),
      additionLines: newFile.contents.split('\n'),
      splitLineCount: 1,
      unifiedLineCount: 2,
      isPartial: false,
    }
  }
  return { File, FileDiff, UnresolvedFile, parseDiffFromFile }
})

import { createDiffSurface } from '../src/DiffSurfaceController'

function largeFileContents(lines = 5000) {
  return Array.from({ length: lines }, (_, i) => `const value_${i} = ${i}`).join('\n')
}

const surfaces: ReturnType<typeof createDiffSurface>[] = []

function mountFile(lines: number, progressiveRender?: boolean | number) {
  const host = document.createElement('div')
  const surface = createDiffSurface({
    kind: 'file',
    file: { name: 'big.ts', contents: largeFileContents(lines), lang: 'typescript' },
    progressiveRender,
  })
  surfaces.push(surface)
  return surface.mount(host)
}

describe('progressive render', () => {
  beforeEach(() => {
    mocks.fileRenders.length = 0
    mocks.diffRenders.length = 0
  })

  afterEach(() => {
    for (const surface of surfaces)
      surface.dispose()
    surfaces.length = 0
  })

  it('renders the first chunk immediately then grows renderRange for large files', async () => {
    await mountFile(1000, 200)

    expect(mocks.fileRenders.length).toBe(1)
    expect(mocks.fileRenders[0].renderRange).toEqual({ startingLine: 0, totalLines: 200, bufferBefore: 0, bufferAfter: 0 })

    // Growth continues until the full file is rendered.
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(mocks.fileRenders.length).toBeGreaterThan(1)
    const last = mocks.fileRenders[mocks.fileRenders.length - 1]
    expect(last.renderRange.totalLines).toBe(Infinity)
  })

  it('keeps a single-shot render for files within the chunk', async () => {
    await mountFile(10, true)

    expect(mocks.fileRenders.length).toBe(1)
    expect(mocks.fileRenders[0].renderRange).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(mocks.fileRenders.length).toBe(1)
  })

  it('does not enable progressive render when the option is off', async () => {
    await mountFile(1000, false)

    expect(mocks.fileRenders.length).toBe(1)
    expect(mocks.fileRenders[0].renderRange).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(mocks.fileRenders.length).toBe(1)
  })

  it('progressively fills diff surfaces too', async () => {
    const host = document.createElement('div')
    const contents = largeFileContents(800)
    const surface = createDiffSurface({
      kind: 'diff',
      oldFile: { name: 'old.ts', contents, lang: 'typescript' },
      newFile: { name: 'new.ts', contents, lang: 'typescript' },
      progressiveRender: 200,
    })
    surfaces.push(surface)
    await surface.mount(host)

    expect(mocks.diffRenders.length).toBe(1)
    expect(mocks.diffRenders[0].renderRange).toEqual({ startingLine: 0, totalLines: 200, bufferBefore: 0, bufferAfter: 0 })

    await new Promise(resolve => setTimeout(resolve, 300))
    expect(mocks.diffRenders.length).toBeGreaterThan(1)
    const last = mocks.diffRenders[mocks.diffRenders.length - 1]
    expect(last.renderRange.totalLines).toBe(Infinity)
  })
})
