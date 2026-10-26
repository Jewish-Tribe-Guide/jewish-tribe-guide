import { isIP } from 'node:net'
import { getAdminClient } from '@/lib/supabase/admin'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { normalizeRow } from '@/lib/resourceStore'
import { addWatch, listWatches, removeWatch, updateWatch } from '@/lib/watchStore'
import { dnsLookup, isPrivateAddress, type Lookup } from '@/lib/menuReader'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { listingSlug } from '@/lib/listingSlug'
import { routes } from '@/lib/routes'
import { answerOf, checkedRecord, isLinkCheck, LINK_CHECK_CREATOR, linkCheckUrl, linksToCheck, standingOf, type LinkAnswer, type LinkStanding, type ListingLink } from '@/lib/linkCheck'
import type { Watch } from '@/lib/watches'
import type { ResourceRow } from '@/types'

// The weekly link check (linkCheck.ts): opens each link a listing shows
// and keeps how it answered. Run by /api/cron/check-links, and for one
// link by the Watches tab's Check it again.

const REQUEST_TIMEOUT_MS = 8_000
/** A link that takes longer than this, all told, didn't answer. */
const LINK_DEADLINE_MS = 15_000
const MAX_HOPS = 5
const AT_ONCE = 8

type Opts = { fetchImpl?: typeof fetch; resolve?: Lookup }

/** Where a link leads, opened as a browser would: a quick HEAD, and a GET
 *  when a site won't answer a HEAD properly. Each hop's address is looked
 *  up first, and nothing on a private network is opened (menuReader.ts). */
async function open(raw: string, { fetchImpl = fetch, resolve = dnsLookup }: Opts): Promise<LinkAnswer> {
  let next = raw
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let url: URL
    try {
      url = new URL(next)
    } catch {
      return 'no_site'
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'no_site'
    const host = url.hostname.replace(/^\[|\]$/g, '')
    let addresses: string[]
    try {
      addresses = isIP(host) ? [host] : await resolve(host)
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      return code === 'ENOTFOUND' || code === 'ENODATA' ? 'no_site' : 'no_answer'
    }
    // A visitor couldn't open one on a private network either.
    if (!addresses.length || addresses.some(isPrivateAddress) || url.username || url.password) return 'no_site'
    const ask = (method: 'HEAD' | 'GET') => fetchImpl(url, { method, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: WATCH_FETCH_HEADERS })
    let res: Response | null = null
    try {
      res = await ask('HEAD')
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') return 'no_answer'
    }
    // Some sites answer a HEAD wrongly (405, 404, 403) or not at all.
    if (!res || res.status >= 400) {
      try {
        res = await ask('GET')
        await res.body?.cancel().catch(() => {})
      } catch {
        return 'no_answer'
      }
    }
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location')
      if (!to) return 'opens'
      next = new URL(to, url).toString()
      continue
    }
    return answerOf(res.status)
  }
  return 'no_answer'
}

/** How a link answers now; one that takes too long didn't answer. */
export async function checkLink(url: string, opts: Opts = {}): Promise<LinkAnswer> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<LinkAnswer>((resolve) => (timer = setTimeout(() => resolve('no_answer'), LINK_DEADLINE_MS)))
  try {
    return await Promise.race([open(url, opts).catch((): LinkAnswer => 'no_answer'), late])
  } finally {
    clearTimeout(timer)
  }
}

type PlacedLink = ListingLink & { place: string; category: string; href: string }

/** A community's links to check, and their records. */
async function communityLinks(community: string): Promise<{ links: PlacedLink[]; records: Watch[]; available: boolean }> {
  const categories = (await listCategoriesUncached(community)).filter((c) => c.kind === 'listing')
  const { watches, available } = await listWatches(community)
  if (!categories.length || !available) return { links: [], records: [], available }
  const { data, error } = await getAdminClient()
    .from('resource')
    .select('*')
    .eq('community_id', community)
    .eq('status', 'approved')
    .in(
      'category',
      categories.map((c) => c.id),
    )
  if (error) throw new Error(`Couldn’t list the places: ${error.message}`)
  const links = ((data ?? []) as ResourceRow[]).flatMap((row) => {
    const category = categories.find((c) => c.id === row.category)
    if (!category) return []
    const p = normalizeRow(row)
    const href = routes.listing(community, p.category, listingSlug(p))
    return linksToCheck({ id: p.id, details: row.details ?? {} }, category, watches).map((l) => ({ ...l, place: p.name, category: p.category, href }))
  })
  return { links, records: watches.filter(isLinkCheck), available }
}

/** Every link of a community and its last check, for the Watches tab. */
export async function linkStandings(community: string): Promise<LinkStanding[]> {
  const { links, records } = await communityLinks(community)
  return links.map((l) => standingOf(l, records.find((r) => r.url === linkCheckUrl(l.resourceId, l.key)))).sort((a, b) => a.place.localeCompare(b.place) || a.field.localeCompare(b.field))
}

/** Saves a link's check on its record, adding the record the first time. */
async function save(community: string, link: PlacedLink, records: readonly Watch[], answer: LinkAnswer, at: string): Promise<Watch | null> {
  const url = linkCheckUrl(link.resourceId, link.key)
  const record = records.find((r) => r.url === url) ?? (await addWatch(community, { kind: 'website', url, resourceId: link.resourceId, label: `${link.place} · ${link.field}`, createdBy: LINK_CHECK_CREATOR, active: false }))
  if (!record) return null
  const patch = checkedRecord(record, link.url, answer, at)
  await updateWatch(community, record.id, patch)
  return { ...record, ...patch }
}

/** One community's run. */
export type LinkRun = { community: string; links: number; checked: number; dontOpen: number; left: number }

/** Checks every community's links, a few at once, until `stopAt`; the
 *  rest wait for next week. A link no listing shows any more loses its
 *  record. */
export async function checkAllLinks({ stopAt = Date.now() + 240_000, ...opts }: Opts & { stopAt?: number } = {}): Promise<LinkRun[]> {
  const { data, error } = await getAdminClient().from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  const out: LinkRun[] = []
  for (const { slug } of (data ?? []) as { slug: string }[]) {
    const { links, records, available } = await communityLinks(slug)
    if (!available) continue
    const shown = new Set(links.map((l) => linkCheckUrl(l.resourceId, l.key)))
    for (const r of records) if (!shown.has(r.url)) await removeWatch(slug, r.id)
    // Those checked longest ago first, so a run cut short gets to the rest next.
    const last = (l: PlacedLink) => records.find((r) => r.url === linkCheckUrl(l.resourceId, l.key))?.lastRunAt ?? ''
    const queue = [...links].sort((a, b) => last(a).localeCompare(last(b)))
    const run: LinkRun = { community: slug, links: links.length, checked: 0, dontOpen: 0, left: 0 }
    let i = 0
    const worker = async () => {
      while (i < queue.length) {
        if (Date.now() > stopAt) {
          run.left = queue.length - i
          i = queue.length
          return
        }
        const link = queue[i++]
        const answer = await checkLink(link.url, opts)
        await save(slug, link, records, answer, new Date().toISOString())
        run.checked++
        if (answer !== 'opens') run.dontOpen++
      }
    }
    await Promise.all(Array.from({ length: AT_ONCE }, worker))
    out.push(run)
  }
  return out
}

/** Check it again: one link of a listing, now. Null when the listing
 *  shows no such link to check. */
export async function checkOneLink(community: string, resourceId: string, key: string, opts: Opts = {}): Promise<LinkStanding | null> {
  const { links, records } = await communityLinks(community)
  const link = links.find((l) => l.resourceId === resourceId && l.key === key)
  if (!link) return null
  const record = await save(community, link, records, await checkLink(link.url, opts), new Date().toISOString())
  return standingOf(link, record ?? undefined)
}
