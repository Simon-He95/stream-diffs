import type { DiffSurfaceController } from '../src'
import { createCodeStream, createDiffSurface } from '../src'

const before = `export async function loadUser(id: string) {
  const response = await fetch('/api/users/' + id)
  return response.json()
}
`

const after = `export async function loadUser(id: string) {
  if (!id)
    throw new Error('Missing user id')

  const response = await fetch('/api/users/' + id)
  if (!response.ok)
    throw new Error('User request failed')
  return response.json()
}
`

const conflictMarker = (token: string, label = '') => `${token.repeat(7)}${label ? ` ${label}` : ''}\n`
const conflictFile = {
  name: 'src/config.ts',
  contents: [
    'export const config = {\n',
    conflictMarker('<', 'current'),
    '  timeout: 2_000,\n',
    conflictMarker('='),
    '  timeout: 5_000,\n',
    conflictMarker('>', 'incoming'),
    '  retries: 3,\n',
    '}\n',
  ].join(''),
  lang: 'typescript',
}

const hover = document.querySelector<HTMLElement>('#token-hover')!
const themeOptions = {
  theme: { dark: 'pierre-dark', light: 'pierre-light' } as const,
  themeType: 'dark' as const,
}
const tokenOptions = {
  onTokenEnter(token: { tokenText: string, tokenElement: HTMLElement }) {
    const rect = token.tokenElement.getBoundingClientRect()
    hover.textContent = `Token: ${JSON.stringify(token.tokenText)}`
    hover.style.display = 'block'
    hover.style.left = `${rect.left}px`
    hover.style.top = `${rect.bottom + 7}px`
  },
  onTokenLeave() {
    hover.style.display = 'none'
  },
}

function setStatus(id: string, message: string) {
  const node = document.querySelector<HTMLElement>(id)
  if (node)
    node.textContent = message
}

const unified = createDiffSurface<{ author: string, body: string }>({
  kind: 'diff',
  oldFile: { name: 'src/user.ts', contents: before, lang: 'typescript' },
  newFile: { name: 'src/user.ts', contents: after, lang: 'typescript' },
  annotations: [{
    side: 'additions',
    lineNumber: 2,
    metadata: { author: 'Ada', body: 'Good boundary check. Keep this close to the request.' },
  }],
  options: {
    ...themeOptions,
    ...tokenOptions,
    diffStyle: 'unified',
    diffIndicators: 'bars',
    lineDiffType: 'word-alt',
    enableLineSelection: true,
    overflow: 'wrap',
    useTokenTransformer: true,
    renderCustomHeader(file) {
      const node = document.createElement('div')
      node.className = 'review-header'
      node.innerHTML = `<strong>${file.name}</strong><em>ready for review</em>`
      return node
    },
    renderAnnotation(annotation) {
      const node = document.createElement('div')
      node.className = 'comment'
      node.textContent = `${annotation.metadata.author}: ${annotation.metadata.body}`
      return node
    },
  },
})

const split = createDiffSurface({
  kind: 'diff',
  oldFile: { name: 'src/user.ts', contents: before, lang: 'typescript' },
  newFile: { name: 'src/user.ts', contents: after, lang: 'typescript' },
  options: {
    ...themeOptions,
    ...tokenOptions,
    diffStyle: 'split',
    diffIndicators: 'bars',
    lineDiffType: 'word-alt',
    enableLineSelection: true,
    overflow: 'wrap',
    useTokenTransformer: true,
  },
})

const merge = createDiffSurface({
  kind: 'merge-conflict',
  file: conflictFile,
  options: {
    ...themeOptions,
    mergeConflictActionsType: 'default',
    expandUnchanged: true,
    overflow: 'wrap',
  },
})

await Promise.all([
  unified.mount(document.querySelector<HTMLElement>('#unified')!),
  split.mount(document.querySelector<HTMLElement>('#split')!),
  merge.mount(document.querySelector<HTMLElement>('#merge')!),
])

function bind(id: string, action: (element: HTMLElement) => void) {
  document.querySelector<HTMLElement>(id)?.addEventListener('click', (event) => {
    action(event.currentTarget as HTMLElement)
  })
}

bind('#accept', () => {
  const diff = unified.acceptReject(0, 'accept')
  setStatus('#unified-status', `Accepted one hunk. ${diff.hunks.length} hunk rows remain in the metadata.`)
})

bind('#reject', () => {
  const diff = unified.acceptReject(0, 'reject')
  setStatus('#unified-status', `Rejected one hunk. ${diff.hunks.length} hunk rows remain in the metadata.`)
})

let editing = false
let editor: Awaited<ReturnType<DiffSurfaceController['startEditing']>> | undefined

bind('#unified-edit', async (button) => {
  if (editing) {
    const text = unified.getEditingText()
    unified.stopEditing('complete')
    editing = false
    button.textContent = 'Edit inline'
    document.querySelector<HTMLElement>('#unified-edit-tools')?.removeAttribute('data-active')
    setStatus('#unified-status', text ? `Edit complete. ${text.split('\n').length} lines in the draft.` : 'Edit complete.')
    return
  }
  button.textContent = 'Preparing editor'
  setStatus('#unified-status', 'Preparing an edit session')
  try {
    editor = await unified.startEditing({
      onChange() {
        setStatus('#unified-status', 'Editing. Type in the diff, then stop the session.')
      },
    }, 'examples-unified')
    editing = true
    unified.focusEditor({ lineNumber: 1 })
    button.textContent = 'Stop editing'
    document.querySelector<HTMLElement>('#unified-edit-tools')?.setAttribute('data-active', 'true')
    setStatus('#unified-status', 'Editor attached. Type in the diff.')
  }
  catch (error) {
    button.textContent = 'Edit inline'
    setStatus('#unified-status', error instanceof Error ? error.message : String(error))
  }
})

bind('#unified-undo', () => {
  unified.undo()
  setStatus('#unified-status', `Undo. Can undo: ${unified.canUndo()}, can redo: ${unified.canRedo()}.`)
})

bind('#unified-redo', () => {
  unified.redo()
  setStatus('#unified-status', `Redo. Can undo: ${unified.canUndo()}, can redo: ${unified.canRedo()}.`)
})

bind('#select', () => {
  split.setSelectedLines({ start: 2, end: 2, side: 'additions' })
  setStatus('#split-status', 'Selected additions line 2.')
})

bind('#merge-current', () => {
  const file = merge.resolveConflict(0, 'current')
  setStatus('#merge-status', file ? 'Resolved as current.' : 'No conflict left to resolve.')
})

bind('#merge-incoming', () => {
  const file = merge.resolveConflict(0, 'incoming')
  setStatus('#merge-status', file ? 'Resolved as incoming.' : 'No conflict left to resolve.')
})

bind('#merge-both', () => {
  const file = merge.resolveConflict(0, 'both')
  setStatus('#merge-status', file ? `Kept both sides. ${file.contents.split('\n').length} lines in the result.` : 'No conflict left to resolve.')
})

bind('#merge-reset', () => {
  merge.updateMergeConflict(conflictFile)
  setStatus('#merge-status', 'Reset to the original conflict file.')
})

const streamHost = document.querySelector<HTMLElement>('#stream')!
const stream = createCodeStream({
  ...themeOptions,
  fileName: 'generated.ts',
  language: 'typescript',
  maxHeight: 320,
  lineNumbers: true,
  autoScroll: 'near-bottom',
})
await stream.mount(streamHost)

let streamRun = 0
let playing = false

async function runStream() {
  if (playing)
    return
  const run = ++streamRun
  playing = true
  const button = document.querySelector<HTMLButtonElement>('#stream-replay')
  if (button)
    button.disabled = true
  setStatus('#stream-status', 'Streaming plain text')

  await stream.reset()
  const streamDelay = new URLSearchParams(location.search).has('qa') ? 0 : 90
  for (const chunk of ['export ', 'const ', 'answer', ' = ', '42', '\n']) {
    if (run !== streamRun)
      return
    stream.append(chunk)
    if (streamDelay)
      await new Promise(resolve => setTimeout(resolve, streamDelay))
  }
  await stream.finalize({
    view: 'diff',
    original: 'export const answer = 0\n',
    ...themeOptions,
    diffStyle: 'split',
    enableLineSelection: true,
    useTokenTransformer: true,
    ...tokenOptions,
  })
  if (run !== streamRun)
    return
  playing = false
  if (button)
    button.disabled = false
  setStatus('#stream-status', 'Finalized an accurate split diff')
}

bind('#stream-replay', () => void runStream())
await runStream()

Object.assign(window, { unified, split, merge, stream, editor })
