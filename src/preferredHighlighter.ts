import type { DiffsThemeNames, HighlighterTypes, SupportedLanguages, ThemesType } from '@pierre/diffs'

/**
 * `auto` picks the WASM `highlights` backend when the platform can run it and
 * falls back to `shiki-js` when it cannot.
 *
 * The decision is app-wide, not per surface: `@pierre/diffs` keeps one shared
 * highlighter per thread and the first caller fixes the backend, so every later
 * value would be ignored. A per-block rule therefore cannot work.
 */
export type PreferredHighlighterOption = HighlighterTypes | 'auto'

export interface PreferredHighlighterContext {
  themes?: DiffsThemeNames | ThemesType
  langs?: SupportedLanguages[]
}

const FALLBACK: HighlighterTypes = 'shiki-js'

let decision: Promise<HighlighterTypes> | undefined

function themeNames(themes?: DiffsThemeNames | ThemesType): DiffsThemeNames[] {
  if (!themes)
    return []
  if (typeof themes === 'string')
    return [themes]
  return [themes.dark, themes.light]
}

/**
 * Resolves `auto` once per page and caches the answer. Any failure while
 * creating the WASM highlighter (missing SIMD, a CSP without
 * `wasm-unsafe-eval`, a failed chunk load, or a grammar that cannot load)
 * downgrades to `shiki-js` instead of surfacing an error to the caller.
 */
export async function resolvePreferredHighlighter(
  context: PreferredHighlighterContext = {},
): Promise<HighlighterTypes> {
  decision ??= decide(context).catch(() => FALLBACK)
  return decision
}

async function decide(context: PreferredHighlighterContext): Promise<HighlighterTypes> {
  const mod = await import('@pierre/diffs')
  if (mod.canUseWASM?.() !== true)
    return FALLBACK

  const themes = themeNames(context.themes)
  const langs = context.langs ?? []
  try {
    const highlighter = await mod.getSharedHighlighter({
      themes: themes.length ? themes : ['pierre-dark'],
      langs,
      preferredHighlighter: 'highlights',
    })
    // A concurrent surface may have created the shared instance first; report
    // what the registry actually holds rather than what we asked for.
    return highlighter.name
  }
  catch {
    return FALLBACK
  }
}

/** Test seam: forget the cached decision. */
export function resetPreferredHighlighterDecision() {
  decision = undefined
}

/**
 * Applies `auto` to a concrete backend. Concrete values pass through untouched
 * so an explicit choice is never overridden.
 */
export async function applyPreferredHighlighter<T extends { preferredHighlighter?: PreferredHighlighterOption } | undefined>(
  options: T,
  context: PreferredHighlighterContext = {},
): Promise<T> {
  const requested = options?.preferredHighlighter
  if (requested !== 'auto')
    return options

  const resolved = await resolvePreferredHighlighter(context)
  return { ...options, preferredHighlighter: resolved } as T
}
