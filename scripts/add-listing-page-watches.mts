// Adds the listing-page watches (src/lib/listingPageWatch.ts) the dry run
// showed (scripts/listing-pages-dry-run.mts) to the LIVE database, as the
// Watches tab's "It's the listing's own page" tick box would: tied to the
// listing, labelled for it, and run once so its first read is the baseline
// (no AI, nothing filed). The user said yes to these nine on Oct 19.
//
//   npx tsx scripts/add-listing-page-watches.mts           # dry run: writes nothing
//   npx tsx scripts/add-listing-page-watches.mts --apply   # adds them
//
// Only after the code that runs them is deployed: the code before it reads
// these as plain page watches, and the first run after would take its own
// change of fingerprint for the page changing.

import { existsSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.PROD_SUPABASE_URL
const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Needs PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const apply = process.argv.includes('--apply')

// Without --apply, anything but a read sent to the live database throws
// before it leaves this process.
if (!apply) {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (target.startsWith(url) && method !== 'GET' && method !== 'HEAD') throw new Error(`Dry run: refused ${method} ${target}`)
    return realFetch(input, init)
  }) as typeof fetch
}

process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = key

const { listCategoriesUncached } = await import('../src/lib/categoryStore')
const { normalizeRow } = await import('../src/lib/resourceStore')
const { getAdminClient } = await import('../src/lib/supabase/admin')
const { addWatch, getWatchByUrl } = await import('../src/lib/watchStore')
const { runAndRecord } = await import('../src/lib/watchRunner')
const { kindForUrl, normalizeWatchUrl } = await import('../src/lib/watches')
const { LISTING_PAGE_WATCH_CREATOR, listingPageLabel, pageReadsFor } = await import('../src/lib/listingPageWatch')
import type { ResourceRow } from '../src/types'

const COMMUNITY = 'philly'

const PAGES: [string, string][] = [
  ['Mekor Habracha', 'https://www.mekorhabracha.org/davening'],
  ["B'nai Abraham Chabad", 'https://phillyshul.com/minyans/'],
  ['Society Hill Synagogue', 'https://www.societyhillsynagogue.org/minyan/'],
  ['Kol Tzedek', 'https://www.kol-tzedek.org/shabbat.html'],
  ['Temple Beth Zion-Beth Israel', 'https://bzbi.org/worship/'],
  ['Mikvah Mei Shalva', 'https://philamikvah.org/appointments/'],
  ['Lower Merion Community Mikvah', 'https://lmcmikvah.org/appointments-and-membership/'],
  ['Mikvah Ohel Leah', 'https://mikvahohelleah.org/make-an-appointment/'],
  ['Mikvah Moishe Zvi', 'https://www.mikvahwestphilly.com/'],
]

const categories = await listCategoriesUncached(COMMUNITY)
console.log(apply ? 'Adding to the live database.\n' : 'Dry run: nothing is written. --apply to add.\n')

for (const [name, page] of PAGES) {
  const { data: row } = await getAdminClient().from('resource').select('*').eq('community_id', COMMUNITY).eq('status', 'approved').eq('name', name).maybeSingle()
  if (!row) {
    console.log(`✗ ${name}: no approved listing by that name`)
    continue
  }
  const listing = normalizeRow(row as ResourceRow)
  const reads = pageReadsFor(categories.find((c) => c.id === listing.category) ?? { detailFields: [] })
  const watchUrl = normalizeWatchUrl(page)
  if (!reads || !watchUrl) {
    console.log(`✗ ${name}: ${reads ? 'not a web address' : 'its category has no davening times or hours'}`)
    continue
  }
  const existing = await getWatchByUrl(COMMUNITY, watchUrl)
  if (existing) {
    console.log(`· ${name}: already watched ("${existing.label ?? existing.url}", by ${existing.createdBy ?? 'unknown'})`)
    continue
  }
  const watch = { kind: kindForUrl(watchUrl), url: watchUrl, resourceId: listing.id, label: listingPageLabel(listing.name, reads), createdBy: LISTING_PAGE_WATCH_CREATOR }
  if (!apply) {
    console.log(`+ ${watch.label}\n    ${watch.url} → listing ${listing.id} (${watch.kind}, created_by "${watch.createdBy}")`)
    continue
  }
  const added = await addWatch(COMMUNITY, watch)
  if (!added) {
    console.log(`· ${name}: already watched`)
    continue
  }
  const { outcome } = await runAndRecord(added)
  console.log(`+ ${watch.label}: added; first read ${outcome.ok ? `ok, filed ${outcome.filed}` : `failed: ${outcome.error}`}`)
}
