// One-time backfill: resolves a stable Google place id for every commercial
// listing (grocery, restaurant, hotel, dentist, …) and stores it as
// `details.placeId`. The presence of a placeId is what opts a listing into the
// recurring hours/phone sync (scripts/sync-google-hours.mjs + the cron route).
//
// Community-wide / fully hand-curated categories (whatsapp, bikur cholim) are
// skipped — Google has no data for them at all, so they stay manual.
//
// Requires GOOGLE_MAPS_SERVER_KEY (Places API enabled, NOT referrer-restricted).
// Safe to re-run: skips listings that already have a placeId. Logs the name +
// address Google matched so you can eyeball each match and fix bad ones by hand.
//
//   node --env-file=.env.local scripts/backfill-place-ids.mjs

import { createClient } from '@supabase/supabase-js'

// Mirrors SYNC_EXCLUDED_CATEGORY_IDS in src/lib/categories.ts (scripts can't
// import the TS module). Keep the two in sync.
const SYNC_EXCLUDED = new Set(['whatsapp', 'bikur-cholim'])

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

// Returns { placeId, name, address } of Google's best match, or null.
async function findPlace(query) {
  const fields = 'place_id,name,formatted_address'
  const u =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(query)}&inputtype=textquery&fields=${fields}&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  const c = data.status === 'OK' && data.candidates?.[0]
  if (!c?.place_id) return null
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
  if (SYNC_EXCLUDED.has(r.category)) { skipped++; continue }
  if (!r.address) { skipped++; continue }

  // Search by address only — more reliable than name+address since names vary
  // between the listing and Google's entry (dashes, subtitles, abbreviations).
  const match = await findPlace(r.address)
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
