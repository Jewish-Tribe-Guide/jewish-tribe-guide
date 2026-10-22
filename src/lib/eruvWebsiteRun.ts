// One run of an eruv's website watch: read the page, set its hotline and
// email-alerts link beside the eruv's (eruvWebsite.ts has the rules), and
// file what differs as an eruv suggestion from its website, for the Eruv
// status page. Changes no eruv: an admin uses or keeps it. Server-only.
//
// Run daily by /api/cron/watches, which first gives each eruv's website its
// watch (syncEruvWebsiteWatches), and on demand from the Eruv status page.

import { createHash } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest } from '@/lib/email'
import { submitEruvUpdate } from '@/lib/submissionStore'
import { listEruvimForAdmin, type AdminEruv } from '@/lib/eruvStore'
import { addWatch, listWatches, removeWatch } from '@/lib/watchStore'
import { MIN_PAGE_WORDS, WATCH_FETCH_HEADERS, pageWords } from '@/lib/websiteWatch'
import { ERUV_SUGGESTION_FIELDS, type EruvSuggestion } from '@/lib/eruvSuggestion'
import type { CheckFound, WatchCheck, WatchOutcome } from '@/lib/watches'
import {
  ERUV_READ_FIELDS,
  ERUV_WEBSITE_CREATOR,
  ERUV_WEBSITE_WATCH_NAME,
  detailsKey,
  eruvDetailsSuggestion,
  eruvWebsiteUrl,
  eruvWebsiteWatchChanges,
  readEruvDetails,
  type EruvReading,
} from '@/lib/eruvWebsite'

/** Gives each eruv's website its watch, and takes away the ones no eruv
 *  has any more, in every community. */
export async function syncEruvWebsiteWatches(): Promise<{ community: string; added: number; removed: number }[]> {
  const { data, error } = await getAdminClient().from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  const out = []
  for (const { slug } of (data ?? []) as { slug: string }[]) {
    const [{ eruvim, available }, { watches, available: watching }] = await Promise.all([listEruvimForAdmin(slug), listWatches(slug)])
    if (!available || !watching) continue
    const { add, remove } = eruvWebsiteWatchChanges(eruvim, watches)
    let added = 0
    for (const w of add) {
      if (await addWatch(slug, { kind: 'website', url: w.url, resourceId: null, label: w.label, createdBy: ERUV_WEBSITE_CREATOR })) added++
    }
    for (const id of remove) await removeWatch(slug, id)
    if (add.length || remove.length) out.push({ community: slug, added, removed: remove.length })
  }
  return out
}

const LABEL = Object.fromEntries(ERUV_SUGGESTION_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>

type Filed = { id: string; status: string; payload: Partial<EruvSuggestion> }

/** The eruvim whose website this is: usually one. */
export const eruvimOf = (eruvim: readonly AdminEruv[], url: string) => eruvim.filter((e) => eruvWebsiteUrl(e.website) === url)

export async function runEruvWebsiteWatch(community: string, url: string, fetcher: typeof fetch = fetch): Promise<WatchOutcome> {
  const eruvim = eruvimOf((await listEruvimForAdmin(community)).eruvim, url)
  if (!eruvim.length) return { ok: false, error: 'No eruv in the guide has this website any more' }

  let res: Response
  try {
    res = await fetcher(url, { headers: WATCH_FETCH_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  } catch (err) {
    return { ok: false, error: `Couldn’t reach the page (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { ok: false, error: `The page answered ${res.status}` }
  const html = await res.text()
  const text = pageWords(html)
  if (text.split(' ').length < MIN_PAGE_WORDS) return { ok: false, error: 'The page came back nearly empty (blocked, or built in the browser)' }
  const pageHash = createHash('sha256').update(text).digest('hex')

  const readings = eruvim.map((e) => ({ eruv: e, reading: readEruvDetails(e, { text, html, url: res.url || url }) }))
  const differing = readings.filter((r) => Object.keys(r.reading.changes).length)

  // Everything this watch has filed for these eruvim, whatever became of it.
  let filedEarlier: (Filed & { eruvId: string })[] = []
  if (differing.length) {
    const { data, error } = await getAdminClient()
      .from('submission')
      .select('id, status, payload')
      .eq('community_id', community)
      .eq('target_type', 'eruv')
      .eq('submitted_by->>name', ERUV_WEBSITE_WATCH_NAME)
    if (error) return { ok: false, error: `Couldn’t read earlier suggestions: ${error.message}` }
    filedEarlier = ((data ?? []) as Filed[]).map((s) => ({ ...s, eruvId: s.payload?.eruvId ?? '' }))
  }

  const outcomes: ('filed' | 'waiting' | 'before')[] = []
  const filed: { name: string; what: string }[] = []
  const lines = (r: EruvReading['changes'], e: AdminEruv) => Object.entries(r).map(([k, v]) => `${e.name}: ${LABEL[k]} ${e[k as 'hotline'] ?? 'none'} → ${v}`)
  for (const { eruv, reading } of differing) {
    const key = detailsKey(eruv.id, { ...pick(eruv), ...reading.changes })
    const mine = filedEarlier.filter((s) => s.eruvId === eruv.id)
    if (mine.some((s) => s.status === 'pending' && detailsKey(eruv.id, pick(s.payload)) === key)) {
      outcomes.push('waiting')
      continue
    }
    // Decided before: kept or used, it isn't filed again.
    if (mine.some((s) => detailsKey(eruv.id, pick(s.payload)) === key)) {
      outcomes.push('before')
      continue
    }
    const suggestion = eruvDetailsSuggestion(eruv, reading.changes)
    const note = `Read from its website, ${url}`
    // A newer reading takes the place of one still waiting.
    const waiting = mine.find((s) => s.status === 'pending')
    if (waiting) {
      const { error } = await getAdminClient().from('submission').update({ payload: suggestion, note }).eq('community_id', community).eq('id', waiting.id).eq('status', 'pending')
      if (error) return { ok: false, error: `Couldn’t update the suggestion: ${error.message}` }
    } else {
      await submitEruvUpdate(community, suggestion, note, { name: ERUV_WEBSITE_WATCH_NAME })
    }
    outcomes.push('filed')
    filed.push({ name: eruv.name, what: Object.keys(reading.changes).map((k) => LABEL[k]).join(', ') })
  }

  const queue: WatchCheck['queue'] = !differing.length ? null : outcomes.includes('filed') ? 'filed' : outcomes.includes('waiting') ? 'waiting' : 'before'
  const read = readings.flatMap(({ eruv, reading }) => reading.same.map((k) => `${LABEL[k]}: ${eruv[k]}`))
  const check: CheckFound = {
    what: 'details',
    from: 'page',
    result: differing.length ? 'differs' : readings.some((r) => r.reading.same.length) ? 'agrees' : 'nothing',
    read,
    differences: differing.flatMap((r) => lines(r.reading.changes, r.eruv)),
    queue,
  }
  if (filed.length) {
    await sendWatchDigest(community, 'Eruv websites', filed, { path: `/${community}/admin/watches/eruv`, name: 'Eruv status' }).catch((err) =>
      console.error('[watch-eruv-website] digest failed:', err),
    )
  }
  return { ok: true, filed: filed.length, pageHash, check }
}

const pick = (v: Partial<Record<(typeof ERUV_READ_FIELDS)[number], string | null>>) => Object.fromEntries(ERUV_READ_FIELDS.map((k) => [k, v[k] ?? null]))
