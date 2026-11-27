---
title: markstream-vue integration
description: Use stream-diffs as the optional code renderer inside markstream-vue without changing CodeBlockNode usage.
---

# markstream-vue integration

`markstream-vue` can use `stream-diffs` as its enhanced code renderer. Existing `CodeBlockNode` usage does not change: install both packages and markstream prefers the lightweight renderer.

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

## Resolution order

The markstream CodeBlock loader tries:

1. `import('stream-diffs')`
2. `import('stream-monaco')`
3. the built-in `<pre>` fallback

Both enhanced runtimes stay optional. When both are installed, `stream-diffs` wins. Remove it if you explicitly want `stream-monaco`.

The root `stream-diffs` entry and `stream-diffs/markstream` both export `useMonaco`, `detectLanguage`, and `preloadMonacoWorkers`. Those names keep the existing adapter contract; they do not load Monaco.

## Runtime mapping

| markstream operation | stream-diffs behavior |
| --- | --- |
| streaming or offscreen block | markstream-owned `<pre>`; no runtime mounted |
| completed visible single file | one static interactive `File` |
| completed visible side-by-side diff | one static split `FileDiff` |
| completed visible inline diff | one static unified `FileDiff` |
| complete Git conflict markers | `UnresolvedFile` |
| theme update | `setThemeType` or a rerender with the requested Shiki theme |
| cleanup | dispose the current Diffs instance and cancel pending readiness |

While `loading` is true, markstream keeps its own `<pre>`. When the block is complete and visible, markstream creates one static Fast surface in a hidden staging layer, waits for `whenVisualReady()`, then swaps the layers in one component update. A stale creation cannot replace the fallback after unmount, collapse, or a code-block identity change.

## Advanced options

Diffs options pass through `code-block-props.monacoOptions`. The property keeps its historical name for compatibility.

```vue
<MarkdownRender
  :content="markdown"
  :loading="streaming"
  :code-block-props="{
    monacoOptions: {
      diffStyle: 'split',
      diffIndicators: 'bars',
      lineDiffType: 'word-alt',
      enableLineSelection: true,
      lineHoverHighlight: 'both',
      onLineSelected(range) {},
      onTokenEnter(token, event) {},
      onTokenLeave(token, event) {},
      lineAnnotations: comments,
      renderAnnotation(annotation) {},
      renderCustomHeader(fileOrDiff) {},
      mergeConflictActionsType: 'default',
      onMergeConflictResolve(file, payload) {},
      onController(controller) {},
    },
  }"
/>
```

The compatibility runtime removes only markstream and Monaco host fields such as `MAX_HEIGHT`, `wordWrap`, and `renderSideBySide`. Every other option is forwarded to Pierre. This avoids a fixed allowlist that would silently drop newer native options.

## Imperative actions

Use `onController` to keep the surface for review actions:

```ts
let controller

const options = {
  onController(value) {
    controller = value
  },
}

controller.setSelectedLines({ start: 10, end: 16, side: 'additions' })
controller.acceptReject(0, 'accept')
controller.resolveConflict(0, 'both')
controller.startEditing({ onChange: saveDraft }, 'markdown-review')
```

For editing, wait until the block has finalized:

```ts
const surface = controller?.getFinalizedSurface?.() ?? controller
await surface?.startEditing({ onChange: saveDraft }, 'block-42')
```

`StreamCode` and `markstream` share the same underlying final surface controller, so editing, reveal, expansion, and scroll helpers are available after finalization.

## Behavioral notes

- The hot path stays in markstream's `<pre>` while tokens stream. Line selection and token hooks appear on the final File or FileDiff.
- Final diffs are recomputed from complete original and modified contents. The library does not claim token-level incremental diff correctness.
- `mergeConflict: false` disables automatic conflict marker detection.
- `stream: false` forces the static file surface.
- If `stream-diffs` is removed, markstream falls back to `stream-monaco` when installed, then the plain `<pre>`.
- The final surface is created after the block is complete and visible. Offscreen blocks do not pay for highlighting.

## Performance

The markstream-vue playground includes a repeatable browser benchmark at `/code-renderer-benchmark`. On the recorded Chrome run, stream-diffs reached a visible code surface 92% sooner than stream-monaco and used 92% fewer renderer DOM nodes at rest.

The numbers, methodology, and reproduction commands are in [Performance and package size](./performance.md#browser-streaming-benchmark).

## Exposed compatibility API

`stream-diffs` exports these names for markstream hosts:

- `useMonaco(options)`
- `detectLanguage(fileName)`
- `preloadMonacoWorkers()`

The runtime also returns `getSurface()`, which exposes the finalized controller. Treat these as compatibility APIs. They are supported because adapters depend on them, not because `stream-diffs` is a Monaco runtime.

## Continue

- [Vue components](./guide/vue)
- [Inline editing](./guide/editing)
- [Performance](./performance.md)
