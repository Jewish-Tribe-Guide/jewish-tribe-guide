import { MENU_WATCH_CREATOR, type Watch } from './watches'
import { isMekorList } from './mekorWatch'
import { refuahHospitalId } from './refuahWatch'
import { isEruvWebsiteWatch } from './eruvWebsite'
import { isListingPageWatch } from './listingPageWatch'
import { isNewsletterWatch } from './newsletter'

// ── The order the nightly run checks the watches in (Oct 24) ────────────────
// They used to run in the order they were added, inside a minute, so on
// Oct 24 the run stopped after the first 29 of 107 every morning and the
// newest never ran at all. Now, when there's time for them all, the order
// doesn't matter; when there isn't, the most important go first, and any
// watch that missed a night goes ahead of everything, so a slow night only
// delays the least important rather than dropping them for good.
//
// Oct 25: on a night with a backlog, the watches that missed the night
// before filled the run, and the kosher lists and Refuah pages, read the
// night before, were the ones left over, so the most important were read
// every other night. They're quick (eight reads, about two seconds), so
// they now go ahead of the backlog too.

/** Most important first: a lost hechsher is the costliest mistake, then
 *  what a patient needs, then Shabbos, then times and hours. Menus are
 *  last: the slowest (the AI reads them) and the least urgent. */
export const WATCH_PRIORITY = ['kosher', 'hospital', 'eruv', 'times', 'website', 'menu'] as const
export type WatchPriority = (typeof WATCH_PRIORITY)[number]

export function watchPriority(w: Pick<Watch, 'kind' | 'url' | 'createdBy'>): WatchPriority {
  if (w.kind === 'keystone_list' || isMekorList(w.url)) return 'kosher'
  if (refuahHospitalId(w.url)) return 'hospital'
  if (isEruvWebsiteWatch(w)) return 'eruv'
  if (isListingPageWatch(w) || isNewsletterWatch({ createdBy: w.createdBy, url: w.url })) return 'times'
  if (w.createdBy === MENU_WATCH_CREATOR) return 'menu'
  return 'website'
}

/** Missed a night: not checked for a day and a half. A clean 48 hours
 *  would miss it, since Vercel starts the cron any time in its hour, so
 *  two nights apart can be 47 hours. */
export const OVERDUE_AFTER_MS = 36 * 3_600_000

/** Read first every night, ahead of any that missed one. */
const ALWAYS_FIRST: readonly WatchPriority[] = ['kosher', 'hospital']

/** The active watches, in the order the night's run checks them: the
 *  kosher lists and hospitals, then any that missed a night (or never
 *  ran), then by priority, and the one checked longest ago first within
 *  each. */
export function orderForRun<W extends Pick<Watch, 'active' | 'kind' | 'url' | 'createdBy' | 'lastRunAt'>>(watches: readonly W[], now: number): W[] {
  const ran = (w: W) => (w.lastRunAt ? Date.parse(w.lastRunAt) : 0)
  const overdue = (w: W) => now - ran(w) > OVERDUE_AFTER_MS
  return watches
    .filter((w) => w.active)
    .map((w) => ({ w, first: ALWAYS_FIRST.includes(watchPriority(w)), overdue: overdue(w), rank: WATCH_PRIORITY.indexOf(watchPriority(w)), ran: ran(w) }))
    .sort((a, b) => Number(b.first) - Number(a.first) || Number(b.overdue) - Number(a.overdue) || a.rank - b.rank || a.ran - b.ran)
    .map((x) => x.w)
}

// ── Six at once (Oct 25) ────────────────────────────────────────────────────
// One at a time, the night's run spent 2½ of its 3½ minutes on six AI
// reads of 10–34s each while the quick pages waited, and stopped with 33
// of 107 left. Side by side, last night's 74 take about 34s, as long as
// its slowest read, so a list several times this size fits.
//
// Never two at once on one site (it's asked politely, a page at a time:
// Refuah's seven hospitals go one after another) nor for one place (two
// readings of one listing never file over each other). The AI read cap
// holds as it is: each read takes from it with nothing awaited between
// looking and taking (menuWatchRun.ts, listingPageRun.ts).

export const WATCHES_AT_ONCE = 6

/** What a watch can't share with one being read: its site, and its place. */
export function sideBySideKeys(w: Pick<Watch, 'url' | 'resourceId'>): string[] {
  let site = w.url
  try {
    site = new URL(w.url).hostname.toLowerCase().replace(/^www\./, '') || w.url
  } catch {
    // Not a web address (a newsletter's mailto:): its own.
  }
  return [`site:${site}`, ...(w.resourceId ? [`place:${w.resourceId}`] : [])]
}

/** Runs `queue` up to `atOnce` at a time, each time starting the first in
 *  line that shares nothing with one being read, until `mayStart` says no
 *  more. The results come back in the queue's order; `left`, how many
 *  never started. */
export function runSideBySide<W, R>(
  queue: readonly W[],
  { atOnce = WATCHES_AT_ONCE, keysOf, mayStart, run }: { atOnce?: number; keysOf: (w: W) => readonly string[]; mayStart: () => boolean; run: (w: W) => Promise<R> },
): Promise<{ results: R[]; left: number }> {
  const waiting = queue.map((_, i) => i)
  const busy = new Set<string>()
  const done = new Map<number, R>()
  let running = 0
  let stopped = false
  return new Promise((resolve, reject) => {
    const next = () => {
      while (running < atOnce && waiting.length && !stopped) {
        if (!mayStart()) {
          stopped = true
          break
        }
        const at = waiting.findIndex((i) => keysOf(queue[i]).every((k) => !busy.has(k)))
        if (at < 0) break
        const [i] = waiting.splice(at, 1)
        const keys = keysOf(queue[i])
        for (const k of keys) busy.add(k)
        running++
        run(queue[i]).then(
          (r) => {
            done.set(i, r)
            for (const k of keys) busy.delete(k)
            running--
            next()
          },
          reject,
        )
      }
      if (running === 0) resolve({ results: [...done].sort(([a], [b]) => a - b).map(([, r]) => r), left: waiting.length })
    }
    next()
  })
}
