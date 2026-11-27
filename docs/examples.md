---
title: Examples
description: Copyable examples for streaming AI code, review diffs, merge conflicts, inline editing, Vue, and markstream-vue.
---

# Examples

Every card below is a working scenario in the playground, backed by the public controller API. Pick one, edit the source, and inspect the result.

<div class="sd-example-grid">
  <a class="sd-example-card" href="playground.html?sample=invoice">
    <strong>Guarded API call</strong>
    <span>Add input validation and a typed error path, then accept or reject the hunk.</span>
    <code>playground?sample=invoice</code>
  </a>
  <a class="sd-example-card" href="playground.html?sample=hook">
    <strong>React data hook</strong>
    <span>Show cancellation, loading state, and a cleanup path in a word-level diff.</span>
    <code>playground?sample=hook</code>
  </a>
  <a class="sd-example-card" href="playground.html?sample=pagination">
    <strong>Cursor pagination</strong>
    <span>Replace page offsets with a cursor, including a guard against repeated cursors.</span>
    <code>playground?sample=pagination</code>
  </a>
  <a class="sd-example-card" href="playground.html?sample=css">
    <strong>Focus and motion</strong>
    <span>A small CSS review with focus-visible styles and a reduced-motion branch.</span>
    <code>playground?sample=css</code>
  </a>
  <a class="sd-example-card" href="playground.html?sample=flags">
    <strong>New file</strong>
    <span>An empty before side rendered as a complete addition with annotations.</span>
    <code>playground?sample=flags</code>
  </a>
  <a class="sd-example-card" href="playground.html?sample=prose">
    <strong>Docs rewrite</strong>
    <span>Prose changes show word-level additions without losing line context.</span>
    <code>playground?sample=prose</code>
  </a>
</div>

## Review and edit

<div class="sd-example-grid">
  <a class="sd-example-card" href="playground.html#merge-conflicts">
    <strong>Merge conflict</strong>
    <span>Resolve current, incoming, or both in a rendered conflict file.</span>
    <code>merge-conflict</code>
  </a>
  <a class="sd-example-card" href="playground.html">
    <strong>Inline editing</strong>
    <span>Call startEditing on the rendered diff, type, undo, then regenerate the diff.</span>
    <code>surface.startEditing()</code>
  </a>
  <a class="sd-example-card" href="playground.html#streaming-lab">
    <strong>Stream then finalize</strong>
    <span>Watch plain text stream, then switch to an interactive file or diff.</span>
    <code>finalize({ view: 'diff' })</code>
  </a>
  <a class="sd-example-card" href="markstream-vue.html">
    <strong>markstream-vue</strong>
    <span>Keep the existing MarkdownRender and CodeBlockNode contract.</span>
    <code>MarkdownRender</code>
  </a>
</div>

## Run the local lab

The repository ships a standalone Vite lab that exercises every surface on one page.

```bash
pnpm install
pnpm example
```

The page lives in `examples/` and imports the source entry directly, so changes to the controller show up on reload.

```ts
import { createCodeStream, createDiffSurface } from 'stream-diffs'

const stream = createCodeStream({ fileName: 'answer.ts', language: 'typescript' })
await stream.mount(document.querySelector('#output')!)
stream.append('export const answer = 42\n')
await stream.finalize({ view: 'diff', original: 'export const answer = 0\n' })
```

## Build your own preset

1. Start from a `FileContents` pair: `{ name, contents, lang }`.
2. Mount `createDiffSurface({ kind: 'diff', oldFile, newFile })`.
3. Add annotations, token hooks, or line selection only when the review flow needs them.
4. For streamed content, keep the host `<pre>` mounted until finalization, then mount one final surface.

<div class="sd-facts">
  <div class="sd-fact"><strong>6</strong><span>diff presets in the playground</span></div>
  <div class="sd-fact"><strong>13</strong><span>languages available in the language picker</span></div>
  <div class="sd-fact"><strong>3</strong><span>review surfaces: file, diff, merge conflict</span></div>
</div>

Need the full option list? Start with the [API reference](/api), then check [diffs and review](/guide/diffs) and [streaming code](/guide/streaming).
