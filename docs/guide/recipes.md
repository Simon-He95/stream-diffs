---
title: Framework recipes
description: Patterns for AI chat, markdown blocks, worker pools, SSR, themes, patches, drafts, and large transcripts.
---

# Framework recipes

The root entry is framework-free. These patterns work in React, Svelte, Angular, Solid, and plain JavaScript. Vue-specific wrappers are documented in [Vue](./vue).

## AI chat message lifecycle

One controller per completed message. Keep the plain text visible while the answer arrives, then finalize once:

```ts
import { createCodeStream } from 'stream-diffs'

type Message = {
  id: string
  text: string
  complete: boolean
}

const controllers = new Map<string, ReturnType<typeof createCodeStream>>()

async function mountCodeBlock(message: Message, host: HTMLElement) {
  const output = createCodeStream({
    fileName: 'answer.ts',
    language: 'typescript',
    maxHeight: 480,
    autoScroll: 'near-bottom',
  })
  controllers.set(message.id, output)

  await output.mount(host)
  output.append(message.text)

  if (message.complete)
    await output.finalize({ view: 'file', useTokenTransformer: true })
}

async function appendDelta(message: Message, delta: string) {
  const output = controllers.get(message.id)
  if (!output)
    return
  output.append(delta)

  if (message.complete)
    await output.finalize({ view: 'file', useTokenTransformer: true })
}

function removeMessage(message: Message) {
  controllers.get(message.id)?.dispose()
  controllers.delete(message.id)
}
```

Wrap the controller lifecycle in your framework's mount and unmount hooks. Do not recreate a controller for every token.

## Finalize only when visible

Offscreen chat messages do not need highlighting. Gate the expensive step:

```ts
const observer = new IntersectionObserver((entries) => {
  if (entries.some(entry => entry.isIntersecting))
    void output.finalize({ view: 'file' })
})

observer.observe(host)
```

`whenVisualReady()` lets you swap a fallback only after the surface has painted:

```ts
const fallback = host.querySelector('.fallback')
await output.finalize({ view: 'file' })

const surface = output.getFinalizedSurface()
if (await surface?.whenVisualReady())
  fallback?.remove()
```

## Markdown code blocks without markstream

If your Markdown renderer gives you a code block node and a completion signal, keep its `<pre>` until the block is complete and visible:

```ts
import { createDiffSurface } from 'stream-diffs'

function isVisible(element: HTMLElement) {
  return element.getBoundingClientRect().top < window.innerHeight
}

async function enhance(block: HTMLElement, code: string, language: string, complete: boolean) {
  if (!complete || !isVisible(block))
    return

  const staging = document.createElement('div')
  const surface = createDiffSurface({
    kind: 'file',
    file: { name: `snippet.${language}`, contents: code, lang: language },
    options: { disableFileHeader: true, useTokenTransformer: true },
  })

  await surface.mount(staging)
  if (!(await surface.whenVisualReady()))
    return surface.dispose()

  block.replaceWith(staging)
}
```

Use `stream-diffs` directly for this. If you already use `markstream-vue`, see [markstream-vue integration](../markstream-vue).

## Worker pool

A worker pool moves highlighting off the main thread. The pool must come from the same `@pierre/diffs` copy that `stream-diffs` uses:

```ts
import { WorkerPoolManager } from '@pierre/diffs/worker'
import DiffWorker from '@pierre/diffs/worker/worker.js?worker'

const pool = new WorkerPoolManager(
  {
    workerFactory: () => new DiffWorker(),
    poolSize: 2,
    mainThreadMaxCharacters: 8_000,
  },
  {
    langs: ['typescript', 'tsx'],
    theme: { dark: 'github-dark', light: 'github-light' },
  },
)

const surface = createDiffSurface({
  kind: 'diff',
  oldFile,
  newFile,
  workerManager: pool,
})
```

`mainThreadMaxCharacters` keeps small blocks on the main thread, which avoids a worker round trip. An incompatible pool created from a different Diffs copy is ignored with a warning, and rendering falls back to the main thread.

Terminate the pool when the app or editor workspace unmounts.

## SSR and hydration

The root entry is SSR-safe: renderer code loads on first `mount()`.

```ts
import { createCodeStream } from 'stream-diffs'

// safe on the server
const output = createCodeStream({ fileName: 'answer.ts' })

// only in the browser
if (typeof window !== 'undefined')
  await output.mount(host)
```

For SSR, render the host container on the server and mount after hydration. If you prerender highlighted HTML, upstream `deferHydrationHighlight: true` delays Shiki until a render needs it.

## Theme switching

```ts
const surface = createDiffSurface({ kind: 'diff', oldFile, newFile })

surface.setThemeType(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
await surface.setTheme({ dark: 'github-dark', light: 'github-light' })
```

`setThemeType()` updates the live surface without ending an edit session. `setTheme()` replaces the theme and rerenders.

## Patches from an API

```ts
const patch = await fetch(`/api/reviews/${reviewId}/diff`).then(response => response.text())

const surface = createDiffSurface({
  kind: 'patch',
  patch,
  fileIndex: 0,
  parsePatchOptions: { cacheKeyPrefix: `review:${reviewId}` },
})

await surface.mount(container)
```

When a patch has multiple commits or files, read `parsePatchFiles()` from `stream-diffs/pierre` first and choose the indexes you need.

## Drafts that survive collapse

```ts
const surface = createDiffSurface({ kind: 'file', file })
await surface.mount(container)

await surface.startEditing({
  onChange(event) {
    draftCache.set(blockId, event.file.contents)
  },
}, `block:${blockId}`)
```

A session key keeps the draft and history in memory. If the block unmounts, persist the draft yourself and reopen the same key when it returns.

## Custom languages and themes

Use the Pierre entry so the shared highlighter and registries stay consistent:

```ts
import {
  registerCustomLanguage,
  registerCustomTheme,
  setLanguageOverride,
} from 'stream-diffs/pierre'
```

Register before mounting the first surface. See the upstream Diffs documentation for loader shapes and theme registration.

## Large transcripts

- Finalize completed blocks and dispose their controllers.
- Virtualize older messages outside the viewport.
- Keep `maxHeight` set so one long answer does not push the composer offscreen.
- Avoid mounting a live controller for every historical message at once.
- Reuse one worker pool for all visible surfaces.

## Cancellation

```ts
const output = createCodeStream({ fileName: 'answer.ts' })
await output.mount(host)

for await (const delta of stream) {
  if (signal.aborted) {
    output.dispose()
    break
  }
  output.append(delta)
}
```

Disposal invalidates pending work and removes the rendered DOM. Create a new controller for the next attempt.
