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
}

/** What one run of a watch came to. */
export type WatchOutcome =
  | { ok: true; filed: number; pageHash?: string }
  | { ok: false; error: string }

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
  update: Partial<Pick<Watch, 'lastRunAt' | 'lastOkAt' | 'lastError' | 'failingSince' | 'lastFiled' | 'pageHash' | 'pageChangedAt'>>
  alert: 'broke' | 'recovered' | null
} {
  if (!outcome.ok) {
    return {
      update: { lastRunAt: now, lastError: outcome.error, failingSince: watch.failingSince ?? now },
      alert: watch.failingSince ? null : 'broke',
    }
  }
  const update: ReturnType<typeof afterRun>['update'] = {
    lastRunAt: now,
    lastOkAt: now,
    lastError: null,
    failingSince: null,
    lastFiled: outcome.filed,
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
