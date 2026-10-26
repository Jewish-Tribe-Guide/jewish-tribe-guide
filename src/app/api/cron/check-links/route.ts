// GET|POST /api/cron/check-links
//
// Opens every link a listing shows that nothing else reads (a kosher
// certificate, a WhatsApp group, a website typed in), to see it's still
// there (linkCheck.ts). No AI: only whether it answers. Meant to run once a
// week (vercel.json); one that doesn't open shows as Not checked on its
// place's row on the Watches tab.
//
// Each run is recorded for the Watches tab (jobRunStore.ts).
//
// Auth: as sync-hours (cronAuth.ts).
import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { checkAllLinks } from '@/lib/linkCheckRun'
import { recordJobRun } from '@/lib/jobRunStore'
import { checkLinksOutcome } from '@/lib/jobRuns'

export const maxDuration = 300

async function run(): Promise<NextResponse> {
  try {
    const links = await recordJobRun('check-links', () => checkAllLinks(), checkLinksOutcome)
    return NextResponse.json({ ok: true, links })
  } catch (err) {
    console.error('[cron/check-links] failed:', err)
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
