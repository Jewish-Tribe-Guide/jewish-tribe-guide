// One run of the Keystone-K watch: read Keystone-K's list of the places it
// certifies and put every difference from the guide in the moderation queue
// (see keystoneWatch.ts). Writes no listing: an admin approves or rejects
// each suggestion with the list's own words in front of them.
//
// Run daily for every keystone_list watch by /api/cron/watches, and on
// demand from the admin Watches tab. `dry` says what it would file and
// files nothing.

import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest, type WatchDigestItem } from '@/lib/email'
import { submitListingCreate, submitListingDelete, submitListingUpdate } from '@/lib/submissionStore'
import { findPlaceStatus } from '@/lib/googlePlaces'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import {
  KEYSTONE_WATCH_NAME,
  compareKeystone,
  findingKey,
  findingNote,
  parseKeystoneList,
  submissionKey,
  type WatchFinding,
  type WatchedListing,
} from '@/lib/keystoneWatch'

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

export type KeystoneRun =
  | { ok: false; error: string }
  | {
      ok: true
      entries: number
      findings: number
      filed: number
      closedOnGoogle: string[]
      /** A dry run's suggestions, unfiled. */
      wouldFile?: (WatchDigestItem & { kind: WatchFinding['kind']; note: string })[]
    }

export async function runKeystoneWatch(community: string, url: string, { dry = false }: { dry?: boolean } = {}): Promise<KeystoneRun> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: WATCH_FETCH_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    return { ok: false, error: `Couldn\u2019t reach Keystone-K's list (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { ok: false, error: `Keystone-K's list answered ${res.status}` }
  const entries = parseKeystoneList(await res.text())
  if (entries.length < MIN_ENTRIES) {
    return { ok: false, error: `Read only ${entries.length} places from Keystone-K's list; its page may have changed. Nothing filed.` }
  }

  const supabase = getAdminClient()
  const { data: rows, error } = await supabase
    .from('resource')
    .select('id,category,name,address,phone,anchor_id,distance,details')
    .eq('community_id', community)
    .eq('status', 'approved')
    .in('category', ['restaurant', 'grocery'])
  if (error) return { ok: false, error: `Couldn\u2019t read the guide's listings: ${error.message}` }

  const findings = compareKeystone(entries, (rows ?? []) as WatchedListing[])

  // Everything this watch has filed before, whatever became of it: a
  // suggestion an admin rejected isn't made again until the list changes.
  const { data: earlier, error: earlierError } = await supabase
    .from('submission')
    .select('operation,target_id,payload,note')
    .eq('community_id', community)
    .eq('submitted_by->>name', KEYSTONE_WATCH_NAME)
  if (earlierError) return { ok: false, error: `Couldn\u2019t read earlier suggestions: ${earlierError.message}` }
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
    return {
      ok: true,
      entries: entries.length,
      findings: findings.length,
      filed: 0,
      closedOnGoogle: closed,
      wouldFile: fresh.map((f) => ({ kind: f.kind, ...describe(f), note: notes.get(f)! })),
    }
  }

  const by = { name: KEYSTONE_WATCH_NAME }
  const items: WatchDigestItem[] = []
  for (const f of fresh) {
    const note = notes.get(f)!
    if (f.kind === 'new') {
      await submitListingCreate(
        community,
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
      await submitListingDelete(community, f.listing.id, note, by)
    } else {
      const l = f.listing
      await submitListingUpdate(
        community,
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

  await sendWatchDigest(community, "Keystone-K's list", items).catch((err) =>
    console.error('[watch-keystone] digest failed:', err),
  )

  return { ok: true, entries: entries.length, findings: findings.length, filed: items.length, closedOnGoogle: closed }
}
