import type { Router } from 'vitepress'

const anchors: Record<string, string> = {
  CodeStreamController: 'codestreamcontroller',
  CodeStreamOptions: 'codestreamoptions',
  CodeStreamStats: 'codestreamstats',
  FinalizeOptions: 'finalizeoptions',
  DiffSurfaceController: 'diffsurfacecontroller',
  DiffSurfaceInput: 'diffsurfaceinput',
  DiffSurfaceEditor: 'diffsurfaceeditor',
  DiffStreamController: 'diffstreamcontroller',
  DiffStreamOptions: 'diffstreamoptions',
  createCodeStream: 'createcodestream',
  createDiffSurface: 'creatediffsurface',
  createDiffStream: 'creatediffstream',
}

export function installTypeLinks(router: Router) {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return

  let frame = 0

  const enhance = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      for (const token of document.querySelectorAll<HTMLElement>('.vp-doc .twoslash-hover')) {
        if (token.dataset.sdTypeLink)
          continue
        const label = token.querySelector<HTMLElement>(':scope > span')?.textContent?.trim()
        const anchor = label ? anchors[label] : undefined
        if (!label || !anchor)
          continue

        token.dataset.sdTypeLink = anchor
        token.setAttribute('role', 'link')
        token.setAttribute('aria-label', `Open ${label} in the API reference`)
        token.setAttribute('title', `${label} in the API reference`)

        const open = (event: Event) => {
          if (event.target instanceof Element && event.target.closest('.v-popper__popper'))
            return
          if (window.getSelection()?.toString().trim())
            return
          event.preventDefault()
          event.stopPropagation()
          window.location.assign(new URL(`api.html#${anchor}`, document.baseURI).href)
        }

        token.addEventListener('click', open)
        token.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            open(event)
          }
        })
      }
    })
  }

  const schedule = () => {
    enhance()
    setTimeout(enhance, 240)
    setTimeout(enhance, 900)
  }

  router.onAfterRouteChanged = schedule
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', schedule, { once: true })
  else
    schedule()
}
