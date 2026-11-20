// The run a kosher list's watch makes, whichever list it is (Keystone-K's,
// keystoneRun.ts; Mekor Habracha's, mekorRun.ts): read the list, compare it
// with the guide, leave out what was filed before, ask Google about places
// the guide lacks, file the rest to the moderation queue, and date the
// hechsher of every listing the list agrees with. Changes no listing.
//
// The two runs were this pipeline twice over, ~90% the same lines, so a fix
// to one (Google's place filed with a new place, Nov 2) had to be made to
// the other by hand. Each now says only what is its own: how to read and
// compare its list, its words, and how each finding is filed.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabase/admin'
import type { WatchDigestItem } from '@/lib/email'
import { canAskGoogle, findPlaceStatus, namesOverlap } from '@/lib/googlePlaces'
import { confirmFromSource } from '@/lib/sourceConfirm'
import { KOSHER_SECTION } from '@/lib/boxDates'
import { listDifference, type ListRead } from '@/lib/watches'
import { pendingCreates, queuedPlaceIds, type PendingCreate } from '@/lib/mekorWatch'
import { readAll } from '@/lib/readAll'

/** `placeId`: the place Google found, to file with a new place, so
 *  approving it fills the listing from Google at once (the user, Nov 2). */
export type GoogleSays = { closed: boolean; line: string; placeId?: string }

/** Whether Google says a place a list names is still open, as a line for
 *  its card. */
export async function askGoogleIfOpen(name: string, address: string): Promise<GoogleSays> {
  // Run with no Google key (the test project's daily run, which leaves
  // Google's paid calls out): said so, never "couldn't find it", so the
  // admin checks it's open before approving.
  if (!canAskGoogle()) return { closed: false, line: 'Google wasn’t asked whether it’s still open.' }
  const g = await findPlaceStatus(name, address)
  if (!g) return { closed: false, line: 'Google: couldn’t find it.' }
  const as = g.name ? ` (as "${g.name}")` : ''
  if (g.businessStatus === 'CLOSED_PERMANENTLY') return { closed: true, line: `Google: permanently closed${as}.` }
  // Kept only when Google's name for it is the list's, as approval asks of
  // a place picked by address (withResolvedPlaceId): Find Place's first
  // answer can be the building, or the shop next door.
  const place = g.name && namesOverlap(g.name, name) ? { placeId: g.placeId } : {}
  if (g.businessStatus === 'CLOSED_TEMPORARILY') return { closed: false, line: `Google: temporarily closed${as}.`, ...place }
  return { closed: false, line: `Google: open${as}.`, ...place }
}

/** A place Google said was permanently closed, and when. A closed place
 *  is never filed, so without this nothing remembered the answer and it
 *  was asked again, a paid call, every night (Nov 18 review). Kept on the
 *  list watch's check (WatchCheck.closedOnGoogle). */
export type ClosedSeen = { name: string; at: string }

/** Asked again after this long, in case it reopened. */
export const ASK_CLOSED_AGAIN_DAYS = 30

/** Google's answer for a place it said was closed lately, or null to ask. */
export function knownClosed(before: readonly ClosedSeen[] | undefined, name: string, now: number): ClosedSeen | null {
  const seen = before?.find((c) => c.name === name)
  return seen && now - Date.parse(seen.at) < ASK_CLOSED_AGAIN_DAYS * 86_400_000 ? seen : null
}

/** A new place's details with Google's place, unless it has one. */
export function withPlaceId<T extends Record<string, unknown>>(details: T, placeId: string | undefined): T {
  return placeId && !details.placeId ? { ...details, placeId } : details
}

export type KosherListRun<Kind extends string> =
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
      /** Those, with when Google said so (ClosedSeen). */
      closedSeen: ClosedSeen[]
      /** Every place it differs on, a line each (listDifference). */
      differences: string[]
      /** Listings the list agreed with, dated today. */
      confirmed?: number
      /** A dry run's suggestions, unfiled. */
      wouldFile?: (WatchDigestItem & { kind: Kind; note: string })[]
    }

type EarlierRow = { operation: string; target_id: string | null; payload: Record<string, unknown>; note?: string | null }

/** What is one list's own. */
export type KosherList<Entry, Finding extends { kind: string }> = {
  /** Who its suggestions are filed as (`submitted_by.name`): how its earlier
   *  ones are found again. */
  watchName: string
  /** The list's name, on the dates it gives (sourceConfirm). */
  sourceName: string
  /** The list, read now, or why it couldn't be. */
  read: () => Promise<{ updated: string | null; entries: Entry[] } | { error: string }>
  /** The categories its places go in: the queue's new places in them are
   *  read, so one another list (or a visitor) already suggested isn't
   *  suggested again. */
  categories: readonly string[]
  /** Every difference from the guide, and the listings that agree.
   *  `pending`: the queue's new places, from anyone. */
  compare: (supabase: SupabaseClient, entries: Entry[], pending: PendingCreate[]) => Promise<{ findings: Finding[]; agree: string[] } | { error: string }>
  /** A finding already waiting in the queue, from anyone, when `compare`
   *  doesn't leave those out itself: said as filed before. */
  waiting?: (f: Finding, pending: PendingCreate[]) => boolean
  findingKey: (f: Finding) => string
  /** An earlier submission's key, as `findingKey` makes them. */
  submissionKey: (row: EarlierRow) => string | null | undefined
  /** The card's note, before Google's line. */
  note: (f: Finding, updated: string | null) => string
  /** A line for the digest and the list of differences. */
  describe: (f: Finding) => WatchDigestItem
  /** A place on the list the guide lacks, to ask Google about; null for
   *  any other finding. */
  newPlace: (f: Finding) => { name: string; address: string } | null
  /** Puts one finding in the queue. `placeId`: Google's, for a new place. */
  file: (f: Finding, note: string, placeId: string | undefined, by: { name: string }) => Promise<void>
}

export async function runKosherListWatch<Entry, Finding extends { kind: string }>(
  community: string,
  list: KosherList<Entry, Finding>,
  {
    dry = false,
    closedBefore,
    now = Date.now(),
  }: {
    dry?: boolean
    /** What Google said was closed on earlier runs (knownClosed). */
    closedBefore?: readonly ClosedSeen[]
    now?: number
  } = {},
): Promise<KosherListRun<Finding['kind']>> {
  const read = await list.read()
  if ('error' in read) return { ok: false, error: read.error }
  const { updated, entries } = read

  const supabase = getAdminClient()
  // New places already in the queue, from anyone: the two lists file many
  // of the same places, and run side by side.
  const { data: queued, error: queuedError } = await readAll((from, to) => supabase
    .from('submission')
    .select('id,payload')
    .eq('community_id', community)
    .eq('status', 'pending')
    .eq('operation', 'create')
    .eq('target_type', 'listing').order('id').range(from, to))
  if (queuedError) return { ok: false, error: `Couldn’t read the queue: ${queuedError.message}` }
  const pending = pendingCreates(queued ?? [], list.categories)

  const compared = await list.compare(supabase, entries, pending)
  if ('error' in compared) return { ok: false, error: compared.error }
  const { findings, agree } = compared

  // Everything this watch has filed before, whatever became of it: a
  // suggestion an admin rejected isn't made again until the list changes.
  const { data: earlier, error: earlierError } = await readAll((from, to) => supabase
    .from('submission')
    .select('operation,target_id,payload,note')
    .eq('community_id', community)
    .eq('submitted_by->>name', list.watchName).order('id').range(from, to))
  if (earlierError) return { ok: false, error: `Couldn’t read earlier suggestions: ${earlierError.message}` }
  const filed = new Set(((earlier ?? []) as EarlierRow[]).map(list.submissionKey).filter(Boolean))
  const waiting = (f: Finding) => !!list.waiting?.(f, pending)
  const before = (f: Finding) => filed.has(list.findingKey(f)) || waiting(f)
  const unfiled = findings.filter((f) => !before(f))

  // A list lags: a place can close and stay on it for a year (Shalom
  // Pizzeria, closed on Google, still on Keystone-K's list Oct 5). So a
  // place the guide lacks is asked about on Google before it's suggested:
  // permanently closed is not suggested at all, anything else is said on
  // the card. Only new places are asked; the guide's own listings are
  // already checked every night by the Google sync.
  const notes = new Map<Finding, string>()
  const placeIds = new Map<Finding, string>()
  const closed: string[] = []
  const closedSeen: ClosedSeen[] = []
  const closedNow = new Set<Finding>()
  const fresh: Finding[] = []
  // Google's place for each new place already waiting or suggested in this
  // run. A list can name a place twice, under two names (the Brodsky
  // Center, filed twice on Nov 4), and a name match can't see that.
  const queuedPlaces = queuedPlaceIds(pending)
  for (const f of unfiled) {
    let note = list.note(f, updated)
    const place = list.newPlace(f)
    if (place) {
      const known = knownClosed(closedBefore, place.name, now)
      const g = known ? { closed: true as const, line: '' } : await askGoogleIfOpen(place.name, place.address)
      if (g.closed) {
        closed.push(place.name)
        closedSeen.push(known ?? { name: place.name, at: new Date(now).toISOString() })
        closedNow.add(f)
        continue
      }
      if (g.placeId && queuedPlaces.has(g.placeId)) continue
      note += `\n${g.line}`
      if (g.placeId) {
        placeIds.set(f, g.placeId)
        queuedPlaces.add(g.placeId)
      }
    }
    notes.set(f, note)
    fresh.push(f)
  }

  const differences = findings.map((f) => {
    const d = list.describe(f)
    return listDifference(d.name, d.what, before(f) ? 'before' : closedNow.has(f) ? 'closed' : 'now')
  })
  const listRead: ListRead = { updated, entries }
  const summary = { ok: true as const, entries: entries.length, listRead, findings: findings.length, matching: agree.length, closedOnGoogle: closed, closedSeen, differences }

  if (dry) {
    return { ...summary, filed: 0, wouldFile: fresh.map((f) => ({ kind: f.kind, ...list.describe(f), note: notes.get(f)! })) }
  }

  const by = { name: list.watchName }
  let filedNow = 0
  for (const f of fresh) {
    await list.file(f, notes.get(f)!, placeIds.get(f), by)
    filedNow++
  }

  // What a kosher list says is the certification: that's what it dates.
  const confirmed = await confirmFromSource(community, agree, list.sourceName, [KOSHER_SECTION])

  return { ...summary, filed: filedNow, confirmed }
}
