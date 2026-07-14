import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

for (const [entry, conditions] of Object.entries(pkg.exports)) {
  for (const [condition, file] of Object.entries(conditions)) {
    if (!existsSync(resolve(root, file)))
      throw new Error(`Missing ${condition} export for ${entry}: ${file}`)
  }
}

const rootEntry = readFileSync(resolve(root, pkg.exports['.'].import), 'utf8')
if (/from\s+["']@pierre\/diffs["']/.test(rootEntry))
  throw new Error('The root entry must not eagerly import @pierre/diffs')

const rootModule = await import(pathToFileURL(resolve(root, pkg.exports['.'].import)).href)
for (const name of ['createCodeStream', 'createDiffSurface', 'useMonaco']) {
  if (typeof rootModule[name] !== 'function')
    throw new Error(`Missing root runtime export: ${name}`)
}

const vueModule = await import(pathToFileURL(resolve(root, pkg.exports['./vue'].import)).href)
for (const name of ['StreamCode', 'StreamDiff', 'StreamMergeConflict']) {
  if (!vueModule[name])
    throw new Error(`Missing Vue runtime export: ${name}`)
}

const pierreModule = await import(pathToFileURL(resolve(root, pkg.exports['./pierre'].import)).href)
for (const name of ['parseDiffFromFile', 'parsePatchFiles', 'diffAcceptRejectHunk']) {
  if (typeof pierreModule[name] !== 'function')
    throw new Error(`Missing Pierre utility export: ${name}`)
}

console.log('package exports and Node imports: ok')
