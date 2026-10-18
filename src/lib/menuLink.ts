import { itemsField } from './listingView'
import { itemWording } from './itemMarks'
import { isHttpUrl, normalizeUrl } from './validation'
import type { CategoryConfig, CategoryField } from './categories'

// ── A food place's menu link (the user, Oct 17) ─────────────────────────────
// The "Full menu" link beside a place's Main dishes, stored as
// details.menuUrl. It used to be set only when dishes were read off a menu
// (the admin's Main dishes tab, or a link sent in the "+ Add" box), so a
// place whose menu nobody had read had nowhere to put one. Now anyone can
// suggest it in Edit listing, on the Main dishes screen, and the moderation
// queue shows it like any other field.
//
// It isn't one of a category's own fields: it belongs to whichever list of
// dishes a category keeps (a grocery's items have no menu), so it needs no
// admin setup. It stays on the app's list of kept keys (syncFields.ts),
// because an edit is built from the category's fields and would otherwise
// wipe it; a submitter's own link is let through by submitterDetails.

export const MENU_LINK_KEY = 'menuUrl'
export const MENU_LINK_LABEL = 'Menu link'

/** The editor's input for it, on the Main dishes screen: a web address
 *  like any other link field. */
export const MENU_LINK_FIELD: CategoryField = {
  key: MENU_LINK_KEY,
  label: MENU_LINK_LABEL,
  type: 'url',
  placeholder: 'Their menu page or PDF',
}

/** Whether a category keeps a menu link: its list of items is dishes. */
export function keepsMenuLink(category: CategoryConfig | null | undefined): boolean {
  const field = category ? itemsField(category) : null
  return !!field && itemWording(field).noun === 'dish'
}

/** A menu link as sent: a web address, tidied ("example.com/menu" gets its
 *  https://), or '' to take the link off. Anything else (another scheme, a
 *  sentence, an object) is undefined: not a menu link at all. */
export function readMenuLink(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim()
  if (!v) return ''
  const url = normalizeUrl(v)
  if (url.length > 2000 || /\s/.test(url) || !isHttpUrl(url)) return undefined
  try {
    // A host with a dot in it: "https://menu" is a word typed in the box.
    return new URL(url).hostname.includes('.') ? url : undefined
  } catch {
    return undefined
  }
}
