# Capability lab

A standalone Vite page that exercises the public controller surface in a real browser.

```bash
pnpm install
pnpm example
```

Open the printed localhost URL. The page imports the source entry directly, so package changes show up on reload.

## What it covers

- Unified diff with annotations, token hover, custom header, accept and reject.
- Split diff with controlled line selection.
- Merge conflict resolution for current, incoming, and both.
- Plain-text streaming that finalizes into an accurate split diff.
- Inline editing on the rendered unified diff, with undo and redo.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and controls. |
| `demo.ts` | Controllers, callbacks, and interactive wiring. |
| `vanilla.ts` | Minimal streaming to diff example. |

For the docs playground, run `pnpm docs:dev` and open `/stream-diffs/playground`.
