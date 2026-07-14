import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import { StreamCode, StreamDiff, StreamMergeConflict } from '../src/vue'

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

describe('Vue components', () => {
  it('streams reactive code and finalizes when loading becomes false', async () => {
    const state = reactive({ code: 'export ', loading: true })
    const target = document.createElement('div')
    const app = createApp({
      render: () => h(StreamCode, {
        code: state.code,
        loading: state.loading,
        language: 'typescript',
        fileName: 'answer.ts',
      }),
    })
    app.mount(target)

    await vi.waitFor(() => {
      expect(target.querySelector('.stream-diffs-plain-text')?.textContent).toBe('export ')
      expect(target.querySelector('diffs-container')).toBeNull()
    })
    state.code = 'export const answer = 42\n'
    await nextTick()
    state.loading = false
    await nextTick()

    await vi.waitFor(() => {
      const host = target.querySelector('diffs-container')
      expect(target.querySelector('.stream-diffs-finalized')).not.toBeNull()
      expect(host?.shadowRoot?.querySelector('code')?.textContent).toContain('answer = 42')
    }, { timeout: 5000 })
    app.unmount()
  }, 10_000)

  it('updates a real split diff when reactive props change', async () => {
    const state = reactive({ modified: 'const answer = 1\n' })
    const target = document.createElement('div')
    const app = createApp({
      render: () => h(StreamDiff, {
        original: 'const answer = 0\n',
        modified: state.modified,
        language: 'typescript',
        fileName: 'answer.ts',
        diffStyle: 'split',
      }),
    })
    app.mount(target)

    await vi.waitFor(() => {
      const root = target.querySelector('diffs-container')?.shadowRoot
      expect(root?.querySelector('pre')?.dataset.diffType).toBe('split')
      expect(root?.textContent).toContain('answer = 1')
    }, { timeout: 5000 })

    state.modified = 'const answer = 42\n'
    await nextTick()
    await vi.waitFor(() => {
      expect(target.querySelector('diffs-container')?.shadowRoot?.textContent).toContain('answer = 42')
    }, { timeout: 5000 })
    app.unmount()
  }, 10_000)

  it('exposes merge conflict resolution through the component controller', async () => {
    const component = ref<any>()
    const target = document.createElement('div')
    const app = createApp({
      render: () => h(StreamMergeConflict, {
        ref: component,
        code: '<<<<<<< current\nold\n=======\nnew\n>>>>>>> incoming\n',
        fileName: 'answer.txt',
        options: { mergeConflictActionsType: 'default' },
      }),
    })
    app.mount(target)

    await vi.waitFor(() => {
      const root = target.querySelector('diffs-container')?.shadowRoot
      expect(root?.querySelectorAll('button')).toHaveLength(3)
    }, { timeout: 5000 })
    const resolved = component.value.getController().resolveConflict(0, 'incoming')
    expect(resolved.contents).toContain('new')
    expect(resolved.contents).not.toContain('<<<<<<<')
    app.unmount()
  }, 10_000)
})
