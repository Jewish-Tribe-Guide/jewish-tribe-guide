// GET|POST /api/cron/nightly-email
//
// The nightly email (nightlyEmail.ts, Nov 12): one per community, after
// the last job, telling its admins what the night found, what stopped
// working, and what Google changed on its own. None on a night with
// nothing. Meant to run daily (vercel.json), after look-again.
//
// Each run is recorded for the Watches tab (jobRunStore.ts).
//
// Auth: as sync-hours (cronAuth.ts).
import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { sendNightlyEmails } from '@/lib/nightlyEmailRun'
import { recordJobRun } from '@/lib/jobRunStore'
import { nightlyEmailOutcome } from '@/lib/jobRuns'

export const maxDuration = 60

async function run(): Promise<NextResponse> {
  try {
    const body = await recordJobRun('nightly-email', async () => await sendNightlyEmails(), nightlyEmailOutcome)
    return NextResponse.json({ ok: true, ...body })
  } catch (err) {
    console.error('[cron/nightly-email] failed:', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await run()
}

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await run()
}
