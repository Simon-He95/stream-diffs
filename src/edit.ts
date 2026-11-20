/**
 * Opt-in editing surface, re-exported from `@pierre/diffs/edit`.
 *
 * `stream-diffs` renders read-only code and diffs; it does not own an editor
 * lifecycle. Hosts that want in-place editing attach an upstream `Editor` to
 * the native instance a controller already exposes:
 *
 * ```ts
 * import { createDiffSurface } from 'stream-diffs'
 * import { Editor } from 'stream-diffs/edit'
 *
 * const surface = createDiffSurface({ kind: 'diff', oldFile, newFile })
 * await surface.mount(container)
 * await surface.prepareForEditing()
 *
 * const editor = new Editor('file-diff', { onChange: event => save(event.file) })
 * const detach = editor.edit(surface.getNativeInstance()!)
 * ```
 *
 * Importing from this entry instead of `@pierre/diffs/edit` keeps the editor on
 * the same `@pierre/diffs` copy `stream-diffs` uses. The highlighter registry is
 * module-level, so a second copy cannot share it.
 *
 * This entry is a pass-through and is only loaded when imported; it adds
 * nothing to the eager runtime.
 */
export * from '@pierre/diffs/edit'
