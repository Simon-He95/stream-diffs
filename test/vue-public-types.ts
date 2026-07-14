import { h } from 'vue'
import { StreamCode, StreamDiff, StreamMergeConflict } from '../src/vue'

const workerManager = {} as import('@pierre/diffs/worker').WorkerPoolManager

h(StreamCode, {
  code: 'const answer = 42',
  language: 'typescript',
  options: { autoScroll: 'near-bottom', flushStrategy: 'raf' },
  fileOptions: { enableLineSelection: true },
  annotations: [{ lineNumber: 1, metadata: { body: 'comment' } }],
  workerManager,
})

h(StreamDiff, {
  original: 'const answer = 0',
  modified: 'const answer = 42',
  diffStyle: 'split',
  options: {
    enableLineSelection: true,
    onTokenEnter(token) {
      token.tokenElement.dataset.hovered = token.tokenText
    },
  },
  annotations: [{ side: 'additions', lineNumber: 1, metadata: { body: 'comment' } }],
  workerManager,
})

h(StreamMergeConflict, {
  code: '<<<<<<< current\na\n=======\nb\n>>>>>>> incoming',
  options: { mergeConflictActionsType: 'default' },
  workerManager,
})
