# stream-diffs

面向 AI 输出的轻量、只读代码与 Diff 渲染库。底层使用 [`@pierre/diffs`](https://diffs.com/) 与 Shiki；流式阶段不创建 Monaco model 和 worker，结束后可切换为可交互的 File、Diff 或 Git 冲突解决界面。

## 安装

```bash
pnpm add stream-diffs
```

Vue 组件入口需要 Vue 3：

```bash
pnpm add stream-diffs vue
```

## 流式代码

```ts
import { createCodeStream } from 'stream-diffs'

const output = createCodeStream({
  fileName: 'answer.ts',
  language: 'typescript',
  theme: { dark: 'github-dark', light: 'github-light' },
  maxHeight: 600,
  lineNumbers: true,
  autoScroll: 'near-bottom',
})

await output.mount(document.querySelector('#code')!)
output.append('export const ')
output.append('answer = 42\n')
await output.finalize({ view: 'file' })
```

实时高亮默认保护阈值为 10,000 行或 1,000,000 字符。超过任一阈值后会终止持续增长的高亮 DOM，继续累积文本并使用只追加纯文本显示；最终仍能生成准确的 File 或 Diff：

```ts
const output = createCodeStream({
  limits: {
    maxStreamingLines: 20_000,
    maxStreamingChars: 2_000_000,
    overflowBehavior: 'stop-highlighting',
  },
  onOverflow: stats => console.warn('已停止实时高亮', stats),
})
```

这些是 `stream-diffs` 的安全默认值，不是 Diffs 官方上限。宿主已限制输出长度时可传入 `limits: false`。

`append()` 是性能最佳的增量路径。对于每次返回完整文本的 SDK，可以使用：

```ts
output.updateSnapshot('export')
output.updateSnapshot('export const')
output.updateSnapshot('export const answer = 42')
```

也可以直接消费 `ReadableStream<string>` 或异步迭代器：

```ts
await output.consume(response.body!)
await output.finalize({
  view: 'diff',
  original: previousSource,
  diffStyle: 'split',
})
```

## 单列与双列 Diff

```ts
import { createDiffSurface } from 'stream-diffs'

const review = createDiffSurface({
  kind: 'diff',
  oldFile: { name: 'src/app.ts', contents: before },
  newFile: { name: 'src/app.ts', contents: after },
  options: {
    diffStyle: 'unified', // 单列
    // diffStyle: 'split', // 双列
    diffIndicators: 'bars',
    lineDiffType: 'word-alt',
    enableLineSelection: true,
  },
})

await review.mount(document.querySelector('#diff')!)
review.setSelectedLines({ start: 8, end: 12, side: 'additions' })
```

`kind: 'file'` 渲染静态代码，`kind: 'merge-conflict'` 渲染 Git 冲突解决 UI。

原始 Git patch 与预解析 `FileDiffMetadata` 也可以直接渲染：

```ts
createDiffSurface({ kind: 'patch', patch: unifiedPatch, fileIndex: 0 })
createDiffSurface({ kind: 'diff', fileDiff: parsedMetadata })
```

## 在 markstream-vue 中自动使用

`markstream-vue` 会动态优先选择已安装的 `stream-diffs`，现有 CodeBlock 用法无需改变：

```bash
pnpm add markstream-vue stream-diffs
```

```vue
<MarkdownRender :content="markdown" :loading="streaming" />
```

高级配置继续通过已有的 `codeBlockProps.monacoOptions` 传入；保留这个属性名是为了兼容现有 API：

```ts
const codeBlockProps = {
  monacoOptions: {
    diffStyle: 'split',
    enableLineSelection: true,
    onLineSelected: range => console.log(range),
    onTokenEnter: ({ tokenText, tokenElement }) => {
      showHover(tokenText, tokenElement)
    },
    lineAnnotations: comments,
    renderAnnotation: renderComment,
    onController: controller => codeController = controller,
  },
}
```

流结束后 markstream 会调用 `finalizeCode()`，原子切换为可交互 `File`，完整冲突标记会进入冲突解决 UI。两种可选渲染器同时安装时优先 `stream-diffs`；移除它即可显式使用 `stream-monaco`。

首次冷启动仍需异步初始化共享的 Shiki highlighter，因此 markstream 会保留 `<pre>`，直到 Diffs surface ready；它不创建 Monaco worker 或 model。实测 Chrome 中冷启动 fallback 中位数为 72.4 ms，stream-monaco 为 913.0 ms；1、12、24 threads 压测均未检测到容器高度回落。方法和复现命令见[性能与包体积](./docs/performance.md#browser-streaming-benchmark)。

兼容运行时已经提供 `finalizeCode()`，供后续加载器在 `loading` 变为 `false` 时完成 `FileStream → File` 原子切换。切换后原 editor adapter 上的选行、注释等方法仍然指向最终 File。

## 交互能力

- Custom headers：`renderHeaderPrefix`、`renderHeaderMetadata`、`renderCustomHeader`。
- Token Hover：`onTokenEnter`、`onTokenLeave`、`onTokenClick`。
- 行选择：`enableLineSelection`、`onLineSelected`、`setSelectedLines()`。
- Comments & Annotations：`annotations`、`renderAnnotation`、`setAnnotations()`。
- Accept/Reject：`acceptReject(hunkIndex, 'accept' | 'reject' | 'both')`，也支持指定 `changeIndex`。
- Merge：`mergeConflictActionsType`、`onMergeConflictResolve`、`resolveConflict()`。
- 完整原生能力：`getNativeInstance()` 返回当前 `File`、`FileDiff` 或 `UnresolvedFile`；`getResolvedFile()` 返回 Accept/Reject 后的完整文件。

示例：

```ts
review.acceptReject(0, 'accept')
review.setAnnotations([
  { side: 'additions', lineNumber: 14, metadata: { body: '这里需要校验输入' } },
])

const merge = createDiffSurface({
  kind: 'merge-conflict',
  file: { name: 'app.ts', contents: conflictedSource },
  options: {
    mergeConflictActionsType: 'default',
    onMergeConflictResolve(file) {
      save(file.contents)
    },
  },
})
```

当前底层 Diffs 版本把 `UnresolvedFile`、merge resolution 和 token hooks 标记为实验性能力，`stream-diffs` 会如实保留这个状态与原生类型。

## Vue 组件

```vue
<script setup lang="ts">
import { StreamCode, StreamDiff, StreamMergeConflict } from 'stream-diffs/vue'
</script>

<template>
  <StreamCode :code="generated" language="typescript" :loading="streaming" />
  <StreamDiff :original="before" :modified="after" diff-style="split" />
  <StreamMergeConflict :code="conflictedSource" language="typescript" />
</template>
```

完整说明见 [API 文档](./docs/api.md)、[性能与包体积](./docs/performance.md) 与 [markstream-vue 接入文档](./docs/markstream-vue.md)。

运行 `pnpm example` 可以打开真实浏览器能力实验页，同页覆盖 unified/split review、annotations、token hover、行选择、accept/reject、merge actions 和 streaming-to-file 转换。

同步的 Pierre 底层工具使用独立入口，避免根入口提前加载渲染依赖：

```ts
import { parseDiffFromFile, parsePatchFiles } from 'stream-diffs/pierre'
```

## 设计边界

- 流式阶段只读、只追加。
- delta append 的性能优于 cumulative snapshot。
- 流式阶段使用 `FileStream`，最终 Diff 基于完整 snapshot 计算，保证准确性。
- 超长输出会继续以只追加纯文本显示，并仍可最终生成准确 File 或 Diff。
- 不包含 cursor editing、undo/redo、Monaco model、补全、LSP 与诊断运行时。
- `@pierre/diffs` 在首次 mount 时动态加载，SSR import 安全。

## License

MIT
