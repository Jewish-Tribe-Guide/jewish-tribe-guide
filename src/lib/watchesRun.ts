// The morning watches run (/api/cron/watches starts one per community,
// each with its own five minutes, Nov 20).
//
// Runs every active watch once (watches.ts): Keystone-K's list files its
// differences as suggestions, as does a hospital's page on Refuah
// (refuahWatch.ts); a food place's menu is read by the AI when it changed
// (menuWatch.ts: first, every place with a menu link is given its watch,
// every hospital the Refuah page nearest it, refuahMatch.ts, and every
// mikvah its pages of hours found from its website, hoursJob.ts),
// and so is a shul's or mikvah's own page of times or hours, for what
// differs from its listing (listingPageWatch.ts); an eruv's website for its
// hotline and email alerts (eruvWebsite.ts); any other website is checked for a change. Alongside
// that, the eruvim's maps, for a part an admin left out that's gone
// (eruvLineRun.ts). Meant to run daily (vercel.json). Each run is recorded
// on the watch, and the admins are emailed once when a watch breaks and
// once when it recovers. The run itself is recorded too (jobRunStore.ts),
// for the Watches tab, with how many of each kind of source it read
// (nightKinds.ts).
//
// Oct 24: the run had a minute and checked the watches in the order they
// were added, so it stopped after the first 29 of 107 every morning. Now
// it has five minutes, checks the most important first and what missed a
// night before anything (watchRunOrder.ts), and starts no watch it might
// not finish: what's left goes first the next night.
//
// Oct 25: one at a time, six slow AI reads took most of that, and 33 of
// 107 were left. Now six are read at once, never two on one site or for
// one place (runSideBySide, watchRunOrder.ts), and the kosher lists and
// hospitals go first every night, ahead of any backlog.
//
// Before migration 070 there is no watch table: the built-in Keystone-K
// watch runs as it did, with nothing recorded.
//
import { listAllWatches } from '@/lib/watchStore'
import { BUILT_IN_WATCHES, runAndRecord, runWatch } from '@/lib/watchRunner'
import { runEruvLines } from '@/lib/eruvLineRun'
import { newMenuReadBudget, syncMenuWatches, type MenuReadBudget } from '@/lib/menuWatchRun'
import { syncRefuahWatches } from '@/lib/refuahMatchRun'
import { syncHoursWatches } from '@/lib/hoursJobRun'
import { syncEruvWebsiteWatches } from '@/lib/eruvWebsiteRun'
import { orderForRun, runSideBySide, sideBySideKeys } from '@/lib/watchRunOrder'
import { recordJobRun } from '@/lib/jobRunStore'
import { watchesOutcome, type WatchesRun } from '@/lib/jobRuns'
import { countWatchKinds } from '@/lib/nightKinds'
import { validatedDuring, type Validated } from '@/lib/validatedDuring'
import { loadListings } from '@/lib/listingReads'
import { jobsOffByCommunity } from '@/lib/jobOff'
import { isNewsletterWatch } from '@/lib/newsletter'
import { nightKindOf } from '@/lib/nightKinds'

/** No watch starts after this much of the run: one AI read can take half
 *  a minute (Oct 24: 31s; 34s the slowest seen), and a shul's calendar is
 *  read a week at a time, this week and next (68s), and the alerts still
 *  go out after the last, inside maxDuration. 200s until Oct 26, when the
 *  night every shul's page is read for its new week (32 AI reads more)
 *  would have left the menus, checked last, for the next night; 250s
 *  until Nov 18, which a two-week read started at the end ran past. The
 *  searches before the watches have their own limit now
 *  (SEARCH_PAGES_FOR_MS), so the watches keep most of the run. */
const START_NO_WATCH_AFTER_MS = 220_000

/** The shul and mikvah page search (syncHoursWatches) starts no place's
 *  search after this much of the run, each search given its own 20s:
 *  every place's website, every night, could take most of the watches'
 *  time (Nov 18 review). The rest are searched on another night. */
const SEARCH_PAGES_FOR_MS = 60_000

async function eruvLines(failed: string[], community?: string) {
  return runEruvLines(undefined, community).catch((err) => {
    console.error('[cron/watches] eruv lines failed:', err)
    failed.push('eruv lines')
    return [{ id: '*', result: 'failed' as const, error: err instanceof Error ? err.message : String(err) }]
  })
}

/** A step of the run that failed: logged, named in `failed` for the run's
 *  warning, and given `empty` so the rest goes on. */
function step<T>(name: string, failed: string[], work: Promise<T>, empty: T): Promise<T> {
  return work.catch((err) => {
    console.error(`[cron/watches] ${name} failed:`, err)
    failed.push(name)
    return empty
  })
}

type Body = Record<string, unknown> & { run: WatchesRun }

async function runAll(started: number, community?: string): Promise<Body> {
  // The steps before the watches (and the eruv lines beside them) that
  // failed, in the run's warning. Ordered as below, the eruv lines last.
  const failedBefore: string[] = []
  const failedLines: string[] = []
  // Started at once: nothing in it waits on the watches.
  const lines = eruvLines(failedLines, community)
  // Before listing them, so a place given a menu link yesterday is read today.
  const menus = await step('menu links', failedBefore, syncMenuWatches(community), [])
  // At once: one asks Refuah, one the mikvahs' websites; the last only
  // gives each eruv's website its watch (eruvWebsiteRun.ts).
  const [hospitals, hours, eruvWebsites] = await Promise.all([
    step('Refuah', failedBefore, syncRefuahWatches(undefined, community), []),
    step('shul and mikvah pages', failedBefore, syncHoursWatches(undefined, undefined, started + SEARCH_PAGES_FOR_MS, community), []),
    step('eruv websites', failedBefore, syncEruvWebsiteWatches(community), []),
  ])
  const all = await listAllWatches()
  const watches = community ? all.watches.filter((w) => w.communityId === community) : all.watches
  const available = all.available

  if (!available) {
    const results = []
    for (const w of BUILT_IN_WATCHES.filter((b) => !community || b.communityId === community)) results.push({ url: w.url, ...(await runWatch(w)) })
    const run = { active: results.length, ran: results.length, notWorking: results.filter((r) => !r.ok).length, left: 0 }
    return { ok: true, recorded: false, results, eruvLines: await lines, run }
  }

  // Each community its own AI reads (Nov 20): shared, the first community's
  // pages could spend them all and leave another's changed menu unread.
  const budgets = new Map<string, MenuReadBudget>()
  const budgetOf = (c: string) => budgets.get(c) ?? budgets.set(c, newMenuReadBudget()).get(c)!
  // Without them, a listing's page goes by its label (watchGroupOf).
  const listings = await step('reading the listings', failedBefore, loadListings(watches.map((w) => w.communityId)), undefined)
  // What a community turned off isn't read, so it costs nothing (jobOff.ts).
  const off = jobsOffByCommunity(watches)
  const wanted = watches.filter((w) => {
    const kinds = off.get(w.communityId)
    if (!kinds) return true
    const kind = isNewsletterWatch(w) ? 'newsletters' : nightKindOf(w, listings?.readsOf, listings?.siteGap)
    return !kind || !kinds.has(kind)
  })
  const queue = orderForRun(wanted, started)
  const validated = new Map<string, Validated[]>()
  const { results, left } = await runSideBySide(queue, {
    keysOf: sideBySideKeys,
    mayStart: () => Date.now() - started <= START_NO_WATCH_AFTER_MS,
    run: async (watch) => {
      // A watch that breaks is told of in the nightly email (nightlyEmail.ts).
      // What it found agreeing is kept for Activity (validatedDuring.ts).
      try {
        const { result, validated: found } = await validatedDuring(() => runAndRecord(watch, undefined, budgetOf(watch.communityId)))
        if (found.length) validated.set(watch.id, found)
        return { id: watch.id, url: watch.url, ...result.outcome }
      } catch (err) {
        // Its save failed (runAndRecord's own reading never throws): one
        // watch not working, never the end of the night's run (Nov 18).
        console.error(`[cron/watches] ${watch.id} failed:`, err)
        return { id: watch.id, url: watch.url, ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    },
  })

  // One its reads ran out for wasn't read (the user, Oct 26): not counted
  // as checked, and its kind's line says Not reached.
  const skipped = results.filter((r) => r.ok && r.skipped).length
  const read = new Set(results.filter((r) => r.ok && !r.skipped).map((r) => r.id))
  const eruvLineResults = await lines
  const failedSteps = [...failedBefore, ...failedLines]
  const run = {
    active: queue.length,
    ran: results.length - skipped,
    notWorking: results.filter((r) => !r.ok).length,
    left,
    skipped,
    kinds: countWatchKinds(queue, read, listings?.readsOf, listings?.siteGap, validated),
    ...(failedSteps.length ? { failedSteps } : {}),
  }
  return { ok: true, recorded: true, menus, hospitals, hours, eruvWebsites, results, left, eruvLines: eruvLineResults, run }
}

/** The morning's watches, recorded as a run (jobRunStore.ts): one
 *  community's with `community` (what /api/cron/watches starts, a run a
 *  community), every community's without it. */
export async function runWatches(community?: string, started = Date.now()): Promise<Body> {
  return recordJobRun('watches', () => runAll(started, community), (b) => watchesOutcome(b.run), undefined, community)
}
