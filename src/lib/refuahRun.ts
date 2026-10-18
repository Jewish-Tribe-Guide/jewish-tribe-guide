// One run of a Refuah watch: read the hospital's record from Refuah and put
// what differs from the guide in the moderation queue (refuahWatch.ts has
// the rules). Never changes what a listing says: an admin approves or
// rejects the suggestion with Refuah's entries in front of them. When
// Refuah says just what the guide says, the one thing it writes is the
// listing's date, "From Refuah, Oct 18" (dateFromRefuah below).
//
// Run daily by /api/cron/watches for every website watch on a Refuah
// hospital page, and on demand from the admin Watches tab.

import { createHash } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { TAGS } from '@/lib/cacheTags'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest } from '@/lib/email'
import { submitListingUpdate } from '@/lib/submissionStore'
import { getCategoryById } from '@/lib/categoryStore'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import type { WatchOutcome } from '@/lib/watches'
import {
  REFUAH_DATA_URL,
  REFUAH_NAME,
  REFUAH_WATCH_NAME,
  compareRefuah,
  refuahFields,
  refuahFingerprint,
  refuahHospitalId,
  refuahKey,
  refuahNote,
  type RefuahHospital,
} from '@/lib/refuahWatch'

/** Asks Refuah's data service for one hospital, as its page does. */
export async function readRefuahHospital(id: string, fetcher: typeof fetch = fetch): Promise<RefuahHospital | { error: string }> {
  let res: Response
  try {
    res = await fetcher(REFUAH_DATA_URL, {
      method: 'POST',
      headers: { ...WATCH_FETCH_HEADERS, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'hospitals:getWithReferences', args: { id }, format: 'json' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    return { error: `Couldn’t reach Refuah (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { error: `Refuah answered ${res.status}` }
  const body = (await res.json().catch(() => null)) as { status?: string; value?: RefuahHospital | null; errorMessage?: string } | null
  if (body?.status !== 'success') return { error: `Refuah couldn’t give this hospital (${body?.errorMessage ?? 'no answer'}); its pages may have changed` }
  if (!body.value) return { error: 'Refuah has no hospital at this address any more' }
  return body.value
}

type Row = { id: string; category: string; name: string; address: string | null; phone: string | null; anchor_id: string; distance: number | null; details: Record<string, unknown> | null }

/**
 * Refuah says what the guide says, so Refuah is vouching for it today: the
 * listing's date becomes "From Refuah, <today>" (confirmedFrom, which
 * FreshnessFooter names only while its `at` is the listing's confirmedAt).
 * Without this, a hospital Refuah keeps agreeing with went stale and asked
 * "Still right?" 90 days after the last person looked.
 *
 * Not when Refuah has nothing to compare (Penn Presbyterian and
 * Pennsylvania Hospital, Oct 17): agreeing about nothing vouches for
 * nothing. Never over a newer date, which only a person can have given.
 * sectionConfirmed, a visitor's tap on one box, is theirs and stays.
 *
 * The write is conditional on the listing still being exactly what was
 * compared, so an approval or a tap landing in between is never undone and
 * a listing that's changed isn't vouched for unread; tomorrow's run looks
 * again. (A whole-object write, because a PostgREST update can't merge two
 * keys into a jsonb column; the condition is what makes that safe.)
 */
async function dateFromRefuah(
  supabase: ReturnType<typeof getAdminClient>,
  community: string,
  row: Row,
  refuah: Record<string, unknown[]>,
): Promise<{ error?: string }> {
  if (!Object.values(refuah).some((entries) => entries.length > 0)) return {}
  const details = row.details ?? {}
  const now = new Date().toISOString()
  const before = typeof details.confirmedAt === 'string' ? Date.parse(details.confirmedAt) : NaN
  if (before >= Date.parse(now)) return {}

  const { data, error } = await supabase
    .from('resource')
    .update({ details: { ...details, confirmedAt: now, confirmedFrom: { from: REFUAH_NAME, at: now } } })
    .eq('community_id', community)
    .eq('id', row.id)
    .eq('status', 'approved')
    .eq('details', JSON.stringify(row.details))
    .select('id')
  if (error) return { error: `Refuah agrees with the guide, but the date couldn’t be saved: ${error.message}` }
  if (!data?.length) return {}
  try {
    // As a visitor's confirmation does, so the next visitor sees the date.
    revalidateTag(TAGS.resources(community), 'max')
  } catch {
    // The test project's daily run is plain Node, with no Next cache to
    // invalidate; the previews pick the date up when theirs expires.
  }
  return {}
}

export async function runRefuahWatch(community: string, url: string, resourceId: string | null): Promise<WatchOutcome> {
  const hospitalId = refuahHospitalId(url)
  if (!hospitalId) return { ok: false, error: 'Not a Refuah hospital page' }
  if (!resourceId) return { ok: false, error: 'Tie this watch to its hospital in the guide, so Refuah has something to be compared with' }

  const record = await readRefuahHospital(hospitalId)
  if ('error' in record) return { ok: false, error: record.error }
  // A record with no name isn't a hospital: the data's shape has changed.
  // One with a name and nothing under it is a hospital Refuah has nothing
  // for yet (Penn Presbyterian and Pennsylvania Hospital, Oct 17), which is
  // a good read with nothing to compare.
  if (typeof record.name !== 'string' || !Array.isArray(record.liaisons ?? []) || !Array.isArray(record.services ?? [])) {
    return { ok: false, error: 'Refuah’s record for this hospital came back in a shape the guide doesn’t know; nothing filed' }
  }

  const supabase = getAdminClient()
  const { data: listing, error } = await supabase
    .from('resource')
    .select('id,category,name,address,phone,anchor_id,distance,details')
    .eq('community_id', community)
    .eq('id', resourceId)
    .eq('status', 'approved')
    .maybeSingle()
  if (error) return { ok: false, error: `Couldn’t read the listing: ${error.message}` }
  if (!listing) return { ok: false, error: 'The hospital this watch is tied to isn’t in the guide any more' }
  const row = listing as Row

  const category = await getCategoryById(community, row.category)
  const contacts = (category?.detailFields ?? []).filter((f) => f.type === 'contacts')
  const refuah = refuahFields(record, new Set(contacts.map((f) => f.key)), new Set(contacts.filter((f) => f.entryFrom).map((f) => f.key)))
  const pageHash = createHash('sha256').update(refuahFingerprint(refuah)).digest('hex')
  const details = row.details ?? {}
  const diffs = compareRefuah(details, refuah, Object.fromEntries(contacts.map((f) => [f.key, f.label])))
  if (diffs.length === 0) {
    const dated = await dateFromRefuah(supabase, community, row, refuah)
    return dated.error ? { ok: false, error: dated.error } : { ok: true, filed: 0, pageHash }
  }

  const fields = Object.fromEntries(diffs.map((d) => [d.key, d.after]))
  // Everything this watch has filed for the listing, whatever became of it.
  const { data: earlier, error: earlierError } = await supabase
    .from('submission')
    .select('payload')
    .eq('community_id', community)
    .eq('target_id', row.id)
    .eq('submitted_by->>name', REFUAH_WATCH_NAME)
  if (earlierError) return { ok: false, error: `Couldn’t read earlier suggestions: ${earlierError.message}` }
  const key = refuahKey(row.id, fields)
  const filedBefore = (earlier ?? []).some((s) => {
    const d = ((s.payload as { details?: Record<string, unknown> } | null)?.details ?? {}) as Record<string, unknown>
    return refuahKey(row.id, Object.fromEntries(Object.keys(fields).map((k) => [k, d[k]]))) === key
  })
  if (filedBefore) return { ok: true, filed: 0, pageHash }

  const note = refuahNote(row.name, url, diffs)
  await submitListingUpdate(
    community,
    row.id,
    {
      category: row.category,
      name: row.name,
      anchorId: row.anchor_id,
      distance: row.distance,
      address: row.address ?? '',
      phone: row.phone ?? '',
      details: { ...details, ...fields },
      source: { readBy: 'automatic', from: REFUAH_NAME, named: REFUAH_NAME, original: note },
    } as Parameters<typeof submitListingUpdate>[2],
    note,
    { name: REFUAH_WATCH_NAME },
  )
  await sendWatchDigest(community, REFUAH_NAME, [{ name: row.name, what: diffs.flatMap((d) => d.lines).join('; ') }]).catch((err) =>
    console.error('[watch-refuah] digest failed:', err),
  )
  return { ok: true, filed: 1, pageHash }
}
