import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  instances: [] as any[],
  parseDiffCalls: [] as any[][],
  streamed: [] as string[],
  setupGate: undefined as Promise<void> | undefined,
  postRenderCallbacks: [] as Array<() => void>,
}))

vi.mock('@pierre/diffs', () => {
  class Base {
    options: any
    selected: any
    annotations: any[] = []
    fileDiff: any
    workerManager: any
    fileRenderer = { renderCache: { result: {}, highlighted: true } }
    cleaned = 0
    constructor(options: any, workerManager?: any) {
      this.options = options
      this.workerManager = workerManager
      mocks.instances.push(this)
    }
    setSelectedLines(value: any) { this.selected = value }
    setLineAnnotations(value: any[]) { this.annotations = value }
    setThemeType(value: string) { this.options = { ...this.options, themeType: value } }
    cleanUp() { this.cleaned++ }
  }
  class FileStream extends Base {
    async setup(source: ReadableStream<string>, wrapper: HTMLElement) {
      await mocks.setupGate
      wrapper.appendChild(document.createElement('diffs-container'))
      void source.pipeTo(new WritableStream({ write(chunk) { mocks.streamed.push(chunk) } })).catch(() => {})
    }
  }
  class File extends Base {
    render(props: any) {
      const node = document.createElement('diffs-container')
      const shadow = node.attachShadow({ mode: 'open' })
      shadow.innerHTML = '<pre>rendered code</pre>'
      props.containerWrapper.appendChild(node)
      const shell = props.containerWrapper.parentElement!
      shell.getBoundingClientRect = () => ({ width: 600, height: 120 }) as DOMRect
      this.annotations = props.lineAnnotations ?? []
      mocks.postRenderCallbacks.push(() => this.options.onPostRender?.(node, this, 'mount'))
      return true
    }
  }
  class FileDiff extends Base {
    render(props: any) {
      this.fileDiff = props.fileDiff ?? parseDiffFromFile(props.oldFile, props.newFile)
      if (!props.containerWrapper.querySelector('diffs-container'))
        props.containerWrapper.appendChild(document.createElement('diffs-container'))
      this.annotations = props.lineAnnotations ?? []
      this.options.onPostRender?.(props.containerWrapper.querySelector('diffs-container'), this, 'update')
      return true
    }
  }
  class UnresolvedFile extends FileDiff {
    render(props: any) {
      this.fileDiff = parseDiffFromFile(props.file, props.file)
      return super.render({ ...props, fileDiff: this.fileDiff })
    }
    resolveConflict(_index: number, resolution: string) {
      return {
        file: { name: 'file.ts', contents: resolution },
        fileDiff: this.fileDiff,
        actions: [],
        markerRows: [],
      }
    }
  }
  function parseDiffFromFile(oldFile: any, newFile: any, options?: any) {
    mocks.parseDiffCalls.push([oldFile, newFile, options])
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
  return {
    FileStream,
    File,
    FileDiff,
    UnresolvedFile,
    parseDiffFromFile,
    diffAcceptRejectHunk(diff: any, hunkIndex: number, action: any) {
      return { ...diff, accepted: { hunkIndex, action } }
    },
  }
})

import { createCodeStream } from '../src/CodeStreamController'
import { createDiffSurface } from '../src/DiffSurfaceController'
import { useMonaco } from '../src/markstream'

beforeEach(() => {
  mocks.instances.length = 0
  mocks.parseDiffCalls.length = 0
  mocks.streamed.length = 0
  mocks.setupGate = undefined
  mocks.postRenderCallbacks.length = 0
  document.body.replaceChildren()
})

describe('CodeStreamController', () => {
  it('ignores empty chunks without changing text or statistics', () => {
    const controller = createCodeStream()
    controller.append('')
    expect(controller.getText()).toBe('')
    expect(controller.getStats()).toMatchObject({ characters: 0, lines: 0, writes: 0 })
  })

  it('buffers before mount in one pre and finalizes to a diff', async () => {
    const states: string[] = []
    const controller = createCodeStream({ language: 'typescript', onStateChange: state => states.push(state) })
    controller.append('const answer = ')
    controller.append('42\n')
    const target = document.createElement('div')
    await controller.mount(target)
    expect(controller.getText()).toBe('const answer = 42\n')
    expect(controller.getStats().lines).toBe(2)
    expect(controller.getStats().writes).toBe(0)
    expect(target.querySelector('pre')?.textContent).toBe('const answer = 42\n')
    await controller.finalize({ view: 'diff', original: 'const answer = 0\n', diffStyle: 'split' })
    expect(controller.getState()).toBe('finalized')
    expect(states).toEqual(expect.arrayContaining(['mounting', 'streaming', 'finalizing', 'finalized']))
    expect(target.querySelector('diffs-container')).not.toBeNull()
  })

  it('keeps the active theme when finalizing a direct code stream', async () => {
    const controller = createCodeStream({ language: 'typescript', theme: 'initial', themeType: 'light' })
    controller.append('const answer = 42')
    await controller.mount(document.createElement('div'))
    await controller.setTheme('updated')
    controller.setThemeType('dark')

    await controller.finalize({ view: 'file' })

    expect((mocks.instances.at(-1) as any).options).toMatchObject({
      theme: 'updated',
      themeType: 'dark',
    })
  })

  it('resets a non-prefix snapshot', async () => {
    const target = document.createElement('div')
    const controller = createCodeStream()
    controller.append('first')
    await controller.mount(target)
    await controller.reset('replacement')
    expect(controller.getText()).toBe('replacement')
    expect(controller.getStats().resets).toBe(1)
  })

  it('batches a thousand micro-deltas into one pre write', async () => {
    const controller = createCodeStream({ limits: false })
    const target = document.createElement('div')
    await controller.mount(target)
    for (let i = 0; i < 1000; i++)
      controller.append('x')
    await controller.flush()
    expect(controller.getText()).toHaveLength(1000)
    expect(target.querySelector('pre')?.textContent).toHaveLength(1000)
    expect(controller.getStats()).toMatchObject({ writes: 1, lines: 1, renderMode: 'plain-text' })
  })

  it('uses append-only plain text regardless of streaming limits', async () => {
    const onOverflow = vi.fn()
    const controller = createCodeStream({
      limits: { maxStreamingChars: 5, maxStreamingLines: 100, overflowBehavior: 'stop-highlighting' },
      onOverflow,
    })
    controller.append('123456')
    const target = document.createElement('div')
    await controller.mount(target)
    expect(target.querySelector('pre')?.textContent).toBe('123456')
    expect(target.querySelector('pre')?.dataset.streamDiffsState).toBe('streaming')
    controller.append('7')
    await controller.flush()
    expect(target.querySelector('pre')?.textContent).toBe('1234567')
    expect(controller.getStats()).toMatchObject({ renderMode: 'plain-text', overflowed: false })
    expect(onOverflow).not.toHaveBeenCalled()

    await controller.reset('ok')
    expect(controller.getStats()).toMatchObject({ renderMode: 'plain-text', overflowed: false })
  })

  it('decides near-bottom auto-follow before a flush changes the height', async () => {
    const controller = createCodeStream({
      limits: { maxStreamingChars: 1, maxStreamingLines: 100 },
      autoScroll: 'near-bottom',
    })
    controller.append('12')
    const target = document.createElement('div')
    await controller.mount(target)
    const shell = target.querySelector<HTMLElement>('.stream-diffs-shell')!
    const pre = target.querySelector('pre')!
    Object.defineProperty(shell, 'clientHeight', { configurable: true, value: 100 })
    Object.defineProperty(shell, 'scrollHeight', {
      configurable: true,
      get: () => pre.textContent!.length > 2 ? 1_500 : 1_000,
    })
    shell.scrollTop = 900

    controller.append('3')
    await controller.flush()

    expect(shell.scrollTop).toBe(1_500)
  })

  it('does not steal scroll position when the reader is away from the bottom', async () => {
    const controller = createCodeStream({
      limits: { maxStreamingChars: 1, maxStreamingLines: 100 },
      autoScroll: 'near-bottom',
    })
    controller.append('12')
    const target = document.createElement('div')
    await controller.mount(target)
    const shell = target.querySelector<HTMLElement>('.stream-diffs-shell')!
    const pre = target.querySelector('pre')!
    Object.defineProperty(shell, 'clientHeight', { configurable: true, value: 100 })
    Object.defineProperty(shell, 'scrollHeight', {
      configurable: true,
      get: () => pre.textContent!.length > 2 ? 1_500 : 1_000,
    })
    shell.scrollTop = 400

    controller.append('3')
    await controller.flush()

    expect(shell.scrollTop).toBe(400)
  })

  it('keeps a Unicode surrogate pair in the streaming pre across chunks', async () => {
    const controller = createCodeStream({ limits: false })
    const target = document.createElement('div')
    await controller.mount(target)
    controller.append('\uD83D')
    await controller.flush()
    expect(target.querySelector('pre')?.textContent).toBe('\uD83D')
    controller.append('\uDE00')
    await controller.flush()
    expect(target.querySelector('pre')?.textContent).toBe('😀')
  })

  it('preserves a CRLF sequence split across chunks', async () => {
    const controller = createCodeStream()
    const target = document.createElement('div')
    await controller.mount(target)
    controller.append('first\r')
    controller.append('\nsecond')
    await controller.flush()
    expect(target.querySelector('pre')?.textContent).toBe('first\r\nsecond')
  })

  it('supports ignore and throw policies for non-prefix snapshots', () => {
    const ignored = createCodeStream({ nonAppendBehavior: 'ignore' })
    ignored.append('prefix')
    ignored.updateSnapshot('replacement')
    expect(ignored.getText()).toBe('prefix')

    const strict = createCodeStream({ nonAppendBehavior: 'throw' })
    strict.append('prefix')
    expect(() => strict.updateSnapshot('replacement')).toThrow('append-only')
    expect(strict.getText()).toBe('prefix')
  })

  it('keeps received text and enters error state when an upstream iterable fails', async () => {
    const error = new Error('upstream failed')
    const onError = vi.fn()
    const controller = createCodeStream({ onError })
    await controller.mount(document.createElement('div'))
    async function* source() {
      yield 'partial'
      throw error
    }
    await expect(controller.consume(source())).rejects.toBe(error)
    expect(controller.getText()).toBe('partial')
    expect(controller.getState()).toBe('error')
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('deduplicates concurrent finalization', async () => {
    const states: string[] = []
    const controller = createCodeStream({ onStateChange: state => states.push(state) })
    controller.append('complete')
    await controller.mount(document.createElement('div'))

    await Promise.all([
      controller.finalize({ view: 'file' }),
      controller.finalize({ view: 'file' }),
    ])

    expect(controller.getState()).toBe('finalized')
    expect(states.filter(state => state === 'finalizing')).toHaveLength(1)
    expect(mocks.instances.filter(instance => instance.constructor.name === 'File')).toHaveLength(1)
  })

  it('rejects appends after finalization', async () => {
    const controller = createCodeStream()
    await controller.mount(document.createElement('div'))
    await controller.finalize()
    expect(() => controller.append('late')).toThrow('finalized')
  })

  it('updates theme type after finalization without resetting', async () => {
    const controller = createCodeStream()
    await controller.mount(document.createElement('div'))
    await controller.finalize({ view: 'file' })
    const renderer = mocks.instances.at(-1)
    controller.setThemeType('dark')
    expect(mocks.instances.at(-1)).toBe(renderer)
    expect(renderer.options.themeType).toBe('dark')
    expect(controller.getStats().resets).toBe(0)
  })

  it('removes its pre when disposed', async () => {
    const controller = createCodeStream()
    const target = document.createElement('div')
    await controller.mount(target)
    controller.dispose()

    expect(controller.getState()).toBe('disposed')
    expect(target.childElementCount).toBe(0)
  })

  it('moves the plain pre when remounted into another container', async () => {
    const controller = createCodeStream()
    const firstTarget = document.createElement('div')
    await controller.mount(firstTarget)
    const secondTarget = document.createElement('div')
    await controller.mount(secondTarget)

    expect(firstTarget.childElementCount).toBe(0)
    expect(secondTarget.querySelector('pre')).not.toBeNull()
  })

  it('uses the latest language when finalizing without losing text', async () => {
    const controller = createCodeStream({ language: 'javascript' })
    controller.append('const answer = 42')
    await controller.mount(document.createElement('div'))

    await controller.setLanguage('typescript')
    await controller.finalize({ view: 'file' })

    expect(controller.getText()).toBe('const answer = 42')
    expect(controller.getFinalizedSurface()?.getInput()).toMatchObject({ file: { lang: 'typescript' } })
  })
})

describe('DiffSurfaceController', () => {
  it('supports split diffs, selection, annotations, and accept/reject', async () => {
    const workerManager = { isWorkingPool: () => true } as any
    const controller = createDiffSurface<{ body: string }>({
      kind: 'diff',
      oldFile: { name: 'file.ts', contents: 'old' },
      newFile: { name: 'file.ts', contents: 'new' },
      options: { diffStyle: 'split', enableLineSelection: true },
      workerManager,
    })
    await controller.mount(document.createElement('div'))
    controller.setSelectedLines({ start: 1, end: 2, side: 'additions' })
    controller.setAnnotations([{ side: 'additions', lineNumber: 1, metadata: { body: 'Review this' } }])
    const next = controller.acceptReject(0, 'accept') as any
    expect(next.accepted).toEqual({ hunkIndex: 0, action: 'accept' })
    await controller.setTheme('github-dark')
    expect((controller.getDiff() as any).accepted).toEqual({ hunkIndex: 0, action: 'accept' })
    expect(controller.getResolvedFile()?.contents).toBe('new')
    const instance = controller.getNativeInstance() as any
    expect(instance.options.diffStyle).toBe('split')
    expect(instance.options.theme).toBe('github-dark')
    expect(instance.workerManager).toBe(workerManager)
    expect(instance.selected).toEqual({ start: 1, end: 2, side: 'additions' })
    expect(instance.annotations[0].metadata.body).toBe('Review this')
  })

  it('passes parseDiffOptions to the native file diff parser', async () => {
    const parseDiffOptions = { context: 2 }
    const controller = createDiffSurface({
      kind: 'diff',
      oldFile: { name: 'file.ts', contents: 'old' },
      newFile: { name: 'file.ts', contents: 'new' },
      options: { parseDiffOptions },
    })

    await controller.mount(document.createElement('div'))

    expect(mocks.parseDiffCalls.at(-1)?.[2]).toEqual(parseDiffOptions)
  })

  it('resolves merge conflicts through the unresolved file primitive', async () => {
    const controller = createDiffSurface({
      kind: 'merge-conflict',
      file: { name: 'file.ts', contents: '<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs' },
    })
    await controller.mount(document.createElement('div'))
    expect(controller.resolveConflict(0, 'incoming')?.contents).toBe('incoming')
  })
})

describe('markstream compatibility runtime', () => {
  it('keeps visual readiness pending until the native post-render commit', async () => {
    const runtime = useMonaco({ stream: false })
    await runtime.createEditor(document.createElement('div'), 'const answer = 42', 'typescript')

    let settled = false
    const ready = runtime.whenVisualReady().then((value) => {
      settled = true
      return value
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    mocks.postRenderCallbacks.shift()?.()
    await expect(ready).resolves.toBe(true)
  })

  it('keeps the compatibility readiness promise on the latest visual revision', async () => {
    const runtime = useMonaco({ stream: false })
    await runtime.createEditor(document.createElement('div'), 'const answer = 1', 'typescript')
    const ready = runtime.whenVisualReady()

    await runtime.updateCode('const answer = 2', 'typescript')
    mocks.postRenderCallbacks.shift()?.()
    await Promise.resolve()
    let settled = false
    void ready.then(() => settled = true)
    await Promise.resolve()
    expect(settled).toBe(false)

    mocks.postRenderCallbacks.shift()?.()
    await expect(ready).resolves.toBe(true)
  })

  it('invalidates pending visual readiness when the runtime is cleaned up', async () => {
    const runtime = useMonaco({ stream: false })
    await runtime.createEditor(document.createElement('div'), 'const answer = 42', 'typescript')
    const ready = runtime.whenVisualReady()

    runtime.cleanupEditor()

    await expect(ready).resolves.toBe(false)
  })

  it('keeps file and diff getCode shapes compatible and cleans up the host', async () => {
    const controllers: any[] = []
    const runtime = useMonaco({ stream: false, onController: controller => controllers.push(controller) })
    const target = document.createElement('div')

    const editor = await runtime.createEditor(target, 'const answer = 0', 'typescript')
    expect(runtime.getCode()).toBe('const answer = 0')
    await runtime.updateCode('const answer = 42', 'typescript')
    expect(runtime.getCode()).toBe('const answer = 42')
    expect(editor.getModel().getValue()).toBe('const answer = 42')

    await runtime.createDiffEditor(target, 'old', 'new', 'typescript')
    expect(runtime.getCode()).toEqual({ original: 'old', modified: 'new' })
    expect(runtime.getDiffEditorView()?.getLineChanges()).toHaveLength(1)
    expect(controllers).toHaveLength(2)

    runtime.cleanupEditor()
    expect(target.childElementCount).toBe(0)
    await runtime.updateCode('must not remount', 'typescript')
    expect(target.childElementCount).toBe(0)
  })

  it('does not publish a static editor after cleanup cancels its creation', async () => {
    const onController = vi.fn()
    const runtime = useMonaco({ stream: false, onController })
    const target = document.createElement('div')

    const creation = runtime.createEditor(target, 'const answer = 42', 'typescript')
    runtime.cleanupEditor()

    await expect(creation).rejects.toThrow('Editor creation was cancelled')
    expect(runtime.getEditorView()).toBeNull()
    expect(onController).not.toHaveBeenCalled()
    expect(target.childElementCount).toBe(0)
  })

  it('auto-detects complete merge conflict markers', async () => {
    let controller: any
    const runtime = useMonaco({ stream: false, onController: value => controller = value })
    const target = document.createElement('div')
    const conflict = '<<<<<<< current\na\n=======\nb\n>>>>>>> incoming'
    const editor = await runtime.createEditor(target, conflict, 'text')
    expect(controller.getInput().kind).toBe('merge-conflict')
    expect(runtime.getCode()).toBe(conflict)
    editor.resolveConflict(0, 'incoming')
    expect(runtime.getCode()).toBe('incoming')
  })

  it('uses the latest language when markstream finalizes streaming code', async () => {
    const runtime = useMonaco()
    await runtime.createEditor(document.createElement('div'), 'const answer = 42', 'javascript')

    await runtime.updateCode('const answer = 42', 'typescript')

    const surface = await runtime.finalizeCode()
    expect(surface?.getInput()).toMatchObject({ file: { lang: 'typescript' } })
    expect(runtime.getCode()).toBe('const answer = 42')
  })

  it('finalizes streaming code and keeps review controls on the editor adapter', async () => {
    const runtime = useMonaco({ enableLineSelection: true })
    const editor = await runtime.createEditor(document.createElement('div'), 'const answer = 42', 'typescript')

    const surface = await runtime.finalizeCode()
    editor.setSelectedLines({ start: 1, end: 1 })

    expect(surface?.getInput().kind).toBe('file')
    expect((surface?.getNativeInstance() as any).selected).toEqual({ start: 1, end: 1 })
  })

  it('returns accepted diff contents through compatibility models', async () => {
    const runtime = useMonaco()
    await runtime.createDiffEditor(document.createElement('div'), 'old', 'new', 'text')

    runtime.getDiffEditorView()?.acceptReject(0, 'accept')

    expect(runtime.getCode()).toEqual({ original: 'old', modified: 'new' })
    expect(runtime.getDiffModels().modified.getValue()).toBe('new')
  })

  it('forwards native Pierre options without a fixed compatibility allowlist', async () => {
    const renderGutterUtility = vi.fn()
    const parseDiffOptions = { context: 8 }
    const runtime = useMonaco({
      stream: false,
      enableGutterUtility: true,
      renderGutterUtility,
      tokenizeMaxLength: 50_000,
      parseDiffOptions,
    })

    await runtime.createDiffEditor(document.createElement('div'), 'old', 'new', 'text')
    const options = (mocks.instances.at(-1) as any).options

    expect(options).toMatchObject({
      enableGutterUtility: true,
      renderGutterUtility,
      tokenizeMaxLength: 50_000,
      parseDiffOptions,
    })
  })

  it('maps legacy unchanged-region context to Pierre diff parsing', async () => {
    const runtime = useMonaco({
      stream: false,
      diffHideUnchangedRegions: { enabled: true, contextLineCount: 2 },
    })

    await runtime.createDiffEditor(document.createElement('div'), 'old', 'new', 'text')

    expect((mocks.instances.at(-1) as any).options).toMatchObject({
      expandUnchanged: false,
      parseDiffOptions: { context: 2 },
    })
  })

  it('keeps unchanged regions expanded when legacy folding is disabled by object', async () => {
    const runtime = useMonaco({
      stream: false,
      diffHideUnchangedRegions: { enabled: false, contextLineCount: 2 },
    })

    await runtime.createDiffEditor(document.createElement('div'), 'old', 'new', 'text')

    expect((mocks.instances.at(-1) as any).options.expandUnchanged).toBe(true)
  })

  it('maps the legacy minimum collapsed line count to Pierre', async () => {
    const runtime = useMonaco({
      stream: false,
      diffHideUnchangedRegions: { enabled: true, minimumLineCount: 4 },
    })

    await runtime.createDiffEditor(document.createElement('div'), 'old', 'new', 'text')

    expect((mocks.instances.at(-1) as any).options.collapsedContextThreshold).toBe(3)
  })

  it('keeps explicit Pierre parsing options over legacy folding values', async () => {
    const runtime = useMonaco({
      stream: false,
      diffHideUnchangedRegions: { enabled: true, contextLineCount: 2 },
      parseDiffOptions: { context: 6 },
    })

    await runtime.createDiffEditor(document.createElement('div'), 'old', 'new', 'text')

    expect((mocks.instances.at(-1) as any).options.parseDiffOptions).toEqual({ context: 6 })
  })

  it('bridges Diffs render completion to editor content-size events', async () => {
    const runtime = useMonaco({ stream: false })
    await runtime.createDiffEditor(document.createElement('div'), 'old', 'new', 'text')
    const onUpdate = vi.fn()
    const disposable = runtime.getDiffEditorView()?.onDidUpdateDiff(onUpdate)

    await runtime.updateDiff('old value', 'new value', 'text')
    expect(onUpdate).toHaveBeenCalled()

    const calls = onUpdate.mock.calls.length
    disposable?.dispose()
    await runtime.updateDiff('older', 'newer', 'text')
    expect(onUpdate).toHaveBeenCalledTimes(calls)
  })

  it('keeps the selected paired theme after a surface update', async () => {
    const options = { stream: false, themes: ['dark-a', 'light-a'] }
    const runtime = useMonaco(options)
    const target = document.createElement('div')
    await runtime.createDiffEditor(target, 'old', 'new', 'text')

    await runtime.setTheme('dark-a')
    await runtime.updateDiff('older', 'newer', 'text')

    expect((mocks.instances.at(-1) as any).options).toMatchObject({
      theme: { dark: 'dark-a', light: 'light-a' },
      themeType: 'dark',
    })
  })

  it('installs a replaced paired theme before selecting its mode', async () => {
    const options = { stream: false, themes: ['dark-a', 'light-a'] }
    const runtime = useMonaco(options)
    await runtime.createEditor(document.createElement('div'), 'const value = 1', 'typescript')

    options.themes = ['dark-b', 'light-b']
    await runtime.setTheme('light-b')
    await runtime.updateCode('const value = 2', 'typescript')

    expect((mocks.instances.at(-1) as any).options).toMatchObject({
      theme: { dark: 'dark-b', light: 'light-b' },
      themeType: 'light',
    })
  })

  it('accepts a stable untokenized surface as visually ready', async () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queueMicrotask(() => callback(performance.now()))
      return 1
    })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const runtime = useMonaco({ stream: false, tokenizeMaxLength: 1 })
    const target = document.createElement('div')
    await runtime.createEditor(target, 'const value = 1', 'typescript')
    const shell = target.querySelector<HTMLElement>('.stream-diffs-shell')!
    shell.getBoundingClientRect = () => ({ width: 600, height: 120 }) as DOMRect
    const diffs = target.querySelector<HTMLElement>('diffs-container')!
    const shadow = diffs.shadowRoot ?? diffs.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<pre>const value = 1</pre>'
    mocks.postRenderCallbacks.shift()?.()

    await expect(runtime.whenVisualReady()).resolves.toBe(true)

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('cancels visual readiness when the runtime is cleaned up', async () => {
    const runtime = useMonaco({ stream: false })
    const target = document.createElement('div')
    await runtime.createEditor(target, 'const value = 1', 'typescript')

    const ready = runtime.whenVisualReady()
    runtime.cleanupEditor()

    await expect(ready).resolves.toBe(false)
  })

  it('reports final stream renders and exposes font metrics to markstream', async () => {
    const target = document.createElement('div')
    const runtime = useMonaco()
    const editor = await runtime.createEditor(target, 'const answer = 42', 'typescript')
    const onSize = vi.fn()
    editor.onDidContentSizeChange(onSize)

    const editorOptions = runtime.getEditor().EditorOption
    editor.updateOptions({ fontSize: 18, lineHeight: 27, fontFamily: 'monospace' })
    expect(editor.getOption(editorOptions.fontInfo)).toEqual({ fontSize: 18 })
    expect(editor.getOption(editorOptions.lineHeight)).toBe(27)
    expect(target.style.fontFamily).toBe('monospace')
    expect(target.style.getPropertyValue('--diffs-font-size')).toBe('18px')
    expect(target.style.getPropertyValue('--diffs-line-height')).toBe('27px')
    expect(target.style.getPropertyValue('--diffs-font-family')).toBe('monospace')

    await runtime.finalizeCode()
    expect(onSize).toHaveBeenCalled()
  })

  it('reports the stream-diffs shell height instead of a previously sized host', async () => {
    const target = document.createElement('div')
    const runtime = useMonaco({ stream: false })
    const editor = await runtime.createEditor(target, 'const answer = 42', 'typescript')
    const shell = target.querySelector<HTMLElement>('.stream-diffs-shell')!

    Object.defineProperty(target, 'scrollHeight', { configurable: true, value: 500 })
    Object.defineProperty(shell, 'scrollHeight', { configurable: true, value: 72 })

    expect(editor.getContentHeight()).toBe(72)
  })
})
