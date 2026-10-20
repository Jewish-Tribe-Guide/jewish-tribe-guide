import { createHash } from 'node:crypto'
import type { CategoryConfig } from './categories'
import type { FieldRead } from './fieldChanges'
import type { Proposal } from './messageReader'
import type { SubmissionSource } from './submissionSource'
import type { CheckFound, Watch } from './watches'
import type { MenuSource } from './menuReader'
import type { UpdateRow } from './scheduleUpdate'
import { CALENDAR_HEADING } from './calendarFeed'
import { formatDays, parseTimeToMinutes, TEFILLAH_LABELS, TEFILLAH_ORDER, type MinyanDayKey } from './davening'
import { DAY_KEYS, fmt12, formatHoursSummary } from './hours'
import { dateText } from './schedules'

// ── Watching a listing's own web page (the user, Oct 19) ────────────────────
// A shul's page of its usual minyan times, or a mikvah's page of its hours,
// tied by an admin to the listing it keeps current, the way a Refuah page is
// tied to its hospital. Read every morning, as a menu is (menuWatch.ts): the
// page's words are fingerprinted, which costs nothing, and only when they
// change does the AI read it, with the cheapest model. What it read that
// differs from the listing goes to the moderation queue for an admin.
//
// Rules (Oct 19):
//   - Filed only when the page changes. A website is often behind the
//     shul's newsletter, so a standing difference is the newsletter being
//     newer, not news; the note says "From their website, changed <date>"
//     so the admin can weigh it.
//   - Never dates the listing when the page agrees with it. Unlike
//     Keystone-K, Mekor and Refuah (read by code, sourceConfirm.ts), this
//     page is read by the AI, and the AI reads but never confirms.
//   - The same suggestion is never filed twice, approved or rejected, and
//     a listing with a suggestion already in the queue is left until it's
//     settled.
//
// Pure: no database, no network. listingPageRun.ts reads and files.

/** The `created_by` of a listing-page watch, so the daily run reads it for
 *  the listing's times or hours, and the Watches tab groups it. */
export const LISTING_PAGE_WATCH_CREATOR = 'listing pages'

/** Who files its suggestions, as the queue says it. */
export const LISTING_PAGE_WATCH_NAME = 'Their website (automated)'

/** The longest page text the readers are given. */
export const MAX_PAGE_TEXT = 8_000

export function isListingPageWatch(w: Pick<Watch, 'createdBy'>): boolean {
  return w.createdBy === LISTING_PAGE_WATCH_CREATOR
}

/** What a listing's page is read for: a shul's usual minyan times, or the
 *  weekly hours fields (a mikvah's hours, women's hours, men's, keilim).
 *  Null when its category has neither, and the page has nothing to give. */
export type PageReads = { kind: 'times'; key: string } | { kind: 'hours'; keys: string[] }

/** Every category's plain "Hours" field, the one Google keeps. */
const PLAIN_HOURS_KEY = 'hours'

export function pageReadsFor(category: Pick<CategoryConfig, 'detailFields'>): PageReads | null {
  const minyanim = category.detailFields.find((f) => f.type === 'minyanim')
  if (minyanim) return { kind: 'times', key: minyanim.key }
  const hours = category.detailFields.filter((f) => f.type === 'hours').map((f) => f.key)
  // A mikvah's page gives women's, men's or keilim hours, never the plain
  // "Hours" beside them: offered that, the AI put Lower Merion's women's
  // hours there and missed that they had changed (the user, Oct 20).
  const named = hours.filter((k) => k !== PLAIN_HOURS_KEY)
  return hours.length ? { kind: 'hours', keys: named.length ? named : hours } : null
}

/** For the AI reading a page for hours: what each field holds now, so it
 *  can tell which of a mikvah's hours the page gives. Without it, "open
 *  7:30–9:30 PM every weeknight" went nowhere, or to the wrong field
 *  (Oct 20). It proposes only what the page says. Null with one field. */
export function hoursNowIntro(name: string, category: Pick<CategoryConfig, 'detailFields'>, keys: readonly string[], listing: Record<string, unknown>): string | null {
  if (keys.length < 2) return null
  const lines = keys.map((k) => {
    const label = category.detailFields.find((f) => f.key === k)?.label ?? k
    return `${label}: ${listing[k] ? formatHoursSummary(listing[k]) : 'none listed'}`
  })
  // "Every one, the same ones too": told what's listed, the AI otherwise
  // gives only what differs, and a page that agrees reads as giving
  // nothing. A time set by candle lighting can't be weekly hours: offered,
  // LMC's men's Friday crowded out the rest of the week (Oct 20).
  return [
    `What the guide lists for ${name} now, only so you can tell which hours the page gives:`,
    ...lines,
    'Give every weekly hours the page states, the ones that match the guide too, and only what the page says. Leave out a day whose time is set by candle lighting, sunset or appointment: weekly hours can’t hold it.',
  ].join('\n')
}

export function listingPageLabel(name: string, reads: PageReads): string {
  return `${name} · ${reads.kind === 'times' ? 'davening times' : 'hours'} on their website`
}

/** The hours changes the message reader read for this listing, and only
 *  hours: a page's phone or address is for another day. A page that names
 *  no other place is about this one, so a proposal for no place counts. */
export function hoursReads(proposals: Proposal[], listingId: string, keys: readonly string[]): FieldRead[] {
  const wanted = new Set(keys)
  return proposals.flatMap((p) =>
    p.kind === 'fields' && (p.listingId === listingId || (p.listingId === null && !p.ask)) ? p.changes.filter((c) => wanted.has(c.key) && c.hours) : [],
  )
}

/** "Oct 20", the day the page was seen to change. */
export function changedOn(now: number, timeZone = 'America/New_York'): string {
  return new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })
}

/** The suggestion's note: where it's from, when the page changed (or, from
 *  "Check now" on a page that hadn't, when it was read), and what it
 *  changes, a line each. */
export function listingPageNote(url: string, on: string, lines: readonly string[], seen: 'changed' | 'read' = 'changed'): string {
  return [`From their website, ${seen} ${on}: ${url}`, lines.join('\n')].join('\n\n')
}

// ── What a full read found (the user, Oct 20) ───────────────────────────────
// "Check now" has the AI read the page whether or not it changed, and the
// row keeps what it read and whether that agrees with the listing
// (watches.ts, WatchCheck), so an admin can tell a watch that reads the
// right things from one that only opens the page.

/** How many lines of what it read a check keeps. */
export const CHECK_READ_LINES = 8

/** Where a page's words came from: a PDF, its calendar, or the page. */
export function checkFrom(source: Pick<MenuSource, 'text' | 'pdf'>, opts: { pictures?: boolean } = {}): CheckFound['from'] {
  if (opts.pictures || (!source.text && !source.pdf)) return 'pictures'
  if (!source.text) return 'pdf'
  return source.text.startsWith(CALENDAR_HEADING) ? 'calendar' : 'page'
}

/** A clock time as the site writes it ("6:45am" → "6:45 AM"); a time
 *  that isn't a clock ("15 min before sunset") as the page wrote it. */
function clockText(time: string): string {
  if (!/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(time.trim())) return time
  const m = parseTimeToMinutes(time)
  return fmt12(`${Math.floor(m / 60)}:${m % 60}`)
}

/** Days in their runs: "Sun–Thu, Sat", where formatDays, which the rest
 *  of the site shows minyanim with, says "Sun, Mon, Tue, Wed, Thu, Sat". */
function dayRuns(days: readonly MinyanDayKey[]): string {
  const sorted = DAY_KEYS.filter((d) => days.includes(d))
  if (sorted.length !== days.length || sorted.length === DAY_KEYS.length) return formatDays([...days])
  const runs: (typeof sorted)[] = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last && DAY_KEYS.indexOf(d) === DAY_KEYS.indexOf(last[last.length - 1]) + 1) last.push(d)
    else runs.push([d])
  }
  return runs.map((r) => formatDays(r)).join(', ')
}

/** The times the AI read off the page, a line per minyan: "Shacharis
 *  Mon–Fri 7:00 AM", and a dated one "Mincha Sun Oct 25 6:05 PM". Only
 *  what the page gives, never the listing's times it left alone. */

export function timesReadLines(rows: readonly UpdateRow[]): string[] {
  const weekly = new Map<string, { tefillah: UpdateRow['tefillah']; time: string; days: MinyanDayKey[] }>()
  const dated: UpdateRow[] = []
  for (const r of rows) {
    if (r.status === 'gone' || r.status === 'kept') continue
    if (!(DAY_KEYS as readonly string[]).includes(r.day)) {
      dated.push(r)
      continue
    }
    const time = clockText(r.time)
    const key = `${r.tefillah} ${time}`
    const g = weekly.get(key) ?? { tefillah: r.tefillah, time, days: [] }
    if (!g.days.includes(r.day as MinyanDayKey)) g.days.push(r.day as MinyanDayKey)
    weekly.set(key, g)
  }
  const order = (t: UpdateRow['tefillah'], time: string) => TEFILLAH_ORDER.indexOf(t) * 10_000 + (parseTimeToMinutes(time) || 0)
  const lines = [...weekly.values()]
    .sort((a, b) => order(a.tefillah, a.time) - order(b.tefillah, b.time))
    .map((g) => `${TEFILLAH_LABELS[g.tefillah]} ${dayRuns(g.days)} ${g.time}`)
  const once = [...dated]
    .sort((a, b) => a.day.localeCompare(b.day) || order(a.tefillah, a.time) - order(b.tefillah, b.time))
    .map((r) => `${TEFILLAH_LABELS[r.tefillah]} ${dateText(r.day, { weekday: true })}${r.occasion ? ` (${r.occasion})` : ''} ${clockText(r.time)}`)
  return [...lines, ...once]
}

/** The hours the AI read off the page, a line each: "Women’s Hours,
 *  Sun–Thu: 7:00 PM–10:00 PM". */
export function hoursReadLines(reads: readonly FieldRead[], category: Pick<CategoryConfig, 'detailFields'>): string[] {
  return reads.flatMap((r) => {
    const h = r.hours
    if (!h) return []
    const label = category.detailFields.find((f) => f.key === r.key)?.label ?? r.key
    const days = h.days === 'all' ? 'every day' : dayRuns(h.days)
    const said = h.closed ? 'closed' : h.open && h.close ? `${fmt12(h.open)}–${fmt12(h.close)}` : h.open ? `opens ${fmt12(h.open)}` : `closes ${fmt12(h.close!)}`
    return [`${label}, ${days}: ${said}${h.when === 'one_day' ? ' (one day only)' : ''}`]
  })
}

/** What a read found, kept to its first few lines. */
export function pageCheck(
  what: 'times' | 'hours' | 'dishes',
  from: CheckFound['from'],
  read: readonly string[],
  rest: Pick<CheckFound, 'differences' | 'queue' | 'note' | 'unread'>,
): CheckFound {
  // Something read that couldn't be set beside the listing isn't agreement:
  // Lower Merion's women's hours, read with no days, showed as "agrees"
  // when they had changed (Oct 20).
  const unread = rest.unread ?? []
  const result: CheckFound['result'] = rest.differences.length ? 'differs' : unread.length ? 'unsure' : read.length ? 'agrees' : 'nothing'
  return {
    what,
    from,
    result,
    read: read.slice(0, CHECK_READ_LINES),
    ...(read.length > CHECK_READ_LINES ? { more: read.length - CHECK_READ_LINES } : {}),
    differences: rest.differences,
    ...(unread.length ? { unread } : {}),
    queue: rest.differences.length ? rest.queue : null,
    ...(rest.note ? { note: rest.note } : {}),
  }
}

/** Where it came from, for the queue's opened card: their own page, read by
 *  the AI, with its words beside the change. The listing is the authority
 *  on itself, as with a shul's newsletter (newsletterRun.ts), so an
 *  admin's approval dates it by name; agreement alone never does. */
export function listingPageSource(listingName: string, url: string, on: string, text: string | null, seen: 'changed' | 'read' = 'changed'): SubmissionSource {
  return {
    readBy: 'ai',
    from: `${listingName}’s website`,
    named: listingName,
    note: `From their website, ${seen} ${on}: ${url}`,
    ...(text ? { original: text.slice(0, MAX_PAGE_TEXT) } : {}),
  }
}

/** A value with every `id` and `postedAt` taken out and lists put in one
 *  order, so the same times read twice (new ids, another order) are the
 *  same suggestion. An empty list is no list: a shul with no schedules. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? v.map(canonical).map((x) => JSON.stringify(x)).sort() : null
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k, x]) => k !== 'id' && k !== 'postedAt' && x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    )
  }
  return v ?? null
}

/** A suggestion's fingerprint: the fields it sets, as they'd be. */
export function suggestionKey(details: Record<string, unknown>, keys: readonly string[]): string {
  return createHash('sha256')
    .update(JSON.stringify(keys.map((k) => [k, canonical(details[k])])))
    .digest('hex')
}

/** Whether this watch filed these fields as they'd be before, whatever
 *  became of it: a rejected suggestion isn't made again until the page
 *  says something else. */
export function filedBefore(earlier: readonly { payload: unknown }[], details: Record<string, unknown>, keys: readonly string[]): boolean {
  const key = suggestionKey(details, keys)
  return earlier.some((s) => {
    const d = (s.payload as { details?: Record<string, unknown> } | null)?.details
    return !!d && suggestionKey(d, keys) === key
  })
}
