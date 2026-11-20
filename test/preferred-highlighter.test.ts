import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  canUseWasm: true,
  highlighterName: 'highlights' as string,
  createError: null as Error | null,
  getSharedHighlighterCalls: [] as any[],
}))

vi.mock('@pierre/diffs', () => ({
  canUseWASM: () => state.canUseWasm,
  getSharedHighlighter: async (options: any) => {
    state.getSharedHighlighterCalls.push(options)
    if (state.createError)
      throw state.createError
    return { name: state.highlighterName }
  },
}))

const { resetPreferredHighlighterDecision, resolvePreferredHighlighter } = await import('../src/preferredHighlighter')

beforeEach(() => {
  resetPreferredHighlighterDecision()
  state.canUseWasm = true
  state.highlighterName = 'highlights'
  state.createError = null
  state.getSharedHighlighterCalls = []
})

describe('resolvePreferredHighlighter', () => {
  it('picks the WASM backend when the platform supports it', async () => {
    await expect(resolvePreferredHighlighter({ themes: 'pierre-dark', langs: ['typescript'] }))
      .resolves.toBe('highlights')
    expect(state.getSharedHighlighterCalls[0]).toMatchObject({
      themes: ['pierre-dark'],
      langs: ['typescript'],
      preferredHighlighter: 'highlights',
    })
  })

  it('falls back to shiki-js when the platform cannot run WASM', async () => {
    state.canUseWasm = false
    await expect(resolvePreferredHighlighter()).resolves.toBe('shiki-js')
    expect(state.getSharedHighlighterCalls).toHaveLength(0)
  })

  it('falls back to shiki-js when the WASM highlighter fails to load', async () => {
    state.createError = new Error('wasm blocked by CSP')
    await expect(resolvePreferredHighlighter()).resolves.toBe('shiki-js')
  })

  it('reports the backend the registry actually holds', async () => {
    // Another surface created the shared instance first.
    state.highlighterName = 'shiki-js'
    await expect(resolvePreferredHighlighter()).resolves.toBe('shiki-js')
  })

  it('resolves once and reuses the decision', async () => {
    await resolvePreferredHighlighter()
    await resolvePreferredHighlighter()
    await resolvePreferredHighlighter()
    expect(state.getSharedHighlighterCalls).toHaveLength(1)
  })

  it('expands a dark/light theme pair for the probe', async () => {
    await resolvePreferredHighlighter({ themes: { dark: 'pierre-dark', light: 'pierre-light' } })
    expect(state.getSharedHighlighterCalls[0].themes).toEqual(['pierre-dark', 'pierre-light'])
  })
})
