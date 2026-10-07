// GET|POST /api/cron/watches
//
// Runs every active watch once (watches.ts): Keystone-K's list files its
// differences as suggestions, a website is checked for a change. Then the
// eruvim's lines, on the day before candles (eruvLineRun.ts). Meant to
// run daily (vercel.json). Each run is recorded on the watch, and the admins
// are emailed once when a watch breaks and once when it recovers.
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

export const maxDuration = 60

async function eruvLines() {
  return runEruvLines().catch((err) => {
    console.error('[cron/watches] eruv lines failed:', err)
    return [{ id: '*', result: 'failed' as const, error: err instanceof Error ? err.message : String(err) }]
  })
}

async function runAll(): Promise<NextResponse> {
  const { watches, available } = await listAllWatches()

  if (!available) {
    const results = []
    for (const w of BUILT_IN_WATCHES) results.push({ url: w.url, ...(await runWatch(w)) })
    return NextResponse.json({ ok: true, recorded: false, results, eruvLines: await eruvLines() })
  }

  const alerts = new Map<string, WatchHealthAlert[]>()
  const results = []
  for (const watch of watches.filter((w) => w.active)) {
    const { outcome, alert } = await runAndRecord(watch)
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
  return NextResponse.json({ ok: true, recorded: true, results, eruvLines: await eruvLines() })
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await runAll()
}

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await runAll()
}
