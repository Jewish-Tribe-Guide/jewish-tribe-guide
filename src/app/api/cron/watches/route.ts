// GET|POST /api/cron/watches
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
// for the Watches tab.
//
// Oct 24: the run had a minute and checked the watches in the order they
// were added, so it stopped after the first 29 of 107 every morning. Now
// it has five minutes, checks the most important first and what missed a
// night before anything (watchRunOrder.ts), and starts no watch it might
// not finish: what's left goes first the next night.
//
// Before migration 070 there is no watch table: the built-in Keystone-K
// watch runs as it did, with nothing recorded.
//
// Auth: as sync-hours (cronAuth.ts).

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { listAllWatches } from '@/lib/watchStore'
import { BUILT_IN_WATCHES, runAndRecord, runWatch } from '@/lib/watchRunner'
import { sendWatchHealthAlert, type WatchHealthAlert } from '@/lib/email'
import { runEruvLines } from '@/lib/eruvLineRun'
import { newMenuReadBudget, syncMenuWatches } from '@/lib/menuWatchRun'
import { syncRefuahWatches } from '@/lib/refuahMatchRun'
import { syncHoursWatches } from '@/lib/hoursJobRun'
import { syncEruvWebsiteWatches } from '@/lib/eruvWebsiteRun'
import { orderForRun } from '@/lib/watchRunOrder'
import { recordJobRun } from '@/lib/jobRunStore'
import { watchesOutcome, type WatchesRun } from '@/lib/jobRuns'

export const maxDuration = 300

/** No watch starts after this much of the run: one AI read can take half
 *  a minute (Oct 24: 31s), and the alerts still go out after the last. */
const START_NO_WATCH_AFTER_MS = 200_000

async function eruvLines() {
  return runEruvLines().catch((err) => {
    console.error('[cron/watches] eruv lines failed:', err)
    return [{ id: '*', result: 'failed' as const, error: err instanceof Error ? err.message : String(err) }]
  })
}

type Body = Record<string, unknown> & { run: WatchesRun }

async function runAll(started = Date.now()): Promise<Body> {
  // Started at once: nothing in it waits on the watches.
  const lines = eruvLines()
  // Before listing them, so a place given a menu link yesterday is read today.
  const menus = await syncMenuWatches().catch((err) => {
    console.error('[cron/watches] menu watches failed:', err)
    return []
  })
  // At once: one asks Refuah, one the mikvahs' websites; the last only
  // gives each eruv's website its watch (eruvWebsiteRun.ts).
  const [hospitals, hours, eruvWebsites] = await Promise.all([
    syncRefuahWatches().catch((err) => {
      console.error('[cron/watches] Refuah matches failed:', err)
      return []
    }),
    syncHoursWatches().catch((err) => {
      console.error('[cron/watches] hours pages failed:', err)
      return []
    }),
    syncEruvWebsiteWatches().catch((err) => {
      console.error('[cron/watches] eruv websites failed:', err)
      return []
    }),
  ])
  const { watches, available } = await listAllWatches()

  if (!available) {
    const results = []
    for (const w of BUILT_IN_WATCHES) results.push({ url: w.url, ...(await runWatch(w)) })
    const run = { active: results.length, ran: results.length, notWorking: results.filter((r) => !r.ok).length, left: 0 }
    return { ok: true, recorded: false, results, eruvLines: await lines, run }
  }

  const alerts = new Map<string, WatchHealthAlert[]>()
  const results = []
  const budget = newMenuReadBudget()
  const queue = orderForRun(watches, started)
  let left = 0
  for (const [i, watch] of queue.entries()) {
    if (Date.now() - started > START_NO_WATCH_AFTER_MS) {
      left = queue.length - i
      break
    }
    const { outcome, alert } = await runAndRecord(watch, undefined, budget)
    results.push({ id: watch.id, url: watch.url, ...outcome })
    if (alert) {
      const list = alerts.get(watch.communityId) ?? []
      list.push({ label: watch.label || watch.url, url: watch.url, alert, error: outcome.ok ? null : outcome.error })
      alerts.set(watch.communityId, list)
    }
  }

  // Awaited, not left running: the response must not finish first.
  await Promise.all(
    [...alerts].map(([community, list]) =>
      sendWatchHealthAlert(community, list).catch((err) => console.error('[cron/watches] alert failed:', err)),
    ),
  )
  const run = { active: queue.length, ran: results.length, notWorking: results.filter((r) => !r.ok).length, left }
  return { ok: true, recorded: true, menus, hospitals, hours, eruvWebsites, results, left, eruvLines: await lines, run }
}

async function recorded(): Promise<NextResponse> {
  const body = await recordJobRun('watches', runAll, (b) => watchesOutcome(b.run))
  return NextResponse.json(body)
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await recorded()
}

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await recorded()
}
