import { describe, expect, it } from 'vitest'
import { diffAcceptRejectHunk, parseDiffFromFile } from '../src/pierre'

describe('@pierre/diffs integration', () => {
  it('parses real file contents and applies an accept action', () => {
    const diff = parseDiffFromFile(
      { name: 'answer.ts', contents: 'export const answer = 0\n' },
      { name: 'answer.ts', contents: 'export const answer = 42\n' },
    )
    expect(diff.hunks).toHaveLength(1)
    const accepted = diffAcceptRejectHunk(diff, 0, 'accept')
    expect(accepted.hunks[0]?.hunkContent).toEqual([
      expect.objectContaining({ type: 'context', lines: 1 }),
    ])
    expect(accepted.deletionLines).toEqual(accepted.additionLines)
    expect(accepted.additionLines.join('\n')).toContain('42')
  })
})
