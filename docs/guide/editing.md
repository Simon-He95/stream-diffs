---
title: Inline editing
description: Start a lazily loaded editor on a rendered file or diff, keep drafts, apply edits, and control the session lifecycle.
---

# Inline editing

Surfaces are read-only by default. `startEditing()` attaches the upstream `@pierre/diffs` editor to the existing render, with undo, redo, selections, and a real document. The editor chunk is imported only when a host starts a session.

## Start a session

```ts
import { createDiffSurface } from 'stream-diffs'

const surface = createDiffSurface({
  kind: 'diff',
  oldFile: { name: 'src/cart.ts', contents: before, lang: 'typescript' },
  newFile: { name: 'src/cart.ts', contents: after, lang: 'typescript' },
  options: {
    diffStyle: 'split',
    useTokenTransformer: true,
  },
})

await surface.mount(container)

const editor = await surface.startEditing({
  onChange(event) {
    // document changed; rows may not be painted yet
    markDraftDirty(event.file)
  },
  onComplete(event) {
    return event.file.contents === savedSource ? 'reject' : 'accept'
  },
}, 'cart-review-draft')
```

`startEditing()` waits for `prepareForEditing()` and the editor's first render sync. When it resolves, `getEditingText()` and `applyEdits()` are immediately usable.

The second argument is an `editStateKey`. A draft and its undo and redo history are kept in memory, so opening the same key again resumes the session.

## What happens on mount

- File surfaces attach immediately.
- Complete diffs attach immediately.
- Patches become editable only when `loadDiffFiles` can supply both complete sides.
- Merge-conflict surfaces throw. Resolve conflicts first.
- An in-flight worker highlight is awaited before the editor attaches.

`startEditing()` throws when the surface is disposed, not mounted, or not editable.

## Editing a streamed answer

```ts
await output.finalize({ view: 'file', useTokenTransformer: true })

const surface = output.getFinalizedSurface()
if (surface) {
  const editor = await surface.startEditing({
    onChange: event => preview(event.file.contents),
  }, `answer:${messageId}`)
}
```

Use `useTokenTransformer: true` when you know a surface will be edited. Without it, upstream re-highlights and rerenders the file when the session starts.

## Change and completion callbacks

`onChange` fires synchronously for every document change: typing, paste, undo, redo, and `applyEdits()`. It reports the document, not the painted rows.

Do not call editor methods from inside `onChange`. This includes `applyEdits`, `undo`, `redo`, `edit`, `cleanUp`, and component `render()`. Defer with `queueMicrotask()` if you need to react programmatically.

`onComplete` runs when the session ends. Return `'accept'` to install the completed value or `'reject'` to restore the original. For a diff, the event includes `fileDiff`, `oldFile`, and `newFile`.

`getEditingText()` returns the editor's current text. For a diff, this is the resulting file document.

## End a session

```ts
surface.stopEditing('complete') // keep the edited document
surface.stopEditing('discard')  // revert to the last render input
```

The controller also ends a session when any call replaces the native instance:

- `update()`
- `setOptions()`
- `setTheme()`
- `acceptReject()`
- `dispose()`

`setThemeType()` and `setAnnotations()` update the live instance and keep the session.

If your host needs to change layout or options mid-session, capture the draft first, end the session, apply the new options, and re-attach.

## Edit programmatically

```ts
surface.applyEdits([{
  range: {
    start: { line: 13, character: 0 },
    end: { line: 13, character: 0 },
  },
  newText: '  validate(input)\n',
}])

surface.undo()
surface.redo()
```

Positions are zero-based lines and UTF-16 character offsets. Pass `false` as the second argument to `applyEdits()` when you do not want the change in undo history.

## Focus, selection, and view state

```ts
surface.focusEditor({ lineNumber: 14 })
surface.setEditorActiveLine(14, { side: 'additions' })
surface.setEditorSelections([
  {
    start: { line: 14, character: 2 },
    end: { line: 14, character: 18 },
    direction: 'none',
  },
])

const view = surface.getEditorViewState()
if (view)
  surface.setEditorViewState(view)
```

`revealLine()` expands collapsed context when needed, and `expandHunk()` or `expandLine()` exposes content before a scroll or edit target.

## Inspect the session

```ts
surface.isEditing()
surface.isReadyToEdit()
surface.canUndo()
surface.canRedo()
surface.getEditor()
surface.getEditingFile()
```

`getEditor()` returns the upstream editor. Treat the wrappers as the stable API and use the raw editor only for features not covered by the controller.

## Vue and framework hosts

The Vue wrapper exposes the controller from the component ref:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { StreamDiff } from 'stream-diffs/vue'

const diff = ref()
let surface

async function edit() {
  surface = diff.value?.getController()?.getFinalizedSurface()
  if (surface)
    await surface.startEditing({ onChange: saveDraft }, 'draft-key')
}
</script>

<template>
  <StreamDiff ref="diff" :original="before" :modified="after" />
</template>
```

Framework components should call `dispose()` on unmount. The controller owns cleanup of the editor and the native instance.

## Constraints

- No LSP, diagnostics, completion, or project model.
- The editor is scoped to one rendered file or diff.
- Replacing the surface ends the session.
- Drafts live in memory. Persist the file if it must survive a reload.
- Merge conflicts are not editable.

## Continue

- [Diffs and review](./diffs)
- [Vue](./vue)
- [Playground](/playground)
