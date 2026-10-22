// A dry run of finding a shul's davening times from its own website
// (timesPages, hoursPages.ts), against the LIVE database, reading only: for
// each place with minyanim, its home page and the links on it that may give
// times, what the AI reads off each, and what that would change on the
// listing. Saves nothing, files nothing, adds no watch (step 4, Oct 21).
//
//   npx tsx scripts/shul-pages-dry-run.mts
//
// Below each page, its own lines that look like times, to judge the read
// by, and whether a page given by hand was found on its own. One AI read a
// page (a week of its calendar, if it has one), on the cheapest model.

import { existsSync } from 'node:fs'

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
const { fetchPublic, troubleClause } = await import('../src/lib/menuReader')
const { WATCH_FETCH_HEADERS } = await import('../src/lib/websiteWatch')
const { readListingPage, readPageFor } = await import('../src/lib/listingPageRun')
const { pageReadsFor, isListingPageWatch } = await import('../src/lib/listingPageWatch')
const { listWatches } = await import('../src/lib/watchStore')
const { samePage } = await import('../src/lib/hoursJob')
const { timesPages } = await import('../src/lib/hoursPages')
import type { ResourceRow } from '../src/types'

const CLOCK = /\b\d{1,2}(:\d\d)?\s*(am|pm|a\.m\.|p\.m\.)/i
const BARE = /\b\d{1,2}:\d\d\b/
const LOOKS_LIKE_TIMES = /\b\d{1,2}:\d\d\b|\b\d{1,2}\s*(am|pm)\b|\b(shacharis|shacharit|mincha|minchah|maariv|ma’ariv|arvit|kabbalat|kabbalas|services|minyan)\b/i

type Tally = { shul: string; site: boolean; opens: boolean; pages: number; readFrom: number; differs: number; given: string[]; givenFound: number; clockOnRead: number; bareOnly: number }
const tallies: Tally[] = []

async function dryRun(slug: string, communityName: string, category: Awaited<ReturnType<typeof listCategoriesUncached>>[number], reads: NonNullable<ReturnType<typeof pageReadsFor>>, row: ResourceRow, given: string[]): Promise<string[]> {
  const out: string[] = []
  const say = (l: string) => out.push(l)
  const listing = normalizeRow(row)
  const website = typeof listing.website === 'string' && listing.website ? listing.website : null
  const t: Tally = { shul: listing.name, site: !!website, opens: false, pages: 0, readFrom: 0, differs: 0, given, givenFound: 0, clockOnRead: 0, bareOnly: 0 }
  tallies.push(t)
  say(`\n══ ${listing.name} (${slug}) · ${website ?? 'no website'}`)
  if (given.length) say(`   Given by hand: ${given.join(', ')}`)
  if (!website) return out
  let trouble = ''
  const home = await fetchPublic(website, { headers: WATCH_FETCH_HEADERS, trouble: (x) => (trouble = troubleClause(x)) })
  if (!home || home.type !== 'html') {
    say(`   Its website can’t be read${trouble ? `: ${trouble}` : ''}.`)
    return out
  }
  t.opens = true
  const pages = timesPages(home.url, home.body)
  t.pages = pages.length
  t.givenFound = given.filter((g) => pages.some((p) => samePage(p.url, g))).length
  for (const { url: page, link } of pages) {
    say(`\n   ── ${page}${link ? ` (its “${link}” link)` : ''}`)
    const source = await readListingPage(page, { pictures: true }).catch(() => null)
    if (!source) {
      say('      Can’t be read (blocked, moved, or nearly empty).')
      continue
    }
    const text = source.weeks ? source.weeks.flatMap((w) => w.lines).join('\n') : source.text ?? ''
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && l.length < 300 && LOOKS_LIKE_TIMES.test(l))
    say(`      ${source.weeks ? `A calendar, ${source.weeks.length} week(s). ` : ''}The page says:${lines.length ? '' : ' nothing like times.'}`)
    for (const l of lines.slice(0, 14)) say(`        | ${l}`)
    try {
      const reading = await readPageFor(listing, category, reads, source, { apiKey: process.env.OPENAI_API_KEY!, communityName })
      say(`      The AI read: ${reading.read.length ? '' : 'no times.'}`)
      for (const l of reading.read.slice(0, 14)) say(`        · ${l}`)
      if (reading.note) say(`      Note: ${reading.note}`)
      say(`      Would change: ${reading.proposal ? '' : 'nothing.'}`)
      for (const l of reading.proposal?.lines ?? []) say(`        → ${l}`)
      if (reading.read.length) {
        t.readFrom++
        if (CLOCK.test(text)) t.clockOnRead++
        else if (BARE.test(text)) t.bareOnly++
      }
      if (reading.proposal) t.differs++
    } catch (err) {
      say(`      The AI couldn’t read it: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return out
}

const { data: communities } = await getAdminClient().from('community').select('slug, name')
for (const { slug, name: communityName } of (communities ?? []) as { slug: string; name: string }[]) {
  const { watches } = await listWatches(slug)
  for (const category of await listCategoriesUncached(slug)) {
    const reads = pageReadsFor(category)
    if (reads?.kind !== 'times') continue
    const { data: rows } = await getAdminClient().from('resource').select('*').eq('community_id', slug).eq('status', 'approved').eq('category', category.id).order('name')
    const list = (rows ?? []) as ResourceRow[]
    // A few shuls at a time; each one's lines printed together.
    for (let i = 0; i < list.length; i += 4) {
      const batch = list.slice(i, i + 4)
      const outs = await Promise.all(batch.map((row) => dryRun(slug, communityName, category, reads, row, watches.filter((w) => w.resourceId === row.id && isListingPageWatch(w)).map((w) => w.url))))
      for (const o of outs) console.log(o.join('\n'))
    }
  }
}

console.log('\n══ Counts')
const n = (f: (t: Tally) => boolean) => tallies.filter(f).length
console.log(`   ${tallies.length} shuls · ${n((t) => t.site)} with a website · ${n((t) => t.opens)} whose website opens`)
console.log(`   ${n((t) => t.readFrom > 0)} with times read from at least one page · ${n((t) => t.differs > 0)} where a page differs from the listing`)
console.log(`   Pages given by hand: ${tallies.reduce((s, t) => s + t.given.length, 0)}, found on their own: ${tallies.reduce((s, t) => s + t.givenFound, 0)}`)
console.log(`   Pages times were read from: ${tallies.reduce((s, t) => s + t.readFrom, 0)} · with an am/pm time: ${tallies.reduce((s, t) => s + t.clockOnRead, 0)} · with only bare times (7:00): ${tallies.reduce((s, t) => s + t.bareOnly, 0)}`)
