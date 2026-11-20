import type { File, FileDiff } from '@pierre/diffs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Editor } from '../src/edit'
import { createDiffSurface } from '../src/DiffSurfaceController'

/**
 * jsdom has no canvas, and the upstream editor measures text with one, so a
 * minimal 2d context keeps the attach path exercisable here.
 */
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
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value() {
      return {
        font: '',
        measureText: (text: string) => ({ width: text.length * 8 }),
        fillText() {},
      }
    },
  })
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

describe('stream-diffs/edit', () => {
  it('attaches an upstream editor to a finalized diff surface', async () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const surface = createDiffSurface({
      kind: 'diff',
      oldFile: { name: 'answer.ts', contents: 'export const answer = 0\n', lang: 'typescript' },
      newFile: { name: 'answer.ts', contents: 'export const answer = 42\n', lang: 'typescript' },
      options: { diffStyle: 'split', theme: 'pierre-dark' },
    })
    await surface.mount(target)
    await surface.prepareForEditing()

    const changes: string[] = []
    const editor = new Editor<'file-diff', unknown>('file-diff', {
      onChange: event => changes.push(event.file.name),
    }, 'review-draft')
    const detach = editor.edit(surface.getNativeInstance() as FileDiff<unknown>)

    // The editor's document is created by its first render sync, so text is
    // only readable once that render settles.
    await vi.waitFor(() => {
      expect(editor.getText()).toContain('answer = 42')
    }, { timeout: 5000 })

    editor.applyEdits([{
      range: { start: { line: 1, character: 25 }, end: { line: 1, character: 25 } },
      newText: ' + 1',
    } as any])
    expect(editor.getText()).toContain('+ 1')
    expect(editor.getText()).not.toBe('export const answer = 42\n')
    expect(changes).toEqual(['answer.ts'])

    expect(typeof detach).toBe('function')
    detach()
    editor.cleanUp('discard')
    surface.dispose()
  }, 20_000)

  it('leaves a complete File surface immediately editable', async () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const surface = createDiffSurface({
      kind: 'file',
      file: { name: 'answer.ts', contents: 'export const answer = 42\n', lang: 'typescript' },
      options: { theme: 'pierre-dark' },
    })
    await surface.mount(target)
    await surface.prepareForEditing()

    const editor = new Editor<'file', unknown>('file', {})
    const detach = editor.edit(surface.getNativeInstance() as File<unknown>)
    expect(editor.getText()).toBe('export const answer = 42\n')

    detach()
    editor.cleanUp('discard')
    surface.dispose()
  }, 20_000)
})
