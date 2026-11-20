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
{ kind: 'patch', patch, patchIndex?, fileIndex?, annotations?, options?: FileDiffOptions, parsePatchOptions?: ParsePatchOptions }
```

Patch parsing is lazy with the renderer. Multi-commit patches can select both a patch and file index.
`parsePatchOptions` is forwarded to `parsePatchFiles()`: pass `cacheKeyPrefix` so worker-pool
renders can cache parsed patches, `throwOnError` for strict parsing, or `disableLineMatching`
to keep a patch's own change blocks.

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

### Upgrading to `@pierre/diffs` 1.6.x

`stream-diffs` depends on `@pierre/diffs@^1.6.4`. Host code that imports native types
directly needs three mechanical changes:

- `FileOptions` and `FileDiffOptions` take a second `Caret` type parameter. Use
  `FileOptions<MyAnnotation, undefined>` / `FileDiffOptions<MyAnnotation, undefined>` unless
  you attach an editor. `stream-diffs` itself has no editor surface, so it pins `undefined`.
- `parsePatchFiles(patch, cacheKeyPrefix?, throwOnError?)` moved to
  `parsePatchFiles(patch, { cacheKeyPrefix, throwOnError, disableLineMatching })`.
- The root entry no longer re-exports `codeToHtml`, `CodeToHastOptions`, `ThemeRegistration`,
  `ThemeRegistrationResolved`, `ShikiTransformer`, `BundledLanguage`, `LanguageRegistration`,
  or `ShikiStreamTokenizer*`. Import them from `shiki`/`@shiki/*`, or use
  `DiffsStreamTokenizer` and `FileStream`.

Two upstream capabilities are worth opting into from the host:

- `preferredHighlighter: 'auto'` resolves once per page to the WASM `highlights` backend when
  the platform can run it, and to `shiki-js` when it cannot or when the backend fails to load.
  Pass an explicit `'shiki-js'`, `'shiki-wasm'`, or `'highlights'` to pin one. Only one backend
  can be active per thread and the first caller fixes it, so this is app-wide rather than
  per-surface; `resolvePreferredHighlighter()` reports what `auto` picked.
- Worker pools accept `mainThreadMaxCharacters` (small files stay on the main thread and skip
  the worker round trip) and `onWorkerError` (report load failures instead of `console.error`).

## Editing a finalized surface

`stream-diffs` stays read-only: it renders a stream, then hands the shell to one native
`File`/`FileDiff`. Upstream `@pierre/diffs` has shipped an editor since 1.3, and this package
re-exports it from `stream-diffs/edit` so the editor runs on the same `@pierre/diffs` copy the
surfaces use. The highlighter registry is module-level, so a separately installed copy cannot
share it.

```ts
import { createDiffSurface } from 'stream-diffs'
import { Editor } from 'stream-diffs/edit'

const surface = createDiffSurface({ kind: 'diff', oldFile, newFile })
await surface.mount(container)
await surface.prepareForEditing()

const editor = new Editor('file-diff', {
  onChange: event => save(event.file),
  onComplete: event => event.file.contents === saved ? 'reject' : 'accept',
}, 'review-draft')
const detach = editor.edit(surface.getNativeInstance()!)
```

- `prepareForEditing()` hydrates a partial diff. A `kind: 'patch'` surface only becomes
  editable when `options.loadDiffFiles` can supply both complete sides; `File` surfaces and
  complete diffs resolve immediately.
- The editor creates its document during its first render sync, so `getText()` and
  `applyEdits()` are only meaningful after one render settles.
- The third constructor argument (`editStateKey`) keeps a draft and its undo history in
  memory so a later editor with the same key resumes it.
- `edit()` returns a detach function. It throws for `merge-conflict` surfaces, which are not
  editable, and for diffs that are still partial.
- Anything that replaces the native instance ends the session: `update()`, `setOptions()`,
  `setTheme()`, `setThemeType()`, and `dispose()` all re-render. Re-attach after those calls,
  or drive the editor from the host's own copy of the data.

This entry is a pass-through. It is only loaded when imported, so it adds nothing to the eager
runtime.

## Vue entry

Import `StreamCode`, `StreamDiff`, and `StreamMergeConflict` from `stream-diffs/vue`. They expose `getController()` through the component ref. Their `options` and `annotations` props use the native generic Diffs types. Hot code deltas bypass Vue reactive rendering and write directly to the imperative controller.

## markstream compatibility entry

The `stream-diffs/markstream` entry exports `useMonaco`, `detectLanguage`, and `preloadMonacoWorkers` so markstream CodeBlock runtime loading can consume `stream-diffs` without changing its existing component contract. The root entry retains these aliases for existing integrations. Markstream keeps its own `<pre>` while content streams, then creates one final static File or FileDiff after the block is complete and visible. `whenVisualReady()` resolves only after the latest native render is stable; adapters must keep the fallback when it resolves `false`. Adapter content-size/layout events are backed by native Diffs render completion so Shadow DOM highlighting can trigger host height reconciliation. These names are compatibility APIs; they do not load Monaco.
