// ─────────────────────────────────────────────────────────────────────────────
// The Keystone-K watch (freshness map, decided Oct 5).
//
// Keystone-K publishes one page listing every place it certifies. Once a day
// the cron reads that page and compares it with the guide's food and grocery
// listings. Every difference becomes an ordinary suggestion in the moderation
// queue, with the list's own words in its note, so an admin checks it against
// the source before anything changes. Nothing here writes to a listing.
//
// Code does all of it, no AI: the page is regular enough to read, and the
// matching is by Keystone-K's own link (details.k) first, then by name with
// the street number as a guard, never a guess.
//
// Three kinds of finding:
//   update  a place on both: the guide is missing Keystone-K, its link, or
//           the Meat / Dairy / Parve the list gives
//   gone    a place the guide says Keystone-K certifies that the list no
//           longer has. Approving takes Keystone-K off it.
//   new     a place on the list the guide doesn't have
// ─────────────────────────────────────────────────────────────────────────────

import { selectValues } from './categories'

export const KEYSTONE_LIST_URL = 'https://keystone-k.org/establishments/'
export const KEYSTONE_CERT = 'Keystone-K'
/** submitted_by.name on every suggestion the watch makes. */
export const KEYSTONE_WATCH_NAME = 'Keystone-K list (automated)'

export type Level = 'Meat' | 'Dairy' | 'Parve'

export type KeystoneEntry = {
  slug: string
  url: string
  name: string
  /** The list's own sections: restaurants, bakeries, sweets, caterers, groceries, miscellaneous. */
  kinds: string[]
  /** When Keystone-K last edited the entry, as the page states it. */
  updated: string | null
  address: string
  phone: string
  website: string | null
  /** What the entry says about its certification, in its own words. */
  certification: string
  levels: Level[]
}

/** The fields of a listing the watch reads. */
export type WatchedListing = {
  id: string
  category: string
  name: string
  address: string | null
  phone: string | null
  anchor_id: string
  distance: number | null
  details: Record<string, unknown>
}

export type WatchFinding =
  | { kind: 'update'; listing: WatchedListing; entry: KeystoneEntry; details: Record<string, unknown>; changes: string[] }
  | { kind: 'gone'; listing: WatchedListing; details: Record<string, unknown>; related: KeystoneEntry | null }
  | { kind: 'new'; entry: KeystoneEntry; category: 'restaurant' | 'grocery'; details: Record<string, unknown> }

// ── Reading the page ─────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&#038;': '&', '&nbsp;': ' ', '&#8211;': '–', '&#8212;': '—',
  '&#8216;': '‘', '&#8217;': '’', '&#8220;': '"', '&#8221;': '"', '&quot;': '"', '&#39;': "'",
}

function decode(s: string): string {
  return s.replace(/&#?\w+;/g, (m) => ENTITIES[m] ?? m)
}

/** One line per paragraph or line break, tags gone. */
function lines(html: string): string[] {
  return decode(
    html
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/(p|h\d|div|li)>/g, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const PHONE = /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/
const BENEFIT = /membership benefit|keystone-k members/i

/** Meat, Dairy and Parve named anywhere in the words, Hebrew included. */
export function levelsIn(text: string): Level[] {
  // "Cholov Yisrael and Pas Yisrael are available upon request" says what
  // can be ordered, not what the place is.
  const t = text
    .toLowerCase()
    .split(/[.;/]/)
    .filter((part) => !/available|request/.test(part))
    .join(' ')
  const out: Level[] = []
  if (/\b(meat|glatt|fleishig)\b|בשר/.test(t)) out.push('Meat')
  if (/\b(dairy|cholov|chalav|milchig)\b|חלב/.test(t)) out.push('Dairy')
  if (/\b(pareve|parve)\b|פרווה/.test(t)) out.push('Parve')
  return out
}

/** Every establishment on Keystone-K's list. The page is edited by hand, so
 *  each entry's text is read whole rather than trusted to one layout. */
export function parseKeystoneList(html: string): KeystoneEntry[] {
  const entries: KeystoneEntry[] = []
  for (const article of html.split('<article ').slice(1)) {
    const link = article.match(/href="(https:\/\/keystone-k\.org\/kosher\/([a-z0-9-]+)\/)"/)
    if (!link) continue
    const title = article.match(/class="entry-title[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)
    const name = title ? lines(title[1]).join(' ') : ''
    if (!name) continue
    const kinds = (article.match(/class="fusion-portfolio-post ([^"]*?)\s*fusion-col-spacing/)?.[1] ?? '')
      .split(/\s+/)
      .filter(Boolean)
    const updated = article.match(/class="updated[^"]*">([^<]+)</)?.[1]?.trim() ?? null

    const bodyStart = article.indexOf('panel-body')
    const body = bodyStart < 0 ? '' : article.slice(article.indexOf('>', bodyStart) + 1).split(/<style|<\/article>/)[0]
    const website = body.match(/<a href="(https?:\/\/(?!keystone-k\.org)[^"]+)"[^>]*>\s*(?:Website|https?:)/i)?.[1] ?? null

    const all = lines(body)
    // The entry repeats its name as a heading first; drop it.
    const rest = all[0] && name.toLowerCase().startsWith(all[0].toLowerCase().slice(0, 8)) ? all.slice(1) : all
    const benefitAt = rest.findIndex((l) => BENEFIT.test(l))
    const kept = benefitAt < 0 ? rest : rest.slice(0, benefitAt)

    const certAt = kept.findIndex((l) => /^kosher certification:?/i.test(l))
    const certification = (
      certAt >= 0
        ? [kept[certAt].replace(/^kosher certification:?\s*/i, ''), ...kept.slice(certAt + 1)]
        : kept.filter((l) => levelsIn(l).length > 0 || /kosher|pas yis|cholov|yoshon/i.test(l))
    )
      .filter((l) => l && !/^website$/i.test(l) && !/^https?:/i.test(l))
      .join(', ')
      .trim()

    const head = certAt >= 0 ? kept.slice(0, certAt) : kept
    const phone = head.find((l) => PHONE.test(l)) ?? ''
    const contactAt = head.findIndex((l) => PHONE.test(l) || /^website$/i.test(l) || /^https?:/i.test(l))
    const address = (contactAt < 0 ? head : head.slice(0, contactAt))
      .filter((l) => /\d/.test(l) && levelsIn(l).length === 0)
      .join(', ')

    entries.push({
      slug: link[2],
      url: link[1],
      name,
      kinds,
      updated,
      address,
      phone,
      website,
      certification,
      levels: levelsIn(certification),
    })
  }
  // The page shows some entries more than once (one per section).
  const seen = new Set<string>()
  return entries.filter((e) => (seen.has(e.slug) ? false : (seen.add(e.slug), true)))
}

// ── Matching ─────────────────────────────────────────────────────────────────

const NAME_NOISE = new Set(['the', 'and', 'kosher', 'inc', 'llc', 'co', 'company'])

/** A name with branch suffixes ("– Cherry Hill"), punctuation and filler words gone. */
export function baseName(name: string): string {
  return name
    .split(/\s+[–—-]\s+/)[0]
    .replace(/\(.*?\)/g, ' ')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !NAME_NOISE.has(w))
    .join(' ')
}

function streetNumber(address: string | null): string | null {
  return address?.match(/^\s*(\d+)/)?.[1] ?? null
}

/** Keystone-K's page for a listing, from its certification link. */
export function keystoneSlug(details: Record<string, unknown>): string | null {
  return String(details.k ?? '').match(/keystone-k\.org\/kosher\/([a-z0-9-]+)/)?.[1] ?? null
}

function claimsKeystone(listing: WatchedListing): boolean {
  return selectValues(listing.details.kosherCert).includes(KEYSTONE_CERT) || keystoneSlug(listing.details) !== null
}

/** The same place by name: equal names (with no clash of street numbers),
 *  or one name inside the other at the same street number ("Chalavita" and
 *  "Chalavita Kosher Dairy Catering", both at 198 Tomlinson Rd). */
function sameByName(listing: WatchedListing, entry: KeystoneEntry): boolean {
  const ours = baseName(listing.name)
  const theirs = baseName(entry.name)
  if (!ours || !theirs) return false
  const a = streetNumber(listing.address)
  const b = streetNumber(entry.address)
  if (ours === theirs) return !a || !b || a === b
  return !!a && a === b && (ours.startsWith(`${theirs} `) || theirs.startsWith(`${ours} `))
}

/** A listing's entry on the list: by its Keystone-K link while that page is
 *  still on the list, otherwise by name. A link the list no longer has (the
 *  page was renamed, "Wells Fargo Center" to "Xfinity Center") falls back to
 *  the name, so a moved page reads as a moved link, not a lost hechsher. */
function entryFor(listing: WatchedListing, entries: KeystoneEntry[]): KeystoneEntry | undefined {
  const slug = keystoneSlug(listing.details)
  return (slug ? entries.find((e) => e.slug === slug) : undefined) ?? entries.find((e) => sameByName(listing, e))
}

const GENERIC_WORDS = new Set(['grill', 'grille', 'catering', 'bakery', 'cafe', 'restaurant', 'philadelphia', 'pizza', 'pizzeria', 'kitchen', 'deli', 'market', 'foods', 'food'])

/** An entry that shares a distinctive word with the name: shown beside a
 *  "gone" card as a possible new name for the same business. */
function relatedEntry(listing: WatchedListing, entries: KeystoneEntry[]): KeystoneEntry | null {
  const words = baseName(listing.name).split(' ').filter((w) => w.length >= 5 && !GENERIC_WORDS.has(w))
  return entries.find((e) => baseName(e.name).split(' ').some((w) => words.includes(w))) ?? null
}

const FOOD_KINDS: Record<string, string> = {
  restaurants: 'Restaurant',
  caterers: 'Catering',
  bakeries: 'Bakery',
  sweets: 'Ice Cream & Treats',
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

/** Every difference between Keystone-K's list and the guide. */
export function compareKeystone(entries: KeystoneEntry[], listings: WatchedListing[]): WatchFinding[] {
  const findings: WatchFinding[] = []
  const matched = new Set<string>()

  for (const listing of listings) {
    const entry = entryFor(listing, entries)
    if (entry) matched.add(entry.slug)

    if (!entry) {
      if (listing.category !== 'restaurant' || !claimsKeystone(listing)) continue
      const details = { ...listing.details }
      const certs = selectValues(details.kosherCert).filter((c) => c !== KEYSTONE_CERT)
      details.kosherCert = certs
      if (keystoneSlug(details) || /keystone-k\.org/.test(String(details.k ?? ''))) delete details.k
      findings.push({ kind: 'gone', listing, details, related: relatedEntry(listing, entries) })
      continue
    }

    // Groceries carry no certification fields: being on the list is all.
    if (listing.category !== 'restaurant') continue
    const details = { ...listing.details }
    const changes: string[] = []
    const certs = selectValues(details.kosherCert)
    if (!certs.includes(KEYSTONE_CERT)) {
      details.kosherCert = [...certs, KEYSTONE_CERT]
      changes.push(`add ${KEYSTONE_CERT}`)
    }
    const slug = keystoneSlug(details)
    // A link to the place's own certificate stays: it's better than the list's page.
    const keystoneLinkOrNone = !details.k || /keystone-k\.org/.test(String(details.k))
    if (slug !== entry.slug && keystoneLinkOrNone) {
      details.k = entry.url
      changes.push(slug ? 'its Keystone-K page has moved' : 'link to its Keystone-K page')
    }
    const ours = selectValues(details.t)
    if (entry.levels.length > 0 && !sameSet(ours, entry.levels)) {
      details.t = entry.levels
      changes.push(ours.length ? `${ours.join(', ')} → ${entry.levels.join(', ')}` : entry.levels.join(', '))
    }
    if (changes.length > 0) findings.push({ kind: 'update', listing, entry, details, changes })
  }

  for (const entry of entries) {
    if (matched.has(entry.slug)) continue
    const food = entry.kinds.filter((k) => FOOD_KINDS[k])
    const grocery = entry.kinds.includes('groceries')
    if (!grocery && food.length === 0) continue // wholesale products, a tofu maker: not places to go
    if (grocery) {
      findings.push({
        kind: 'new',
        entry,
        category: 'grocery',
        details: { isKosher: 'Kosher Items', ...(entry.website ? { website: entry.website } : {}) },
      })
    } else {
      findings.push({
        kind: 'new',
        entry,
        category: 'restaurant',
        details: {
          kosherCert: [KEYSTONE_CERT],
          k: entry.url,
          foodType: food.map((k) => FOOD_KINDS[k]),
          ...(entry.levels.length ? { t: entry.levels } : {}),
          ...(entry.website ? { website: entry.website } : {}),
        },
      })
    }
  }
  return findings
}

// ── What the admin reads ─────────────────────────────────────────────────────

/** The card's note: what the list says, word for word, and where. */
export function findingNote(f: WatchFinding): string {
  if (f.kind === 'gone') {
    const lines = [
      `Not on Keystone-K's list of the places it certifies today: ${KEYSTONE_LIST_URL}`,
      'Approving takes Keystone-K off this place. Rejecting keeps it.',
    ]
    if (f.related) lines.push(`The list does have "${f.related.name}" (${f.related.url}). The same business under a new name?`)
    return lines.join('\n')
  }
  const said = [
    `Keystone-K's list says: "${f.entry.name}"`,
    f.entry.address && `at ${f.entry.address}`,
    f.entry.certification && `Certification: "${f.entry.certification}"`,
    f.entry.updated && `Updated on the list ${f.entry.updated.slice(0, 10)}`,
    f.entry.url,
  ].filter(Boolean)
  if (f.kind === 'update') return [`From Keystone-K's list: ${f.changes.join('; ')}.`, ...said].join('\n')
  return ['On Keystone-K’s list, not in the guide.', ...said].join('\n')
}

/** A stable description of what a finding proposes, so the same suggestion
 *  isn't made twice: once rejected, it stays rejected until the list or the
 *  guide changes what it would propose. */
export function findingKey(f: WatchFinding): string {
  if (f.kind === 'new') return `new:${f.entry.slug}`
  const d = f.details
  return `${f.kind}:${f.listing.id}:${proposal(d)}`
}

/** The same key, read back from a suggestion the watch made earlier. */
export function submissionKey(s: {
  operation: string
  target_id: string | null
  payload: Record<string, unknown>
  note?: string | null
}): string | null {
  const details = (s.payload.details ?? {}) as Record<string, unknown>
  if (s.operation === 'create') {
    // A grocery has no certificate link, so its entry is read from the note.
    const slug = keystoneSlug(details) ?? keystoneSlug({ k: s.note ?? '' })
    return slug ? `new:${slug}` : null
  }
  if (!s.target_id) return null
  const kind = selectValues(details.kosherCert).includes(KEYSTONE_CERT) ? 'update' : 'gone'
  return `${kind}:${s.target_id}:${proposal(details)}`
}

function proposal(d: Record<string, unknown>): string {
  return JSON.stringify([[...selectValues(d.kosherCert)].sort(), d.k ?? null, [...selectValues(d.t)].sort()])
}
