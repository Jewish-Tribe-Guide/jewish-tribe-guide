// ── Look again (drawn Oct 27, board XSuFCMdLQmBYNJqfWaEM3A; built Nov 3) ─────
// What a job couldn't find, tried again a month after the last try, a few a
// night (/api/cron/look-again): an eruv with no status page, a menu that
// couldn't be read, a place Google has no match for. What it finds is
// offered on To do, never set on its own (Use this page / Not this page,
// Use this place / Not this place); a menu read again is a reading like
// any other. Stop trying takes one off for good, until it's started again.
// Pure: the job, its page and To do all read it. The rows are look_again's
// (migration 092, lookAgainStore.ts).

import { jobHealth, NIGHTLY_JOBS, type JobRun } from './jobRuns'

export type LookKind = 'eruv' | 'menu' | 'google'

/** An eruv's status page found on its website. */
export type FoundPage = { url: string; status: 'up' | 'down'; words: string | null; at: string }
/** A place Google has under the listing's name. */
export type FoundPlace = { placeId: string; name: string; address: string; at: string }

export type LookRow = {
  kind: LookKind
  targetId: string
  triedAt: string | null
  found: FoundPage | FoundPlace | null
  notThese: string[]
  stoppedAt: string | null
}

export type LookItem = {
  kind: LookKind
  id: string
  name: string
  /** Why it's here, in a few words ("Turned the reader away"). */
  why: string
  /** What the last try said, in full: a menu's note. */
  note: string | null
  lastTry: string | null
  found: FoundPage | FoundPlace | null
  stopped: string | null
}

/** A month after the last try (the user, Oct 27). */
export const LOOK_AGAIN_MS = 30 * 86_400_000
/** Tried a night, at most: a menu is a page or a few and an AI read. */
export const LOOKS_PER_NIGHT = 5

export const LOOK_GROUPS: { kind: LookKind; title: string }[] = [
  { kind: 'eruv', title: 'Eruv status page' },
  { kind: 'menu', title: 'Menus that couldn’t be read' },
  { kind: 'google', title: 'Not on Google' },
]

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A failed menu reading's note, in the drawing's few words. The order
 *  matters: a cookie notice's note says it names no dishes too. */
export function menuWhy(note: string | null): string {
  const n = note ?? ''
  if (/turned the reader away|\b40[13]\b/i.test(n)) return 'Turned the reader away'
  if (/cookie/i.test(n)) return 'Only a cookie notice'
  if (/took too long/i.test(n)) return 'Took too long to read'
  if (/doesn’t lead to a public web|doesn't lead to a public web/i.test(n)) return 'Its menu link doesn’t open'
  if (/not a menu|catalog/i.test(n)) return 'Not a menu'
  if (/no dishes|any dishes|not include a menu/i.test(n)) return 'No dishes named'
  if (/couldn’t read a menu on its website/i.test(n)) return 'No menu found on its website'
  return 'Couldn’t be read'
}

const later = (a: string | null | undefined, b: string | null | undefined) => (!a ? (b ?? null) : !b ? a : a > b ? a : b)

export type LookInput = {
  eruvim: readonly { id: string; name: string; website: string | null; statusUrl: string | null; statusEmail?: string | null; active?: boolean }[]
  /** Food places whose menu reading failed. A place said to have no menu
   *  online isn't one: that's an answer. */
  menus: readonly { id: string; name: string; reading: { status: string; note: string | null; readAt: string } }[]
  google: readonly { id: string; name: string; matched: boolean; notOnGoogle: string | null; failedAt?: string | null }[]
  rows: readonly LookRow[]
}

/** Everything Look again tries, or has stopped trying. */
export function lookItems(input: LookInput): LookItem[] {
  const rows = new Map(input.rows.map((r) => [`${r.kind}:${r.targetId}`, r]))
  const item = (kind: LookKind, id: string, name: string, why: string, lastTry: string | null, note: string | null = null): LookItem => {
    const row = rows.get(`${kind}:${id}`)
    // Found, it says so: not why it was looked for.
    if (row?.found) why = kind === 'eruv' ? 'Status page found' : 'Found on Google'
    return { kind, id, name, why, note, lastTry: later(row?.triedAt, lastTry), found: row?.found ?? null, stopped: row?.stoppedAt ?? null }
  }
  const out: LookItem[] = []
  for (const e of input.eruvim) {
    if (e.active === false || !e.website || e.statusUrl || e.statusEmail) continue
    out.push(item('eruv', e.id, e.name, `No status page on ${host(e.website)}`, null))
  }
  for (const m of input.menus) {
    if (m.reading.status !== 'failed') continue
    out.push(item('menu', m.id, m.name, menuWhy(m.reading.note), m.reading.readAt, m.reading.note))
  }
  for (const g of input.google) {
    if (g.matched) continue
    const tried = rows.get(`google:${g.id}`)?.triedAt ?? g.failedAt ?? null
    const why = g.notOnGoogle ? 'You said Not on Google' : tried ? 'Not found on Google' : 'Never looked for'
    out.push(item('google', g.id, g.name, why, g.notOnGoogle ?? g.failedAt ?? null))
  }
  return out
}

/** When it's next tried, by itself: never tried, at once. */
export const dueAt = (i: Pick<LookItem, 'lastTry'>) => (i.lastTry ? Date.parse(i.lastTry) + LOOK_AGAIN_MS : 0)

/** Still tried: not stopped, and not waiting on an admin with a find. */
export const stillTried = (i: Pick<LookItem, 'stopped' | 'found'>) => !i.stopped && !i.found

const KIND_ORDER: LookKind[] = ['eruv', 'menu', 'google']

/** Those due by `at`, in the order they're tried: the longest waiting first,
 *  one never tried before any tried, then by kind and name. */
export function dueQueue(items: readonly LookItem[], at: number): LookItem[] {
  return items
    .filter((i) => stillTried(i) && dueAt(i) <= at)
    .sort((a, b) => dueAt(a) - dueAt(b) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name))
}

const ZONE = 'America/New_York'
const day = (t: number | string) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: ZONE })

/** "Not tried yet · tonight", "Oct 22 · next Nov 21", "Oct 22 · tomorrow".
 *  `nightOf`: how many nights from the next run each one due is tried,
 *  from its place in the queue. */
export function whenLine(i: LookItem, nightOf: ReadonlyMap<LookItem, number>, nextRun: number): string {
  if (i.stopped) return `Stopped ${day(i.stopped)}`
  if (i.found) return `Found ${day(i.found.at)}`
  const tried = i.lastTry ? day(i.lastTry) : 'Not tried yet'
  const next = nextTry(i, nightOf, nextRun)!
  return nightOf.has(i) ? `${tried} · ${next.toLowerCase()}` : `${tried} · next ${next}`
}

/** "Tonight", "Tomorrow", "Nov 21": its next try, or null for one stopped or
 *  waiting on an admin. */
export function nextTry(i: LookItem, nightOf: ReadonlyMap<LookItem, number>, nextRun: number): string | null {
  if (!stillTried(i)) return null
  const night = nightOf.get(i)
  if (night === undefined) return day(dueAt(i))
  return night === 0 ? 'Tonight' : night === 1 ? 'Tomorrow' : day(nextRun + night * 86_400_000)
}

/** The page's rows: each group's, and those stopped. */
export type LookView = {
  /** "Tonight, 4:00 AM · 5 due" */
  tonight: string
  /** Still tried, waiting or not. */
  total: number
  groups: { kind: LookKind; title: string; rows: LookShown[] }[]
  stopped: LookShown[]
}

/** A row: `when` beside it, `next` when it's opened. */
export type LookShown = LookItem & { when: string; next: string | null }

export function lookView(items: readonly LookItem[], nextRun: number, perNight = LOOKS_PER_NIGHT): LookView {
  const queue = dueQueue(items, nextRun)
  const nightOf = new Map(queue.map((i, n) => [i, Math.floor(n / perNight)]))
  const rank = (i: LookItem) => (i.found ? -1 : (nightOf.get(i) ?? Infinity))
  const shown = (i: LookItem): LookShown => ({ ...i, when: whenLine(i, nightOf, nextRun), next: nextTry(i, nightOf, nextRun) })
  const live = items.filter((i) => !i.stopped)
  const time = new Date(nextRun).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ZONE })
  return {
    tonight: `Tonight, ${time} · ${Math.min(queue.length, perNight)} due`,
    total: live.length,
    groups: LOOK_GROUPS.map((g) => ({
      ...g,
      rows: live
        .filter((i) => i.kind === g.kind)
        .sort((a, b) => rank(a) - rank(b) || dueAt(a) - dueAt(b) || a.name.localeCompare(b.name))
        .map(shown),
    })).filter((g) => g.rows.length > 0),
    stopped: items.filter((i) => i.stopped).sort((a, b) => a.name.localeCompare(b.name)).map(shown),
  }
}

/** A Google result is offered only under the listing's own name. */
export function pickFound<T extends { name: string }>(results: readonly T[], name: string, overlap: (a: string, b: string) => boolean): T | null {
  return results.find((r) => overlap(r.name, name)) ?? null
}

/** The first page found that an admin hasn't turned down. */
export function pickPage<T extends { url: string }>(pages: readonly T[], notThese: readonly string[]): T | null {
  return pages.find((p) => !notThese.includes(p.url)) ?? null
}

export const isFoundPage = (f: FoundPage | FoundPlace): f is FoundPage => 'url' in f

/** What its route answers. `leftOut`: the names of listings Google doesn't
 *  check at all, in a category with no address (groups, not places).
 *  `runs`: the job's latest first. */
export type LookAgainLoaded = { available: boolean; items: LookItem[]; leftOut: string[]; runs?: JobRun[] }

/** Look again's run, per community, for the Watches tab's line. */
export type LookAgainRun = { skipped: string } | { communities: readonly { community: string; tried: number; found: number; failed: number; left: number }[] }

/** Needs fixing on the Watches tab, in the words the other jobs' are:
 *  its last run failed, was cut off, or it stopped running. */
export function lookAgainFix(runs: readonly JobRun[], now: number): { name: string; why: string; page: string } | null {
  const health = jobHealth(NIGHTLY_JOBS.find((j) => j.id === 'look-again')!, runs, now)
  const why =
    health.state === 'late'
      ? `Didn’t run since ${day(health.since)}`
      : health.state === 'failed'
        ? 'Last run failed'
        : health.state === 'cut off'
          ? 'Last run stopped before it finished'
          : null
  return why ? { name: 'Look again', why, page: 'job/look-again' } : null
}
