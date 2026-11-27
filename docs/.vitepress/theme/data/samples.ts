export interface SampleAnnotation {
  side: 'additions' | 'deletions'
  lineNumber: number
  author: string
  body: string
}

export interface CodeSample {
  id: string
  label: string
  blurb: string
  fileName: string
  language: string
  original: string
  modified: string
  annotation?: SampleAnnotation
}

export const codeSamples: CodeSample[] = [
  {
    id: 'invoice',
    label: 'Guarded API call',
    blurb: 'Input validation, a retry, and a typed error path.',
    fileName: 'src/billing/loadInvoice.ts',
    language: 'typescript',
    annotation: {
      side: 'additions',
      lineNumber: 4,
      author: 'Mina',
      body: 'Keep the empty-id check before the request so the network layer never sees a bad key.',
    },
    original: `export async function loadInvoice(id: string) {
  const response = await fetch(\`/api/invoices/\${id}\`)
  return response.json()
}
`,
    modified: `export async function loadInvoice(id: string) {
  if (!id.trim())
    throw new Error('Missing invoice id')

  const response = await fetch(\`/api/invoices/\${id}\`)
  if (!response.ok)
    throw new Error(\`Invoice request failed: \${response.status}\`)
  return response.json()
}
`,
  },
  {
    id: 'hook',
    label: 'React data hook',
    blurb: 'Adds cancellation and an explicit loading state.',
    fileName: 'src/hooks/useWorkspaceMember.ts',
    language: 'tsx',
    annotation: {
      side: 'additions',
      lineNumber: 8,
      author: 'Tomas',
      body: 'Abort on cleanup keeps fast route changes from writing stale members into state.',
    },
    original: `import { useEffect, useState } from 'react'

export function useWorkspaceMember(workspaceId: string) {
  const [member, setMember] = useState<Member | null>(null)

  useEffect(() => {
    fetch(\`/api/workspaces/\${workspaceId}/member\`)
      .then(response => response.json())
      .then(setMember)
  }, [workspaceId])

  return member
}
`,
    modified: `import { useEffect, useState } from 'react'

export function useWorkspaceMember(workspaceId: string) {
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    fetch(\`/api/workspaces/\${workspaceId}/member\`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(response))
      .then(setMember)
      .catch(error => {
        if (error.name !== 'AbortError')
          setMember(null)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [workspaceId])

  return { member, loading }
}
`,
  },
  {
    id: 'pagination',
    label: 'Cursor pagination',
    blurb: 'Replaces page offsets with a cursor and a loop that cannot spin forever.',
    fileName: 'workers/sync_orders.py',
    language: 'python',
    annotation: {
      side: 'additions',
      lineNumber: 9,
      author: 'Keiko',
      body: 'The cursor contract lets this run safely against a table that changes during the sync.',
    },
    original: `def fetch_orders(client):
    page = 1
    orders = []
    while True:
        batch = client.orders(page=page, per_page=100)
        if not batch:
            break
        orders.extend(batch)
        page += 1
    return orders
`,
    modified: `def fetch_orders(client):
    cursor = None
    orders = []
    seen_cursors = set()

    while True:
        batch = client.orders(cursor=cursor, limit=100)
        orders.extend(batch.items)

        if not batch.next_cursor:
            break
        if batch.next_cursor in seen_cursors:
            raise RuntimeError("Pagination cursor repeated")
        seen_cursors.add(batch.next_cursor)
        cursor = batch.next_cursor

    return orders
`,
  },
  {
    id: 'css',
    label: 'Focus and motion',
    blurb: 'A small CSS change with visible word-level additions.',
    fileName: 'app/button.css',
    language: 'css',
    original: `.button {
  border: 1px solid #d4d7dd;
  padding: 8px 14px;
  transition: background 180ms ease;
}

.button:hover {
  background: #f1f3f6;
}
`,
    modified: `.button {
  border: 1px solid #d4d7dd;
  padding: 8px 14px;
  transition: background 180ms ease, outline-offset 120ms ease;
}

.button:hover {
  background: #f1f3f6;
}

.button:focus-visible {
  outline: 2px solid #4f7a16;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .button {
    transition: none;
  }
}
`,
  },
  {
    id: 'flags',
    label: 'New file',
    blurb: 'An empty before side, rendered as a full addition.',
    fileName: 'src/feature-flags.ts',
    language: 'typescript',
    annotation: {
      side: 'additions',
      lineNumber: 6,
      author: 'Ravi',
      body: 'Return a copy so callers cannot mutate the registry by accident.',
    },
    original: '',
    modified: `export type FeatureFlag = {
  key: string
  enabled: boolean
}

export function enabledFlags(flags: FeatureFlag[]): string[] {
  return flags.filter(flag => flag.enabled).map(flag => flag.key)
}
`,
  },
  {
    id: 'prose',
    label: 'Docs rewrite',
    blurb: 'Prose diffs highlight changed words, not just changed lines.',
    fileName: 'docs/onboarding.md',
    language: 'markdown',
    original: `# Onboarding

Create a workspace, invite one teammate, and open the sample project.
The first render should finish in under a second on a laptop.
`,
    modified: `# Onboarding

Create a workspace, invite at least one teammate, then open the sample project.
The first render should finish in under 400 ms on a standard laptop.
`,
  },
]

export interface MergeSample {
  fileName: string
  language: string
  contents: string
}

const conflictMarker = (token: string, label = '') => `${token.repeat(7)}${label ? ` ${label}` : ''}\n`

export const mergeSample: MergeSample = {
  fileName: 'src/config/runtime.ts',
  language: 'typescript',
  contents: [
    'export const runtime = {\n',
    "  apiBase: process.env.API_BASE ?? 'https://api.example.test',\n",
    conflictMarker('<', 'current'),
    '  timeoutMs: 2_000,\n',
    '  retries: 2,\n',
    conflictMarker('='),
    '  timeoutMs: 5_000,\n',
    '  retries: 3,\n',
    conflictMarker('>', 'incoming'),
    "  logLevel: 'info',\n",
    conflictMarker('<', 'current'),
    '  traceSampleRate: 0.1,\n',
    conflictMarker('='),
    '  traceSampleRate: 0.25,\n',
    conflictMarker('>', 'incoming'),
    '}\n',
  ].join(''),
}
