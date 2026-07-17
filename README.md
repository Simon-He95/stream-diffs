# stream-diffs

Lightweight, read-only code and diff rendering for AI output. `stream-diffs` is powered by [`@pierre/diffs`](https://diffs.com/) and Shiki, streams appended code without Monaco models or workers, and switches to interactive file or diff surfaces when needed.

## Install

```bash
pnpm add stream-diffs
```

For Vue components:

```bash
pnpm add stream-diffs vue
```

## Streaming code

```ts
import { createCodeStream } from 'stream-diffs'

const output = createCodeStream({
  fileName: 'answer.ts',
  language: 'typescript',
  theme: { dark: 'github-dark', light: 'github-light' },
  maxHeight: 600,
  lineNumbers: true,
  autoScroll: 'near-bottom',
})

await output.mount(document.querySelector('#code')!)
output.append('export const ')
output.append('answer = 42\n')
await output.finalize({ view: 'file' })
```

Live highlighting is protected by default at 10,000 lines or 1,000,000 characters. Crossing either threshold aborts the growing highlighted DOM, keeps accumulating text, and continues with append-only plain text. Finalization still produces the accurate interactive File or Diff:

```ts
const output = createCodeStream({
  limits: {
    maxStreamingLines: 20_000,
    maxStreamingChars: 2_000_000,
    overflowBehavior: 'stop-highlighting',
  },
  onOverflow: stats => console.warn('Highlighting stopped', stats),
})
```

These are `stream-diffs` safety defaults, not upstream Diffs limits. Use `limits: false` when the host already enforces output bounds.

`append()` is the primary hot path. Cumulative SDK snapshots are also supported:

```ts
output.updateSnapshot('export')
output.updateSnapshot('export const')
output.updateSnapshot('export const answer = 42')
```

You can consume browser streams and async iterables directly:

```ts
await output.consume(response.body!)
await output.finalize({
  view: 'diff',
  original: previousSource,
  diffStyle: 'split',
})
```

## File, unified diff, and split diff

```ts
import { createDiffSurface } from 'stream-diffs'

const diff = createDiffSurface({
  kind: 'diff',
  oldFile: { name: 'src/app.ts', contents: before },
  newFile: { name: 'src/app.ts', contents: after },
  options: {
    diffStyle: 'unified', // one column
    // diffStyle: 'split', // two columns
    diffIndicators: 'bars',
    lineDiffType: 'word-alt',
    enableLineSelection: true,
  },
})

await diff.mount(document.querySelector('#diff')!)
diff.setSelectedLines({ start: 8, end: 12, side: 'additions' })
```

Use `kind: 'file'` for a static code file and `kind: 'merge-conflict'` for Git conflict markers.

Raw Git patches and pre-parsed metadata are accepted without eagerly loading Pierre from the root entry:

```ts
const patchView = createDiffSurface({
  kind: 'patch',
  patch: unifiedPatch,
  fileIndex: 0,
  options: { diffStyle: 'unified' },
})
```

## markstream-vue

`markstream-vue` dynamically prefers `stream-diffs` when it is installed. Existing `CodeBlockNode` usage does not change:

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

Advanced Diffs options pass through `code-block-props.monacoOptions`. The property keeps its existing name for compatibility:

```vue
<MarkdownRender
  :content="markdown"
  :code-block-props="{
    monacoOptions: {
      diffStyle: 'split',
      enableLineSelection: true,
      onLineSelected: range => console.log(range),
      onTokenEnter: ({ tokenText, tokenElement }) => {
        tokenElement.dataset.hovered = tokenText
      },
      onController: controller => codeController = controller,
    },
  }"
/>
```

While loading, markstream keeps its own `<pre>` and does not create a Diffs controller. After the block is complete and visible, it creates one static File or FileDiff with `stream: false`, waits for the first stable visual frame, and atomically replaces the fallback. Complete Git conflict markers use the merge conflict resolution UI. If both optional renderers are installed, `stream-diffs` wins; remove it to select `stream-monaco` explicitly.

The first cold mount still initializes the shared Shiki highlighter asynchronously, so markstream keeps its `<pre>` fallback until the Diffs surface is ready. No Monaco worker or model is created. On the measured Chrome benchmark, the median cold fallback was 72.4 ms for stream-diffs versus 913.0 ms for stream-monaco; 1-, 12-, and 24-thread runs had no measured container-height decrease. See [Performance and package size](./docs/performance.md#browser-streaming-benchmark) for methodology and reproducible commands.

## Framework adapters

The root `stream-diffs` entry is an imperative DOM runtime and imports no framework. React, Svelte, Angular, Vue, and vanilla applications use the same controllers. The optional `stream-diffs/vue` entry only provides Vue component wrappers.

For streamed Markdown, the framework adapter owns completion and visibility. Keep the framework's `<pre>` mounted while the block is incomplete or outside the viewport, then mount one final snapshot when both conditions are true:

```ts
if (codeBlockComplete && codeBlockVisible) {
  const runtime = useMonaco({ stream: false, disableFileHeader: true })
  await runtime.createEditor(stagingElement, finalCode, language)
  if (await runtime.whenVisualReady?.())
    fallbackElement.replaceWith(stagingElement)
}
```

Build the highlighted surface in a staging element and replace the fallback only after creation and visual readiness resolve. This keeps React effects, Svelte actions, Angular hooks, and Vue lifecycle code outside the runtime while preserving a single pre-to-highlight transition. Dispose the runtime when the host component unmounts, collapses, or changes code-block identity.

## Interactive review APIs

### Custom headers

```ts
const review = createDiffSurface({
  kind: 'diff',
  oldFile,
  newFile,
  options: {
    renderCustomHeader(fileDiff) {
      const header = document.createElement('div')
      header.textContent = `Review ${fileDiff.name}`
      return header
    },
  },
})
```

### Token hover

```ts
const file = createDiffSurface({
  kind: 'file',
  file: { name: 'styles.css', contents: css },
  options: {
    onTokenEnter({ tokenText, lineNumber, tokenElement }) {
      showHover({ tokenText, lineNumber, anchor: tokenElement })
    },
    onTokenLeave() {
      hideHover()
    },
  },
})
```

Token hooks add token metadata to the DOM and should only be enabled when needed.

### Comments and annotations

```ts
type Comment = { author: string, body: string }

const review = createDiffSurface<Comment>({
  kind: 'diff',
  oldFile,
  newFile,
  annotations: [
    { side: 'additions', lineNumber: 14, metadata: { author: 'You', body: 'Validate this input.' } },
  ],
  options: {
    renderAnnotation(annotation) {
      const el = document.createElement('article')
      el.textContent = `${annotation.metadata.author}: ${annotation.metadata.body}`
      return el
    },
  },
})

review.setAnnotations(nextComments)
```

### Accept or reject changes

```ts
review.acceptReject(0, 'accept')
review.acceptReject(1, 'reject')
review.acceptReject(2, { type: 'accept', changeIndex: 0 })
```

Each call returns the next `FileDiffMetadata` and rerenders the surface. This is a metadata transformation; persisting or applying the resulting file is controlled by your application.

```ts
const resolved = review.getResolvedFile()
await save(resolved?.contents)

// Escape hatch for any upstream API not wrapped by stream-diffs.
const nativeFileDiff = review.getNativeInstance()
```

### Merge conflicts

```ts
const merge = createDiffSurface({
  kind: 'merge-conflict',
  file: { name: 'src/app.ts', contents: conflictedSource },
  options: {
    mergeConflictActionsType: 'default',
    onMergeConflictResolve(file, payload) {
      save(file.contents, payload.resolution)
    },
  },
})

await merge.mount(container)
const resolvedFile = merge.resolveConflict(0, 'incoming')
```

`UnresolvedFile`, merge resolution, and token hooks are experimental in the current underlying Diffs release. `stream-diffs` exposes them without hiding that status.

## Vue

```vue
<script setup lang="ts">
import { StreamCode, StreamDiff, StreamMergeConflict } from 'stream-diffs/vue'
</script>

<template>
  <StreamCode :code="generated" language="typescript" :loading="streaming" />
  <StreamDiff
    :original="before"
    :modified="after"
    language="typescript"
    diff-style="split"
  />
  <StreamMergeConflict :code="conflictedSource" language="typescript" />
</template>
```

See [API reference](./docs/api.md), [performance and package size](./docs/performance.md), [markstream-vue integration](./docs/markstream-vue.md), and the [Chinese guide](./README.zh-CN.md).

Run the real-browser capability lab with `pnpm example`. It exercises unified/split review, annotations, token hover, selection, accept/reject, merge actions, and the streaming-to-file transition on one page.

Low-level synchronous Pierre utilities use a separate entry so the root package stays lazy:

```ts
import { parseDiffFromFile, parsePatchFiles } from 'stream-diffs/pierre'
```

## Design constraints

- Read-only and append-only while streaming.
- Delta append is faster than cumulative snapshots.
- Streaming uses `FileStream`; accurate diffs are generated from the final snapshot.
- Oversized streams continue in append-only plain text and can still finalize to an accurate File or Diff.
- No cursor editing, undo stack, Monaco text model, completion, LSP, or diagnostics runtime.
- `@pierre/diffs` is loaded on first mount, so importing `stream-diffs` remains SSR-safe.

## License

MIT
