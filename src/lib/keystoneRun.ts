// One run of the Keystone-K watch: read Keystone-K's list of the places it
// certifies and put every difference from the guide in the moderation queue
// (see keystoneWatch.ts). Changes no listing: an admin approves or rejects
// each suggestion with the list's own words in front of them. A listing the
// list agrees with only has its date moved forward (sourceConfirm.ts).
//
// Run daily for every keystone_list watch by /api/cron/watches, and on
// demand from the admin Watches tab. `dry` says what it would file and
// files nothing.

import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest, type WatchDigestItem } from '@/lib/email'
import { findingPage } from '@/lib/watchFindings'
import { submitListingCreate, submitListingDelete, submitListingUpdate } from '@/lib/submissionStore'
import { canAskGoogle, findPlaceStatus } from '@/lib/googlePlaces'
import { confirmFromSource } from '@/lib/sourceConfirm'
import { KOSHER_SECTION } from '@/lib/boxDates'
import { listDifference, type ListRead } from '@/lib/watches'
import { KEYSTONE_NAME } from '@/lib/sourceNames'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import {
  KEYSTONE_WATCH_NAME,
  compareKeystone,
  findingKey,
  keystoneAgrees,
  findingNote,
  parseKeystoneList,
  submissionKey,
  type KeystoneEntry,
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
  return askGoogleIfOpen(f.entry.name, f.entry.address)
}

/** Whether Google says a place a list names is still open, as a line for
 *  its card. Shared with Mekor Habracha's watch (mekorRun.ts). */
export async function askGoogleIfOpen(name: string, address: string): Promise<{ closed: boolean; line: string }> {
  // Run with no Google key (the test project's daily run, which leaves
  // Google's paid calls out): said so, never "couldn't find it", so the
  // admin checks it's open before approving.
  if (!canAskGoogle()) return { closed: false, line: 'Google wasn\u2019t asked whether it\u2019s still open.' }
  const g = await findPlaceStatus(name, address)
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
      /** The list as read, kept on its watch (WatchCheck.listRead). */
      listRead: ListRead
      findings: number
      filed: number
      /** Listings the list names that agree with it. */
      matching: number
      closedOnGoogle: string[]
      /** Every place it differs on, a line each (listDifference). */
      differences: string[]
      /** Listings the list agreed with, dated today. */
      confirmed?: number
      /** A dry run's suggestions, unfiled. */
      wouldFile?: (WatchDigestItem & { kind: WatchFinding['kind']; note: string })[]
    }

/** Keystone-K's list, read now: every entry on it, or why it couldn't be.
 *  Shared with the Kosher certification page (/api/admin/watches/kosher). */
export async function readKeystoneList(url: string): Promise<{ entries: KeystoneEntry[] } | { error: string }> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: WATCH_FETCH_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    return { error: `Couldn\u2019t reach Keystone-K's list (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { error: `Keystone-K's list answered ${res.status}` }
  const entries = parseKeystoneList(await res.text())
  if (entries.length < MIN_ENTRIES) {
    return { error: `Read only ${entries.length} places from Keystone-K's list; its page may have changed. Nothing filed.` }
  }
  return { entries }
}

export async function runKeystoneWatch(community: string, url: string, { dry = false }: { dry?: boolean } = {}): Promise<KeystoneRun> {
  const list = await readKeystoneList(url)
  if ('error' in list) return { ok: false, error: list.error }
  const { entries } = list

  const supabase = getAdminClient()
  const { data: rows, error } = await supabase
    .from('resource')
    .select('id,category,name,address,phone,anchor_id,distance,details')
    .eq('community_id', community)
    .eq('status', 'approved')
    .in('category', ['restaurant', 'grocery'])
  if (error) return { ok: false, error: `Couldn\u2019t read the guide's listings: ${error.message}` }

  const findings = compareKeystone(entries, (rows ?? []) as WatchedListing[])
  const agree = keystoneAgrees(entries, (rows ?? []) as WatchedListing[], findings)

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
  const closedNow = new Set<WatchFinding>()
  const fresh: WatchFinding[] = []
  for (const f of unfiled) {
    let note = findingNote(f)
    if (f.kind === 'new') {
      const g = await googleSays(f)
      if (g.closed) {
        closed.push(f.entry.name)
        closedNow.add(f)
        continue
      }
      note += `\n${g.line}`
    }
    notes.set(f, note)
    fresh.push(f)
  }

  const differences = findings.map((f) => {
    const d = describe(f)
    return listDifference(d.name, d.what, filed.has(findingKey(f)) ? 'before' : closedNow.has(f) ? 'closed' : 'now')
  })

  if (dry) {
    return {
      ok: true,
      entries: entries.length,
      listRead: { updated: null, entries },
      findings: findings.length,
      filed: 0,
      matching: agree.length,
      closedOnGoogle: closed,
      differences,
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

  await sendWatchDigest(community, "Keystone-K's list", items, findingPage(community)).catch((err) =>
    console.error('[watch-keystone] digest failed:', err),
  )
  // What a kosher list says is the certification: that's what it dates.
  const confirmed = await confirmFromSource(community, agree, KEYSTONE_NAME, [KOSHER_SECTION])

  return { ok: true, entries: entries.length, listRead: { updated: null, entries }, findings: findings.length, filed: items.length, matching: agree.length, closedOnGoogle: closed, differences, confirmed }
}
