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

/** A place's own website: its category's first web-address field in the
 *  form's basics (Website), or one keyed "website". */
export function menuWebsite(listing: Record<string, unknown>, category: CategoryConfig): string | null {
  const field = category.detailFields.find((f) => f.type === 'url' && f.coreSection) ?? category.detailFields.find((f) => f.key === 'website')
  const url = field ? listing[field.key] : null
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : null
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** A menu read somewhere other than the place's own site, and not a PDF
 *  it links to: its website may have moved, lapsed or been taken over
 *  (one in Philly's guide now sends visitors to a gambling site). Its menu
 *  link is wherever someone said the menu is, so that's never elsewhere. */
export function readElsewhere(source: string | null, website: string | null, menuUrl: string | null): boolean {
  if (!source || !website || /\.pdf($|\?)/i.test(source)) return false
  if (menuUrl && hostOf(source) === hostOf(menuUrl)) return false
  const a = hostOf(source)
  const b = hostOf(website)
  return !!a && !!b && a !== b && !a.endsWith(`.${b}`) && !b.endsWith(`.${a}`)
}
