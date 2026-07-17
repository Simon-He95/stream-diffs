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
  'index.mjs': 3_500,
  'vue.mjs': 1_520,
  'pierre.mjs': 300,
  [core]: 5_660,
}

for (const [file, maximum] of Object.entries(budgets)) {
  const actual = sizes[file]
  if (actual == null)
    throw new Error(`Missing size-gated runtime file: ${file}`)
  if (actual > maximum)
    throw new Error(`${file} is ${actual} gzip bytes; budget is ${maximum}`)
}

const total = Object.values(sizes).reduce((sum, size) => sum + size, 0)
if (total > 10_860)
  throw new Error(`Total first-party runtime is ${total} gzip bytes; budget is 10860`)

console.log(`runtime gzip: ${total} bytes`, sizes)
