import { createCodeStream } from 'stream-diffs'

const controller = createCodeStream({
  fileName: 'generated.ts',
  language: 'typescript',
  autoScroll: 'near-bottom',
})

await controller.mount(document.querySelector('#app')!)
for await (const delta of getModelDeltas())
  controller.append(delta)

await controller.finalize({
  view: 'diff',
  original: 'export const answer = 0\n',
  diffStyle: 'split',
  enableLineSelection: true,
})

declare function getModelDeltas(): AsyncIterable<string>
