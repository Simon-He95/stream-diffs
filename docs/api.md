# API reference

<p class="sd-api-note">Want typed examples? The <a href="types.html">type reference</a> is typechecked by Twoslash and links back into this page.</p>

The controller API is stable for the 0.0.x line. Mounting is browser-only; importing is SSR-safe.

<a id="createcodestream"></a>

## `createCodeStream(options?)`

Creates a read-only append stream controller.

<a id="codestreamoptions"></a>

### Options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `fileName` | `string` | derived | File name used when finalizing. |
| `language` | `string` | `text` | Shiki language. |
| `theme` | `string \| { dark, light }` | Diffs default | Shiki theme. |
| `themeType` | `system \| dark \| light` | `system` | Active theme mode. |
| `lineNumbers` | `boolean` | `true` | Show line numbers in the streaming gutter and on the final File or Diff surface. |
| `wrap` | `boolean` | `false` | Wrap long lines in the streaming pre and the final surface. Wrapped streams keep the gutter width but hide its numbers until finalize. |
| `showHeader` | `boolean` | `true` | Render the streamed filename header. When false, the final file header is hidden too, so the code keeps the same origin. |
| `maxHeight` | `number \| string` | none | Scroll shell maximum height. |
| `autoScroll` | `always \| near-bottom \| never` | `near-bottom` | Viewport follow policy. |
| `autoScrollThresholdPx` | `number` | `32` | Near-bottom threshold. |
| `flushStrategy` | `raf \| { intervalMs }` | `raf` | Delta batching policy. |
| `nonAppendBehavior` | `reset \| throw \| ignore` | `reset` | Non-prefix snapshot behavior. |
| `limits` | `false \| CodeStreamLimits` | none | Reserved. The current streaming path is plain text and does not tokenize, so limits do not change rendering. |
| `onOverflow` | callback | none | Reserved. Not called by the current plain-text streaming path. |
| `onStateChange` | callback | none | Lifecycle notification. |
| `onError` | callback | none | Streaming renderer error notification. |

The controller applies only the options listed above, plus `workerManager` for the final surface. Other fields on the `FileStreamOptions` base type are currently unused by the plain-text streaming path.

<a id="codestreamcontroller"></a>
<a id="finalizeoptions"></a>

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
- `whenVisualReady()` resolves after the final surface has painted. The controller keeps the plain stream visible while a cold final render is in flight, so awaiting this method is the safe point to announce completion.

<a id="codestreamstats"></a>

`getStats()` reports characters, lines, writes, resets, and `renderMode`. While streaming, `renderMode` is `plain-text`. Highlighting starts at finalization.

### Stable layout handoff

The plain stream is not an unrelated `<pre>` dropped into the page. It mirrors the final file surface before the renderer loads:

- 44px filename header, or none when `showHeader: false`.
- 13px / 20px monospace metrics from `@pierre/diffs`, with `--diffs-font-size` and `--diffs-line-height` respected when set by the host.
- A 2ch / 1ch line-number gutter and the same 1ch content inset.
- `8px` top padding for `scroll` and `0` for `wrap`, matching the final `[data-code]` row.

Finalizing with `view: 'file'` therefore replaces text with highlighted text at the same coordinates. `view: 'diff'` intentionally changes the view to hunks and two sides; that is a layout change, not a highlight handoff. For the most stable result, set `showHeader`, `lineNumbers`, and `wrap` at creation and do not override them in `finalize()`.

The `limits`, `onOverflow`, and overflow fields on the stats object are reserved for a future live-highlight path. They are currently no-ops.

States are `idle`, `mounting`, `streaming`, `finalizing`, `finalized`, `error`, and `disposed`.

<a id="creatediffstream"></a>
<a id="diffstreamcontroller"></a>
<a id="diffstreamoptions"></a>

### Diff stream

`createDiffStream(options?)` accepts `fileName`, `language`, `diffStyle`, `lineNumbers`, `wrap`, `showHeader`, `maxHeight`, `autoScroll`, `autoScrollThresholdPx`, `workerManager`, and the lifecycle callbacks. It renders a plain two-sided or unified preview, then swaps to the native diff on finalize. The preview header matches the final file header; pass `showHeader: false` to hide both.

<a id="creatediffsurface"></a>

## `createDiffSurface(input)`

Creates one imperative surface. All DOM-heavy code loads on `mount()`.

<a id="diffsurfaceinput"></a>

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

<a id="diffsurfacecontroller"></a>

### Controller

- `mount(container)` and `dispose()` own the DOM lifecycle.
- `update(input)`, `updateFile()`, `updateDiff()`, `updateParsedDiff()`, `updatePatch()`, and `updateMergeConflict()` replace render data.
- `setSelectedLines(range, options?)` sets or clears a controlled selection; `options` forwards upstream's `SelectionWriteOptions` (`notify`, `activeLineSide`, `lineNumberOnly`).
- `setAnnotations(annotations)` updates comments without recreating the controller.
- `setThemeType(type)`, `setTheme(theme)`, and `setOptions(options)` update appearance and native Diffs options without discarding accepted/rejected state.
- `acceptReject(hunkIndex, action)` transforms the current diff and rerenders it.
- `resolveConflict(conflictIndex, resolution)` resolves current, incoming, or both and rerenders the surface.
- `getResolvedFile()` returns the current complete file after accept/reject transformations (undefined for partial patches and non-diff inputs such as merge conflicts).
- `getDiff()` returns current parsed metadata.
- `getInput()` returns current input data.
- `getNativeInstance()` exposes the mounted `File`, `FileDiff`, or `UnresolvedFile` for upstream APIs not wrapped by the controller.
- `onDidRender(listener)` observes initial and subsequent native render completion, including asynchronous highlighting updates. It returns a disposable subscription.
- `whenVisualReady()` waits for the latest native post-render commit, including a render that supersedes the one originally awaited. It resolves `true` after that commit and `false` if the surface is disposed before it becomes ready or no visual render exists.
- `isReadyToEdit()` reports whether an editor can attach immediately. Since `@pierre/diffs@1.7`, `prepareForEditing()` also awaits an in-flight worker-pool highlight.
- `startEditing(options?, editStateKey?)`, `stopEditing(reason?)`, and `isEditing()` own an upstream edit session. The editor chunk loads lazily the first time editing starts; read-only hosts never download it. `startEditing()` resolves after `prepareForEditing()` and the editor's first render sync attaches it, so `getEditingText()` and `applyEdits()` are usable immediately.
- `getEditor()`, `getEditingFile()`, `getEditingText()`, `canUndo()`, `canRedo()`, `undo()`, `redo()`, and `applyEdits()` forward the active editor document and history.
- `focusEditor()`, `blurEditor()`, `getEditorViewState()`, `setEditorViewState()`, and `setEditorSelections()` forward view state and selection APIs.
- `revealLine(line, side?)`, `expandLine(target)`, `expandHunk(index, direction, override?)`, `setEditorActiveLine(line, options?)`, `getNearestRenderableLine()`, and `isLineInCollapsedContext()` expose the 1.7 navigation and collapsed-context APIs.
- `getCodeScrollLeft()` and `setCodeScrollLeft(position)` expose horizontal scroll without reaching into Shadow DOM.

Any controller call that replaces the native instance (`update()`, `setOptions()`, `setTheme()`, `acceptReject()`, or `dispose()`) ends the active edit session first. Re-attach after the new render settles. `setThemeType()` and `setAnnotations()` update the live instance without ending the session.

## Native Diffs exports

The `stream-diffs/pierre` entry re-exports common non-component utilities: `parseDiffFromFile`, `parsePatchFiles`, `diffAcceptRejectHunk`, `resolveConflict`, `resolveRegion`, `registerCustomLanguage`, `registerCustomTheme`, `setCustomExtension`, `setLanguageOverride`, `getSharedHighlighter`, and `disposeHighlighter`.

Native types are also re-exported. Common public types remain available from the root; the complete upstream type surface is available from `stream-diffs/pierre`.

When token callbacks are configured, `stream-diffs` automatically enables the upstream token transformer so `data-char` metadata and hover events are reliably available.

### Upgrading to `@pierre/diffs` 1.7.x

`stream-diffs` now depends on `@pierre/diffs@^1.7.2`. The controlled DOM API is source-compatible, but the upstream runtime has behavior changes worth planning for:

- `Editor.edit()` now throws until the component is ready. `surface.startEditing()` handles `prepareForEditing()` for you; direct `stream-diffs/edit` users must check `isReadyToEdit()` and await `prepareForEditing()` first. `File` now exposes `prepareForEditing()` too.
- `prepareForEditing()` waits for a worker-pool highlight that would otherwise be re-run on the main thread, so the first edit session starts from highlighted rows.
- Long lines longer than `tokenizeMaxLineLength` (default `1000` characters) are cut and get a "Show full line" control instead of rendering the whole unhighlighted line. Set `tokenizeMaxLineLength: 0` to disable both the cut and the line-length highlight limit, or call `surface.expandLine()` to reveal one line. This is the largest visual behavior change for minified JSON or data URLs.
- `preferredDiffLib: '@pierre/patches'` opts into the WASM diff engine. On a 2,000-line fixture it cut parse time from ~73 ms to ~12 ms (6.3x) with identical output; it remains opt-in because it adds a WASM asset and CSP requirements.
- `i18n.set({ locale, messages })` localizes collapsed-context, search, and editing strings. Messages are ICU MessageFormat strings; omitted keys keep English defaults.
- `deferHydrationHighlight: true` delays loading Shiki for hydrated prerendered HTML until a render actually needs it.
- Editor `onChange`/`onEditChange` callbacks are synchronous document notifications. Do not call `edit`, `applyEdits`, `undo`, `redo`, `cleanUp`, or a component `render()` from inside them; defer with `queueMicrotask()`.
- CodeView gained find/replace (`openSearch`, `closeSearch`, `navigateSearch`, `isSearchOpen`, `onSearchStateChange`) and `replaceSearchMatches()` on the editor. `stream-diffs` surfaces are standalone File/FileDiff, so CodeView-managed search is not part of this package.
- Upstream flattened several component selectors and moved search styling to `::highlight(...)`. Host CSS overrides that targeted deep gutter or match-range selectors need to be rechecked.
- A worker pool must come from the same `@pierre/diffs@^1.7` copy. A pool from an older copy is now rejected with a one-time warning and highlighting falls back to the main thread instead of failing mid-render.

Host code that imports native types directly should also account for the accumulated API changes:

- `FileOptions` and `FileDiffOptions` take a second `Caret` type parameter. Use
  `FileOptions<MyAnnotation, undefined>` / `FileDiffOptions<MyAnnotation, undefined>` unless
  you attach an editor with caret metadata. `stream-diffs` defaults that parameter to
  `undefined` and accepts an explicit `Caret` on `createDiffSurface`/`DiffSurfaceController`.
- `parsePatchFiles(patch, cacheKeyPrefix?, throwOnError?)` moved to
  `parsePatchFiles(patch, { cacheKeyPrefix, throwOnError, disableLineMatching })`.
- 1.7 renderer results no longer expose `*GutterAST`, `*ContentAST`, `gutterAST`, `contentAST`,
  or `css`. Use `renderer.renderCodeAST(...)`, `hastToHtml(...)`, and `columnCells(...)`.
  `FileRenderer.renderPartialHTML` was removed.
- `TextDocument.normalizeEol()` now returns newline-normalized text. Use `getText()` or
  `getLineText(line, true)` for the original line endings.
- The root entry no longer re-exports `codeToHtml`, `CodeToHastOptions`, `ThemeRegistration`,
  `ThemeRegistrationResolved`, `ShikiTransformer`, `BundledLanguage`, `LanguageRegistration`,
  or `ShikiStreamTokenizer*`. Import them from `shiki`/`@shiki/*`, or use
  `DiffsStreamTokenizer` and `FileStream`.

Additional upstream capabilities are worth opting into from the host:

- `i18n` and the new model/layout/search utilities are re-exported from `stream-diffs/pierre`,
  alongside `preloadHighlighter`, `getHighlighterIfLoaded`, and `isHighlighterLoaded`.
- `preferredHighlighter: 'auto'` resolves once per page to the WASM `highlights` backend when
  the platform can run it, and to `shiki-js` when it cannot or when the backend fails to load.
  Pass an explicit `'shiki-js'`, `'shiki-wasm'`, or `'highlights'` to pin one. Only one backend
  can be active per thread and the first caller fixes it, so this is app-wide rather than
  per-surface; `resolvePreferredHighlighter()` reports what `auto` picked.
- Worker pools accept `mainThreadMaxCharacters` (small files stay on the main thread and skip
  the worker round trip) and `onWorkerError` (report load failures instead of `console.error`).
  Since 1.7 they also accept `preferredDiffLib` for inline word/character diffs. Keep the pool
  on the same `@pierre/diffs` version as `stream-diffs`; an incompatible pool is ignored with a
  warning so rendering falls back to the main thread.

<a id="diffsurfaceeditor"></a>

## Editing a finalized surface

`stream-diffs` renders read-only by default, then hands the shell to one native
`File`/`FileDiff`. Upstream `@pierre/diffs` owns the editor, and `surface.startEditing()` wraps
its readiness rules so a host does not need to know them:

```ts
import { createDiffSurface } from 'stream-diffs'

const surface = createDiffSurface({ kind: 'diff', oldFile, newFile })
await surface.mount(container)

const editor = await surface.startEditing({
  onChange: event => save(event.file),
  onComplete: event => event.file.contents === saved ? 'reject' : 'accept',
}, 'review-draft')

surface.applyEdits([{
  range: { start: { line: 14, character: 0 }, end: { line: 14, character: 0 } },
  newText: '  validate(input)\n',
}])
surface.undo()
surface.redo()
surface.focusEditor({ lineNumber: 14 })

surface.stopEditing('complete')
```

- `startEditing()` hydrates a partial diff, waits for an in-flight worker-pool highlight, and resolves after the editor has attached to the first render sync. A
  `kind: 'patch'` surface only becomes editable when `options.loadDiffFiles` can supply both
  complete sides; `File` surfaces and complete diffs attach immediately.
- Set `useTokenTransformer: true` when rendering a file or diff you know will be edited. Without
  it, upstream re-highlights and re-renders the whole file when the session starts.
- The second argument (`editStateKey`) keeps a draft and its undo/redo history in memory so a
  later session with the same key resumes it.
- `merge-conflict` surfaces are not editable; `startEditing()` throws.
- Anything that replaces the native instance ends the session: `update()`, `setOptions()`,
  `setTheme()`, `acceptReject()`, and `dispose()` all re-render. Re-attach after those calls,
  or drive the editor from the host's own copy of the data. `setThemeType()` and
  `setAnnotations()` keep the live session.
- `stream-diffs/edit` remains available for hosts that want to construct the upstream
  `Editor` themselves. It re-exports the same `@pierre/diffs` copy, so the module-level
  highlighter and edit-state registries are shared. It is a pass-through and adds nothing to
  the eager runtime.

## Vue entry

Import `StreamCode`, `StreamDiff`, and `StreamMergeConflict` from `stream-diffs/vue`. They expose `getController()` through the component ref. Their `options` and `annotations` props use the native generic Diffs types. Hot code deltas bypass Vue reactive rendering and write directly to the imperative controller. For editing, call `getController().getFinalizedSurface()?.startEditing(...)` after the component finalizes.

## markstream compatibility entry

The `stream-diffs/markstream` entry exports `useMonaco`, `detectLanguage`, and `preloadMonacoWorkers` so markstream CodeBlock runtime loading can consume `stream-diffs` without changing its existing component contract. The root entry retains these aliases for existing integrations. The runtime also returns `getSurface()`, which exposes the finalized controller so markstream can forward editing, reveal, expansion, and scroll APIs to its `CodeBlockNode` ref. Markstream keeps its own `<pre>` while content streams, then creates one final static File or FileDiff after the block is complete and visible. `whenVisualReady()` resolves only after the latest native render is stable; adapters must keep the fallback when it resolves `false`. Adapter content-size/layout events are backed by native Diffs render completion so Shadow DOM highlighting can trigger host height reconciliation. These names are compatibility APIs; they do not load Monaco.
