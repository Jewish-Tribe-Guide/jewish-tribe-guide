// A dry run of finding a mikvah's hours from its own website (hoursPages.ts),
// against the LIVE database, reading only: for each place with weekly
// hours fields (women's, men's, keilim), its home page and the links on it
// that may give hours, what the AI reads off each, and what that would
// change on the listing. Saves nothing, files nothing, adds no watch.
//
//   npx tsx scripts/hours-pages-dry-run.mts
//
// Below each page, its own lines that look like hours, to judge the read
// by. One AI read a page, on the cheapest model: a few cents.

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
const { pageReadsFor } = await import('../src/lib/listingPageWatch')
const { hoursPages } = await import('../src/lib/hoursPages')
import type { ResourceRow } from '../src/types'

const LOOKS_LIKE_HOURS = /\b\d{1,2}(:\d\d)?\s*(am|pm|a\.m\.|p\.m\.)|\b(hours|open|closed|candle|sunset|appointment only|by appointment)\b/i

const { data: communities } = await getAdminClient().from('community').select('slug, name')
for (const { slug, name: communityName } of (communities ?? []) as { slug: string; name: string }[]) {
  for (const category of await listCategoriesUncached(slug)) {
    const reads = pageReadsFor(category)
    // Places with named weekly hours (a mikvah's), not every place with "Hours".
    if (reads?.kind !== 'hours' || reads.keys.includes('hours')) continue
    const { data: rows } = await getAdminClient().from('resource').select('*').eq('community_id', slug).eq('status', 'approved').eq('category', category.id).order('name')
    for (const row of (rows ?? []) as ResourceRow[]) {
      const listing = normalizeRow(row)
      const website = typeof listing.website === 'string' && listing.website ? listing.website : null
      console.log(`\n══ ${listing.name} (${slug}) · ${website ?? 'no website'}`)
      if (!website) continue
      let trouble = ''
      const home = await fetchPublic(website, { headers: WATCH_FETCH_HEADERS, trouble: (t) => (trouble = troubleClause(t)) })
      if (!home || home.type !== 'html') {
        console.log(`   Its website can’t be read${trouble ? `: ${trouble}` : ''}.`)
        continue
      }
      for (const page of hoursPages(home.url, home.body)) {
        console.log(`\n   ── ${page}`)
        const source = await readListingPage(page).catch(() => null)
        if (!source) {
          console.log('      Can’t be read (blocked, moved, or nearly empty).')
          continue
        }
        const lines = (source.text ?? '').split('\n').map((l) => l.trim()).filter((l) => l && l.length < 300 && LOOKS_LIKE_HOURS.test(l))
        console.log(`      The page says:${lines.length ? '' : ' nothing like hours.'}`)
        for (const l of lines.slice(0, 12)) console.log(`        | ${l}`)
        try {
          const reading = await readPageFor(listing, category, reads, source, { apiKey: process.env.OPENAI_API_KEY!, communityName })
          console.log(`      The AI read: ${reading.read.length ? '' : 'no hours.'}`)
          for (const l of reading.read) console.log(`        · ${l}`)
          if (reading.unread?.length) console.log(`      Couldn’t compare: ${reading.unread.join('; ')}`)
          console.log(`      Would change: ${reading.proposal ? '' : 'nothing.'}`)
          for (const l of reading.proposal?.lines ?? []) console.log(`        → ${l}`)
        } catch (err) {
          console.log(`      The AI couldn’t read it: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  }
}
