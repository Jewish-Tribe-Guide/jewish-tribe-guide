// GET|POST /api/cron/watch-keystone
//
// Reads Keystone-K's list of the places it certifies and puts every
// difference from the guide in the moderation queue (see keystoneWatch.ts).
// Meant to run daily (vercel.json). Writes no listing: an admin approves or
// rejects each suggestion with the list's own words in front of them.
//
// `?dry=1` returns what it would file and files nothing.
//
// Auth: as sync-hours (cronAuth.ts).

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { cronAuthorized } from '@/lib/cronAuth'
import { sendWatchDigest, type WatchDigestItem } from '@/lib/email'
import { submitListingCreate, submitListingUpdate } from '@/lib/submissionStore'
import {
  KEYSTONE_LIST_URL,
  KEYSTONE_WATCH_NAME,
  compareKeystone,
  findingKey,
  findingNote,
  parseKeystoneList,
  submissionKey,
  type WatchFinding,
  type WatchedListing,
} from '@/lib/keystoneWatch'

/** Keystone-K certifies in and around Philadelphia only. */
const COMMUNITY = 'philly'

/** Fewer entries than this means the page changed shape, not that Keystone-K
 *  stopped certifying half of Philadelphia: file nothing rather than a card
 *  saying every place lost its hechsher. The list had 54 on Oct 5, 2026. */
const MIN_ENTRIES = 30

function describe(f: WatchFinding): WatchDigestItem {
  if (f.kind === 'new') return { name: f.entry.name, what: 'On the list, not in the guide' }
  if (f.kind === 'gone') return { name: f.listing.name, what: 'No longer on the list' }
  return { name: f.listing.name, what: f.changes.join('; ') }
}

async function run(dry: boolean): Promise<NextResponse> {
  const res = await fetch(KEYSTONE_LIST_URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; PhillyJewishGuide/1.0)' },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ ok: false, error: `Keystone-K's list answered ${res.status}` }, { status: 502 })
  const entries = parseKeystoneList(await res.text())
  if (entries.length < MIN_ENTRIES) {
    return NextResponse.json(
      { ok: false, error: `Read only ${entries.length} places from Keystone-K's list; its page may have changed. Nothing filed.` },
      { status: 502 },
    )
  }

  const supabase = getAdminClient()
  const { data: rows, error } = await supabase
    .from('resource')
    .select('id,category,name,address,phone,anchor_id,distance,details')
    .eq('community_id', COMMUNITY)
    .eq('status', 'approved')
    .in('category', ['restaurant', 'grocery'])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const findings = compareKeystone(entries, (rows ?? []) as WatchedListing[])

  // Everything this watch has filed before, whatever became of it: a
  // suggestion an admin rejected isn't made again until the list changes.
  const { data: earlier, error: earlierError } = await supabase
    .from('submission')
    .select('operation,target_id,payload,note')
    .eq('community_id', COMMUNITY)
    .eq('submitted_by->>name', KEYSTONE_WATCH_NAME)
  if (earlierError) return NextResponse.json({ ok: false, error: earlierError.message }, { status: 500 })
  const filed = new Set((earlier ?? []).map(submissionKey).filter(Boolean))
  const fresh = findings.filter((f) => !filed.has(findingKey(f)))

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      entries: entries.length,
      findings: findings.length,
      wouldFile: fresh.map((f) => ({ kind: f.kind, ...describe(f), note: findingNote(f) })),
    })
  }

  const by = { name: KEYSTONE_WATCH_NAME }
  const items: WatchDigestItem[] = []
  for (const f of fresh) {
    const note = findingNote(f)
    if (f.kind === 'new') {
      await submitListingCreate(
        COMMUNITY,
        {
          category: f.category,
          name: f.entry.name,
          anchorId: 'community',
          distance: null,
          address: f.entry.address,
          phone: f.entry.phone,
          details: f.details,
          submittedBy: by,
        },
        note,
      )
    } else {
      const l = f.listing
      await submitListingUpdate(
        COMMUNITY,
        l.id,
        {
          category: l.category,
          name: l.name,
          anchorId: l.anchor_id,
          distance: l.distance,
          address: l.address ?? '',
          phone: l.phone ?? '',
          details: f.details,
        },
        note,
        by,
      )
    }
    items.push(describe(f))
  }

  await sendWatchDigest(COMMUNITY, "Keystone-K's list", items).catch((err) =>
    console.error('[watch-keystone] digest failed:', err),
  )

  return NextResponse.json({ ok: true, entries: entries.length, findings: findings.length, filed: items.length })
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await run(req.nextUrl.searchParams.get('dry') === '1')
}

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await run(req.nextUrl.searchParams.get('dry') === '1')
}
