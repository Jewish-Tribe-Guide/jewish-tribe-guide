// A dry run of the rebuilt shul watch against the LIVE database, reading
// only: for each shul with a watched page, what the nightly run would file
// from each page now (readShulPage, the code the run calls), beside what
// the old watch filed this week. Files nothing, dates nothing.
// docs/shul-watch-rebuild.md, steps 5 and 6.
//
//   npx tsx scripts/shul-times-dry-run.mts [today] [> out.json]
//
// Each page is read twice: once on its own, then with the shul's other
// pages' reads beside it, as the run has them from the night before
// (lastCheck.shulReads). It asks the AI for every page, twice. A few
// cents on the cheapest model.

import { existsSync, writeFileSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.PROD_SUPABASE_URL
const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || !process.env.OPENAI_API_KEY) {
  console.error('Needs PROD_SUPABASE_URL, PROD_SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY.')
  process.exit(1)
}

// Reads only, and made so: anything but a read sent to the live database
// throws before it leaves this process.
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (target.startsWith(url) && method !== 'GET' && method !== 'HEAD') throw new Error(`Dry run: refused ${method} ${target}`)
  return realFetch(input, init)
}) as typeof fetch

process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = key

const { listCategoriesUncached } = await import('../src/lib/categoryStore')
const { normalizeRow } = await import('../src/lib/resourceStore')
const { getAdminClient } = await import('../src/lib/supabase/admin')
const { readListingPage } = await import('../src/lib/listingPageRun')
const { pageReadsFor } = await import('../src/lib/listingPageWatch')
const { readShulPage } = await import('../src/lib/shulPageRead')
const { readSchedules, schedulesKey } = await import('../src/lib/schedules')
import type { SourceRead } from '../src/lib/shulTimes'
import type { ResourceRow } from '../src/types'

const COMMUNITY = 'philly'
const TODAY = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const NOW = Date.parse(`${TODAY}T17:00:00Z`)

const categories = await listCategoriesUncached(COMMUNITY)
const { data: community } = await getAdminClient().from('community').select('timezone, map_center').eq('slug', COMMUNITY).maybeSingle()
const { timezone, map_center: mapCenter } = community as { timezone: string; map_center: { lat: number; lng: number } }
const where = { timezone, mapCenter }

const { data: watches } = await getAdminClient().from('watch').select('url, resource_id, active').eq('community_id', COMMUNITY).eq('kind', 'website').eq('active', true)
const { data: rows } = await getAdminClient().from('resource').select('*').eq('community_id', COMMUNITY).eq('status', 'approved')
const shuls = (rows as ResourceRow[])
  .map(normalizeRow)
  .flatMap((l) => {
    const c = categories.find((x) => x.id === l.category)
    const reads = c && pageReadsFor(c)
    return c && reads?.kind === 'times' ? [{ listing: l, category: c, key: reads.key }] : []
  })
  .filter(({ listing }) => (watches ?? []).some((w) => w.resource_id === listing.id))

const sunday = (() => {
  const d = new Date(`${TODAY}T12:00:00Z`)
  return new Date(d.getTime() - d.getUTCDay() * 86_400_000).toISOString().slice(0, 10)
})()
const { data: filed } = await getAdminClient()
  .from('submission')
  .select('target_id, payload, status, created_at, submitted_by')
  .eq('community_id', COMMUNITY)
  .gte('created_at', `${sunday}T00:00:00Z`)
const { data: pendingRows } = await getAdminClient().from('submission').select('target_id, payload').eq('community_id', COMMUNITY).eq('status', 'pending')

const out: unknown[] = []
for (const { listing, category, key } of shuls) {
  const urls = (watches ?? []).filter((w) => w.resource_id === listing.id).map((w) => w.url as string).filter((u) => /^https?:/.test(u))
  console.error(`── ${listing.name}: ${urls.join(', ')}`)
  const sk = schedulesKey(key)
  const onListing = new Set(readSchedules(listing[sk]).map((s) => s.id))
  // Weeks waiting in To do: a pending suggestion's weeks the listing hasn't.
  const waiting = (pendingRows ?? [])
    .filter((r) => r.target_id === listing.id)
    .flatMap((r) => readSchedules((r.payload as { details?: Record<string, unknown> } | null)?.details?.[sk]))
    .filter((s) => s.kind === 'week' && !onListing.has(s.id))

  const sources = new Map<string, Awaited<ReturnType<typeof readListingPage>>>()
  const notes: string[] = []
  for (const page of urls) {
    let why = ''
    const source = await readListingPage(page, { timezone, pictures: true, now: NOW, trouble: (t) => (why = JSON.stringify(t)) }).catch((err) => {
      why = err instanceof Error ? err.message : String(err)
      return null
    })
    if (source) sources.set(page, source)
    else notes.push(`${page}: couldn’t be read${why ? ` (${why})` : ''}`)
  }
  const read = async (page: string, otherReads: readonly SourceRead[]) =>
    readShulPage(listing, category, key, sources.get(page)!, page, { apiKey: process.env.OPENAI_API_KEY!, where, now: NOW, otherReads, waiting }).catch((err) => {
      notes.push(`${page}: the AI couldn’t read it (${err instanceof Error ? err.message : String(err)})`)
      return null
    })
  // Once alone, to have each page's reads; then each with the others'.
  const alone = new Map<string, SourceRead[]>()
  for (const page of sources.keys()) alone.set(page, (await read(page, []))?.shulReads ?? [])
  const pages = []
  for (const page of sources.keys()) {
    const others = [...alone].filter(([p]) => p !== page).flatMap(([, r]) => r)
    const got = await read(page, others)
    if (!got) continue
    pages.push({
      page,
      read: got.read,
      note: got.note ?? null,
      parts: got.parts,
      files: got.proposal ? Object.values(got.proposal.weekLines).length ? got.proposal.weekLines : got.proposal.lines : null,
      weeks: got.proposal ? readSchedules(got.proposal.submission.details[sk]).filter((s) => s.postedBy === 'website' && !onListing.has(s.id)).map((s) => ({ name: s.name, from: s.from, to: s.to, parts: s.parts, whole: s.whole, minyanim: s.minyanim.map((m) => `${m.on.join(',')} ${m.tefillah} ${m.time}${m.joinLink ? ' (link)' : ''}`) })) : [],
    })
  }
  const oldFiled = (filed ?? [])
    .filter((f) => f.target_id === listing.id && (f.submitted_by as { name?: string } | null)?.name)
    .map((f) => ({ at: f.created_at, by: (f.submitted_by as { name?: string }).name, status: f.status }))
  out.push({ name: listing.name, notes, waiting: waiting.length, pages, oldFiled })
}

const file = process.env.DRY_RUN_OUT ?? `shul-times-dry-run-${TODAY}.json`
writeFileSync(file, JSON.stringify(out, null, 2))
for (const s of out as { name: string; notes: string[]; pages: { page: string; note: string | null; weeks: { name: string; parts?: string[]; minyanim: string[] }[] }[]; oldFiled: unknown[] }[]) {
  console.log(`\n${s.name}${s.notes.length ? `  [${s.notes.join('; ')}]` : ''}`)
  for (const p of s.pages) {
    console.log(`  ${p.page}${p.note ? `  (${p.note})` : ''}`)
    for (const w of p.weeks) console.log(`    files ${w.name} [${w.parts?.join(',') ?? 'both'}]: ${w.minyanim.join('; ') || 'no minyan'}`)
    if (!p.weeks.length) console.log('    files no week')
  }
  console.log(`  old watch filed since ${sunday}: ${s.oldFiled.length}`)
}
console.error(`\nAll of it: ${file}`)
