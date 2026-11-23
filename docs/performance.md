# Performance and package size

## First-party runtime budget

`pnpm size:check` gzip-measures every emitted first-party `.mjs` file and fails when an entry exceeds its budget:

| Output | Current approximate gzip | Gate |
| --- | ---: | ---: |
| root API entry | 0.23 kB | 0.26 kB |
| markstream compatibility entry | 4.97 kB | 5.0 kB |
| shared stream/surface controller | 8.09 kB | 8.4 kB |
| Vue entry | 1.51 kB | 1.52 kB |
| synchronous Pierre utility entry | 0.29 kB | 0.3 kB |
| all first-party runtime outputs | 15.1 kB | 15.4 kB |

These numbers exclude `@pierre/diffs`, Shiki grammars, themes, and an optional worker because those are upstream/runtime-selected dependencies. The root entry contains no eager static import of `@pierre/diffs`; renderer code loads on the first `mount()`.

Application bundles still depend on selected languages, themes, highlighter engine, and bundler chunking. Measure the actual host build rather than treating this table as total application transfer size.

`@pierre/diffs@1.7.1` declares `react` and `react-dom` as optional peers even when an application only imports its Vanilla entry. Some package managers may still install them. `stream-diffs` never imports the Pierre React entry, but it cannot remove an upstream package manifest requirement; installation size and browser runtime size should be evaluated separately. The editor lifecycle, navigation, and runtime-surface wrappers add ~1.6 kB gzip to the shared controller; the editor implementation itself stays in a lazily imported `@pierre/diffs/edit` chunk and is not part of the size gate.

## Streaming path

- Deltas append to a chunk accumulator rather than repeatedly concatenating the complete source.
- High-frequency deltas are coalesced by RAF or a configured interval.
- Writes are serialized through one promise chain.
- A trailing high surrogate is held until the matching chunk arrives.
- The viewport follows only when it is already near the bottom.
- At 10,000 lines or 1,000,000 characters by default, the growing highlighted DOM is aborted and streaming continues in append-only plain text.
- Final File/Diff rendering always uses the complete accumulated snapshot.

Run `pnpm benchmark` for the repeatable accumulator benchmarks covering 10,000 micro-deltas and 1 MiB of chunked text. Renderer correctness and batching remain in the normal test suite because DOM/highlighter timing varies substantially by browser and machine.

## Browser streaming benchmark

The markstream-vue playground contains a real-browser benchmark at `/code-renderer-benchmark`. It streams deterministic cumulative snapshots into independent `CodeBlockNode` instances and records first surface, enhanced-runtime readiness, fallback visibility, settle time, animation-frame latency, long tasks, DOM size, height decreases, and the height delta at finalization.

Run it from the markstream-vue repository:

```bash
pnpm test:e2e:code-renderer-streaming
```

The following medians were measured on Chrome 150.0.7871.115 at 1440×1000, with three repetitions. These are machine-specific measurements, not fixed guarantees.

| Scenario | Metric | stream-diffs | stream-monaco | Difference |
| --- | --- | ---: | ---: | ---: |
| cold, 1 thread / 140 lines | first enhanced ready | 199.5 ms | 921.3 ms | 78.3% lower |
| cold, 1 thread / 140 lines | fallback visible | 72.4 ms | 913.0 ms | 92.1% lower |
| cold, 1 thread / 140 lines | frame p95 | 10.2 ms | 16.6 ms | 38.6% lower |
| cold, 1 thread / 140 lines | renderer DOM nodes | 31 | 405 | 92.3% lower |
| warm, 12 threads / 100 lines each | first enhanced ready | 92.2 ms | 1,396.2 ms | 93.4% lower |
| warm, 12 threads / 100 lines each | fallback visible | 33.5 ms | 1,421.2 ms | 97.6% lower |
| warm, 12 threads / 100 lines each | frame p95 | 33.4 ms | 41.6 ms | 19.7% lower |
| warm, 12 threads / 100 lines each | renderer DOM nodes | 360 | 4,824 | 92.5% lower |

A separate 24-thread stress run, again using three repetitions, reached first enhanced ready in 166.5 ms for stream-diffs and 2,554.9 ms for stream-monaco. Both completed without a measured height decrease; stream-diffs used 720 renderer DOM nodes versus Monaco's 9,628. At this saturation point stream-diffs had a 75.1 ms frame p95 versus Monaco's 58.3 ms, while settle time was nearly equal (2,600.1 ms versus 2,624.7 ms). The result is stable but no longer a per-frame win: applications with more than a dozen simultaneously visible live streams should retain markstream's viewport prioritization or virtualize offscreen threads.

To reproduce that stress run:

```bash
CODE_RENDERER_BENCHMARK_MODES=stream-diffs,monaco \
CODE_RENDERER_BENCHMARK_THREADS=24 \
CODE_RENDERER_BENCHMARK_REPETITIONS=3 \
pnpm test:e2e:code-renderer-streaming
```

## Readiness, fallback, and height stability

`stream-diffs` does not start Monaco workers or create Monaco models. Its renderer module and the shared Shiki highlighter still initialize asynchronously on the first cold mount, so a host should keep its `<pre>` fallback until the first Diffs surface is ready. In the benchmark above that cold fallback lasted 72.4 ms at the median, compared with 913.0 ms for Monaco. `preloadStreamDiffs()` (and the compatibility name `preloadMonacoWorkers()`) can start loading the renderer chunk earlier, but neither function starts a worker.

After initialization, Pierre reuses its module-level highlighter and deduplicates language resolution. Concurrent code blocks therefore share those resources rather than creating one worker or highlighter per thread.

The benchmark samples every renderer container on animation frames during streaming and after `finalizeCode()`. The 1-, 12-, and 24-thread enhanced-runtime runs recorded zero height decreases and a zero-pixel finalization delta. The host still reserves a maximum-height container and reconciles native Diffs render-completion events, so highlighted Shadow DOM does not cause a late collapse.

## Worker pool for large static surfaces

`File`, `FileDiff`, patch, and merge-conflict inputs accept a native `WorkerPoolManager`. `stream-diffs` passes it as the second constructor argument without wrapping or replacing it:

```ts
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker'
import { createDiffSurface } from 'stream-diffs'

const workerManager = getOrCreateWorkerPoolSingleton({
  poolOptions: {
    poolSize: 4,
    workerFactory: () => new DiffsWorker(),
  },
  highlighterOptions: {
    langs: ['typescript'],
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
  },
})

const review = createDiffSurface({
  kind: 'diff',
  oldFile,
  newFile,
  workerManager,
  options: { diffStyle: 'split' },
})
```

The `?worker` import above is the Vite form; use the equivalent worker import for your bundler. The same manager can be shared across surfaces. Lifecycle and termination remain under application control through the upstream worker APIs.

The upstream Worker Pool API is experimental. Its render options control worker-generated tokens, so initialize the manager with `useTokenTransformer: true` when using Token Hover callbacks. Theme changes must also be applied through `workerManager.setRenderOptions(...)`.

Since `@pierre/diffs@1.6`, the pool also takes:

- `mainThreadMaxCharacters`: files and diffs at or below this many characters highlight on the main thread instead of paying a worker round trip. Unset keeps the old behavior where every highlight uses a worker.
- `workerInitializationTimeout` (default `10s`) and `onWorkerError`, which replaces the default `console.error` for worker load failures. A pool that fails to initialize still lets every surface fall back to main-thread highlighting.
- `preferredDiffLib`: `'jsdiff'` (default) or `'@pierre/patches'` for the WASM diff engine used by inline word/character highlights.

The injected pool must come from the same `@pierre/diffs@^1.7` copy. `stream-diffs` checks the 1.7 pool surface and ignores older managers with a one-time warning instead of crashing when 1.7 calls a method the old pool does not have.

Surfaces accept `preferredHighlighter: 'auto'`, which uses the WASM `highlights` backend when `canUseWASM()` reports support and falls back to `shiki-js` otherwise (or when the backend fails to load). To keep worker and main-thread output identical, give the pool the same backend: `highlighterOptions.preferredHighlighter: 'highlights'`. One backend can be active per thread, so choose it before the first highlight and dispose existing highlighters before switching.


## Measured `@pierre/diffs` 1.6.4 → 1.7.1 comparison

Method: headless Chrome 1255 (macOS arm64), 1440×1000, isolated browser contexts with HTTP cache disabled, identical deterministic fixtures, and three repetitions. Each number is the median of three runs. The fixture uses a warm main-thread Shiki highlighter unless the scenario name says otherwise. These are synthetic first-party measurements, not upstream guarantees.

| Scenario | 1.6.4 | 1.7.1 | Delta |
| --- | ---: | ---: | ---: |
| module import (cold) | 40.6 ms | 46.0 ms | +13.3% |
| Shiki + theme + TS language (cold) | 30.4 ms | 30.8 ms | +1.3% |
| append a new language | 3.9 ms | 4.1 ms | +5.1% |
| append a new theme | 4.1 ms | 4.0 ms | -2.4% |
| 2,000-line file, cold render | 626.2 ms | 659.3 ms | +5.3% |
| 2,000-line file, warm render | 409.1 ms | 454.1 ms | +11.0% |
| 10,000-line file, warm render | 2,156.6 ms | 2,270.5 ms | +5.3% |
| 20× 300-line file renders | 1,492.1 ms | 1,512.5 ms | +1.4% |
| 2,000-line split diff, warm render | 682.9 ms | 733.3 ms | +7.4% |
| 2,000-line diff parse, jsdiff | 73.3 ms | 76.9 ms | +4.9% |
| 2,000-line diff parse, `@pierre/patches` | n/a | 11.6 ms | 6.3× faster than jsdiff |
| 2,000-line file update render | 410.8 ms | 467.2 ms | +13.7% |
| worker pool init (2 workers) | 38.2 ms | 38.6 ms | +1.0% |
| worker first theme switch (chunk load) | 5.8 ms | 4.5 ms | -22.4% |
| worker cached theme switch | 0.4 ms | 0.4 ms | flat |
| worker 2,000-line file render | 572.5 ms | 638.7 ms | +11.6% |
| worker 2,000-line file CPU (`TaskDuration`) | 0.273 s | 0.341 s | +24.9% |
| 5,000-character single line | 361.9 ms | 22.6 ms | 16× faster |

Interpretation:

- Language and theme loading is unchanged. Warm Shiki setup is dominated by Shiki itself, not by Diffs; 1.7.1 adds no measurable startup cost there.
- The new shared row/layout renderer is not faster for a one-shot static full render in this harness. It is 1–14% slower depending on size and scenario, with the largest regression on a warm 2k-line re-render. DOM node counts are effectively identical (79,656 versus 79,639 for the 2k fixture).
- The real 1.7 wins are elsewhere: long-line cutting avoids a 16× layout stall, `@pierre/patches` makes diff parsing ~6.3× faster, incremental editing patches rows instead of rebuilding the surface, and editor attach can reuse highlighted rows after `prepareForEditing()`.
- Worker-pool initialization is flat, but worker rendering used ~25% more main-thread task time in this run while still moving tokenization off-thread. Keep `mainThreadMaxCharacters`/viewport deferral enabled when many blocks mount together.
- Memory did not regress meaningfully; the 10k-line file used ~27 MB JS heap in 1.6.4 and ~44 MB in 1.7.1 in the sampled process, which includes the larger module graph and measured variance. Treat heap numbers as directional rather than a budget.

### Reproducing long-line behavior

The default `tokenizeMaxLineLength` is 1,000 characters. A 5,000-character line renders 1,005 characters plus a "Show full line" control in 1.7.1. Setting `tokenizeMaxLineLength: 0` restores the full 6,000-character render at ~1.68 s, close to the 1.6.4 uncut ~1.78 s. Keep the default for chat/data output; opt out only when a host needs full-line selection without an expand click.
