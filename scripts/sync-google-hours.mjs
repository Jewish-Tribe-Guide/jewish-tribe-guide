// Recurring sync: refreshes hours / phone / business status for every listing
// that has a Google place id (set by scripts/backfill-place-ids.mjs). Run by
// hand whenever you want a refresh, or on a schedule. The cron route
// (src/app/api/cron/sync-hours) does the same thing for hosted scheduling.
//
// What it writes (into the listing's `details`, plus top-level `phone`):
//   • details.hours          — Google's opening hours, mapped to {sun:{open,close}|null,…}
//   • details.businessStatus — OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
//   • details.googleSyncedAt — ISO timestamp of this run
//   • phone                  — Google's formatted number (overwrites)
//   • address                — only filled when the listing has none (never overwrites)
//
// Requires GOOGLE_MAPS_SERVER_KEY (Places API enabled, NOT referrer-restricted).
//
//   node --env-file=.env.local scripts/sync-google-hours.mjs

import { createClient } from '@supabase/supabase-js'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY
if (!url || !serviceRoleKey || !mapsKey) {
  console.error('Run: node --env-file=.env.local scripts/sync-google-hours.mjs')
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_SERVER_KEY.')
  process.exit(1)
}
const s = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const hhmm = (t) => `${t.slice(0, 2)}:${t.slice(2, 4)}`

// Google opening_hours.periods → { sun:{open,close}|null, … }. See the canonical
// (commented) version in src/lib/googlePlaces.ts. Returns null when Google has
// no hours, so the caller leaves existing hours untouched.
function mapHours(oh) {
  const periods = oh?.periods
  if (!periods || periods.length === 0) return null
  if (periods.length === 1 && !periods[0].close && periods[0].open.time === '0000') {
    return Object.fromEntries(DAY_KEYS.map((k) => [k, { open: '00:00', close: '23:59' }]))
  }
  const result = Object.fromEntries(DAY_KEYS.map((k) => [k, null]))
  for (const p of periods) {
    const d = p.open.day
    if (d < 0 || d > 6) continue
    const key = DAY_KEYS[d]
    const open = hhmm(p.open.time)
    const close = !p.close || p.close.day !== d ? '23:59' : hhmm(p.close.time)
    const ex = result[key]
    result[key] = ex
      ? { open: open < ex.open ? open : ex.open, close: close > ex.close ? close : ex.close }
      : { open, close }
  }
  return result
}

async function fetchDetails(placeId) {
  const fields = 'business_status,formatted_phone_number,formatted_address,opening_hours'
  const u =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK' || !data.result) return null
  return data.result
}

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,phone,address,details')
  .eq('status', 'approved')
  .not('details->>placeId', 'is', null)
if (error) throw new Error(error.message)

let done = 0
let failed = 0
for (const r of rows) {
  const result = await fetchDetails(r.details.placeId)
  if (!result) {
    console.log('⚠️  details fetch failed:', r.name)
    failed++
    await sleep(200)
    continue
  }

  const hours = mapHours(result.opening_hours)
  const details = { ...r.details, googleSyncedAt: new Date().toISOString() }
  if (hours) details.hours = hours
  if (result.business_status) details.businessStatus = result.business_status

  const update = { details }
  if (result.formatted_phone_number) update.phone = result.formatted_phone_number
  if (!r.address && result.formatted_address) update.address = result.formatted_address

  await s.from('resource').update(update).eq('id', r.id)
  done++
  console.log(`✅ ${r.name} — ${result.business_status ?? 'OPERATIONAL'}`)
  await sleep(200)
}

console.log(`\nDone. synced ${done}, failed ${failed}.`)
