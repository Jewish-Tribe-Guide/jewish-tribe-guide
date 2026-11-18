// One run of the Keystone-K watch: read Keystone-K's list of the places it
// certifies and put every difference from the guide in the moderation queue
// (see keystoneWatch.ts). Changes no listing: an admin approves or rejects
// each suggestion with the list's own words in front of them. A listing the
// list agrees with only has its date moved forward (sourceConfirm.ts).
//
// Run daily for every keystone_list watch by /api/cron/watches, and on
// demand from the admin Watches tab. `dry` says what it would file and
// files nothing. The run itself is kosherListRun.ts, shared with Mekor
// Habracha's list; this is what is Keystone-K's own.

import type { WatchDigestItem } from '@/lib/email'
import { submitListingCreate, submitListingDelete, submitListingUpdate } from '@/lib/submissionStore'
import { KEYSTONE_NAME } from '@/lib/sourceNames'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { runKosherListWatch, withPlaceId, type KosherList, type KosherListRun } from '@/lib/kosherListRun'
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

export type KeystoneRun = KosherListRun<WatchFinding['kind']>

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

/** Keystone-K's part of a kosher list's run (kosherListRun.ts). */
function keystoneList(community: string, url: string): KosherList<KeystoneEntry, WatchFinding> {
  return {
    watchName: KEYSTONE_WATCH_NAME,
    sourceName: KEYSTONE_NAME,
    async read() {
      const list = await readKeystoneList(url)
      return 'error' in list ? list : { updated: null, entries: list.entries }
    },
    async compare(supabase, entries) {
      const { data: rows, error } = await supabase
        .from('resource')
        .select('id,category,name,address,phone,anchor_id,distance,details')
        .eq('community_id', community)
        .eq('status', 'approved')
        .in('category', ['restaurant', 'grocery'])
      if (error) return { error: `Couldn\u2019t read the guide's listings: ${error.message}` }
      const findings = compareKeystone(entries, (rows ?? []) as WatchedListing[])
      return { findings, agree: keystoneAgrees(entries, (rows ?? []) as WatchedListing[], findings) }
    },
    findingKey,
    submissionKey,
    note: (f) => findingNote(f),
    describe,
    newPlace: (f) => (f.kind === 'new' ? { name: f.entry.name, address: f.entry.address } : null),
    async file(f, note, placeId, by) {
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
            details: withPlaceId(f.details, placeId),
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
    },
  }
}

export async function runKeystoneWatch(community: string, url: string, { dry = false }: { dry?: boolean } = {}): Promise<KeystoneRun> {
  return runKosherListWatch(community, keystoneList(community, url), { dry })
}
