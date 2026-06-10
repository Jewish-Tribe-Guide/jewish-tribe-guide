// One-time backfill: computes driving + walking minutes from every existing
// listing (that has geocoded coordinates) to each hospital, via Google's
// Distance Matrix API, storing details as `travel = { [hospitalId]: { drive, walk } }`.
// Requires GOOGLE_MAPS_SERVER_KEY (Distance Matrix API enabled, not referrer-restricted).
// Safe to re-run (skips listings that already have travel data).
//
//   node --env-file=.env.local scripts/backfill-travel-times.mjs

import { createClient } from '@supabase/supabase-js'
import { hospitals } from '../src/data/hospitals.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY
if (!url || !serviceRoleKey || !mapsKey) {
  console.error('Run: node --env-file=.env.local scripts/backfill-travel-times.mjs')
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_SERVER_KEY.')
  process.exit(1)
}
const s = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const destinationsParam = hospitals.map((h) => `${h.latitude},${h.longitude}`).join('|')

async function fetchDurationsMinutes(originParam, mode) {
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(originParam)}&destinations=${encodeURIComponent(destinationsParam)}` +
    `&mode=${mode}&units=imperial&key=${mapsKey}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK' || !data.rows[0]) return null
  return data.rows[0].elements.map((el) =>
    el.status === 'OK' && el.duration ? Math.round(el.duration.value / 60) : null,
  )
}

async function computeTravel(geo) {
  const originParam = `${geo.lat},${geo.lng}`
  const [driving, walking] = await Promise.all([
    fetchDurationsMinutes(originParam, 'driving'),
    fetchDurationsMinutes(originParam, 'walking'),
  ])
  if (!driving && !walking) return null

  const travel = {}
  hospitals.forEach((h, i) => {
    const times = {}
    if (driving?.[i] != null) times.drive = driving[i]
    if (walking?.[i] != null) times.walk = walking[i]
    if (times.drive != null || times.walk != null) travel[h.id] = times
  })
  return Object.keys(travel).length > 0 ? travel : null
}

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,details,travel')
  .eq('status', 'approved')
if (error) throw new Error(error.message)

let done = 0
let skipped = 0
let failed = 0
for (const r of rows) {
  if (r.travel) { skipped++; continue }
  const geo = r.details?.geo
  if (!geo?.lat) { skipped++; continue }

  const travel = await computeTravel(geo)
  if (!travel) {
    console.log('⚠️  could not compute travel times:', r.name)
    failed++
    await sleep(200)
    continue
  }
  await s.from('resource').update({ travel }).eq('id', r.id)
  done++
  console.log(`✅ ${r.name}`, JSON.stringify(travel))
  await sleep(200)
}

console.log(`\nDone. computed ${done}, skipped ${skipped}, failed ${failed}.`)
