// ─────────────────────────────────────────────────────────────────────────────
// The pure half of the activity log: what counts as something happening, who
// did it, and which grocery items an approved edit newly vouches for.
//
// The log (activityStore.ts) is groundwork. Nothing public reads it yet, but
// the "This week" strip, credit on listings and contributor counts will, and
// they need a history that started before anyone asked for it.
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIVITY_KINDS = [
  'listing_added',
  'listing_edited',
  'listing_removed',
  'listing_confirmed',
  'item_added',
  'item_confirmed',
  'item_reported_gone',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/** Who a row is from: a visitor's one tap, an approved submission, or the
 *  Google Places sync (its closure reports go through the queue too). */
export type ActivitySource = 'visitor' | 'submission' | 'google'

export type ActivityInput = {
  community: string
  resourceId?: string | null
  kind: ActivityKind
  source: ActivitySource
  fieldKey?: string
  item?: string
  actorEmail?: string | null
  submissionId?: string | null
}

/** The name submitGoogleClosure files its reports under. */
export const GOOGLE_SUBMITTER_NAME = 'Google Places (automated)'

/** The email a submitter typed, as the key their contributions are counted
 *  by, or null. It's unverified, so it is only ever a way to group someone's
 *  edits, never proof of who they are. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function sourceOfSubmission(submittedBy: { name?: string; email?: string } | null | undefined): ActivitySource {
  return submittedBy?.name === GOOGLE_SUBMITTER_NAME ? 'google' : 'submission'
}

// ── Grocery items ────────────────────────────────────────────────────────────
// A `tags` field ("Kosher items here") stores plain labels, plus a
// `<key>_sometimes` companion for items that come and go. Each label gets its
// own "last seen" date in details.itemSeen, so a search can say "seen 2 days
// ago" about challah at one store without vouching for the whole store.

export type ItemSeen = Record<string, Record<string, string>>

/** The detail keys that hold items for these fields. */
export function itemFieldKeys(fields: ReadonlyArray<{ key: string; type: string }>): string[] {
  return fields.filter((f) => f.type === 'tags').flatMap((f) => [f.key, `${f.key}_sometimes`])
}

function itemsOf(details: Record<string, unknown> | null | undefined, key: string): string[] {
  const raw = details?.[key]
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const label = v.trim()
    const k = label.toLowerCase()
    if (!label || seen.has(k)) continue
    seen.add(k)
    out.push(label)
  }
  return out
}

/** Items present after an edit that weren't there before, per field. Case
 *  doesn't make an item new: "challah" retyped as "Challah" isn't news. */
export function addedItems(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys: string[],
): { fieldKey: string; item: string }[] {
  const out: { fieldKey: string; item: string }[] = []
  for (const key of keys) {
    const had = new Set(itemsOf(before, key).map((i) => i.toLowerCase()))
    for (const item of itemsOf(after, key)) {
      if (!had.has(item.toLowerCase())) out.push({ fieldKey: key, item })
    }
  }
  return out
}

const ISO = /^\d{4}-\d{2}-\d{2}T/

/** The itemSeen map after an approved edit: every item added now is dated
 *  `now`; items that stayed keep their date (an edit to a store's hours says
 *  nothing about its challah); items that were removed lose theirs. Anything
 *  malformed in the previous map is dropped rather than carried forward.
 *
 *  Always computed on the server from the stored row, never taken from the
 *  submission, so nobody can post a made-up "seen today". */
export function nextItemSeen(
  previous: unknown,
  after: Record<string, unknown> | null | undefined,
  keys: string[],
  added: { fieldKey: string; item: string }[],
  now: string,
): ItemSeen {
  const prev = previous && typeof previous === 'object' ? (previous as Record<string, unknown>) : {}
  const next: ItemSeen = {}
  for (const key of keys) {
    const items = itemsOf(after, key)
    if (items.length === 0) continue
    const prevField = prev[key] && typeof prev[key] === 'object' ? (prev[key] as Record<string, unknown>) : {}
    const prevByLower = new Map<string, string>()
    for (const [label, date] of Object.entries(prevField)) {
      if (typeof date === 'string' && ISO.test(date)) prevByLower.set(label.toLowerCase(), date)
    }
    const addedHere = new Set(added.filter((a) => a.fieldKey === key).map((a) => a.item.toLowerCase()))
    const field: Record<string, string> = {}
    for (const item of items) {
      const lower = item.toLowerCase()
      const date = addedHere.has(lower) ? now : prevByLower.get(lower)
      if (date) field[item] = date
    }
    if (Object.keys(field).length > 0) next[key] = field
  }
  return next
}

// ── Search misses ────────────────────────────────────────────────────────────

/** A search that found nothing, reduced to what's worth counting, or null
 *  when it shouldn't be stored at all. People type all sorts into a search
 *  box; anything that looks like an email or a phone number is dropped, so
 *  the admin's "searches that found nothing" list never holds personal
 *  details. */
export function normalizeSearchMiss(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const q = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (q.length < 3 || q.length > 60) return null
  if (q.includes('@')) return null
  // Seven or more digits in one run (spaces, dots, dashes and brackets
  // allowed between them) reads as a phone number. A house number and a zip
  // code separated by a street name don't.
  if (/(?:\d[\s().-]*){7,}/.test(q)) return null
  return q
}

/** A date as YYYY-MM-DD where the community is, so a daily count means that
 *  community's day and not UTC's (in Philadelphia, UTC's day turns over at
 *  7 or 8 in the evening). */
export function dayInTimezone(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
