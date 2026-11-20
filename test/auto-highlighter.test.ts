import { beforeAll, describe, expect, it } from 'vitest'
import { getSharedHighlighter } from '@pierre/diffs'
import { createDiffSurface } from '../src/DiffSurfaceController'

beforeAll(() => {
  Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', { configurable: true, value() {} })
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() { return [] },
    set() {},
  })
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

describe('preferredHighlighter: auto on a real surface', () => {
  it('resolves auto to the backend the registry actually uses', async () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const surface = createDiffSurface({
      kind: 'file',
      file: { name: 'a.ts', contents: 'export const answer = 42\n', lang: 'typescript' },
      options: { theme: 'pierre-dark', preferredHighlighter: 'auto' },
    })
    await surface.mount(target)
    await surface.whenVisualReady()

    const resolved = (surface.getInput().options as { preferredHighlighter?: string }).preferredHighlighter
    expect(resolved).not.toBe('auto')
    expect(['highlights', 'shiki-js']).toContain(resolved)

    // The applied value must match the shared registry, not just our request.
    const actual = (await getSharedHighlighter({ themes: ['pierre-dark'], langs: ['typescript'] })).name
    expect(resolved).toBe(actual)
    expect(target.querySelector('diffs-container')?.shadowRoot?.textContent).toContain('42')
    surface.dispose()
  }, 20_000)
})
