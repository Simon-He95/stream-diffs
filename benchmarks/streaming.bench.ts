import { bench, describe } from 'vitest'
import { TextAccumulator } from '../src/internal'

describe('append-only accumulation', () => {
  bench('10,000 micro deltas', () => {
    const text = new TextAccumulator()
    for (let i = 0; i < 10_000; i++)
      text.append('x')
    text.toString()
  })

  bench('1 MiB in 1 KiB chunks', () => {
    const text = new TextAccumulator()
    const chunk = 'x'.repeat(1024)
    for (let i = 0; i < 1024; i++)
      text.append(chunk)
    text.toString()
  })
})
