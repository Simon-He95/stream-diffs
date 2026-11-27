---
title: Quickstart
description: Install stream-diffs and render a streaming code answer, a final diff, and a Vue component in a few minutes.
---

# Quickstart

## Requirements

- A browser with ES2022 and Shadow DOM support.
- A bundler that can load ESM packages. Vite, Rollup, webpack, and esbuild all work.
- Vue 3.3 or newer only if you use the `stream-diffs/vue` entry.

## Install

```bash
pnpm add stream-diffs
```

```bash
npm install stream-diffs
```

```bash
yarn add stream-diffs
```

The renderer is a runtime dependency. Shiki grammars and themes selected by your options are loaded by `@pierre/diffs` on first mount.

## Stream code into a page

```ts
import { createCodeStream } from 'stream-diffs'

const output = createCodeStream({
  fileName: 'answer.ts',
  language: 'typescript',
  theme: { dark: 'github-dark', light: 'github-light' },
  themeType: 'system',
  maxHeight: 520,
  lineNumbers: true,
  autoScroll: 'near-bottom',
})

await output.mount(document.querySelector<HTMLElement>('#output')!)

output.append('export const ')
output.append('answer = 42\n')

await output.finalize({ view: 'file' })
```

While the stream is active, the surface is intentionally plain text. Highlighting starts at finalization, where one accurate snapshot is available.

## Finalize to a diff

Pass the previous source and the diff is computed from the complete text:

```ts
await output.finalize({
  view: 'diff',
  original: previousSource,
  diffStyle: 'unified', // or 'split'
  diffIndicators: 'bars',
  lineDiffType: 'word-alt',
  enableLineSelection: true,
})
```

`finalize()` can only be called once per stream. Call `reset()` to reuse the controller for another answer.

## Render a static diff

When both sides already exist, skip the stream entirely:

```ts twoslash
import { createDiffSurface } from 'stream-diffs'

const before = `export function total(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}
`
const after = `export function total(items) {
  return items.reduce((sum, item) => {
    if (!Number.isFinite(item.price))
      throw new TypeError('price must be finite')
    return sum + item.price
  }, 0)
}
`

const surface = createDiffSurface({
  kind: 'diff',
  oldFile: { name: 'src/cart.ts', contents: before, lang: 'typescript' },
  newFile: { name: 'src/cart.ts', contents: after, lang: 'typescript' },
  options: {
    diffStyle: 'split',
    enableLineSelection: true,
  },
})

await surface.mount(document.querySelector<HTMLElement>('#review')!)
```

The same controller accepts `kind: 'file'`, `kind: 'patch'`, and `kind: 'merge-conflict'`. See [Diffs and review](./diffs).

## Vue components

```bash
pnpm add stream-diffs vue
```

```vue
<script setup lang="ts">
import { StreamCode, StreamDiff } from 'stream-diffs/vue'

const before = 'export const answer = 0\n'
const after = 'export const answer = 42\n'
</script>

<template>
  <StreamCode
    :code="after"
    file-name="answer.ts"
    language="typescript"
    :loading="false"
  />

  <StreamDiff
    :original="before"
    :modified="after"
    language="typescript"
    diff-style="split"
  />
</template>
```

`StreamCode` keeps its fallback until the block is complete and visible. That behavior is designed for streamed Markdown. See [Vue](./vue) for props and controller access.

## Drop into markstream-vue

```bash
pnpm add markstream-vue stream-diffs
```

```vue
<script setup lang="ts">
import { MarkdownRender } from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender :content="markdown" :loading="streaming" />
</template>
```

When both optional runtimes are installed, markstream selects `stream-diffs`. See [markstream-vue integration](/markstream-vue).

## Try it without writing code

The [playground](/playground) runs the public controller API on a live page. Edit both sources, switch unified and split, annotate a line, then start an inline edit session on the rendered diff.

## Next steps

- [Streaming code](./streaming)
- [Diffs and review](./diffs)
- [Inline editing](./editing)
- [Framework recipes](./recipes)
- [Troubleshooting](./troubleshooting)
