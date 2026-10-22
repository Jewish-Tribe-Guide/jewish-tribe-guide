// ─────────────────────────────────────────────────────────────────────────────
// Watches: the outside pages the guide reads on its own to stay current
// (freshness map, Oct 5), and the rules for whether each is still working.
//
// A watch that breaks quietly is the worst kind of stale: the queue looks
// calm and everyone assumes the guide is current. So every run records how
// it went, the admin is emailed once when a watch breaks and once when it
// recovers, and the Watches tab shows any watch that hasn't run lately.
//
// Pure: no database, no network. watchStore.ts keeps them; the cron
// (/api/cron/watches) runs them.
// ─────────────────────────────────────────────────────────────────────────────

import { KEYSTONE_LIST_URL } from './keystoneWatch'
import type { PartGiven } from './timesParts'

export type WatchKind = 'keystone_list' | 'website'

export type Watch = {
  id: string
  communityId: string
  kind: WatchKind
  url: string
  resourceId: string | null
  label: string | null
  active: boolean
  createdAt: string
  createdBy: string | null
  lastRunAt: string | null
  lastOkAt: string | null
  lastError: string | null
  failingSince: string | null
  lastFiled: number | null
  pageHash: string | null
  pageChangedAt: string | null
  /** What its last full read found (migration 085): null until one is
   *  kept, and without the migration. */
  lastCheck: WatchCheck | null
}

/** What a full read of a watch found, kept until the next one, so the
 *  Watches tab can say what it read and whether that agrees with the
 *  listing, not only that the page opened (the user, Oct 20). Made by
 *  "Check now" and by a daily run that had the AI read a changed page, and
 *  by every run of a list read by code (Keystone-K, Mekor, Refuah).
 *
 *   result   agrees      read something, and the listing already says it
 *            differs     read something the listing doesn't say
 *            nothing     the page opened, but the AI found nothing to read
 *            unreadable  the page wouldn't open
 *   queue    what became of the differences: filed now, filed before (and
 *            not again), or waiting behind a suggestion already in the
 *            queue for that listing
 *   list     a list's counts: places on it, how many match the guide, how
 *            many differ, how many of those were filed this time */
export type WatchCheck = {
  at: string
  what: 'times' | 'hours' | 'dishes' | 'list' | 'contacts'
  /** Where it read: the page, the page and its calendar, a PDF, the
   *  pictures of a menu on its page. */
  from: 'page' | 'calendar' | 'pdf' | 'pictures' | null
  /** `unsure`: it read something it couldn't set beside the listing
   *  (`unread`), so it can't say the two agree. */
  result: 'agrees' | 'differs' | 'unsure' | 'nothing' | 'unreadable'
  /** What it read, a short line each, the first few. */
  read: string[]
  /** How many more lines it read than `read` keeps. */
  more?: number
  differences: string[]
  /** What it read but couldn't compare: "Hours: opens 7:30 PM, closes
   *  9:30 PM, but which days isn’t said". */
  unread?: string[]
  queue: 'filed' | 'before' | 'waiting' | null
  /** Anything else worth a line: days left to the newsletter, say. */
  note?: string
  list?: { listed: number; matching: number; differences: number; filed: number }
  /** A shul's page: the parts of its times it gave (timesParts.ts), for
   *  Shul times' Reads to name it by. */
  parts?: PartGiven[]
  /** A Refuah watch's: the guide's entries it knows came from Refuah, by
   *  field and name (refuahWatch.ts), so only those are ever taken off. */
  refuahHad?: string[]
  /** A listing's page: its phone and email as the page gives them
   *  (contactRead.ts), by field key: the ones that match the listing, and
   *  the ones it would change. For the job page's Phone or Contact box. */
  contact?: { same: string[]; changes: string[] }
}

/** A check whose differences were filed, now or before, so they're a
 *  finding (watchFindings.ts): settled once none of the place's findings
 *  waits, since the admin updated the listing or skipped it. `waiting`
 *  unknown, nothing is settled. */
export const settles = (c: WatchCheck, waiting: number | undefined) => waiting === 0 && c.result === 'differs' && (c.queue === 'filed' || c.queue === 'before')

/** A check as a runner makes it; the run dates it. */
export type CheckFound = Omit<WatchCheck, 'at'>

/** The `created_by` of the watches the daily run makes for each food
 *  place's menu (menuWatch.ts), so it only ever adds and removes its own,
 *  and the Watches tab says what they do. An admin's own watch on a menu
 *  page is an ordinary website watch. */
export const MENU_WATCH_CREATOR = 'menu links'

/** The `created_by` of the watches the daily run makes for each hospital
 *  it matches to Refuah by map position (refuahMatch.ts). As with menus,
 *  it only adds and removes its own. */
export const REFUAH_MATCH_CREATOR = 'Refuah match'

/** One place a list differs from the guide on, as a line for the Watches
 *  tab, saying why it wasn't filed this time when it wasn't. */
export function listDifference(name: string, what: string, filing: 'now' | 'before' | 'closed'): string {
  const why = filing === 'before' ? ' (filed before)' : filing === 'closed' ? ' (closed on Google, not filed)' : ''
  return `${name}: ${what}${why}`
}

/** What a run of a list read by code compared (Keystone-K's, Mekor's):
 *  how many places it lists, how many match the guide, how many differ,
 *  and how many of those it filed this time. The rest were filed before.
 *  Which places differ is kept too, so an admin can see them without
 *  pressing Check now (the user, Oct 20). */
export function listCheck(run: { entries: number; matching: number; findings: number; filed: number; differences?: string[] }): CheckFound {
  return {
    what: 'list',
    from: null,
    result: run.findings ? 'differs' : 'agrees',
    read: [],
    differences: run.differences ?? [],
    queue: run.findings ? (run.filed ? 'filed' : 'before') : null,
    list: { listed: run.entries, matching: run.matching, differences: run.findings, filed: run.filed },
  }
}

/** What one run of a watch came to. */
export type WatchOutcome =
  | { ok: true; filed: number; pageHash?: string; check?: CheckFound }
  | { ok: false; error: string; check?: CheckFound }

/** A page address as the guide keeps it: https, no fragment, no trailing
 *  spaces. Null for anything that isn't a web page. */
export function normalizeWatchUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Another scheme ("mailto:", "tel:") isn't a page; "example.org:8080" is.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.')) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

/** Which reader a page gets, from its address. Keystone-K's list is read
 *  entry by entry; any other page is watched for changes. */
export function kindForUrl(url: string): WatchKind {
  const a = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')
  const b = KEYSTONE_LIST_URL.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')
  return a === b ? 'keystone_list' : 'website'
}

/** The columns a run writes, and whether to email about it. */
export function afterRun(
  watch: Pick<Watch, 'failingSince' | 'pageHash' | 'pageChangedAt'>,
  outcome: WatchOutcome,
  now: string,
): {
  update: Partial<Pick<Watch, 'lastRunAt' | 'lastOkAt' | 'lastError' | 'failingSince' | 'lastFiled' | 'pageHash' | 'pageChangedAt' | 'lastCheck'>>
  alert: 'broke' | 'recovered' | null
} {
  // A run that only fingerprinted the page keeps the last check's result.
  const check = outcome.check ? { lastCheck: { ...outcome.check, at: now } } : {}
  if (!outcome.ok) {
    return {
      update: { lastRunAt: now, lastError: outcome.error, failingSince: watch.failingSince ?? now, ...check },
      alert: watch.failingSince ? null : 'broke',
    }
  }
  const update: ReturnType<typeof afterRun>['update'] = {
    lastRunAt: now,
    lastOkAt: now,
    lastError: null,
    failingSince: null,
    lastFiled: outcome.filed,
    ...check,
  }
  if (outcome.pageHash !== undefined) {
    update.pageHash = outcome.pageHash
    // The first read sets the baseline: nothing has changed yet.
    if (watch.pageHash && watch.pageHash !== outcome.pageHash) update.pageChangedAt = now
  }
  return { update, alert: watch.failingSince ? 'recovered' : null }
}

/** Two days without a run means the daily cron itself has stopped. */
export const STALE_AFTER_MS = 2 * 86_400_000

export type WatchHealth =
  | { state: 'paused' }
  | { state: 'waiting' } // added, not run yet
  | { state: 'working'; since: string }
  | { state: 'failing'; since: string; error: string }
  | { state: 'stale'; lastRunAt: string }

export function watchHealth(watch: Pick<Watch, 'active' | 'lastRunAt' | 'lastOkAt' | 'lastError' | 'failingSince'>, now: number): WatchHealth {
  if (!watch.active) return { state: 'paused' }
  if (!watch.lastRunAt) return { state: 'waiting' }
  if (now - Date.parse(watch.lastRunAt) > STALE_AFTER_MS) return { state: 'stale', lastRunAt: watch.lastRunAt }
  if (watch.failingSince) return { state: 'failing', since: watch.failingSince, error: watch.lastError ?? 'Unknown error' }
  return { state: 'working', since: watch.lastOkAt ?? watch.lastRunAt }
}
