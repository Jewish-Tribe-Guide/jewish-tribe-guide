// A dry run of the listing-page watch (src/lib/listingPageWatch.ts) against
// the LIVE database, reading only: for each shul's or mikvah's own page, what
// the AI reads off it today and what the watch would file. Files nothing,
// adds no watch, dates nothing.
//
//   npx tsx scripts/listing-pages-dry-run.mts
//   npx tsx scripts/listing-pages-dry-run.mts "Lower Merion Synagogue=https://www.lowermerionsynagogue.org/davening"
//
// It asks the AI for every page, as the run would only on a day the page
// changed, so the result is what the first change would bring. A few cents
// on the cheapest model.

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

// The app's own client (src/lib/supabase/admin.ts) reads these.
process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = key

const { listCategoriesUncached } = await import('../src/lib/categoryStore')
const { normalizeRow } = await import('../src/lib/resourceStore')
const { getAdminClient } = await import('../src/lib/supabase/admin')
const { readListingPage, proposeFromPage, hasPendingSuggestion, earlierSuggestions } = await import('../src/lib/listingPageRun')
const { pageReadsFor, filedBefore, listingPageNote, changedOn } = await import('../src/lib/listingPageWatch')
const { menuHash } = await import('../src/lib/menuWatch')
import type { ResourceRow } from '../src/types'

const COMMUNITY = 'philly'

/** Each listing's page of times or hours, found from its website Oct 19. */
const PAGES: [string, string][] = [
  ['Mekor Habracha', 'https://www.mekorhabracha.org/davening'],
  ["B'nai Abraham Chabad", 'https://phillyshul.com/minyans/'],
  ['Society Hill Synagogue', 'https://www.societyhillsynagogue.org/minyan/'],
  ['Kol Tzedek', 'https://www.kol-tzedek.org/shabbat.html'],
  ['Temple Beth Zion-Beth Israel', 'https://bzbi.org/worship/'],
  ['Lower Merion Synagogue', 'https://www.lowermerionsynagogue.org/'],
  ['Mikvah Mei Shalva', 'https://philamikvah.org/appointments/'],
  ['Lower Merion Community Mikvah', 'https://lmcmikvah.org/appointments-and-membership/'],
  ['Mikvah Ohel Leah', 'https://mikvahohelleah.org/make-an-appointment/'],
  ['Mikvah Moishe Zvi', 'https://www.mikvahwestphilly.com/'],
]

const pages: [string, string][] = process.argv.length > 2 ? process.argv.slice(2).map((a) => a.split('=') as [string, string]) : PAGES

const categories = await listCategoriesUncached(COMMUNITY)
const { data: community } = await getAdminClient().from('community').select('name').eq('slug', COMMUNITY).maybeSingle()
const communityName = (community as { name?: string } | null)?.name ?? COMMUNITY
const today = changedOn(Date.now())

for (const [name, page] of pages) {
  console.log(`\n── ${name}\n   ${page}`)
  const { data: row } = await getAdminClient().from('resource').select('*').eq('community_id', COMMUNITY).eq('status', 'approved').eq('name', name).maybeSingle()
  if (!row) {
    console.log('   No approved listing by that name.')
    continue
  }
  const listing = normalizeRow(row as ResourceRow)
  const category = categories.find((c) => c.id === listing.category)
  const reads = category && pageReadsFor(category)
  if (!category || !reads) {
    console.log('   Its category has no davening times or hours.')
    continue
  }
  const source = await readListingPage(page).catch((err) => {
    console.log(`   ${err instanceof Error ? err.message : String(err)}`)
    return null
  })
  if (!source) {
    console.log('   Can’t be read: blocked, moved, or built in the browser. The watch would show as not working.')
    continue
  }
  console.log(`   Read: ${source.text ? `${source.text.length} characters of text` : 'a PDF'} (fingerprint ${menuHash(source).slice(0, 8)}). For: ${reads.kind === 'times' ? 'davening times' : `hours (${reads.keys.join(', ')})`}`)
  let proposal
  try {
    proposal = await proposeFromPage(listing, category, reads, source, { apiKey: process.env.OPENAI_API_KEY!, communityName })
  } catch (err) {
    console.log(`   The AI couldn’t read it: ${err instanceof Error ? err.message : String(err)}`)
    continue
  }
  if (!proposal) {
    console.log('   The AI read nothing that differs from the listing: files nothing, dates nothing.')
    continue
  }
  const pending = await hasPendingSuggestion(COMMUNITY, listing.id)
  const before = filedBefore(await earlierSuggestions(COMMUNITY, listing.id), proposal.submission.details, proposal.keys)
  const verdict = pending ? 'Would wait: the listing has a suggestion in the queue already.' : before ? 'Would skip: filed before.' : 'Would file, if the page changed today:'
  console.log(`   ${verdict}`)
  console.log(
    listingPageNote(page, today, proposal.lines)
      .split('\n')
      .map((l) => `     ${l}`)
      .join('\n'),
  )
}
