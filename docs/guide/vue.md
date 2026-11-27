---
title: Vue
description: StreamCode, StreamDiff, and StreamMergeConflict wrappers for Vue 3, with controller access and visibility-aware finalization.
---

# Vue

The optional `stream-diffs/vue` entry provides three Vue 3 components. They are thin wrappers around the same imperative controllers.

```bash
pnpm add stream-diffs vue
```

```vue
<script setup lang="ts">
import { StreamCode, StreamDiff, StreamMergeConflict } from 'stream-diffs/vue'
</script>
```

`vue` is an optional peer dependency. The root entry stays framework-free.

## StreamCode

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { StreamCode } from 'stream-diffs/vue'

const code = ref('')
const streaming = ref(true)

async function readAnswer() {
  for await (const delta of source)
    code.value += delta
  streaming.value = false
}
</script>

<template>
  <StreamCode
    :code="code"
    file-name="answer.ts"
    language="typescript"
    :loading="streaming"
    :max-height="520"
    :options="{ autoScroll: 'near-bottom' }"
  />
</template>
```

While `loading` is true, the component streams plain text. When `loading` becomes false and the component is visible, it finalizes to an interactive `File` surface.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `code` | `string` | required | Cumulative source. Prefix updates append; other updates reset. |
| `language` | `string` | `text` | Shiki language. |
| `fileName` | `string` | derived | Header and final file name. |
| `loading` | `boolean` | `false` | Set to false when the answer is complete. |
| `lineNumbers` | `boolean` | `true` | Line numbers in the final file. |
| `wrap` | `boolean` | `false` | Wrap long lines. |
| `maxHeight` | `number \| string` | none | Shell max height. |
| `theme` | `string \| object` | Diffs default | Shiki theme or theme pair. |
| `options` | `CodeStreamOptions` | `{}` | Extra stream options. |
| `fileOptions` | `FileOptions` | `{}` | Options for the final file. |
| `annotations` | `LineAnnotation[]` | `[]` | Final file annotations. |
| `workerManager` | `WorkerPoolManager` | none | Optional upstream pool. |

The component only finalizes when it is actually visible. An `IntersectionObserver` avoids paying for highlighting on offscreen chat messages.

## StreamDiff

```vue
<script setup lang="ts">
import { StreamDiff } from 'stream-diffs/vue'

const before = 'export const answer = 0\n'
const after = 'export const answer = 42\n'
</script>

<template>
  <StreamDiff
    :original="before"
    :modified="after"
    file-name="answer.ts"
    language="typescript"
    diff-style="split"
    :loading="false"
    :annotations="comments"
    :options="{ diffIndicators: 'bars', lineDiffType: 'word-alt', enableLineSelection: true }"
  />
</template>
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `original` | `string` | required | Before source. |
| `modified` | `string` | required | After source. |
| `language` | `string` | `text` | Shiki language. |
| `fileName` | `string` | `file.txt` | Header name. |
| `loading` | `boolean` | `false` | Finalize to a real diff when false and visible. |
| `diffStyle` | `unified \| split` | `unified` | Layout. |
| `options` | `DiffStreamOptions` | `{}` | Extra diff options. |
| `annotations` | `DiffLineAnnotation[]` | `[]` | Diff annotations. |
| `workerManager` | `WorkerPoolManager` | none | Optional upstream pool. |

While `loading` is true, the component shows a low-cost text preview. At finalization it swaps to a real diff and returns the `DiffSurfaceController` from the internal stream.

## StreamMergeConflict

```vue
<template>
  <StreamMergeConflict
    :code="conflictedSource"
    file-name="src/config.ts"
    language="typescript"
    :options="{ mergeConflictActionsType: 'default' }"
  />
</template>
```

| Prop | Type | Default |
| --- | --- | --- |
| `code` | `string` | required |
| `language` | `string` | `text` |
| `fileName` | `string` | `file.txt` |
| `options` | `UnresolvedFileOptions` | `{}` |
| `annotations` | `DiffLineAnnotation[]` | `[]` |
| `workerManager` | `WorkerPoolManager` | none |

This component mounts a `merge-conflict` surface immediately and updates when its props change.

## Controller access

Every component exposes `getController()` through its ref:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { StreamDiff } from 'stream-diffs/vue'

const diff = ref<InstanceType<typeof StreamDiff>>()

async function acceptFirstHunk() {
  const controller = diff.value?.getController()
  controller?.acceptReject(0, 'accept')
}

async function edit() {
  const surface = diff.value?.getController()?.getFinalizedSurface()
  await surface?.startEditing({
    onChange: event => saveDraft(event.file.contents),
  }, 'review-draft')
}
</script>

<template>
  <StreamDiff ref="diff" :original="before" :modified="after" />
</template>
```

`StreamCode` exposes a `CodeStreamController`; `StreamDiff` exposes a `DiffStreamController`; `StreamMergeConflict` exposes a `DiffSurfaceController`.

## Finalize and visibility

The components are built for chat transcripts:

- Plain text or a cheap preview is visible immediately.
- Expensive highlighting waits for `loading === false` and actual visibility.
- A stale finalization cannot replace a newer block after unmount or content identity changes.
- The renderer is disposed on unmount.

If you need full control over finalization timing, use the imperative controllers instead.

## Styling

The components render a plain wrapper element:

- `.stream-diffs-vue-code`
- `.stream-diffs-vue-diff`
- `.stream-diffs-vue-merge-conflict`

The code surface itself lives in a Shadow DOM container. Host CSS should target the wrapper for layout, spacing, and borders, not internals.

## SSR

Importing the components on the server is safe. Rendering starts in `onMounted`, so no DOM or renderer work runs during SSR. Hydration shows the wrapper first, then the stream.

## Continue

- [markstream-vue integration](../markstream-vue)
- [Inline editing](./editing)
- [Streaming code](./streaming)
