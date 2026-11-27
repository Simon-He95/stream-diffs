---
title: Streaming code
description: Control append-only code streams, finalize to an interactive file or diff, and handle themes, viewport follow, and cleanup.
---

# Streaming code

`createCodeStream()` owns one append-only code block. While the model is still writing, the block is plain text. Highlighting starts at `finalize()`, when the complete snapshot is available and one accurate render is worth the cost.

The plain stream keeps the final layout ready: the same 44px filename header, 13px / 20px monospace metrics, line-number gutter, and content inset used by the @pierre/diffs file surface. Finalizing to a file swaps the text for highlighted text without moving the code. `showHeader: false` removes the header from both states; `wrap: true` keeps the gutter width and reveals its numbers only after finalize.

## Basic flow

```ts
import { createCodeStream } from 'stream-diffs'

const output = createCodeStream({
  fileName: 'answer.ts',
  language: 'typescript',
  theme: { dark: 'github-dark', light: 'github-light' },
  themeType: 'system',
  lineNumbers: true,
  maxHeight: 520,
  autoScroll: 'near-bottom',
})

await output.mount(container)

output.append('export const ')
output.append('answer = 42\n')

await output.finalize({ view: 'file' })
```

`mount()` resolves after the lazily imported renderer is ready. Always await it before appending if you need errors from initialization to reach the caller.

## Append or update a snapshot

`append()` is the hot path. Send deltas, not the full document:

```ts
output.append(delta)
```

If your SDK only exposes cumulative snapshots, use `updateSnapshot()`. A prefix snapshot is converted into a delta automatically:

```ts
output.updateSnapshot('export')
output.updateSnapshot('export const')
output.updateSnapshot('export const answer = 42')
```

Non-prefix snapshots follow `nonAppendBehavior`:

| Value | Behavior |
| --- | --- |
| `reset` (default) | Reset and start a new document from the snapshot. |
| `ignore` | Drop the snapshot. |
| `throw` | Throw an error. Use this to enforce the append contract. |

## Consume a browser stream

`consume()` accepts a `ReadableStream<string>` or any `AsyncIterable<string>`:

```ts
await output.consume(response.body!)
await output.finalize({ view: 'diff', original: previousSource })
```

Errors from the source mark the stream as `error` and are rethrown.

## Batching

Deltas are batched with `requestAnimationFrame` by default. For low-frequency sources you can force an interval:

```ts
const output = createCodeStream({
  flushStrategy: { intervalMs: 32 },
})
```

Call `flush()` before reading the DOM or measuring layout if you need every pending chunk committed synchronously.

## Finalize

`finalize()` is one-way. It flushes pending deltas and upgrades the block:

```ts
await output.finalize({ view: 'stream' }) // keep the streamed DOM
```

```ts
await output.finalize({
  view: 'file',
  enableLineSelection: true,
  useTokenTransformer: true,
})
```

```ts
await output.finalize({
  view: 'diff',
  original: previousSource,
  diffStyle: 'split',
  diffIndicators: 'bars',
  lineDiffType: 'word-alt',
})
```

The diff is computed from the complete text. Callers must not assume token-level incremental diff correctness while the answer is still arriving.

After finalization the stream is read-only at the controller level. Calling `append()` throws. To reuse the controller:

```ts
await output.reset()
output.append('A new answer')
```

## Controller state

`getState()` returns one of:

`idle`, `mounting`, `streaming`, `finalizing`, `finalized`, `error`, `disposed`.

```ts
output.onDidRender(() => {
  console.log('visible frame committed')
})

console.log(output.getStats())
```

`getStats()` reports characters, lines, writes, resets, and render mode. While streaming, `renderMode` is `plain-text`: no syntax tokens are created during the stream. It becomes `highlighted` after finalization.

`lineNumbers` and `wrap` style the streaming pre and are forwarded to the final File or Diff surface as `disableLineNumbers` and `overflow`.

`onStateChange` receives every transition. `onError` receives renderer failures. `onDidRender` fires after visible stream writes and after the final surface commits.

## Themes and language

```ts
output.setThemeType('dark')
await output.setTheme({ dark: 'pierre-dark', light: 'pierre-light' })
await output.setLanguage('tsx')
```

Changing language while streaming preserves the accumulated text. Changing language after finalization updates the rendered surface.

Theme values accept one Shiki theme name or a `{ dark, light }` pair. `themeType` chooses the active side and defaults to `system`.

## Viewport follow

`autoScroll` controls whether the shell follows new text:

| Value | Behavior |
| --- | --- |
| `near-bottom` (default) | Follow only when the user is within `autoScrollThresholdPx` of the bottom. |
| `always` | Follow every write. |
| `never` | Never move the viewport. |

The default keeps a user who has scrolled up from being yanked back to the bottom.

## Large outputs

The streaming path is intentionally cheap, but the document still grows. For long answers:

- Keep `maxHeight` set so the shell scrolls instead of expanding the chat layout.
- Avoid mounting dozens of live streams at once. Finalize completed blocks and virtualize older ones.
- Dispose controllers when a message is removed or replaced.

```ts
const output = createCodeStream({ maxHeight: 600 })

// later
output.dispose()
```

`limits` and `onOverflow` are reserved options on `CodeStreamOptions`. The current streaming path is plain text and does not tokenize, so they do not change rendering. Do not rely on them for production behavior yet.

## Streaming a diff preview

When both sides are changing, `createDiffStream()` renders a low-cost text preview and swaps to a real diff at the end:

```ts
import { createDiffStream } from 'stream-diffs'

const preview = createDiffStream({
  fileName: 'src/cart.ts',
  language: 'typescript',
  diffStyle: 'split',
  maxHeight: 420,
})

await preview.mount(container, originalSource, '')
preview.update(originalSource, partialModifiedSource)

const surface = await preview.finalize()
```

`finalize()` resolves to the `DiffSurfaceController` when the real diff is mounted. Use `getFinalizedSurface()` later if you did not keep that result. The preview shares the final file header and 13px / 20px metrics; `showHeader: false` removes the preview header and the final file header together. A diff is still a different view from a single streamed column, so use `createCodeStream()` when the handoff must stay pixel-stable.

## Cleanup checklist

- Dispose the controller when the message unmounts.
- Do not call `append()` after `finalize()`.
- Await `mount()` before `append()` if you need initialization errors.
- Guard `finalize()` with the same completion signal that marks the model response complete.
- If you render into a framework component, let the component own `dispose()`.
