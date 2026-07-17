# API reference

## `createCodeStream(options?)`

Creates a read-only append stream controller.

### Options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `fileName` | `string` | derived | File name used when finalizing. |
| `language` | `string` | `text` | Shiki language. |
| `theme` | `string \| { dark, light }` | Diffs default | Shiki theme. |
| `themeType` | `system \| dark \| light` | `system` | Active theme mode. |
| `lineNumbers` | `boolean` | `true` | Show line numbers. |
| `wrap` | `boolean` | `false` | Wrap long lines. |
| `maxHeight` | `number \| string` | none | Scroll shell maximum height. |
| `autoScroll` | `always \| near-bottom \| never` | `near-bottom` | Viewport follow policy. |
| `autoScrollThresholdPx` | `number` | `32` | Near-bottom threshold. |
| `flushStrategy` | `raf \| { intervalMs }` | `raf` | Delta batching policy. |
| `nonAppendBehavior` | `reset \| throw \| ignore` | `reset` | Non-prefix snapshot behavior. |
| `limits` | `false \| CodeStreamLimits` | 10,000 lines / 1,000,000 chars | Stop live highlighting and continue in append-only plain text after the threshold. |
| `onOverflow` | callback | — | Called once when streaming switches to plain-text mode. |
| `onStateChange` | callback | — | Lifecycle notification. |
| `onError` | callback | — | Streaming renderer error notification. |

Other `FileStreamOptions` are accepted directly.

### Controller

- `mount(container)` initializes the lazily loaded renderer.
- `append(chunk)` appends a delta.
- `updateSnapshot(content)` accepts a cumulative snapshot.
- `consume(source)` consumes a `ReadableStream<string>` or `AsyncIterable<string>`.
- `flush()` commits queued deltas in order.
- `finalize({ view: 'stream' })` closes and keeps the streaming DOM.
- `finalize({ view: 'file', ...fileOptions })` switches to an interactive file.
- `finalize({ view: 'diff', original, diffStyle, ...diffOptions })` switches to a final accurate diff.
- `reset(initialContent?)` invalidates pending work and starts a new stream.
- `setThemeType(type)`, `setTheme(theme)`, `setLanguage(language)`, `getText()`, `getState()`, `getStats()`, and `dispose()` manage the instance. Changing language resets the active streaming tokenizer while preserving the accumulated text.
- `onDidRender(listener)` observes live stream writes and the final File/Diff surface. It returns a disposable subscription.

`getStats()` reports `renderMode` (`highlighted` or `plain-text`) and `overflowed`. The default limits are safety defaults for this package, not documented upstream Diffs limits. Pass `limits: false` to disable them or configure `maxStreamingLines`, `maxStreamingChars`, and `overflowBehavior`.

States are `idle`, `mounting`, `streaming`, `finalizing`, `finalized`, `error`, and `disposed`.

## `createDiffSurface(input)`

Creates one imperative surface. All DOM-heavy code loads on `mount()`.

### File input

```ts
{ kind: 'file', file, annotations?, options?: FileOptions }
```

### Diff input

```ts
{ kind: 'diff', oldFile, newFile, annotations?, options?: FileDiffOptions }
```

`options.diffStyle` selects `unified` or `split` layout.

### Merge conflict input

```ts
{ kind: 'merge-conflict', file, annotations?, options?: UnresolvedFileOptions }
```

### Parsed diff and Git patch inputs

```ts
{ kind: 'diff', fileDiff, annotations?, options?: FileDiffOptions }
{ kind: 'patch', patch, patchIndex?, fileIndex?, annotations?, options?: FileDiffOptions }
```

Patch parsing is lazy with the renderer. Multi-commit patches can select both a patch and file index.

Every File, Diff, Patch, and Merge input accepts `workerManager?: WorkerPoolManager`. It is forwarded unchanged to the native Pierre constructor.

### Controller

- `mount(container)` and `dispose()` own the DOM lifecycle.
- `update(input)`, `updateFile()`, `updateDiff()`, `updateParsedDiff()`, `updatePatch()`, and `updateMergeConflict()` replace render data.
- `setSelectedLines(range)` sets or clears a controlled selection.
- `setAnnotations(annotations)` updates comments without recreating the controller.
- `setThemeType(type)`, `setTheme(theme)`, and `setOptions(options)` update appearance and native Diffs options without discarding accepted/rejected state.
- `acceptReject(hunkIndex, action)` transforms the current diff and rerenders it.
- `resolveConflict(conflictIndex, resolution)` resolves current, incoming, or both.
- `getResolvedFile()` returns the current complete file after accept/reject transformations (undefined for partial patches).
- `getDiff()` returns current parsed metadata.
- `getInput()` returns current input data.
- `getNativeInstance()` exposes the mounted `File`, `FileDiff`, or `UnresolvedFile` for upstream APIs not wrapped by the controller.
- `onDidRender(listener)` observes initial and subsequent native render completion, including asynchronous highlighting updates. It returns a disposable subscription.
- `whenVisualReady()` waits for the latest native post-render commit, including a render that supersedes the one originally awaited. It resolves `true` after that commit and `false` if the surface is disposed before it becomes ready or no visual render exists.

## Native Diffs exports

The `stream-diffs/pierre` entry re-exports common non-component utilities: `parseDiffFromFile`, `parsePatchFiles`, `diffAcceptRejectHunk`, `resolveConflict`, `resolveRegion`, `registerCustomLanguage`, `registerCustomTheme`, `setCustomExtension`, `setLanguageOverride`, `getSharedHighlighter`, and `disposeHighlighter`.

Native types are also re-exported. Common public types remain available from the root; the complete upstream type surface is available from `stream-diffs/pierre`.

When token callbacks are configured, `stream-diffs` automatically enables the upstream token transformer so `data-char` metadata and hover events are reliably available.

## Vue entry

Import `StreamCode`, `StreamDiff`, and `StreamMergeConflict` from `stream-diffs/vue`. They expose `getController()` through the component ref. Their `options` and `annotations` props use the native generic Diffs types. Hot code deltas bypass Vue reactive rendering and write directly to the imperative controller.

## markstream compatibility entry

The `stream-diffs/markstream` entry exports `useMonaco`, `detectLanguage`, and `preloadMonacoWorkers` so markstream CodeBlock runtime loading can consume `stream-diffs` without changing its existing component contract. The root entry retains these aliases for existing integrations. Markstream keeps its own `<pre>` while content streams, then creates one final static File or FileDiff after the block is complete and visible. `whenVisualReady()` resolves only after the latest native render is stable; adapters must keep the fallback when it resolves `false`. Adapter content-size/layout events are backed by native Diffs render completion so Shadow DOM highlighting can trigger host height reconciliation. These names are compatibility APIs; they do not load Monaco.
