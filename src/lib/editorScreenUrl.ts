import type { CategoryField } from './categories'

// Which of a category page editor's screens is open, in the address: a
// field's own screen, a step of Add a field, a card line's picker, the
// preview full size. Before this they were state only, the address the same
// on every one, so a reload or a Back from another tab came back to the
// page while the history still said the field: the next Back looked like it
// did nothing, Forward lost its place (the user, Nov 9: "these add a field
// pages seem to not register as a new page").
//
// The address is read on opening and on every Back and Forward, so where
// the browser is and what shows can't drift apart. It is written through
// Next's router, never history.pushState: an entry made behind the
// router's back carries the router's copy of the page before it, query and
// all, and after a reload Next's Back to such an entry from another tab
// changed the address and never drew the page (Nov 9, found walking it).

export type PickerScreen = { at: 'list' } | { at: 'look'; id: string } | { at: 'make'; name?: string }

export type EditorScreen = {
  /** A field by its key, '#3' for one not named yet (by its place), or the
   *  page's 'address' or 'phone'. */
  field?: string
  add?: PickerScreen
  /** The box whose "+ Add a field" opened the picker, so a reload or Back
   *  offers what lands in it, as the click did. */
  into?: string
  line?: 'second' | 'third'
  preview?: boolean
  /** The field's Remove step. Its count is kept in memory only: a reload
   *  goes back to the field, to count again. */
  remove?: boolean
}

const OURS = ['field', 'add', 'in', 'line', 'preview', 'remove'] as const

/** The address for a screen: this page's, its other parameters kept. */
export function screenHref(pathname: string, search: string, screen: EditorScreen): string {
  const params = new URLSearchParams(search)
  for (const key of OURS) params.delete(key)
  if (screen.field) params.set('field', screen.field)
  if (screen.add) params.set('add', screen.add.at === 'look' ? screen.add.id : screen.add.at)
  if (screen.add && screen.into) params.set('in', screen.into)
  if (screen.line) params.set('line', screen.line)
  if (screen.preview) params.set('preview', '1')
  if (screen.remove) params.set('remove', '1')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function screenFromSearch(search: string): EditorScreen {
  const params = new URLSearchParams(search)
  const screen: EditorScreen = {}
  const field = params.get('field')
  if (field) screen.field = field
  const add = params.get('add')
  if (add) screen.add = add === 'list' || add === 'make' ? { at: add } : { at: 'look', id: add }
  const into = params.get('in')
  if (add && into) screen.into = into
  const line = params.get('line')
  if (line === 'second' || line === 'third') screen.line = line
  if (params.get('preview') === '1') screen.preview = true
  if (params.get('remove') === '1') screen.remove = true
  return screen
}

/** How the address names a field: its key, or its place while it has none. */
export function fieldRef(fields: readonly CategoryField[], open: number | 'address' | 'phone'): string {
  return typeof open === 'number' ? fields[open]?.key || `#${open}` : open
}

/** The field the address names, in these fields; null when it isn't one
 *  (a field not saved, after a reload). */
export function fieldFromRef(fields: readonly CategoryField[], ref: string | undefined): number | 'address' | 'phone' | null {
  if (!ref) return null
  if (ref === 'address' || ref === 'phone') return ref
  const at = /^#(\d+)$/.exec(ref)
  if (at) {
    // Still that place once it's named: the address was written before.
    const i = Number(at[1])
    return i < fields.length ? i : null
  }
  const i = fields.findIndex((f) => f.key === ref)
  return i >= 0 ? i : null
}
