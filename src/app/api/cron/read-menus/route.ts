// GET|POST /api/cron/read-menus
//
// Reads the menus of the food places never read (menuPlaceRead.ts), a few
// a morning, so the Main dishes page reads nothing when it's opened (the
// user, Oct 22). Once a place has a reading, its menu watch keeps it
// current (menuWatch.ts), and "Read now" reads it whenever an admin asks.
// Meant to run daily (vercel.json).
//
// Each run is recorded for the Watches tab (jobRunStore.ts).
//
// Auth: as sync-hours (cronAuth.ts).
import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { readUnreadMenus } from '@/lib/menuPlaceRead'
import { recordJobRun } from '@/lib/jobRunStore'
import { readMenusOutcome } from '@/lib/jobRuns'

export const maxDuration = 60

async function run(): Promise<NextResponse> {
  try {
    const body = await recordJobRun(
      'read-menus',
      async () => {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) return { ok: true as const, skipped: 'no OPENAI_API_KEY' }
        return { ok: true as const, menus: await readUnreadMenus(apiKey) }
      },
      readMenusOutcome,
    )
    return NextResponse.json(body)
  } catch (err) {
    console.error('[cron/read-menus] failed:', err)
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
