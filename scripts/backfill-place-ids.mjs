// One-time backfill: resolves a stable Google place id for every commercial
// listing (grocery, restaurant, hotel, dentist, …) and stores it as
// `details.placeId`. The presence of a placeId is what opts a listing into the
// recurring hours/phone sync (scripts/sync-google-hours.mjs + the cron route).
//
// Address-less listings (WhatsApp groups, Networking, …) are skipped — no
// address means no physical place for Google to match against, and it's the
// listing's own `address` column that decides that, not a hand-maintained
// category id list (see isCategorySyncEligible in src/lib/categories.ts,
// which used to be exactly that kind of list until it missed a category).
//
// Requires GOOGLE_MAPS_SERVER_KEY (Places API enabled, NOT referrer-restricted).
// Safe to re-run: skips listings that already have a placeId. Logs the name +
// address Google matched so you can eyeball each match and fix bad ones by hand.
//
//   node --env-file=.env.local scripts/backfill-place-ids.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY
if (!url || !serviceRoleKey || !mapsKey) {
  console.error('Run: node --env-file=.env.local scripts/backfill-place-ids.mjs')
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_SERVER_KEY.')
  process.exit(1)
}
const s = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A real business match has a name Google gave it, not the street address
// echoed back — Find Place's address-only search falls back to a bare geocode
// point whenever nothing at that address dominates the query, and a bare
// point has no phone/hours/business_status for the sync to ever use. `types`
// backs up the same check: a geocode fallback is tagged street_address/route,
// never establishment or point_of_interest.
function isRealBusiness(candidate) {
  if (/^\d/.test(candidate.name)) return false
  const types = candidate.types ?? []
  if (types.includes('street_address') || types.includes('route')) return false
  return types.includes('establishment') || types.includes('point_of_interest')
}

// "198 Tomlinson Rd, Philadelphia, PA 19116, USA" → "198 tomlinson rd" — just
// the street number + name, so formatting differences (unit numbers, city
// spelled out or not) don't break the comparison.
function streetOf(address) {
  return address.split(',')[0].trim().toLowerCase()
}

// Words of 3+ letters, lowercased — short enough to compare loosely across
// naming variants (dashes, "The", abbreviations) without pulling in noise
// words like "of"/"the".
function significantWords(name) {
  return new Set(name.toLowerCase().match(/[a-z0-9']{3,}/g) ?? [])
}

// True if the two names share at least one non-trivial word. Multiple
// organizations often share one building (a shul's mikvah, a chabad's
// preschool) — the address alone can't tell them apart, since only one of
// them may have its own Google listing at all. Requiring name overlap is
// what catches "right address, wrong organization" (e.g. a mikvah's address
// query returning the synagogue it's housed inside).
function namesOverlap(a, b) {
  const wordsA = significantWords(a)
  for (const w of significantWords(b)) if (wordsA.has(w)) return true
  return false
}

// Returns { placeId, name, address } of Google's best match, or null.
// Searches by name + address (Text Search), but Google ranks results by
// text relevance, not by whether the address/business is actually right —
// the top hit can be a more prominent business anywhere nearby, or the
// distinct Google listing for a different org that happens to share the
// building. So this only accepts a candidate whose address matches what we
// have on file AND whose name overlaps what we're looking for; if nothing
// clears both bars, it's a genuine no-match rather than a guess, and the
// listing is left for manual review.
async function findPlace(name, address) {
  const query = `${name} ${address}`
  const u =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK') return null
  const wantStreet = streetOf(address)
  const c = (data.results ?? []).find(
    (r) =>
      r.place_id &&
      isRealBusiness(r) &&
      streetOf(r.formatted_address ?? '') === wantStreet &&
      namesOverlap(name, r.name ?? ''),
  )
  if (!c) return null
  return { placeId: c.place_id, name: c.name, address: c.formatted_address }
}

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,address,category,details')
  .eq('status', 'approved')
if (error) throw new Error(error.message)

let done = 0
let skipped = 0
let failed = 0
for (const r of rows) {
  if (r.details?.placeId) { skipped++; continue }
  if (!r.address) { skipped++; continue }

  const match = await findPlace(r.name, r.address)
  if (!match) {
    console.log('⚠️  no Google match:', r.name, '—', r.address)
    failed++
    await sleep(200)
    continue
  }

  const details = { ...(r.details ?? {}), placeId: match.placeId }
  await s.from('resource').update({ details }).eq('id', r.id)
  done++
  console.log(`✅ ${r.name}\n     → matched: ${match.name} — ${match.address}`)
  await sleep(200)
}

console.log(`\nDone. linked ${done}, skipped ${skipped}, no-match ${failed}.`)
console.log('Review the matches above; correct any wrong placeId by hand in Supabase.')
