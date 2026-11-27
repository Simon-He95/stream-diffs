---
title: Type reference
description: Typechecked stream-diffs examples with hover types and links into the API reference.
---

# Type reference

The examples on this page are checked by Twoslash during the docs build. Hover a type to inspect its shape. Type names and controller functions with a dotted underline open the matching API section.

## Streaming controller

```ts twoslash
import { createCodeStream } from 'stream-diffs'
import type {
  CodeStreamController,
  CodeStreamOptions,
} from 'stream-diffs'

const options: CodeStreamOptions = {
  fileName: 'answer.ts',
  language: 'typescript',
  lineNumbers: true,
  showHeader: true,
}

const stream: CodeStreamController = createCodeStream(options)

void stream.finalize({ view: 'file' })
```

## Diff surface

```ts twoslash
import { createDiffSurface } from 'stream-diffs'
import type { DiffSurfaceController } from 'stream-diffs'

const surface: DiffSurfaceController = createDiffSurface({
  kind: 'diff',
  oldFile: {
    name: 'src/cart.ts',
    contents: 'const total = 0\n',
    lang: 'typescript',
  },
  newFile: {
    name: 'src/cart.ts',
    contents: 'const total = 42\n',
    lang: 'typescript',
  },
  options: { diffStyle: 'split', enableLineSelection: true },
})
```

## Finalize options

```ts twoslash
import type { FinalizeOptions } from 'stream-diffs'

const asFile: FinalizeOptions = {
  view: 'file',
  enableLineSelection: true,
  overflow: 'scroll',
}

const asDiff: FinalizeOptions = {
  view: 'diff',
  original: 'const total = 0\n',
  diffStyle: 'unified',
}
```

## Editor session

```ts twoslash
import { createDiffSurface } from 'stream-diffs'
import type { DiffSurfaceEditor } from 'stream-diffs'

const surface = createDiffSurface({
  kind: 'file',
  file: { name: 'answer.ts', contents: 'export const answer = 42\n', lang: 'typescript' },
})

async function attachEditor(): Promise<DiffSurfaceEditor> {
  return surface.startEditing()
}
```

## Linked types

- [`CodeStreamController`](/api#codestreamcontroller)
- [`CodeStreamOptions`](/api#codestreamoptions)
- [`DiffSurfaceController`](/api#diffsurfacecontroller)
- [`DiffSurfaceInput`](/api#diffsurfaceinput)
- [`FinalizeOptions`](/api#finalizeoptions)
- [`DiffSurfaceEditor`](/api#diffsurfaceeditor)
- [`DiffStreamController`](/api#diffstreamcontroller)
- [`DiffStreamOptions`](/api#diffstreamoptions)
