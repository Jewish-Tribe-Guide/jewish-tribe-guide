// One run of the KCL list watch: find the list on KCL's home page, read the
// PDF's names, and date the hechsher of every listing that says KCL and is
// on it (kclWatch.ts). A listing that says KCL and isn't on it gets a card
// in To do, to take KCL off or keep it; nothing else is filed, since a list
// of names alone can't say what else the guide should change.
//
// Run daily by /api/cron/watches for a website watch on KCL's home page,
// and on demand from the admin Watches tab.

import { extractText, getDocumentProxy } from 'unpdf'
import { getAdminClient } from '@/lib/supabase/admin'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { submitListingUpdate } from '@/lib/submissionStore'
import { confirmFromSource } from '@/lib/sourceConfirm'
import { KOSHER_SECTION } from '@/lib/boxDates'
import { CATEGORIES } from '@/lib/mekorRun'
import { listDifference, type ListRead } from '@/lib/watches'
import { KCL_NAME, KCL_WATCH_NAME, kclListLink, kclMatches, kclMissing, kclMissingKey, kclMissingNote, kclSubmissionKey, parseKclList, type KclEntry } from '@/lib/kclWatch'

/** Fewer names than this means the PDF changed shape, not that KCL dropped
 *  most of its places. The December 2025 list had 205. */
const MIN_ENTRIES = 100

export type KclRun =
  | { ok: false; error: string }
  | {
      ok: true
      entries: number
      listRead: ListRead
      /** Listings that say KCL and aren't on its list. */
      findings: number
      /** Cards filed for them this run: the ones not filed before. */
      filed: number
      /** Listings that say KCL and are on its list. */
      matching: number
      /** Every listing it lacks, a line each (listDifference). */
      differences: string[]
      confirmed?: number
    }

async function get(url: string): Promise<Response | { error: string }> {
  try {
    const res = await fetch(url, { headers: WATCH_FETCH_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    return res.ok ? res : { error: `${url} answered ${res.status}` }
  } catch (err) {
    return { error: `Couldn’t reach ${url} (${err instanceof Error ? err.message : String(err)})` }
  }
}

/** KCL's list, read now from the PDF its home page links: its edition and
 *  its names, or why it couldn't be. Shared with the Kosher certification page. */
export async function readKclList(homeUrl: string): Promise<{ updated: string | null; entries: KclEntry[] } | { error: string }> {
  const home = await get(homeUrl)
  if ('error' in home) return { error: `KCL’s home page: ${home.error}` }
  const pdfUrl = kclListLink(await home.text(), homeUrl)
  if (!pdfUrl) return { error: 'KCL’s home page no longer links its list of establishments. Nothing read.' }
  const pdf = await get(pdfUrl)
  if ('error' in pdf) return { error: `KCL’s list: ${pdf.error}` }
  let text: string
  try {
    ;({ text } = await extractText(await getDocumentProxy(new Uint8Array(await pdf.arrayBuffer())), { mergePages: true }))
  } catch (err) {
    return { error: `Couldn’t read KCL’s list as a PDF (${err instanceof Error ? err.message : String(err)})` }
  }
  const list = parseKclList(text)
  if (list.entries.length < MIN_ENTRIES) return { error: `Read only ${list.entries.length} names from KCL’s list; it may have changed shape.` }
  return list
}

type Row = { id: string; category: string; name: string; address: string | null; phone: string | null; anchor_id: string; distance: number | null; status: string; details: Record<string, unknown> }

export async function runKclWatch(community: string, homeUrl: string): Promise<KclRun> {
  const list = await readKclList(homeUrl)
  if ('error' in list) return { ok: false, error: list.error }

  const supabase = getAdminClient()
  const { data: rows, error } = await supabase
    .from('resource')
    .select('id,category,name,address,phone,anchor_id,distance,status,details')
    .eq('community_id', community)
    .eq('status', 'approved')
    .in('category', CATEGORIES)
  if (error) return { ok: false, error: `Couldn’t read the guide's listings: ${error.message}` }

  const listings = (rows ?? []) as Row[]
  const matched = kclMatches(list.entries, listings)
  const missing = kclMissing(list.entries, listings)

  // Every card this watch has filed, whatever became of it: one an admin
  // rejected isn't filed again until the listing's hechshers change.
  const { data: earlier, error: earlierError } = await supabase
    .from('submission')
    .select('operation,target_id,payload')
    .eq('community_id', community)
    .eq('submitted_by->>name', KCL_WATCH_NAME)
  if (earlierError) return { ok: false, error: `Couldn’t read earlier suggestions: ${earlierError.message}` }
  const before = new Set((earlier ?? []).map(kclSubmissionKey).filter(Boolean))

  let filed = 0
  for (const f of missing) {
    if (before.has(kclMissingKey(f))) continue
    const l = f.listing
    await submitListingUpdate(
      community,
      l.id,
      { category: l.category, name: l.name, anchorId: l.anchor_id, distance: l.distance, address: l.address ?? '', phone: l.phone ?? '', details: f.details },
      kclMissingNote(f, list.updated),
      { name: KCL_WATCH_NAME },
    )
    filed++
  }
  const differences = missing.map((f) => listDifference(f.listing.name, 'Says KCL, not on KCL’s list', before.has(kclMissingKey(f)) ? 'before' : 'now'))

  const confirmed = await confirmFromSource(community, [...matched.keys()], KCL_NAME, [KOSHER_SECTION])
  return { ok: true, entries: list.entries.length, listRead: list, findings: missing.length, filed, matching: matched.size, differences, confirmed }
}
