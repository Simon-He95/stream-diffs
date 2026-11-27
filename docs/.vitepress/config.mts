import { fileURLToPath, URL } from 'node:url'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { createFileSystemTypesCache } from '@shikijs/vitepress-twoslash/cache-fs'
import { defineConfig } from 'vitepress'

const repo = 'https://github.com/Simon-He95/stream-diffs'
const siteUrl = (process.env.DOCS_SITE ?? 'https://stream-diffs.pages.dev/').replace(/\/?$/, '/')
const base = (process.env.DOCS_BASE ?? '/stream-diffs/').replace(/\/?$/, '/')
const description = 'Stream-native syntax highlighting and review-ready diffs for AI output. No Monaco, no workers, with opt-in inline editing. Powered by @pierre/diffs and Shiki.'

const src = (path: string) => fileURLToPath(new URL(`../../src/${path}`, import.meta.url))

export default defineConfig({
  lang: 'en-US',
  title: 'stream-diffs',
  titleTemplate: ':title | stream-diffs',
  description,
  base,
  site: siteUrl,
  cleanUrls: false,
  lastUpdated: true,
  appearance: 'dark',
  sitemap: {
    hostname: siteUrl,
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#08090c' }],
    ['meta', { name: 'author', content: 'Simon He' }],
    ['meta', { name: 'keywords', content: 'streaming code, diff renderer, syntax highlighting, AI output, LLM, Shiki, @pierre/diffs, Vue, code review, markdown' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'stream-diffs' }],
    ['meta', { property: 'og:image', content: `${siteUrl}social-preview.png` }],
    ['meta', { property: 'og:image:width', content: '1280' }],
    ['meta', { property: 'og:image:height', content: '640' }],
    ['meta', { property: 'og:image:alt', content: 'stream-diffs social card: render the stream, land the diff' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${siteUrl}social-preview.png` }],
    ['meta', { name: 'twitter:image:alt', content: 'stream-diffs social card: render the stream, land the diff' }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      'name': 'stream-diffs',
      'applicationCategory': 'DeveloperApplication',
      'operatingSystem': 'Any',
      'description': description,
      'url': siteUrl,
      'codeRepository': repo,
      'license': 'https://opensource.org/licenses/MIT',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
      'author': { '@type': 'Person', 'name': 'Simon He', 'url': 'https://github.com/Simon-He95' },
    })],
  ],
  transformPageData(pageData) {
    if (pageData.relativePath === 'index.md') {
      pageData.frontmatter.head = [
        ...(pageData.frontmatter.head ?? []),
        ['script', {}, `if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('sd-motion-ready')`],
      ]
    }
  },
  transformHead({ pageData }) {
    const path = pageData.relativePath
      .replace(/\.md$/, '')
      .replace(/(^|\/)index$/, '')
    const pageUrl = path ? `${siteUrl}${path}.html` : siteUrl
    const pageTitle = pageData.frontmatter.title ?? pageData.title ?? 'stream-diffs'
    const pageDescription = pageData.frontmatter.description ?? description
    return [
      ['link', { rel: 'canonical', href: pageUrl }],
      ['meta', { property: 'og:url', content: pageUrl }],
      ['meta', { property: 'og:title', content: `${pageTitle} | stream-diffs` }],
      ['meta', { property: 'og:description', content: pageDescription }],
      ['meta', { name: 'twitter:title', content: `${pageTitle} | stream-diffs` }],
      ['meta', { name: 'twitter:description', content: pageDescription }],
    ]
  },
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    codeTransformers: [
      transformerTwoslash({
        typesCache: createFileSystemTypesCache(),
      }),
    ],
  },
  vite: {
    resolve: {
      alias: [
        { find: /^stream-diffs$/, replacement: src('index.ts') },
        { find: /^stream-diffs\/vue$/, replacement: src('vue.ts') },
        { find: /^stream-diffs\/pierre$/, replacement: src('pierre.ts') },
        { find: /^stream-diffs\/edit$/, replacement: src('edit.ts') },
        { find: /^stream-diffs\/markstream$/, replacement: src('markstream.ts') },
      ],
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'stream-diffs',
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Playground', link: '/playground', activeMatch: '/playground' },
      { text: 'Examples', link: '/examples', activeMatch: '/examples' },
      { text: 'API', link: '/api', activeMatch: '/api' },
      { text: 'Types', link: '/types', activeMatch: '/types' },
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Quickstart', link: '/guide/getting-started' },
          { text: 'Playground', link: '/playground' },
          { text: 'Examples', link: '/examples' },
        ],
      },
      {
        text: 'Core',
        items: [
          { text: 'Streaming code', link: '/guide/streaming' },
          { text: 'Diffs and review', link: '/guide/diffs' },
          { text: 'Merge conflicts', link: '/guide/merge-conflicts' },
          { text: 'Inline editing', link: '/guide/editing' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Vue', link: '/guide/vue' },
          { text: 'markstream-vue', link: '/markstream-vue' },
          { text: 'Framework recipes', link: '/guide/recipes' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API reference', link: '/api' },
          { text: 'Type reference', link: '/types' },
          { text: 'Performance', link: '/performance' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          { text: 'Contributing', link: '/guide/contributing' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: repo },
      { icon: 'npm', link: 'https://www.npmjs.com/package/stream-diffs' },
    ],
    search: {
      provider: 'local',
    },
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2025-present Simon He',
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
    outline: {
      level: [2, 3],
      label: 'On this page',
    },
    lastUpdated: {
      text: 'Last updated',
    },
  },
})
