import { describe, expect, it, vi } from 'vitest'
import { compatibleWorkerManager, TextAccumulator } from '../src/internal'

describe('TextAccumulator', () => {
  it('accumulates and resets text without changing order', () => {
    const text = new TextAccumulator()
    for (let i = 0; i < 300; i++)
      text.append(`${i},`)
    expect(text.toString()).toBe(Array.from({ length: 300 }, (_, i) => `${i},`).join(''))
    expect(text.length).toBe(text.toString().length)
    text.clear('next')
    expect(text.toString()).toBe('next')
  })
})

describe('compatibleWorkerManager', () => {
  it('passes through a 1.7-compatible pool', () => {
    const pool = {
      isWorkingPool: () => true,
      shouldHighlightOnMainThread: () => false,
      setFileResultCache: () => {},
      getPreferredHighlighter: () => 'shiki-js',
    }
    expect(compatibleWorkerManager(pool)).toBe(pool)
  })

  it('drops a legacy pool and warns once instead of crashing mid-render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacyPool = {
      isWorkingPool: () => true,
      highlightFileAST: () => {},
      getPlainFileAST: () => undefined,
      getFileRenderOptions: () => ({}),
    }

    expect(compatibleWorkerManager(legacyPool as any)).toBeUndefined()
    expect(compatibleWorkerManager(legacyPool as any)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('incompatible @pierre/diffs WorkerPoolManager')
    warn.mockRestore()
  })
})
