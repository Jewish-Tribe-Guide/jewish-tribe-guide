// One run of the KCL list watch: find the list on KCL's home page, read the
// PDF's names, and date the hechsher of every listing that says KCL and is
// on it (kclWatch.ts). Files nothing: a list of names alone can't say what
// the guide should change.
//
// Run daily by /api/cron/watches for a website watch on KCL's home page,
// and on demand from the admin Watches tab.

import { extractText, getDocumentProxy } from 'unpdf'
import { getAdminClient } from '@/lib/supabase/admin'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { confirmFromSource } from '@/lib/sourceConfirm'
import { KOSHER_SECTION } from '@/lib/boxDates'
import { CATEGORIES } from '@/lib/mekorRun'
import type { ListRead } from '@/lib/watches'
import { KCL_NAME, kclListLink, kclMatches, parseKclList, type KclEntry } from '@/lib/kclWatch'

/** Fewer names than this means the PDF changed shape, not that KCL dropped
 *  most of its places. The December 2025 list had 205. */
const MIN_ENTRIES = 100

export type KclRun =
  | { ok: false; error: string }
  | {
      ok: true
      entries: number
      listRead: ListRead
      findings: 0
      filed: 0
      /** Listings that say KCL and are on its list. */
      matching: number
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

export async function runKclWatch(community: string, homeUrl: string): Promise<KclRun> {
  const list = await readKclList(homeUrl)
  if ('error' in list) return { ok: false, error: list.error }

  const { data: rows, error } = await getAdminClient()
    .from('resource')
    .select('id,name,status,details')
    .eq('community_id', community)
    .eq('status', 'approved')
    .in('category', CATEGORIES)
  if (error) return { ok: false, error: `Couldn’t read the guide's listings: ${error.message}` }

  const matched = kclMatches(list.entries, (rows ?? []) as { id: string; name: string; status: string; details: Record<string, unknown> }[])
  const confirmed = await confirmFromSource(community, [...matched.keys()], KCL_NAME, [KOSHER_SECTION])
  return { ok: true, entries: list.entries.length, listRead: list, findings: 0, filed: 0, matching: matched.size, confirmed }
}
