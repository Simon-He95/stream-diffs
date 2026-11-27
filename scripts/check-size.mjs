import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = resolve(import.meta.dirname, '../dist')
const files = readdirSync(dist).filter(file => file.endsWith('.mjs'))
const sizes = Object.fromEntries(files.map(file => [file, gzipSync(readFileSync(resolve(dist, file))).byteLength]))
const core = files.find(file => file.startsWith('DiffStreamController-'))

if (!core)
  throw new Error('Missing shared stream controller runtime chunk')

const budgets = {
  // Root entry gains the `resolvePreferredHighlighter` re-export; it must stay a
  // thin barrel with no eager `@pierre/diffs` import.
  'index.mjs': 260,
  'markstream.mjs': 4_980,
  'vue.mjs': 1_520,
  'pierre.mjs': 300,
  // Pass-through only; it must stay a re-export, never real editor code.
  'edit.mjs': 120,
  // + the `auto` highlighter resolver (probe + memo) and the 1.7 editor
  // lifecycle/search/reveal wrappers. Keep this from absorbing unrelated
  // growth by raising it deliberately per feature.
  // + the stable-handoff stream shell (header, gutter, final metrics).
  [core]: 10_500,
}

for (const [file, maximum] of Object.entries(budgets)) {
  const actual = sizes[file]
  if (actual == null)
    throw new Error(`Missing size-gated runtime file: ${file}`)
  if (actual > maximum)
    throw new Error(`${file} is ${actual} gzip bytes; budget is ${maximum}`)
}

const total = Object.values(sizes).reduce((sum, size) => sum + size, 0)
// Covers `parsePatchOptions`, the `prepareForEditing` bridge, the `auto`
// highlighter resolver, and the 1.7 editing API. tsdown output varies by ~150
// gzip bytes between builds, so keep a little slack and raise this deliberately
// per feature.
if (total > 17_600)
  throw new Error(`Total first-party runtime is ${total} gzip bytes; budget is 17600`)

console.log(`runtime gzip: ${total} bytes`, sizes)
