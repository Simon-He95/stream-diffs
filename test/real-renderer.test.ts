import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createCodeStream } from '../src/CodeStreamController'
import { createDiffSurface } from '../src/DiffSurfaceController'

beforeAll(() => {
  Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
    configurable: true,
    value() {},
  })
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() { return [] },
    set() {},
  })
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

describe('real @pierre/diffs renderers', () => {
  it('keeps streamed code in a plain pre until finalization', async () => {
    const target = document.createElement('div')
    const controller = createCodeStream({ language: 'typescript', flushStrategy: { intervalMs: 0 } })
    await controller.mount(target)
    controller.append('export const answer = 42\n')
    await controller.flush()

    expect(target.querySelector('diffs-container')).toBeNull()
    expect(target.querySelector('.stream-diffs-plain-text')?.textContent).toContain('answer')
    controller.dispose()
  })

  it('finalizes a normal highlighted stream to an interactive file', async () => {
    const target = document.createElement('div')
    const onPostRender = vi.fn()
    const controller = createCodeStream({ language: 'typescript' })
    await controller.mount(target)
    controller.append('export const answer = 42\n')
    await controller.flush()
    await controller.finalize({ view: 'file', enableLineSelection: true, onPostRender })
    await vi.waitFor(() => {
      expect(target.querySelector('diffs-container')?.shadowRoot?.textContent).toContain('42')
    })
    expect(controller.getState()).toBe('finalized')
    expect(onPostRender).toHaveBeenCalled()
    controller.dispose()
  }, 10_000)

  it('renders a real split diff and invokes token-capable options', async () => {
    const target = document.createElement('div')
    const tokenEnter = vi.fn()
    const controller = createDiffSurface({
      kind: 'diff',
      oldFile: { name: 'answer.ts', contents: 'export const answer = 0\n' },
      newFile: { name: 'answer.ts', contents: 'export const answer = 42\n' },
      annotations: [{ side: 'additions', lineNumber: 1, metadata: 'review-comment' }],
      options: {
        diffStyle: 'split',
        enableLineSelection: true,
        onTokenEnter: tokenEnter,
        renderCustomHeader() {
          const header = document.createElement('strong')
          header.textContent = 'Review header'
          return header
        },
        renderAnnotation(annotation) {
          const comment = document.createElement('span')
          comment.textContent = annotation.metadata
          return comment
        },
      },
    })
    await controller.mount(target)

    await vi.waitFor(() => {
      const host = target.querySelector('diffs-container')
      expect(host?.shadowRoot?.querySelector('pre')?.dataset.diffType).toBe('split')
      const renderedText = `${target.textContent}${host?.shadowRoot?.textContent}`
      expect(renderedText).toContain('42')
      expect(renderedText).toContain('Review header')
      expect(renderedText).toContain('review-comment')
    }, { timeout: 5000 })
    let token: HTMLElement | null | undefined
    await vi.waitFor(() => {
      token = target.querySelector('diffs-container')?.shadowRoot?.querySelector<HTMLElement>('[data-char]')
      expect(token).toBeTruthy()
    }, { timeout: 5000 })
    const pointerMove = new Event('pointermove', { bubbles: true, composed: true })
    Object.defineProperty(pointerMove, 'pointerType', { value: 'mouse' })
    token!.dispatchEvent(pointerMove)
    expect(tokenEnter).toHaveBeenCalledWith(
      expect.objectContaining({ tokenText: expect.any(String), tokenElement: token }),
      pointerMove,
    )
    controller.setSelectedLines({ start: 1, end: 1, side: 'additions' })
    await vi.waitFor(() => {
      expect(target.querySelector('diffs-container')?.shadowRoot?.querySelectorAll('[data-selected-line]').length).toBeGreaterThan(0)
    })
    controller.acceptReject(0, 'accept')
    await controller.setOptions(controller.getInput().options!)
    expect(controller.getResolvedFile()?.contents).toBe('export const answer = 42\n')
    expect(controller.getDiff()?.hunks[0]?.hunkContent).toEqual([
      expect.objectContaining({ type: 'context' }),
    ])
    expect(controller.getNativeInstance()).toBeTruthy()
    await vi.waitFor(() => {
      expect(target.querySelector('diffs-container')?.shadowRoot?.querySelectorAll('[data-selected-line]').length).toBeGreaterThan(0)
    })
    controller.dispose()
  })

  it('renders and resolves a real merge conflict', async () => {
    const target = document.createElement('div')
    const controller = createDiffSurface({
      kind: 'merge-conflict',
      file: {
        name: 'answer.ts',
        contents: '<<<<<<< current\nexport const answer = 0\n=======\nexport const answer = 42\n>>>>>>> incoming\n',
      },
      options: { mergeConflictActionsType: 'default' },
    })
    await controller.mount(target)
    await vi.waitFor(() => {
      expect(target.querySelector('diffs-container')?.shadowRoot?.textContent).toContain('42')
    }, { timeout: 5000 })
    expect(controller.resolveConflict(0, 'incoming')?.contents).toContain('answer = 42')
    controller.dispose()
  })

  it('renders a Git patch without claiming a complete resolved file', async () => {
    const target = document.createElement('div')
    const controller = createDiffSurface({
      kind: 'patch',
      patch: [
        'diff --git a/answer.ts b/answer.ts',
        '--- a/answer.ts',
        '+++ b/answer.ts',
        '@@ -1 +1 @@',
        '-export const answer = 0',
        '+export const answer = 42',
        '',
      ].join('\n'),
      options: { diffStyle: 'unified' },
    })
    await controller.mount(target)
    await vi.waitFor(() => {
      expect(target.querySelector('diffs-container')?.shadowRoot?.textContent).toContain('42')
    })
    expect(controller.getDiff()?.isPartial).toBe(true)
    expect(controller.getResolvedFile()).toBeUndefined()
    controller.dispose()
  })

  it('falls back from an active highlighter and still finalizes an accurate diff', async () => {
    const target = document.createElement('div')
    const controller = createCodeStream({
      fileName: 'answer.ts',
      language: 'typescript',
      limits: { maxStreamingChars: 10, maxStreamingLines: 100 },
    })
    await controller.mount(target)
    controller.append('export const answer = 42\n')
    await controller.flush()
    expect(target.querySelector('.stream-diffs-plain-text')?.textContent).toContain('42')
    expect(controller.getState()).toBe('streaming')

    await controller.finalize({
      view: 'diff',
      original: 'export const answer = 0\n',
      diffStyle: 'split',
    })
    await vi.waitFor(() => {
      expect(target.querySelector('diffs-container')?.shadowRoot?.textContent).toContain('42')
    })
    expect(controller.getState()).toBe('finalized')
    controller.dispose()
  })
})
