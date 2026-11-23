import { beforeAll, describe, expect, it } from 'vitest'
import { useMonaco } from '../src/markstream'

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
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

describe('markstream compatibility runtime', () => {
  it('exposes the finalized native surface for editing and navigation APIs', async () => {
    const runtime = useMonaco({ stream: false, theme: 'pierre-dark' })
    const target = document.createElement('div')
    document.body.appendChild(target)

    await runtime.createEditor(target, 'export const answer = 42\n', 'typescript')
    const surface = runtime.getSurface()
    expect(surface).toBeTruthy()
    expect(surface?.getInput().kind).toBe('file')
    expect(typeof surface?.startEditing).toBe('function')
    expect(typeof surface?.revealLine).toBe('function')
    expect(typeof surface?.expandLine).toBe('function')
    expect(typeof surface?.setEditorActiveLine).toBe('function')
    expect(typeof surface?.getCodeScrollLeft).toBe('function')
    expect(surface?.isReadyToEdit()).toBe(true)
    expect(surface?.getEditor()).toBeUndefined()

    runtime.cleanupEditor()
  }, 20_000)
})
