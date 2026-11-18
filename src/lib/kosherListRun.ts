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
  /** Every difference from the guide, and the listings that agree. */
  compare: (supabase: SupabaseClient, entries: Entry[]) => Promise<{ findings: Finding[]; agree: string[] } | { error: string }>
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
  { dry = false }: { dry?: boolean } = {},
): Promise<KosherListRun<Finding['kind']>> {
  const read = await list.read()
  if ('error' in read) return { ok: false, error: read.error }
  const { updated, entries } = read

  const supabase = getAdminClient()
  const compared = await list.compare(supabase, entries)
  if ('error' in compared) return { ok: false, error: compared.error }
  const { findings, agree } = compared

  // Everything this watch has filed before, whatever became of it: a
  // suggestion an admin rejected isn't made again until the list changes.
  const { data: earlier, error: earlierError } = await supabase
    .from('submission')
    .select('operation,target_id,payload,note')
    .eq('community_id', community)
    .eq('submitted_by->>name', list.watchName)
  if (earlierError) return { ok: false, error: `Couldn’t read earlier suggestions: ${earlierError.message}` }
  const filed = new Set(((earlier ?? []) as EarlierRow[]).map(list.submissionKey).filter(Boolean))
  const unfiled = findings.filter((f) => !filed.has(list.findingKey(f)))

  // A list lags: a place can close and stay on it for a year (Shalom
  // Pizzeria, closed on Google, still on Keystone-K's list Oct 5). So a
  // place the guide lacks is asked about on Google before it's suggested:
  // permanently closed is not suggested at all, anything else is said on
  // the card. Only new places are asked; the guide's own listings are
  // already checked every night by the Google sync.
  const notes = new Map<Finding, string>()
  const placeIds = new Map<Finding, string>()
  const closed: string[] = []
  const closedNow = new Set<Finding>()
  const fresh: Finding[] = []
  for (const f of unfiled) {
    let note = list.note(f, updated)
    const place = list.newPlace(f)
    if (place) {
      const g = await askGoogleIfOpen(place.name, place.address)
      if (g.closed) {
        closed.push(place.name)
        closedNow.add(f)
        continue
      }
      note += `\n${g.line}`
      if (g.placeId) placeIds.set(f, g.placeId)
    }
    notes.set(f, note)
    fresh.push(f)
  }

  const differences = findings.map((f) => {
    const d = list.describe(f)
    return listDifference(d.name, d.what, filed.has(list.findingKey(f)) ? 'before' : closedNow.has(f) ? 'closed' : 'now')
  })
  const listRead: ListRead = { updated, entries }
  const summary = { ok: true as const, entries: entries.length, listRead, findings: findings.length, matching: agree.length, closedOnGoogle: closed, differences }

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
