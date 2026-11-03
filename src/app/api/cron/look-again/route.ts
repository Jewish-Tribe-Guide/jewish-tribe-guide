// GET|POST /api/cron/look-again
//
// Look again (lookAgain.ts): what a job couldn't find, tried again a month
// after the last try, a few a night: an eruv's status page on its website,
// a menu that couldn't be read, a place Google has no match for. What it
// finds waits on To do; nothing is set on its own. Meant to run daily
// (vercel.json).
//
// Each run is recorded for the Watches tab (jobRunStore.ts).
//
// Auth: as sync-hours (cronAuth.ts).
import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { lookAgainNight } from '@/lib/lookAgainRun'
import { recordJobRun } from '@/lib/jobRunStore'
import { lookAgainOutcome } from '@/lib/jobRuns'

export const maxDuration = 300

async function run(): Promise<NextResponse> {
  try {
    const body = await recordJobRun('look-again', () => lookAgainNight(process.env.OPENAI_API_KEY), lookAgainOutcome)
    return NextResponse.json({ ok: true, ...body })
  } catch (err) {
    console.error('[cron/look-again] failed:', err)
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
