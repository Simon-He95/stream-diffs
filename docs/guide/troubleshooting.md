---
title: Troubleshooting
description: Fix common rendering, highlighting, editing, worker, CSP, and SSR issues with stream-diffs.
---

# Troubleshooting

## The surface is empty

Check the order:

1. `createCodeStream()` or `createDiffSurface()` created the controller.
2. `await mount(container)` ran in the browser.
3. The container existed at mount time.
4. The controller was not disposed.

```ts
const host = document.querySelector<HTMLElement>('#output')
if (!host)
  throw new Error('Missing #output')

await output.mount(host)
```

`mount()` replaces the container's children with a `.stream-diffs-shell`.

## The code is plain text while streaming

That is the current design. The stream stays in one plain `<pre>` while deltas arrive. Syntax highlighting starts at `finalize()`. Final diffs are always computed from complete text.

If you need a highlighted view immediately, render a static file or diff surface after the content is complete.

## Highlighting takes a moment after finalize

The final surface loads Shiki themes and grammars on demand. Warm the highlighter before the first visible block:

```ts
import { preloadHighlighter } from 'stream-diffs/pierre'

await preloadHighlighter({
  themes: ['github-dark', 'github-light'],
  langs: ['typescript', 'tsx'],
})
```

Keep your Markdown fallback visible until `whenVisualReady()` resolves.

## `startEditing()` throws

| Message | Cause | Fix |
| --- | --- | --- |
| `Mount the surface before starting an edit session` | `startEditing()` ran before `mount()` | Await `mount()` first. |
| `Only file and diff surfaces are editable` | Input is not a complete file or diff | Use a file or complete diff. |
| `Merge-conflict surfaces are not editable` | Input is `kind: 'merge-conflict'` | Resolve conflicts, then edit the result. |
| `The editor did not attach to the surface in time` | Renderer never reached a ready frame | Check console errors, worker setup, and whether the surface is hidden by `display: none`. |
| `The surface was replaced before the editor attached` | `update()` or `setOptions()` ran during startup | Wait for `startEditing()` before replacing the surface. |

For partial patches, make sure `options.loadDiffFiles` can provide both sides.

## The edit session disappears

These calls replace the native instance and end the session:

- `update()`
- `setOptions()`
- `setTheme()`
- `acceptReject()`
- `dispose()`

`setThemeType()` and `setAnnotations()` keep the session alive.

Capture the draft before any replacing call, then re-attach after the new render.

## `append()` throws after finalize

A stream is one-way after finalization. Use `reset()`:

```ts
await output.reset()
output.append(nextDelta)
```

Or create a new controller for each message.

## Worker pool warning

The warning means a `WorkerPoolManager` came from a different `@pierre/diffs` copy. The pool is ignored and highlighting falls back to the main thread.

Keep one Diffs version in the dependency graph. If your app uses `pnpm`, run `pnpm why @pierre/diffs` and align the versions. The worker file must also be built from the same package.

## CSP blocks the highlighter

`preferredHighlighter: 'auto'` tries the WASM backend first and falls back to `shiki-js` when the platform cannot run it. If your CSP blocks WASM, pin the JS backend:

```ts
const surface = createDiffSurface({
  kind: 'diff',
  oldFile,
  newFile,
  options: { preferredHighlighter: 'shiki-js' },
})
```

WASM may require `wasm-unsafe-eval` in `script-src`. Choose the backend explicitly when your policy is strict.

## Long lines are truncated

Upstream cuts lines longer than `tokenizeMaxLineLength` (default `1000`) and renders a "Show full line" control. Options:

```ts
options: {
  tokenizeMaxLineLength: 0, // disable the cut and the length limit
}
```

Or reveal one line:

```ts
surface.expandLine({ additionLineNumber: 12 })
```

The exact `LineExpansion` shape is exported from `stream-diffs/pierre`.

## Annotations do not appear

`renderAnnotation` must return an element:

```ts
options: {
  renderAnnotation(annotation) {
    const node = document.createElement('div')
    node.textContent = annotation.metadata.body
    return node
  },
}
```

Also check the side and line number. An annotation on `additions` will not attach to a deleted line.

## Token hover does nothing

Provide both callbacks:

```ts
options: {
  onTokenEnter(props) {
    show(props.tokenText, props.lineNumber)
  },
  onTokenLeave() {
    hide()
  },
}
```

Token callbacks enable the upstream token transformer automatically. Enabling hooks on large surfaces adds DOM metadata, so use them only where the interaction exists.

## Vue component stays plain text

`StreamCode` and `StreamDiff` finalize only when:

- `loading` is `false`
- the component is actually visible

If the block is inside a collapsed panel, the `IntersectionObserver` has not fired. Open the panel or use the imperative controller if you need a different visibility rule.

## markstream keeps its fallback

The fallback remains until the block is complete and visible. Check:

- `loading` is `false`
- the block is inside the viewport
- `whenVisualReady()` did not resolve `false`
- no render error is logged
- both packages resolve the same `@pierre/diffs` copy

## Styles look wrong

The rendered surface lives in a Shadow DOM container. Host CSS cannot select internal rows and gutters. Style the wrapper for layout, and use the upstream CSS variables or theme options for the surface itself.

If you use a custom theme, pass it through `theme` rather than overriding internal classes.

## Highlighting is fine but the layout jumps

Reserve height for the host:

```css
.code-host {
  min-height: 320px;
}
```

Keep a fallback with the same height while the final surface loads, and swap only after `whenVisualReady()`.

## SSR error: `window is not defined`

Importing is safe. Calling `mount()` is not. Move controller creation that touches the DOM into `onMounted`, `useEffect`, or an equivalent client hook. Also avoid `new IntersectionObserver` during module evaluation.

## Still stuck

- Open the [playground](/playground) and compare the behavior.
- Check the [API reference](/api) for the exact method names.
- Search [GitHub issues](https://github.com/Simon-He95/stream-diffs/issues).
- Open a new issue with a minimal reproduction, the package version, and the browser.
