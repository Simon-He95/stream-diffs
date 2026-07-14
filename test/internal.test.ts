import { describe, expect, it } from 'vitest'
import { TextAccumulator } from '../src/internal'

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
