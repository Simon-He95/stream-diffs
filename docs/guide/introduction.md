---
title: Introduction
description: A stream-native code and diff renderer for AI output, built on @pierre/diffs and Shiki.
---

# Introduction

`stream-diffs` renders code that is still arriving. It starts with append-only text, then upgrades the completed block into a syntax-highlighted file or an accurate diff. Review actions, annotations, and inline editing are available after that upgrade.

The package is a controller layer, not an editor product. It owns the stream lifecycle and delegates rendering to [`@pierre/diffs`](https://diffs.com) and Shiki. No Monaco model or worker is created.

<div class="sd-doc-demo">
  <HeroDemo />
</div>

## Why this exists

AI responses arrive token by token. Traditional code editors assume a complete document, a worker pool, and a language service. That is a poor fit for a chat transcript:

- A diff cannot be accurate until both sides are complete.
- Re-running a full editor render on every delta is wasteful.
- A 40-line code answer does not justify an editor runtime.
- Users still expect selection, comments, word-level highlights, and copy.

`stream-diffs` separates those concerns:

1. **Stream** deltas into one plain `<pre>`, with batching and viewport follow.
2. **Finalize** the complete snapshot into one static File or FileDiff.
3. **Interact** with that surface: select lines, annotate, accept a hunk, or start an editing session.

## What you get

- Append-only streaming with optional overflow fallback.
- Unified and split diffs with word-level highlights.
- File, diff, patch, and merge-conflict inputs.
- Line annotations, token hooks, controlled selection, custom headers.
- Accept and reject transformations plus a resolved file.
- Opt-in editing that loads the upstream editor chunk lazily.
- Vue wrappers and a compatibility entry for `markstream-vue`.
- SSR-safe imports: the renderer loads on first `mount()`.

## What it is not

- Not a full editor shell or IDE. There is no LSP, diagnostics, or project model.
- Not an incremental diff engine. Diffs are computed from the final snapshot.
- Not a Markdown parser. It renders code blocks and diffs; your host owns Markdown.
- Not a Monaco drop-in. If you need a full editor on every message, use an editor.

## Install

```bash
pnpm add stream-diffs
```

With Vue components:

```bash
pnpm add stream-diffs vue
```

`vue` is an optional peer dependency. The root entry has no framework dependency.

## The shortest useful example

```ts
import { createCodeStream } from 'stream-diffs'

const output = createCodeStream({
  fileName: 'answer.ts',
  language: 'typescript',
  maxHeight: 480,
})

await output.mount(document.querySelector('#output')!)

for await (const delta of modelStream)
  output.append(delta)

await output.finalize({
  view: 'diff',
  original: previousSource,
  diffStyle: 'split',
})
```

## Where to go next

- [Quickstart](./getting-started) for a complete first render.
- [Playground](/playground) to edit sources and use the review surface.
- [Streaming code](./streaming) for batching, limits, and lifecycle.
- [Diffs and review](./diffs) for annotations, selection, and accept or reject.
- [Inline editing](./editing) for `startEditing()` and draft sessions.
