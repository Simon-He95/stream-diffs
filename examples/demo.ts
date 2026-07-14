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

const unified = createDiffSurface<{ author: string, body: string }>({
  kind: 'diff',
  oldFile: { name: 'src/user.ts', contents: before },
  newFile: { name: 'src/user.ts', contents: after },
  annotations: [{
    side: 'additions',
    lineNumber: 2,
    metadata: { author: 'Ada', body: 'Good boundary check. Keep this close to the request.' },
  }],
  options: {
    ...themeOptions,
    ...tokenOptions,
    diffStyle: 'unified',
    enableLineSelection: true,
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
  oldFile: { name: 'src/user.ts', contents: before },
  newFile: { name: 'src/user.ts', contents: after },
  options: { ...themeOptions, ...tokenOptions, diffStyle: 'split', enableLineSelection: true },
})

const merge = createDiffSurface({
  kind: 'merge-conflict',
  file: {
    name: 'src/config.ts',
    contents: `export const config = {
<<<<<<< current
  timeout: 2_000,
=======
  timeout: 5_000,
>>>>>>> incoming
  retries: 3,
}
`,
  },
  options: { ...themeOptions, mergeConflictActionsType: 'default', expandUnchanged: true },
})

await Promise.all([
  unified.mount(document.querySelector<HTMLElement>('#unified')!),
  split.mount(document.querySelector<HTMLElement>('#split')!),
  merge.mount(document.querySelector<HTMLElement>('#merge')!),
])

document.querySelector('#accept')!.addEventListener('click', () => unified.acceptReject(0, 'accept'))
document.querySelector('#reject')!.addEventListener('click', () => unified.acceptReject(0, 'reject'))
document.querySelector('#select')!.addEventListener('click', () => split.setSelectedLines({ start: 2, end: 2, side: 'additions' }))

const stream = createCodeStream({ ...themeOptions, fileName: 'generated.ts', language: 'typescript', maxHeight: 320 })
await stream.mount(document.querySelector<HTMLElement>('#stream')!)
Object.assign(window, { stream })
const streamDelay = new URLSearchParams(location.search).has('qa') ? 0 : 90
for (const chunk of ['export ', 'const ', 'answer', ' = ', '42', '\n']) {
  stream.append(chunk)
  if (streamDelay)
    await new Promise(resolve => setTimeout(resolve, streamDelay))
}
await stream.finalize({ view: 'file', ...themeOptions, enableLineSelection: true, ...tokenOptions })

Object.assign(window, { unified, split, merge, stream })
