// One run of a Refuah watch: read the hospital's record from Refuah and file
// what differs from the guide, a box of the listing at a time, for the
// Hospitals page (refuahWatch.ts has the rules, hospitalBoxes.ts the
// boxes). Changes no listing: an admin uses or keeps each box with Refuah's
// entries in front of them. A hospital Refuah agrees with only has its date
// moved forward (sourceConfirm.ts).
//
// Run daily by /api/cron/watches for every website watch on a Refuah
// hospital page, and on demand from the admin Watches tab.

import { createHash } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest } from '@/lib/email'
import { findingPage } from '@/lib/watchFindings'
import { replacePendingSuggestion, submitListingUpdate } from '@/lib/submissionStore'
import { readSectionSource, type SectionSource } from '@/lib/hoursSections'
import { boxOf, contactBoxes } from '@/lib/hospitalBoxes'
import { getCategoryById } from '@/lib/categoryStore'
import { confirmFromSource } from '@/lib/sourceConfirm'
import { boxKeysHolding } from '@/lib/listingView'
import type { DirectoryResource } from '@/types'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import type { CheckFound, WatchCheck, WatchOutcome } from '@/lib/watches'
import {
  REFUAH_DATA_URL,
  REFUAH_NAME,
  REFUAH_WATCH_NAME,
  compareRefuah,
  refuahFields,
  refuahFingerprint,
  refuahHadNow,
  refuahHospitalId,
  refuahKey,
  refuahHasEntries,
  refuahNote,
  type FieldDifference,
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

type Filed = { id: string; status: string; payload: unknown }
const detailsOf = (s: Filed) => ((s.payload as { details?: Record<string, unknown> } | null)?.details ?? {}) as Record<string, unknown>
const boxOfFiled = (s: Filed): SectionSource | null => readSectionSource((s.payload as { source?: { section?: unknown } } | null)?.source?.section)

/** `last`: the watch's last check, for the entries it knows came from
 *  Refuah (refuahHadNow). */
export async function runRefuahWatch(community: string, url: string, resourceId: string | null, last?: WatchCheck | null): Promise<WatchOutcome> {
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
  const labels = Object.fromEntries(contacts.map((f) => [f.key, f.label]))
  // What came from Refuah: what it matched before, and what it matches now.
  const had = (last?.refuahHad ?? []).filter((h) => contacts.some((f) => h.startsWith(`${f.key}:`)))
  const diffs = compareRefuah(details, refuah, labels, had)
  const refuahHad = refuahHadNow(details, refuah, had)
  // What it compared, for the Watches tab (watches.ts, WatchCheck).
  const listed = Object.values(refuah).reduce((n, entries) => n + entries.length, 0)
  const check = (queue: WatchCheck['queue']): CheckFound => ({
    what: 'contacts',
    from: null,
    result: diffs.length ? 'differs' : refuahHasEntries(record) ? 'agrees' : 'nothing',
    read: listed ? [`${listed} contact${listed === 1 ? '' : 's'} on Refuah`] : [],
    differences: diffs.flatMap((d) => d.lines),
    queue: diffs.length ? queue : null,
    refuahHad,
  })
  if (diffs.length === 0) {
    // Refuah agrees: each box it gave contacts for is dated by it
    // (sourceConfirm.ts), and no other.
    const read = Object.entries(refuah).flatMap(([key, entries]) => (entries.length ? [key] : []))
    const boxes = (d: Record<string, unknown>) => (category ? boxKeysHolding({ ...d, id: row.id, name: row.name, category: row.category } as DirectoryResource, category, read) : [])
    if (refuahHasEntries(record)) await confirmFromSource(community, [row.id], REFUAH_NAME, boxes)
    return { ok: true, filed: 0, pageHash, check: check(null) }
  }

  // Everything this watch has filed for the listing, whatever became of it.
  const { data: earlier, error: earlierError } = await supabase
    .from('submission')
    .select('id, status, payload')
    .eq('community_id', community)
    .eq('target_id', row.id)
    .eq('submitted_by->>name', REFUAH_WATCH_NAME)
  if (earlierError) return { ok: false, error: `Couldn’t read earlier suggestions: ${earlierError.message}` }
  const filedEarlier = (earlier ?? []) as Filed[]

  // A box at a time, in the listing's order.
  const boxes = category ? contactBoxes(category, details) : []
  const byBox = new Map<string, { box: SectionSource; diffs: FieldDifference[] }>()
  for (const d of diffs) {
    const b = boxOf(boxes, d.key, labels[d.key] ?? d.key)
    const got = byBox.get(b.title) ?? byBox.set(b.title, { box: { section: b.title, keys: b.keys }, diffs: [] }).get(b.title)!
    got.diffs.push(d)
  }
  const outcomes: ('filed' | 'waiting' | 'before')[] = []
  const filed: string[] = []
  for (const { box, diffs: those } of byBox.values()) {
    const fields = Object.fromEntries(box.keys.map((k) => [k, those.find((d) => d.key === k)?.after ?? details[k] ?? null]))
    const key = refuahKey(row.id, fields)
    const keyOf = (s: Filed) => refuahKey(row.id, Object.fromEntries(box.keys.map((k) => [k, detailsOf(s)[k]])))
    const waiting = filedEarlier.filter((s) => s.status === 'pending' && boxOfFiled(s)?.section === box.section)
    if (waiting.some((s) => keyOf(s) === key)) {
      outcomes.push('waiting')
      continue
    }
    // Filed before as this box, or inside a whole reading from before the
    // boxes.
    if (filedEarlier.some((s) => (boxOfFiled(s)?.section ?? box.section) === box.section && keyOf(s) === key)) {
      outcomes.push('before')
      continue
    }
    const note = refuahNote(row.name, url, those)
    const payload = {
      category: row.category,
      name: row.name,
      anchorId: row.anchor_id,
      distance: row.distance,
      address: row.address ?? '',
      phone: row.phone ?? '',
      details: { ...details, ...fields },
      source: { readBy: 'automatic', from: REFUAH_NAME, named: REFUAH_NAME, original: note, section: box },
    } as Parameters<typeof submitListingUpdate>[2]
    // What Refuah says of a box replaces what it said before, still waiting.
    if (!(waiting[0] && (await replacePendingSuggestion(community, waiting[0].id, payload, note)))) {
      await submitListingUpdate(community, row.id, payload, note, { name: REFUAH_WATCH_NAME })
    }
    outcomes.push('filed')
    filed.push(`${box.section}: ${those.flatMap((d) => d.lines).join('; ')}`)
  }
  const queue = outcomes.includes('filed') ? 'filed' : outcomes.includes('waiting') ? 'waiting' : 'before'
  if (filed.length) {
    await sendWatchDigest(community, REFUAH_NAME, [{ name: row.name, what: filed.join('; ') }], findingPage(community, 'hospitals')).catch((err) =>
      console.error('[watch-refuah] digest failed:', err),
    )
  }
  return { ok: true, filed: filed.length, pageHash, check: check(queue) }
}
