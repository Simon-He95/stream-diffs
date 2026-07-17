# Performance and package size

## First-party runtime budget

`pnpm size:check` gzip-measures every emitted first-party `.mjs` file and fails when an entry exceeds its budget:

| Output | Current approximate gzip | Gate |
| --- | ---: | ---: |
| root API entry | 0.2 kB | 0.2 kB |
| markstream compatibility entry | 4.9 kB | 5.0 kB |
| shared stream/surface controller | 5.7 kB | 5.7 kB |
| Vue entry | 1.5 kB | 1.5 kB |
| synchronous Pierre utility entry | 0.2 kB | 0.3 kB |
| all first-party runtime outputs | 12.5 kB | 12.5 kB |

These numbers exclude `@pierre/diffs`, Shiki grammars, themes, and an optional worker because those are upstream/runtime-selected dependencies. The root entry contains no eager static import of `@pierre/diffs`; renderer code loads on the first `mount()`.

Application bundles still depend on selected languages, themes, highlighter engine, and bundler chunking. Measure the actual host build rather than treating this table as total application transfer size.

`@pierre/diffs@1.2.12` currently declares `react` and `react-dom` as peers even when an application only imports its Vanilla entry. Some package managers may therefore install those peers. `stream-diffs` never imports the Pierre React entry, but it cannot remove an upstream package manifest requirement; installation size and browser runtime size should be evaluated separately.

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
