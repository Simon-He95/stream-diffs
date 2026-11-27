---
title: Diffs and review
description: Render files, unified and split diffs, Git patches, annotations, token hover, selections, and accept or reject actions.
---

# Diffs and review

`createDiffSurface()` mounts one static review surface. It accepts complete files, pre-parsed diff metadata, Git patches, or a merge conflict file. All DOM and renderer code loads on `mount()`.

## Mount a diff

```ts
import { createDiffSurface } from 'stream-diffs'

const review = createDiffSurface({
  kind: 'diff',
  oldFile: { name: 'src/cart.ts', contents: before, lang: 'typescript' },
  newFile: { name: 'src/cart.ts', contents: after, lang: 'typescript' },
  options: {
    diffStyle: 'unified', // or 'split'
    diffIndicators: 'bars',
    lineDiffType: 'word-alt',
    enableLineSelection: true,
  },
})

await review.mount(container)
```

The `lang` field drives highlighting. A missing or unknown language falls back to plain text.

## Input kinds

| Kind | Shape | Use |
| --- | --- | --- |
| `file` | `{ file }` | A single static file. |
| `diff` | `{ oldFile, newFile }` | Two complete sources. The diff is computed for you. |
| `diff` | `{ fileDiff }` | Pre-parsed `FileDiffMetadata`. |
| `patch` | `{ patch, patchIndex?, fileIndex? }` | Raw Git patch, parsed lazily. |
| `merge-conflict` | `{ file }` | A file with Git conflict markers. |

Every input accepts `annotations`, `options`, and `workerManager`.

## Layout and highlight options

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `diffStyle` | `unified`, `split` | `split` | One column or side-by-side. |
| `diffIndicators` | `classic`, `bars`, `none` | `bars` | Gutter change markers. |
| `lineDiffType` | `word-alt`, `word-line`, `word`, `char`, `none` | `word-alt` | Intra-line highlighting. |
| `overflow` | `scroll`, `wrap` | `scroll` | Long line behavior. |
| `disableLineNumbers` | `boolean` | `false` | Hide the gutter. |
| `enableLineSelection` | `boolean` | `false` | Allow range selection. |
| `expandUnchanged` | `boolean` | `false` | Render collapsed context expanded. |
| `collapsedContextThreshold` | `number` | upstream default | Context lines kept around hunks. |
| `theme` | name or `{ dark, light }` | Diffs default | Shiki themes. |
| `themeType` | `system`, `dark`, `light` | `system` | Active theme side. |

`setOptions()` applies a new option object and rerenders. `setThemeType()` updates the live surface without ending an edit session. `setTheme()` rerenders with a new Shiki theme.

## Annotations

Annotations are attached to one side and one line:

```ts
type Comment = { author: string, body: string }

const review = createDiffSurface<Comment>({
  kind: 'diff',
  oldFile,
  newFile,
  annotations: [{
    side: 'additions',
    lineNumber: 14,
    metadata: { author: 'Mina', body: 'Validate this input before the request.' },
  }],
  options: {
    renderAnnotation(annotation) {
      const node = document.createElement('article')
      node.className = 'review-comment'
      node.textContent = `${annotation.metadata.author}: ${annotation.metadata.body}`
      return node
    },
  },
})
```

`renderAnnotation` must return an element for the annotation to be visible. Use `surface.setAnnotations(next)` to update comments without recreating the controller.

Annotations on deleted lines use `side: 'deletions'`. A line number of `0` renders a file-level annotation above the first row.

## Token hover

```ts
const file = createDiffSurface({
  kind: 'file',
  file: { name: 'styles.css', contents: css, lang: 'css' },
  options: {
    onTokenEnter({ tokenText, lineNumber, tokenElement }) {
      console.log(tokenText, lineNumber, tokenElement)
    },
    onTokenLeave() {},
  },
})
```

When token callbacks are present, `stream-diffs` enables the upstream token transformer so `data-char` metadata and enter/leave events are available. Token hooks add DOM metadata and should only be enabled when the feature needs them.

## Selection

```ts
const review = createDiffSurface({
  kind: 'diff',
  oldFile,
  newFile,
  options: {
    enableLineSelection: true,
    onLineSelected(range) {
      console.log(range?.side, range?.start, range?.end)
    },
  },
})

review.setSelectedLines({ start: 8, end: 12, side: 'additions' })
review.setSelectedLines(null)
```

`setSelectedLines()` also accepts upstream `SelectionWriteOptions` as the second argument. Use it when your host needs a controlled selection, such as linking a comment composer to a range.

## Accept or reject

```ts
review.acceptReject(0, 'accept')
review.acceptReject(1, 'reject')
review.acceptReject(2, { type: 'accept', changeIndex: 0 })
```

Each call returns the next `FileDiffMetadata` and rerenders the surface. A complete diff can then produce a resolved file:

```ts
const resolved = review.getResolvedFile()
if (resolved)
  await saveFile(resolved.contents)
```

`getResolvedFile()` returns `undefined` for a partial patch. Accept and reject operate on metadata. Persisting the file is the host's job.

## Custom header

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

`disableFileHeader: true` hides the default header if you want to own the entire frame.

## Git patches

```ts
const patchView = createDiffSurface({
  kind: 'patch',
  patch: unifiedPatch,
  fileIndex: 0,
  options: { diffStyle: 'unified' },
})

await patchView.mount(container)
```

For multi-commit patches, pass both `patchIndex` and `fileIndex`. `parsePatchOptions` is forwarded to upstream `parsePatchFiles()`:

```ts
parsePatchOptions: {
  cacheKeyPrefix: 'review:42',
  throwOnError: true,
  disableLineMatching: false,
}
```

Patches are parsed lazily inside `mount()`. The root package does not eagerly import the Pierre parser.

## Ready and render events

```ts
review.onDidRender(() => {
  console.log('frame committed')
})

await review.whenVisualReady()
```

`whenVisualReady()` waits for the latest post-render commit, including a render that replaced the one originally awaited. It resolves `false` if the surface is disposed first. A typical Markdown adapter keeps its `<pre>` visible until this resolves.

## Update in place

```ts
await review.updateDiff(nextBefore, nextAfter, nextAnnotations)
await review.updateFile(nextFile)
await review.updatePatch(nextPatch, 0)
```

`update()` replaces the native instance and ends an active edit session. `setThemeType()` and `setAnnotations()` keep the session alive. `setOptions()`, `setTheme()`, `acceptReject()`, and `update()` do not.

## Escape hatch

The controller wraps the common review flow. For anything else:

```ts
const native = review.getNativeInstance()
```

This is a real upstream `File`, `FileDiff`, or `UnresolvedFile`. See the [API reference](/api) for the complete wrapped surface.

## Continue

- [Merge conflicts](./merge-conflicts)
- [Inline editing](./editing)
- [Playground](/playground)
