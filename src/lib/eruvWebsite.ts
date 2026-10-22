import { formatPhone } from './validation'
import { pageContacts, phoneDigits } from './contactRead'
import { dialable, type Eruv } from './eruv'
import { normalizeWatchUrl, type Watch } from './watches'
import { ERUV_SUGGESTION_FIELDS, type EruvSuggestion, type EruvSuggestionField } from './eruvSuggestion'

// ── An eruv's Details, read from its own website (Oct 22) ───────────────────
// Drawn on artifact 9Kv6MGeAEooZREzW28hiBu (Eruv status, agreed Oct 21): an
// eruv's hotline and email-alerts link are read every day from its website,
// so every field of an eruv has something checking it. Where it goes is the
// guide's wording and the website is the page read, so neither is compared.
//
// Read by code, not the AI, and only when the page leaves no doubt:
//   - Hotline: its number gone from the page, and exactly one other number
//     there. The eruv's own wording ("option 3") went with the old number,
//     so the new one comes alone. A hotline spelled in letters
//     ("333-ERUV") is found on the page as written.
//   - Email alerts: none on the eruv, or its link gone from the page, and
//     exactly one sign-up or alerts link there.
// What it finds is filed as an eruv suggestion from its website, waiting on
// the Eruv status page (not the moderation queue) for Use this.
//
// Pure: no database, no network.

/** The `created_by` of the watch the daily run gives each eruv's website,
 *  so it only ever adds and removes its own. */
export const ERUV_WEBSITE_CREATOR = 'eruv website'

/** Who its suggestions are from, as a watch files them. */
export const ERUV_WEBSITE_WATCH_NAME = 'Its website (automated, eruv)'

export const isEruvWebsiteWatch = (w: Pick<Watch, 'createdBy'>) => w.createdBy === ERUV_WEBSITE_CREATOR

export const eruvWebsiteLabel = (name: string) => `${name}’s website`

/** The fields read from the website. */
export const ERUV_READ_FIELDS = ['hotline', 'alertsUrl'] as const satisfies readonly EruvSuggestionField[]
export type EruvReadField = (typeof ERUV_READ_FIELDS)[number]

/** The address a watch keeps for an eruv's website. */
export const eruvWebsiteUrl = (website: string | null | undefined): string | null => (website ? normalizeWatchUrl(website) : null)

/** The watches the daily run adds and removes: one per website an eruv
 *  has (eruvim sharing one share it). A paused one stays, so it isn't
 *  added back; one whose eruv has gone, or changed its website, goes. */
export function eruvWebsiteWatchChanges(
  eruvim: readonly Pick<Eruv, 'name' | 'website'>[],
  watches: readonly Pick<Watch, 'id' | 'url' | 'createdBy'>[],
): { add: { url: string; label: string }[]; remove: string[] } {
  const wanted = new Map<string, string>()
  for (const e of eruvim) {
    const url = eruvWebsiteUrl(e.website)
    if (url && !wanted.has(url)) wanted.set(url, eruvWebsiteLabel(e.name))
  }
  const own = watches.filter(isEruvWebsiteWatch)
  const taken = new Set(watches.map((w) => w.url))
  return {
    add: [...wanted].filter(([url]) => !taken.has(url)).map(([url, label]) => ({ url, label })),
    remove: own.filter((w) => !wanted.has(w.url)).map((w) => w.id),
  }
}

/** A link's address, compared without its scheme, "www." or a trailing
 *  slash. */
const same = (url: string) => url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/#.*$/, '').replace(/\/+$/, '')

/** What says a link signs you up for alerts: its words or its address. */
const ALERTS_WORDS = /\b(alerts?|sign[\s-]?up|subscribe|mailing[\s-]?list|e-?mail[\s-]?(list|updates|notifications?)|notifications?|text[\s-]?updates)\b/i
const ALERTS_HOSTS = /(^|\.)(groups\.google\.com|groups\.io|list-manage\.com|mailchi\.mp|eepurl\.com|constantcontact\.com|tinyletter\.com|flocknote\.com|substack\.com)$/i
/** Sharing a page isn't signing up for anything. */
const SHARE = /(facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent|wa\.me|linkedin\.com\/share)/i

/** Every link on a page: where it goes, and its words. */
export function pageLinks(html: string, pageUrl: string): { url: string; words: string }[] {
  const out: { url: string; words: string }[] = []
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string
    try {
      url = new URL(m[1].replace(/&amp;/g, '&'), pageUrl).toString()
    } catch {
      continue
    }
    if (!/^https?:/i.test(url)) continue
    out.push({ url, words: m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim() })
  }
  return out
}

/** The sign-up or alerts links on a page, each once. */
export function alertsLinks(html: string, pageUrl: string): string[] {
  const seen = new Map<string, string>()
  const page = same(pageUrl)
  for (const l of pageLinks(html, pageUrl)) {
    if (SHARE.test(l.url) || same(l.url) === page) continue
    let host = ''
    try {
      host = new URL(l.url).hostname
    } catch {
      continue
    }
    if (ALERTS_WORDS.test(l.words) || ALERTS_WORDS.test(new URL(l.url).pathname) || ALERTS_HOSTS.test(host)) {
      if (!seen.has(same(l.url))) seen.set(same(l.url), l.url)
    }
  }
  return [...seen.values()]
}

/** The hotline's number, ten digits; null when it has none. */
function hotlineDigits(hotline: string): string | null {
  return pageContacts(hotline).phones[0] ?? phoneDigits(dialable(hotline))
}

/** The hotline as written up to its number's end ("(215) 333-ERUV"), to
 *  find a number spelled in letters. */
const squeezed = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** What the website says of each field it's read for: the ones it gives as
 *  the eruv has them (`same`), and the ones it would change (`changes`). */
export type EruvReading = { same: EruvReadField[]; changes: Partial<Record<EruvReadField, string>> }

export function readEruvDetails(eruv: Pick<Eruv, 'hotline' | 'alertsUrl'>, page: { text: string; html: string; url: string }): EruvReading {
  const out: EruvReading = { same: [], changes: {} }
  const contacts = pageContacts(page.text, page.html)

  const hotline = eruv.hotline?.trim()
  const own = hotline ? hotlineDigits(hotline) : null
  if (hotline && own) {
    const main = hotline.split(/,|\s+option\b|\s+press\b|\s+ext\b/i)[0]
    if (contacts.phones.includes(own) || (/[a-z]/i.test(main) && squeezed(page.text).includes(squeezed(main)))) out.same.push('hotline')
    else if (contacts.phones.length === 1) out.changes.hotline = formatPhone(contacts.phones[0])
  }

  const links = alertsLinks(page.html, page.url)
  const alerts = eruv.alertsUrl?.trim()
  if (alerts && pageLinks(page.html, page.url).some((l) => same(l.url) === same(alerts))) out.same.push('alertsUrl')
  else if (links.length === 1 && (!alerts || same(links[0]) !== same(alerts))) out.changes.alertsUrl = links[0]
  return out
}

/** The suggestion it files: the eruv as it is, with what changes. */
export function eruvDetailsSuggestion(eruv: Pick<Eruv, 'id' | 'name' | EruvSuggestionField>, changes: EruvReading['changes']): EruvSuggestion {
  return { eruvId: eruv.id, name: eruv.name, covers: eruv.covers, website: eruv.website, hotline: changes.hotline ?? eruv.hotline, alertsUrl: changes.alertsUrl ?? eruv.alertsUrl }
}

/** A reading's fingerprint, so the same one is never filed twice. */
export const detailsKey = (eruvId: string, values: Partial<Record<EruvReadField, string | null | undefined>>) =>
  JSON.stringify([eruvId, ...ERUV_READ_FIELDS.map((k) => values[k] ?? null)])

// ── The Details box (the drawing's boards 1 and 2) ──────────────────────────

export type DetailsRow = { key: EruvSuggestionField; name: string; value: string; was?: string; mark: 'same' | 'new' | 'changed' | 'gone' }

const shown = (key: EruvSuggestionField, v: string | null | undefined): string => {
  const t = v?.trim() ?? ''
  return ERUV_SUGGESTION_FIELDS.find((f) => f.key === key)?.url ? t.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : t
}

/** The box's rows: the eruv's now, marked by what its website says
 *  (`next`); a row neither says anything for is left out. */
export function detailsRows(now: Pick<Eruv, EruvSuggestionField>, next: Partial<Record<EruvSuggestionField, string | null>> = now): DetailsRow[] {
  return ERUV_SUGGESTION_FIELDS.flatMap((f): DetailsRow[] => {
    const a = shown(f.key, now[f.key])
    const b = shown(f.key, f.key in next ? next[f.key] : now[f.key])
    if (!a && !b) return []
    if (!a) return [{ key: f.key, name: f.label, value: b, mark: 'new' }]
    if (!b) return [{ key: f.key, name: f.label, value: a, mark: 'gone' }]
    if (a.toLowerCase() === b.toLowerCase()) return [{ key: f.key, name: f.label, value: a, mark: 'same' }]
    return [{ key: f.key, name: f.label, value: b, was: a, mark: 'changed' }]
  })
}

/** The box's pill: "1 change", "1 new", "2 updates", else "Same". */
export function detailsPill(rows: readonly DetailsRow[]): string {
  const lit = rows.filter((r) => r.mark !== 'same')
  const n = lit.length
  if (!n) return 'Same'
  const kinds = new Set(lit.map((r) => r.mark))
  if (kinds.size > 1) return `${n} updates`
  if (kinds.has('new')) return `${n} new`
  return `${n} change${n === 1 ? '' : 's'}`
}

/** What Use this takes: the rows it changes. */
export const detailsKeysToUse = (rows: readonly DetailsRow[]): EruvSuggestionField[] => rows.filter((r) => r.mark !== 'same').map((r) => r.key)
