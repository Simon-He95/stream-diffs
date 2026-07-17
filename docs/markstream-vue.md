# markstream-vue integration

## Integration status

`stream-diffs/markstream` exports `useMonaco`, `detectLanguage`, and `preloadMonacoWorkers`, and markstream adapters dynamically select it without importing Monaco.

## Resolution order

The CodeBlock loader attempts:

1. `import('stream-diffs/markstream')`
2. `import('stream-monaco')`
3. the built-in basic `<pre>` fallback

This keeps both enhanced runtimes optional and makes `stream-diffs` the automatic lightweight choice when installed.

## Runtime mapping

| markstream operation | stream-diffs behavior |
| --- | --- |
| streaming or offscreen block | markstream-owned `<pre>`; runtime not mounted |
| completed visible single file | one static interactive `File` |
| completed visible side-by-side diff | one static split `FileDiff` |
| completed visible inline diff | one static unified `FileDiff` |
| complete Git conflict markers | `UnresolvedFile` |
| theme update | `setThemeType` or rerender with the requested Shiki theme |
| cleanup | dispose the current Diffs instance and cancel pending readiness |

When `loading` changes to `false` and the block is visible, markstream creates a runtime with `stream: false` in the hidden editor layer. The `<pre>` stays visible until creation and `whenVisualReady()` finish. Markstream then switches the two layers in one component update. A stale creation cannot replace the fallback after unmount, collapse, or code-block identity change.

The existing `monacoOptions` property is retained because changing it would break markstream users. Diffs-native options can be placed in that object because `CodeBlockMonacoOptions` has an extension index.

The compatibility runtime removes only markstream/Monaco host fields such as `MAX_HEIGHT`, `wordWrap`, and `renderSideBySide`; every other option is forwarded to Pierre. This avoids a fixed allowlist that would drop current or future native APIs.

## Advanced options

```ts
const codeBlockProps = {
  monacoOptions: {
    diffStyle: 'split',
    diffIndicators: 'bars',
    lineDiffType: 'word-alt',
    enableLineSelection: true,
    lineHoverHighlight: 'both',
    onLineSelected(range) {},
    onTokenEnter(token, event) {},
    onTokenLeave(token, event) {},
    lineAnnotations: comments,
    renderAnnotation(annotation) {},
    renderCustomHeader(fileOrDiff) {},
    mergeConflictActionsType: 'default',
    onMergeConflictResolve(file, payload) {},
    onController(controller) {},
  },
}
```

Use `onController` when an application needs imperative actions:

```ts
let controller

const options = {
  onController(value) {
    controller = value
  },
}

controller.setSelectedLines({ start: 10, end: 16, side: 'additions' })
controller.acceptReject(0, 'accept')
controller.resolveConflict(0, 'both')
```

## Behavioral notes

- During token streaming, the hot path stays in markstream's `<pre>`; line selection and token hooks become available on the final File/FileDiff surface.
- Final diffs are recomputed from the complete original and modified contents. The library does not claim token-level incremental diff correctness.
- If both enhanced packages are installed, `stream-diffs` wins. Remove it to explicitly use `stream-monaco`.
- `mergeConflict: false` disables automatic conflict marker detection.
- `stream: false` forces the static file surface.

## Playground selection and benchmark

The markstream-vue playground's main Test page can switch between Stream Diffs, Monaco, Shiki, and the plain pre renderer. The selection resets the optional-runtime cache, so Stream Diffs and Monaco can be compared in the same session without changing installed dependencies.

`/code-renderer-benchmark` provides the repeatable streaming and multi-thread benchmark. Run `pnpm test:e2e:code-renderer-streaming` in markstream-vue for the asserted Chrome test, or use the page controls to change renderer, thread count, line count, chunk size, and delay. See [Performance and package size](./performance.md#browser-streaming-benchmark) for the recorded medians and resource-readiness conclusions.
