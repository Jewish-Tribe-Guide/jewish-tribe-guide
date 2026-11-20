// One run of the Mekor Habracha watch: read Mekor's kosher list and put
// every difference from the guide in the moderation queue (see
// mekorWatch.ts). Changes no listing: an admin approves or rejects each
// suggestion with Mekor's own words in front of them. A listing the list
// agrees with only has its date moved forward (sourceConfirm.ts).
//
// Run daily by /api/cron/watches for a website watch on Mekor's list, and on
// demand from the admin Watches tab. `dry` says what it would file and
// files nothing. The run itself is kosherListRun.ts, shared with
// Keystone-K's list; this is what is Mekor's own.

import type { WatchDigestItem } from '@/lib/email'
import { submitListingCreate, submitListingUpdate } from '@/lib/submissionStore'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { runKosherListWatch, withPlaceId, type ClosedSeen, type KosherList, type KosherListRun } from '@/lib/kosherListRun'
import {
  MEKOR_NAME,
  MEKOR_WATCH_NAME,
  compareMekor,
  mekorAgrees,
  findingKey,
  findingNote,
  parseMekorList,
  submissionKey,
  type GuideListing,
  type MekorEntry,
  type MekorFinding,
} from '@/lib/mekorWatch'
import { readAll } from '@/lib/readAll'

/** Fewer places than this means the page changed shape, not that Mekor
 *  dropped half its list: file nothing rather than a card for every IKC
 *  place in the guide. The list had 78 on Oct 18, 2026. */
const MIN_ENTRIES = 40

/** The food places a kosher list is compared with. */
export const CATEGORIES = ['restaurant', 'grocery']

/** Ten digits as the guide writes a phone. */
function phone(digits: string): string {
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits
}

function describe(f: MekorFinding): WatchDigestItem {
  if (f.kind === 'new') return { name: f.entry.name, what: f.archived ? 'On Mekor’s list, archived in the guide' : 'On Mekor’s list, not in the guide' }
  if (f.kind === 'only-here') return { name: f.listing.name, what: 'IKC in the guide, not on Mekor’s list' }
  const what = [f.removed.length && `Mekor doesn’t say ${f.removed.join(', ')}`, f.added.length && `Mekor says ${f.added.join(', ')}`].filter(Boolean).join('; ')
  return { name: f.listing.name, what }
}

export type MekorRun = KosherListRun<MekorFinding['kind']>

/** Mekor Habracha's list, read now: its entries and its "Last Updated"
 *  date, or why it couldn't be. Shared with the Kosher certification page. */
export async function readMekorList(url: string): Promise<{ updated: string | null; entries: MekorEntry[] } | { error: string }> {
  let res: Response
  try {
    res = await fetch(url, { headers: WATCH_FETCH_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  } catch (err) {
    return { error: `Couldn’t reach Mekor Habracha’s list (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { error: `Mekor Habracha’s list answered ${res.status}` }
  const { updated, entries } = parseMekorList(await res.text())
  if (entries.length < MIN_ENTRIES) {
    return { error: `Read only ${entries.length} places from Mekor Habracha’s list; its page may have changed. Nothing filed.` }
  }
  return { updated, entries }
}

/** Mekor Habracha's part of a kosher list's run (kosherListRun.ts). */
function mekorList(community: string, url: string): KosherList<MekorEntry, MekorFinding> {
  return {
    watchName: MEKOR_WATCH_NAME,
    sourceName: MEKOR_NAME,
    categories: CATEGORIES,
    read: () => readMekorList(url),
    // `pending`: new places already in the queue, from anyone (the run reads
    // them): Keystone-K's watch files many of the same places.
    async compare(supabase, entries, pending) {
      // Archived listings too: a place Mekor still lists that the guide took
      // down is said as such, not suggested as if the guide never had it.
      const { data: rows, error } = await readAll((from, to) => supabase
        .from('resource')
        .select('id,category,name,address,phone,anchor_id,distance,details,status')
        .eq('community_id', community)
        .in('status', ['approved', 'archived'])
        .in('category', CATEGORIES).order('id').range(from, to))
      if (error) return { error: `Couldn’t read the guide's listings: ${error.message}` }

      const findings = compareMekor(entries, (rows ?? []) as GuideListing[], pending)
      return { findings, agree: mekorAgrees(entries, (rows ?? []) as GuideListing[], findings) }
    },
    findingKey,
    submissionKey,
    note: findingNote,
    describe,
    newPlace: (f) => (f.kind === 'new' ? { name: f.entry.name, address: f.entry.address } : null),
    async file(f, note, placeId, by) {
      if (f.kind === 'new') {
        // An archived listing's own name and address, which the guide had
        // already tidied; otherwise Mekor's.
        const from = f.archived
        await submitListingCreate(
          community,
          {
            category: 'restaurant',
            name: from?.name ?? f.entry.name,
            anchorId: 'community',
            distance: null,
            address: from?.address ?? f.entry.address,
            phone: from?.phone ?? phone(f.entry.phone),
            details: withPlaceId(f.details, placeId),
            submittedBy: by,
          },
          note,
        )
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

export async function runMekorWatch(
  community: string,
  url: string,
  options: { dry?: boolean; closedBefore?: readonly ClosedSeen[]; now?: number } = {},
): Promise<MekorRun> {
  // Mekor's list lags, as Keystone-K's does: a place it lists that the
  // guide lacks is asked about on Google first (kosherListRun.ts).
  return runKosherListWatch(community, mekorList(community, url), options)
}
