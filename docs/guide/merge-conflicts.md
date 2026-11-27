---
title: Merge conflicts
description: Render Git conflict markers and resolve current, incoming, or both with the same surface controller.
---

# Merge conflicts

A merge conflict is a file with Git markers. Pass it as `kind: 'merge-conflict'` and the surface renders conflict rows plus resolution actions.

## Mount

```ts
import { createDiffSurface } from 'stream-diffs'

const merge = createDiffSurface({
  kind: 'merge-conflict',
  file: {
    name: 'src/config/runtime.ts',
    contents: conflictedSource,
    lang: 'typescript',
  },
  options: {
    mergeConflictActionsType: 'default',
    expandUnchanged: true,
    onMergeConflictResolve(file, payload) {
      console.log(payload.resolution, payload.conflict)
      queueSave(file.contents)
    },
  },
})

await merge.mount(container)
```

`mergeConflictActionsType: 'default'` renders the built-in current, incoming, and both controls. If your host renders its own toolbar, disable or replace that UI and call `resolveConflict()` directly.

## Resolve from code

```ts
const resolved = merge.resolveConflict(0, 'incoming')
if (resolved)
  await save(resolved.contents)
```

Resolutions are `'current'`, `'incoming'`, or `'both'`. The controller updates its input file and diff metadata after a successful resolution, so `getInput()` reflects the new contents. The rendered surface is rerendered in place.

Conflict indexes refer to the current file. If you resolve in order, `0` is always the next conflict. If you resolve out of order, recompute indexes from the latest input.

## Read the result

```ts
const input = merge.getInput()
if (input.kind === 'merge-conflict')
  console.log(input.file.contents)

const native = merge.getNativeInstance()
```

`getResolvedFile()` is intended for diff and patch surfaces. For a merge conflict, use the return value of `resolveConflict()` or read the current file from `getInput()`. `getNativeInstance()` exposes the upstream `UnresolvedFile` for APIs not wrapped by the controller.

## Using the built-in actions

The default action UI calls the same resolver. Hosts that want to persist the result can use either callback style:

```ts
const merge = createDiffSurface({
  kind: 'merge-conflict',
  file,
  options: {
    mergeConflictActionsType: 'default',
    onMergeConflictResolve(file, payload) {
      persist({ contents: file.contents, resolution: payload.resolution })
    },
  },
})
```

If the callback is missing, the surface still resolves visually. Persisting is always the host's responsibility. Programmatic `resolveConflict()` calls also notify `onMergeConflictResolve` when the option is configured.

## Try it

The playground runs this exact flow. Edit the conflict file, then resolve current, incoming, or both.

<div class="sd-doc-demo">
  <MergeLab />
</div>

## Behavioral notes

- Conflict files are not editable through `startEditing()`. Resolve conflicts first, then edit the resulting file surface.
- Annotations can be attached to a merge-conflict surface, but line numbers refer to the unresolved file as rendered.
- `theme`, `themeType`, `overflow`, and other file options pass through.
- `whenVisualReady()` works the same as other surfaces, which makes it safe to swap a Markdown fallback only after the conflict UI is painted.

## Continue

- [Inline editing](./editing)
- [Diffs and review](./diffs)
- [API reference](/api)
