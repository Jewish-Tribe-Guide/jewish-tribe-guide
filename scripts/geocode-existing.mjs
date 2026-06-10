// One-time backfill: geocode every existing listing that has an address but no
// coordinates yet, storing details.geo = { lat, lng }. Respects Nominatim's
// ~1 req/sec limit. Safe to re-run (skips ones already geocoded).
//
//   node --env-file=.env.local scripts/geocode-existing.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Run: node --env-file=.env.local scripts/geocode-existing.mjs')
  process.exit(1)
}
const s = createClient(url, key, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function geocode(address) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(u, { headers: { 'User-Agent': 'JewishPatientConnect/1.0 (yhagler@gmail.com)' } })
  if (!res.ok) return null
  const data = await res.json()
  if (!data[0]) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,address,details')
  .not('address', 'is', null)
if (error) throw new Error(error.message)

let done = 0
let skipped = 0
let failed = 0
for (const r of rows) {
  if (!r.address?.trim()) { skipped++; continue }
  if (r.details?.geo?.lat) { skipped++; continue }

  const geo = await geocode(r.address)
  if (!geo) {
    console.log('⚠️  could not geocode:', r.name, '—', r.address)
    failed++
    await sleep(1100)
    continue
  }
  await s.from('resource').update({ details: { ...r.details, geo } }).eq('id', r.id)
  done++
  console.log(`✅ ${r.name} → ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`)
  await sleep(1100)
}

console.log(`\nDone. geocoded ${done}, skipped ${skipped}, failed ${failed}.`)
