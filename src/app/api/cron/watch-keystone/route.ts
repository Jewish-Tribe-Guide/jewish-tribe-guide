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
import { submitListingCreate, submitListingDelete, submitListingUpdate } from '@/lib/submissionStore'
import { findPlaceStatus } from '@/lib/googlePlaces'
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
  if (f.kind === 'gone') {
    return { name: f.listing.name, what: f.remove ? 'No longer on the list, and it was its only hechsher: remove?' : 'No longer on the list' }
  }
  return { name: f.listing.name, what: f.changes.join('; ') }
}

/** Keystone-K's list lags: a place can close and stay on it for a year
 *  (Shalom Pizzeria, closed on Google, still listed Oct 5). So a place the
 *  guide lacks is asked about on Google before it's suggested: permanently
 *  closed is not suggested at all, anything else is said on the card. Only
 *  new places are asked; the guide's own listings are already checked every
 *  night by the Google sync. */
async function googleSays(f: Extract<WatchFinding, { kind: 'new' }>): Promise<{ closed: boolean; line: string }> {
  const g = await findPlaceStatus(f.entry.name, f.entry.address)
  if (!g) return { closed: false, line: 'Google: couldn\u2019t find it.' }
  const as = g.name ? ` (as "${g.name}")` : ''
  if (g.businessStatus === 'CLOSED_PERMANENTLY') return { closed: true, line: `Google: permanently closed${as}.` }
  if (g.businessStatus === 'CLOSED_TEMPORARILY') return { closed: false, line: `Google: temporarily closed${as}.` }
  return { closed: false, line: `Google: open${as}.` }
}

async function run(dry: boolean): Promise<NextResponse> {
  const res = await fetch(KEYSTONE_LIST_URL, {
    // Says who is asking. Keystone-K's firewall answers 403 to any agent
    // containing "compatible;" (measured Oct 5), so not the usual bot form.
    headers: { 'user-agent': 'PhillyJewishGuide/1.0' },
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
  const unfiled = findings.filter((f) => !filed.has(findingKey(f)))

  const notes = new Map<WatchFinding, string>()
  const closed: string[] = []
  const fresh: WatchFinding[] = []
  for (const f of unfiled) {
    let note = findingNote(f)
    if (f.kind === 'new') {
      const g = await googleSays(f)
      if (g.closed) {
        closed.push(f.entry.name)
        continue
      }
      note += `\n${g.line}`
    }
    notes.set(f, note)
    fresh.push(f)
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      entries: entries.length,
      findings: findings.length,
      closedOnGoogle: closed,
      wouldFile: fresh.map((f) => ({ kind: f.kind, ...describe(f), note: notes.get(f) })),
    })
  }

  const by = { name: KEYSTONE_WATCH_NAME }
  const items: WatchDigestItem[] = []
  for (const f of fresh) {
    const note = notes.get(f)!
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
    } else if (f.kind === 'gone' && f.remove) {
      await submitListingDelete(COMMUNITY, f.listing.id, note, by)
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

  return NextResponse.json({ ok: true, entries: entries.length, findings: findings.length, filed: items.length, closedOnGoogle: closed })
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await run(req.nextUrl.searchParams.get('dry') === '1')
}

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return await run(req.nextUrl.searchParams.get('dry') === '1')
}
