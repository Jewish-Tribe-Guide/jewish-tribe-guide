// One run of a Refuah watch: read the hospital's record from Refuah and put
// what differs from the guide in the moderation queue (refuahWatch.ts has
// the rules). Changes no listing: an admin approves or rejects the
// suggestion with Refuah's entries in front of them. A hospital Refuah
// agrees with only has its date moved forward (sourceConfirm.ts).
//
// Run daily by /api/cron/watches for every website watch on a Refuah
// hospital page, and on demand from the admin Watches tab.

import { createHash } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest } from '@/lib/email'
import { submitListingUpdate } from '@/lib/submissionStore'
import { getCategoryById } from '@/lib/categoryStore'
import { confirmFromSource } from '@/lib/sourceConfirm'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import type { CheckFound, WatchCheck, WatchOutcome } from '@/lib/watches'
import {
  REFUAH_DATA_URL,
  REFUAH_NAME,
  REFUAH_WATCH_NAME,
  compareRefuah,
  refuahFields,
  refuahFingerprint,
  refuahHospitalId,
  refuahKey,
  refuahHasEntries,
  refuahNote,
  type RefuahHospital,
} from '@/lib/refuahWatch'
import type { RefuahListed } from '@/lib/refuahMatch'

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

/** Refuah's hospitals near each of these places, with their addresses and
 *  map positions, nearest first from each. Refuah only answers "the 25
 *  nearest to a point" (asked with no point, it gives 50 of its hospitals,
 *  none of them Philadelphia's; Oct 21), so it's asked once per place, from
 *  where that place is, and the answers merged. A place's own match is
 *  always in its own answer. One that fails fails them all: a partial list
 *  would call a hospital "not on Refuah" that is. */
export async function readRefuahNear(places: readonly { lat: number; lng: number }[], fetcher: typeof fetch = fetch): Promise<RefuahListed[] | { error: string }> {
  const points = [...new Map(places.map((p) => [`${p.lat},${p.lng}`, p])).values()]
  const answers = await Promise.all(points.map((p) => readRefuahPage({ latitude: p.lat, longitude: p.lng }, fetcher)))
  const failed = answers.find((a): a is { error: string } => 'error' in a)
  if (failed) return failed
  const merged = new Map<string, RefuahListed>()
  for (const list of answers as RefuahListed[][]) for (const h of list) merged.set(h._id, h)
  return [...merged.values()]
}

async function readRefuahPage(args: { latitude: number; longitude: number }, fetcher: typeof fetch): Promise<RefuahListed[] | { error: string }> {
  let res: Response
  try {
    res = await fetcher(REFUAH_DATA_URL, {
      method: 'POST',
      headers: { ...WATCH_FETCH_HEADERS, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'hospitals:list', args, format: 'json' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    return { error: `Couldn’t reach Refuah (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { error: `Refuah answered ${res.status}` }
  const body = (await res.json().catch(() => null)) as { status?: string; value?: unknown } | null
  if (body?.status !== 'success' || !Array.isArray(body.value)) return { error: 'Refuah couldn’t list its hospitals; its pages may have changed' }
  return body.value.filter(
    (h): h is RefuahListed =>
      !!h && typeof h._id === 'string' && typeof h.name === 'string' && Number.isFinite(h.latitude) && Number.isFinite(h.longitude),
  )
}

type Row = { id: string; category: string; name: string; address: string | null; phone: string | null; anchor_id: string; distance: number | null; details: Record<string, unknown> | null }

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
  // What it compared, for the Watches tab (watches.ts, WatchCheck).
  const listed = Object.values(refuah).reduce((n, entries) => n + entries.length, 0)
  const check = (queue: WatchCheck['queue']): CheckFound => ({
    what: 'contacts',
    from: null,
    result: diffs.length ? 'differs' : refuahHasEntries(record) ? 'agrees' : 'nothing',
    read: listed ? [`${listed} contact${listed === 1 ? '' : 's'} on Refuah`] : [],
    differences: diffs.flatMap((d) => d.lines),
    queue: diffs.length ? queue : null,
  })
  if (diffs.length === 0) {
    // Refuah agrees: the hospital's date moves forward (sourceConfirm.ts).
    if (refuahHasEntries(record)) await confirmFromSource(community, [row.id], REFUAH_NAME)
    return { ok: true, filed: 0, pageHash, check: check(null) }
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
  if (filedBefore) return { ok: true, filed: 0, pageHash, check: check('before') }

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
  return { ok: true, filed: 1, pageHash, check: check('filed') }
}
