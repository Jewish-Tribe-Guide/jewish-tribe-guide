// ─────────────────────────────────────────────────────────────────────────────
// The Mekor Habracha watch (Oct 18).
//
// Mekor Habracha keeps a list of the kosher places in Center City, the Main
// Line, Old York Road / the Northeast and Cherry Hill, with the hechsher of
// each (the guide was first seeded from it). Once a day the cron reads that
// page and compares it with the guide's food and grocery listings, the way
// Keystone-K's list is read (keystoneWatch.ts). Every difference becomes an
// ordinary suggestion in the moderation queue with Mekor's own words in its
// note. Nothing here writes to a listing, and nothing is ever removed: the
// guide is quicker to edit than Mekor's list and is often ahead of it.
//
// Code does all of it, no AI. A place on Mekor is matched to a listing by
// its certificate link first (only a link no other place on Mekor has, and
// only when the name, street number or phone agrees too: Keystone-K's home
// page stands in for the certificate of half a dozen places), then by name
// with the street number as a guard, then by street number or phone with a
// word of the name. Never a guess: a place that matches two listings
// equally is left alone.
//
// Three kinds of finding:
//   new        on Mekor, not in the guide (or only archived in it)
//   hechsher   on both, and the guide shows a hechsher Mekor doesn't, or
//              lacks one Mekor gives. The user, Oct 18: above all, the
//              guide must not say IKC where it isn't. Keystone-K is never
//              added or taken off here: Keystone-K's own list is the
//              authority on Keystone-K, and its watch reads it daily.
//   only-here  a listing the guide says is IKC that Mekor doesn't list at
//              all, for a person to check (Zevi's Bakery's own site says
//              IKC; Mekor just hasn't added it).
// ─────────────────────────────────────────────────────────────────────────────

import { selectValues } from './categories'
import { KEYSTONE_CERT, baseName, levelsIn, type Level, type WatchedListing } from './keystoneWatch'

export const MEKOR_LIST_URL = 'https://www.mekorhabracha.org/center-city'
export const MEKOR_NAME = 'Mekor Habracha'
/** submitted_by.name on every suggestion the watch makes. */
export const MEKOR_WATCH_NAME = 'Mekor Habracha list (automated)'

const IKC = 'IKC'
const OTHER = 'Other Kosher'

/** Mekor's kosher directory: mekorhabracha.org/center-city. */
export function isMekorList(url: string): boolean {
  try {
    const u = new URL(url)
    return /^(www\.)?mekorhabracha\.org$/i.test(u.hostname) && /^\/center-city\/?$/i.test(u.pathname)
  } catch {
    return false
  }
}

export type MekorEntry = {
  /** From its "Details" link, /post/<slug>. */
  slug: string
  url: string
  name: string
  /** The card's first tag: "Center City & Vicinity", "Cherry Hill", … */
  neighborhood: string
  /** The rest: Restaurants, Bakery, Cafe, Ice Cream, Catering, Parve, … */
  kinds: string[]
  /** Its Supervision line, word for word. */
  supervision: string
  /** The same, as the guide's hechsher options. */
  certs: string[]
  address: string
  /** Ten digits, or ''. */
  phone: string
  website: string | null
  certificate: string | null
}

/** A food or grocery listing, live or archived. */
export type GuideListing = WatchedListing & { status: string }

/** A new place already waiting in the moderation queue, from anyone. */
export type PendingCreate = { id: string; name: string; address: string | null; phone: string | null; details: Record<string, unknown> }

export type MekorFinding =
  | { kind: 'new'; entry: MekorEntry; details: Record<string, unknown>; archived: GuideListing | null }
  | { kind: 'hechsher'; entry: MekorEntry; listing: GuideListing; details: Record<string, unknown>; removed: string[]; added: string[] }
  | { kind: 'only-here'; listing: GuideListing; details: Record<string, unknown> }

// ── Reading the page ─────────────────────────────────────────────────────────

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] !== '#') return NAMED[code.toLowerCase()] ?? m
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return Number.isFinite(n) ? String.fromCodePoint(n) : m
  })
}

function text(html: string): string {
  return decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** An element's inner HTML by the stable end of its class name: the page's
 *  CSS-module classes carry a hash ("kosher-directory-module__ijl0tG__card")
 *  that changes with every deploy of Mekor's site. */
function byClass(html: string, name: string, tag = '[a-z0-9]+'): string[] {
  const re = new RegExp(`<(${tag})\\b[^>]*class="[^"]*__${name}"[^>]*>([\\s\\S]*?)</\\1>`, 'g')
  return [...html.matchAll(re)].map((m) => m[2])
}

/** The hechsher options of the guide's restaurant category, from Mekor's
 *  Supervision line. A supervisor the guide has no option for is "Other
 *  Kosher". */
export function certsIn(supervision: string): string[] {
  const s = supervision.toLowerCase()
  if (!s.trim()) return []
  const out: string[] = []
  if (/\bikc\b/.test(s)) out.push(IKC)
  if (/keystone[\s-]?k\b/.test(s)) out.push(KEYSTONE_CERT)
  if (/cherry[\s-]?k\b/.test(s)) out.push('Cherry-K')
  if (/\bkcl\b/.test(s)) out.push('KCL')
  if (/\bstar[\s-]?k\b/.test(s)) out.push('Star-K')
  if (/\bkof[\s-]?k\b/.test(s)) out.push('Kof-K')
  if (/\bcrc\b/.test(s)) out.push('cRc')
  if (/\bou\b|orthodox union/.test(s)) out.push('OU')
  return out.length ? out : [OTHER]
}

/** Every place on Mekor's list, and the list's "Last Updated" date. */
export function parseMekorList(html: string): { updated: string | null; entries: MekorEntry[] } {
  const updated = html.match(/Last Updated:\s*(?:<!--\s*-->\s*)?(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  const entries: MekorEntry[] = []
  const seen = new Set<string>()
  for (const card of html.split('<article').slice(1)) {
    const article = card.split('</article>')[0]
    if (!/^[^>]*class="[^"]*__card"/.test(article)) continue
    const slug = article.match(/href="\/post\/([^"/?#]+)"/)?.[1]
    const name = text(byClass(article, 'cardTitle')[0] ?? '')
    if (!slug || !name || seen.has(slug)) continue
    seen.add(slug)

    const tags = byClass(article, 'tag').map(text).filter(Boolean)
    const facts = new Map<string, string>()
    const dl = article.match(/<dl\b[\s\S]*?<\/dl>/)?.[0] ?? ''
    for (const m of dl.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)) facts.set(text(m[1]).toLowerCase(), m[2])
    const supervision = text(facts.get('supervision') ?? '')
    const phoneHtml = facts.get('phone') ?? ''
    const digits = (phoneHtml.match(/href="tel:([^"]+)"/)?.[1] ?? text(phoneHtml)).replace(/\D/g, '')

    const actions = article.slice(article.search(/class="[^"]*__cardActions"/))
    const links = [...actions.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: decode(m[1]), label: text(m[2]) }))
    const certificate = links.find((l) => /^certificate/i.test(l.label))?.href ?? null
    const website = links.find((l) => /^https?:/i.test(l.href) && !/^(details|map|certificate)/i.test(l.label))?.href ?? null

    entries.push({
      slug,
      url: `https://www.mekorhabracha.org/post/${slug}`,
      name,
      neighborhood: tags[0] ?? '',
      kinds: tags.slice(1),
      supervision,
      certs: certsIn(supervision),
      address: text(facts.get('address') ?? ''),
      phone: digits.length >= 10 ? digits.slice(-10) : '',
      website,
      certificate,
    })
  }
  return { updated, entries }
}

// ── Matching ─────────────────────────────────────────────────────────────────

type Place = { name: string; address: string | null; phone: string | null }

/** Keystone-K's name rule, with accents, a "| Lakewood" and a " - LKWD NJ"
 *  suffix gone too. */
function nameKey(name: string): string {
  return baseName(name.normalize('NFD').replace(/[̀-ͯ]/g, '').split('|')[0])
}

const GENERIC = new Set([
  'grill', 'grille', 'catering', 'bakery', 'cafe', 'restaurant', 'philadelphia', 'pizza', 'pizzeria', 'kitchen', 'deli',
  'market', 'foods', 'food', 'shop', 'water', 'cakes', 'cookies', 'sweet', 'sweets', 'center', 'vegan', 'street', 'bagel',
])

function words(name: string): string[] {
  return nameKey(name).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w))
}

function streetNumber(address: string | null): string | null {
  return address?.match(/\d+/)?.[0] ?? null
}

function phoneDigits(phone: string | null): string {
  const d = (phone ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}

/** A link without its scheme, "www." or trailing slash. */
function linkKey(url: unknown): string {
  return String(url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

/** Something besides a link says it's the same place: the street number,
 *  the phone, or a word of the name, by its first five letters (the guide
 *  spells it "The Brazillian BBQ"). */
function agrees(a: Place, b: Place): boolean {
  const na = streetNumber(a.address)
  const pa = phoneDigits(a.phone)
  const stem = (w: string) => w.slice(0, 5)
  const wa = words(a.name).map(stem)
  return (!!na && na === streetNumber(b.address)) || (!!pa && pa === phoneDigits(b.phone)) || words(b.name).some((w) => wa.includes(stem(w)))
}

/** The same name, with no clash of street numbers; or one name inside the
 *  other at the same street number ("Cheezy Vegan" and "Cheezy Vegan Cafe
 *  & Comfort Food Lab", both at 1216 S 17th St). */
function sameByName(a: Place, b: Place): boolean {
  const ka = nameKey(a.name)
  const kb = nameKey(b.name)
  if (!ka || !kb) return false
  const na = streetNumber(a.address)
  const nb = streetNumber(b.address)
  if (ka === kb) return !na || !nb || na === nb
  return !!na && na === nb && (ka.startsWith(`${kb} `) || kb.startsWith(`${ka} `))
}

/** The same address or phone, and a word of the name: "Rita's Water Ice -
 *  Crossroads Plaza" and the guide's "Rita's Italian Ice & Frozen Custard",
 *  both at 877 Cooper Landing Rd. Or every word of one name in the other,
 *  where neither phone says otherwise (Mekor lists the Brodsky Enrichment
 *  Center twice, at 345 and 349 Montgomery Ave). */
function sameByContact(a: Place, b: Place): boolean {
  const na = streetNumber(a.address)
  const pa = phoneDigits(a.phone)
  const pb = phoneDigits(b.phone)
  const samePhone = !!pa && pa === pb
  const sameNumber = !!na && na === streetNumber(b.address)
  const wa = words(a.name)
  const wb = words(b.name)
  const shared = wb.some((w) => wa.includes(w))
  if (sameNumber && (samePhone || shared)) return true
  if (samePhone && shared) return true
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  return short.length >= 3 && short.every((w) => long.includes(w)) && !(pa && pb && pa !== pb)
}

/** Mekor's certificate links that point at one place only. A link two
 *  places on the list share is a list page, not a certificate; Keystone-K's
 *  home page is never one. */
function identifyingLinks(entries: MekorEntry[]): Set<string> {
  const counts = new Map<string, number>()
  for (const e of entries) {
    const k = linkKey(e.certificate)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return new Set([...counts].filter(([k, n]) => n === 1 && k.includes('/') && !/^keystone-k\.org(\/kosher)?$/.test(k)).map(([k]) => k))
}

/** Each place on Mekor and the listing that is that place, one listing to a
 *  place. A pass at a time, the surest first, so a place matched by its
 *  certificate isn't then offered a neighbour with the same phone. A place
 *  that fits two listings equally is matched to neither, and remembered so
 *  it isn't suggested as new either. */
function matchEntries(entries: MekorEntry[], listings: GuideListing[]): { matched: Map<string, GuideListing>; unsure: Set<string> } {
  const links = identifyingLinks(entries)
  const matched = new Map<string, GuideListing>()
  const unsure = new Set<string>()
  const taken = new Set<string>()
  const place = (e: MekorEntry): Place => ({ name: e.name, address: e.address, phone: e.phone })

  const passes: ((e: MekorEntry, l: GuideListing) => boolean)[] = [
    (e, l) => {
      const k = linkKey(e.certificate)
      return links.has(k) && linkKey(l.details.k) === k && agrees(place(e), l)
    },
    (e, l) => sameByName(place(e), l),
    (e, l) => sameByContact(place(e), l),
  ]
  for (const fits of passes) {
    for (const e of entries) {
      if (matched.has(e.slug)) continue
      const all = listings.filter((l) => !taken.has(l.id) && fits(e, l))
      // A live listing over an archived copy of the same place.
      const live = all.filter((l) => l.status === 'approved')
      const candidates = live.length ? live : all
      if (candidates.length === 1) {
        matched.set(e.slug, candidates[0])
        taken.add(candidates[0].id)
        unsure.delete(e.slug)
      } else if (candidates.length > 1) {
        unsure.add(e.slug)
      }
    }
  }
  return { matched, unsure }
}

// ── Comparing ────────────────────────────────────────────────────────────────

const FOOD_KINDS: Record<string, string> = {
  restaurants: 'Restaurant',
  cafe: 'Restaurant',
  bakery: 'Bakery',
  'ice cream': 'Ice Cream & Treats',
  catering: 'Catering',
}

function levelsOf(e: MekorEntry): Level[] {
  return levelsIn([e.supervision, ...e.kinds].join('. '))
}

function https(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/** Mekor's link to the place's own site, when it is one: not Keystone-K's
 *  home page standing in for it, not its certificate again, not a
 *  mistyped address ("httpswww.primowaterice.com") or a mailing's
 *  tracking link. */
function ownSite(e: MekorEntry): string | null {
  if (!e.website || e.website.length > 120) return null
  const key = linkKey(e.website)
  if (key === linkKey(e.certificate) || /^keystone-k\.org\b/.test(key) || /^https?(www)?[.:]/.test(key)) return null
  return e.website
}

/** What a place Mekor lists and the guide doesn't would be filed as. */
function newDetails(e: MekorEntry, links: Set<string>): Record<string, unknown> {
  const foodType = [...new Set(e.kinds.map((k) => FOOD_KINDS[k.toLowerCase()]).filter(Boolean))]
  const levels = levelsOf(e)
  return {
    kosherCert: e.certs,
    ...(e.certificate && links.has(linkKey(e.certificate)) ? { k: https(e.certificate) } : {}),
    ...(foodType.length ? { foodType } : {}),
    ...(levels.length ? { t: levels } : {}),
    ...(ownSite(e) ? { website: ownSite(e) } : {}),
  }
}

/** Every difference between Mekor's list and the guide. `pending` is the
 *  queue's new places, so one Keystone-K's watch (or a visitor) has
 *  already suggested isn't suggested again. */
export function compareMekor(entries: MekorEntry[], listings: GuideListing[], pending: PendingCreate[]): MekorFinding[] {
  const findings: MekorFinding[] = []
  const links = identifyingLinks(entries)
  const { matched, unsure } = matchEntries(entries, listings)

  for (const e of entries) {
    const listing = matched.get(e.slug)
    if (!listing) {
      if (unsure.has(e.slug)) continue
      const p = { name: e.name, address: e.address, phone: e.phone }
      const queued = pending.some(
        (q) => sameByName(p, q) || sameByContact(p, q) || (links.has(linkKey(e.certificate)) && linkKey(q.details.k) === linkKey(e.certificate)),
      )
      if (!queued) findings.push({ kind: 'new', entry: e, details: newDetails(e, links), archived: null })
      continue
    }
    if (listing.status !== 'approved') {
      findings.push({ kind: 'new', entry: e, details: newDetails(e, links), archived: listing })
      continue
    }
    // Groceries carry no hechsher field: being matched is all.
    if (listing.category !== 'restaurant' || e.certs.length === 0) continue
    const ours = selectValues(listing.details.kosherCert)
    const removed = ours.filter((c) => !e.certs.includes(c) && c !== KEYSTONE_CERT)
    const added = e.certs.filter((c) => !ours.includes(c) && c !== KEYSTONE_CERT && c !== OTHER)
    if (removed.length === 0 && added.length === 0) continue
    const details = { ...listing.details, kosherCert: [...ours.filter((c) => !removed.includes(c)), ...added] }
    findings.push({ kind: 'hechsher', entry: e, listing, details, removed, added })
  }

  const onMekor = new Set([...matched.values()].map((l) => l.id))
  for (const listing of listings) {
    if (listing.status !== 'approved' || listing.category !== 'restaurant' || onMekor.has(listing.id)) continue
    const ours = selectValues(listing.details.kosherCert)
    if (!ours.includes(IKC)) continue
    findings.push({ kind: 'only-here', listing, details: { ...listing.details, kosherCert: ours.filter((c) => c !== IKC) } })
  }
  return findings
}

/** The live listings Mekor's list has just as the guide does: matched, with
 *  nothing to suggest. Their dates move forward (sourceConfirm.ts). */
export function mekorAgrees(entries: MekorEntry[], listings: GuideListing[], findings: MekorFinding[]): string[] {
  const differ = new Set(findings.flatMap((f) => ('listing' in f ? [f.listing.id] : [])))
  const { matched } = matchEntries(entries, listings)
  return [...new Set([...matched.values()].filter((l) => l.status === 'approved' && !differ.has(l.id)).map((l) => l.id))]
}

// ── What the admin reads ─────────────────────────────────────────────────────

function said(e: MekorEntry, updated: string | null): string[] {
  return [
    `Mekor Habracha's kosher list says: "${e.name}"`,
    e.address && `at ${e.address}`,
    e.supervision && `Supervision: "${e.supervision}"`,
    updated && `The list was last updated ${updated}`,
    e.url,
  ].filter((l): l is string => !!l)
}

/** The card's note: what Mekor says, word for word, and where. */
export function findingNote(f: MekorFinding, updated: string | null): string {
  if (f.kind === 'only-here') {
    const left = selectValues(f.details.kosherCert)
    return [
      `The guide says IKC, and Mekor Habracha's kosher list doesn't have this place: ${MEKOR_LIST_URL}`,
      'The guide can be ahead of Mekor, which updates its list by hand: check the place’s own certificate before approving.',
      left.length
        ? `Approving takes IKC off; ${left.join(', ')} stays. Rejecting keeps IKC.`
        : 'Approving takes IKC off, which leaves it with no hechsher named: edit in the right one first. Rejecting keeps IKC.',
      updated && `Mekor's list was last updated ${updated}.`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (f.kind === 'hechsher') {
    const ours = selectValues(f.listing.details.kosherCert)
    const left = selectValues(f.details.kosherCert)
    const lines = [`From Mekor Habracha's kosher list: the guide says ${ours.join(', ') || 'no hechsher'}; Mekor says ${f.entry.certs.join(', ')}.`]
    if (f.removed.length) lines.push(`Approving takes ${f.removed.join(', ')} off. The guide can be ahead of Mekor: check the place’s own certificate first.`)
    if (f.added.length) lines.push(`Approving adds ${f.added.join(', ')}.`)
    if (left.length === 0) lines.push('That leaves it with no hechsher named: edit in the right one before approving.')
    if (f.entry.certs.includes(KEYSTONE_CERT) && !ours.includes(KEYSTONE_CERT)) {
      lines.push('Keystone-K isn’t added from here: its own list is the authority, and the Keystone-K watch adds it where that list has the place.')
    }
    lines.push('Rejecting keeps it as it is.')
    return [...lines, ...said(f.entry, updated)].join('\n')
  }
  const lines = ['On Mekor Habracha’s kosher list, not in the guide.']
  if (f.archived) {
    lines.push(
      `The guide has it archived ("${f.archived.name}", ${f.archived.address ?? 'no address'}). If it's open, restoring it from the Archived tab keeps its hours and photos (then reject this); approving lists it again as Mekor has it.`,
    )
  }
  if (f.entry.certs.includes(KEYSTONE_CERT)) lines.push('Mekor says Keystone-K: check Keystone-K’s own list has it.')
  return [...lines, ...said(f.entry, updated)].join('\n')
}

/** A stable description of what a finding proposes, so the same suggestion
 *  isn't made twice: once rejected, it stays rejected until Mekor or the
 *  guide changes what it would propose. */
export function findingKey(f: MekorFinding): string {
  if (f.kind === 'new') return `new:${f.entry.slug}`
  return `cert:${f.listing.id}:${proposal(f.details)}`
}

/** The same key, read back from a suggestion the watch made earlier. */
export function submissionKey(s: { operation: string; target_id: string | null; payload: Record<string, unknown>; note?: string | null }): string | null {
  if (s.operation === 'create') {
    const slug = (s.note ?? '').match(/mekorhabracha\.org\/post\/([^\s/?#]+)/)?.[1]
    return slug ? `new:${slug}` : null
  }
  if (s.operation !== 'update' || !s.target_id) return null
  return `cert:${s.target_id}:${proposal((s.payload.details ?? {}) as Record<string, unknown>)}`
}

function proposal(d: Record<string, unknown>): string {
  return JSON.stringify([...selectValues(d.kosherCert)].sort())
}
