// ── Google, a job on the Watches tab (the user, Oct 22) ─────────────────────
// Google sync coverage moved here from Metrics, as a job page like the
// others (drawing 6gCnW6nVTDXySkcYENvAqF). Google writes the fields it keeps
// on its own every morning, so this page isn't about updates: it shows,
// field by field, whether Google, the listing's website, or nothing checks
// it. The user: "with google you can have some fields checked by google and
// some not."
//
// Who checks a field comes from each job's own rule, never a list kept
// here (googleJobRun.ts works it out): Google, when the listing has a match
// and Google keeps that field; its website, when a job reads a page there
// that loads; you, when an admin kept the listing's own after comparing it
// with Google, or said it isn't on Google. Only Google checks a name.
// Descriptions are left out, and the address is never checked.
//
// Google is asked only on a tap: Check against Google and Find it on Google
// are one paid call each. Nothing is asked when the page opens.

/** The fields this page is about. */
export type CheckedField = 'name' | 'hours' | 'phone' | 'website'
export const CHECKED_FIELDS: readonly CheckedField[] = ['name', 'hours', 'phone', 'website']
export const CHECKED_LABELS: Record<CheckedField, string> = { name: 'Name', hours: 'Hours', phone: 'Phone', website: 'Website' }

/** Who checks a field: `at`, for you, when you said so; for Google, when it
 *  last answered, shown only once it has stopped answering; for the Links
 *  job (a website only, that it opens each week), when it last opened. */
export type Checker = { kind: 'google' | 'website' | 'you' | 'links' | 'nothing'; at?: string | null }

export type GoogleFieldRow = { field: CheckedField; label: string; value: string; by: Checker }

/** Google's version beside the listing's, after Check against Google or a
 *  pick on Find it on Google. `changed`: a field nothing else checks where
 *  Google says otherwise; `none`, Google has nothing for it; `raw`, Google's
 *  value as the listing would hold it (Edit's preset). */
export type GoogleCompareRow = { field: CheckedField; label: string; google: string; changed: boolean; none?: boolean; raw?: unknown }
export type GoogleCompare = { at: string; rows: GoogleCompareRow[] }

export type GoogleSection = 'to_check' | 'cant_read' | 'checked'

export type GoogleClosure = {
  status: 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  shownOpen: boolean
  since: string | null
  /** Google is asked whether a place is open more often than for its fields. */
  readAt: string | null
  /** When an admin said Keep closed, since Google last changed its answer. */
  kept: string | null
}

/** A closure waits for the admin: shown on the site at once, Keep closed or
 *  Show as open decides it. A later change of Google's asks again. */
export const closureWaits = (c: GoogleClosure | null): c is GoogleClosure => !!c && !c.shownOpen && !c.kept

export type GooglePlace = {
  id: string
  name: string
  /** Its street, when another listing here has the same name ("GIANT ·
   *  Huntingdon Pike"). */
  street: string | null
  address: string | null
  category: string
  categoryLabel: string
  href: string
  /** It has a Google match. */
  matched: boolean
  section: GoogleSection
  fields: GoogleFieldRow[]
  /** When Google last answered for it, and, failing, when it didn't. */
  readAt: string | null
  failedAt: string | null
  notOnGoogle: string | null
  closure: GoogleClosure | null
  /** What a check left to decide, while it's fresh. */
  compare: GoogleCompare | null
  /** Use Google's or Keep the listing, and when. */
  decided?: { what: 'used' | 'kept'; at: string } | null
}

/** A place's tab: Google stopped answering for its match; a field nothing
 *  checks; or everything checked. */
export function googleSection(p: { matched: boolean; failing: boolean; fields: readonly Pick<GoogleFieldRow, 'by'>[] }): GoogleSection {
  if (p.matched && p.failing) return 'cant_read'
  return p.fields.some((f) => f.by.kind === 'nothing') ? 'to_check' : 'checked'
}

const CLOSED_TEXT = { CLOSED_TEMPORARILY: 'Closed for now', CLOSED_PERMANENTLY: 'Closed for good' } as const
export const closureText = (c: GoogleClosure) => (c.shownOpen ? 'Shown as open' : CLOSED_TEXT[c.status])

/** A category's Website field: the url field it calls Website, the one the
 *  morning's sync writes. */
export const websiteKeyOf = (category: { detailFields: readonly { key: string; type: string; label: string }[] }) =>
  category.detailFields.find((f) => f.type === 'url' && f.label.trim().toLowerCase() === 'website')?.key

/** "2200 Huntingdon Pike, Huntingdon Valley, PA" → "Huntingdon Pike";
 *  "1001-29 S Broad St" → "S Broad St". */
export function streetOf(address: string | null | undefined): string | null {
  const first = address?.split(',')[0]?.trim()
  if (!first) return null
  return first.replace(/^\d+[a-z]?(?:-\d+[a-z]?)?\s+/i, '') || first
}

/** The counts for its row on the Watches tab. */
export function googleCounts(places: readonly Pick<GooglePlace, 'section'>[]): { checked: number; toCheck: number; cantRead: number; didntLoad: number } {
  const n = (s: GoogleSection) => places.filter((p) => p.section === s).length
  return { checked: n('checked'), toCheck: n('to_check'), cantRead: n('cant_read'), didntLoad: 0 }
}
