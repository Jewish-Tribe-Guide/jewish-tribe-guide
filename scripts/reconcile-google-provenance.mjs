// One-off: works out `details.googleFields` for listings that predate the
// submission form recording it.
//
// The form now captures provenance at the only moment it's knowable — whether
// the submitter kept what picking an address autofilled, or replaced it. Rows
// created before that have no such record, so this infers it the only way
// available: compare what's stored against what Google says today.
//
//   • stored value matches Google  → the submitter almost certainly kept the
//                                    autofill → Google's, keep it fresh
//   • stored value is empty        → nothing to protect → Google's
//   • stored value differs         → AMBIGUOUS. Either someone corrected it
//                                    (leave it alone) or Google has changed
//                                    since (should follow). No way to tell
//                                    apart automatically — reported for a
//                                    human call, and left as the submitter's
//                                    until told otherwise.
//
//   node --env-file=.env.local scripts/reconcile-google-provenance.mjs
//   node --env-file=.env.local scripts/reconcile-google-provenance.mjs --apply
//
// Without --apply nothing is written. Costs one Places call per listing either
// way. Safe to re-run: it only ever recomputes from current data.

import { createClient } from '@supabase/supabase-js'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const APPLY = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY
if (!url || !serviceRoleKey || !mapsKey) {
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_SERVER_KEY.')
  process.exit(1)
}
const s = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Mirrors mapHours in scripts/sync-google-hours.mjs (canonical commented
// version in src/lib/googlePlaces.ts) so the comparison below is against
// exactly what a sync would have written.
const hhmm = (t) => `${t.slice(0, 2)}:${t.slice(2, 4)}`
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
  const fields = 'formatted_phone_number,opening_hours'
  const u =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK' || !data.result) return null
  return data.result
}

/** Phone numbers are stored formatted and Google's come formatted too, but not
 *  always identically — compare digits only. */
const digits = (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

/** Hours must be compared by value, not by JSON text: stored objects don't
 *  necessarily carry their days in the same key order this script builds them
 *  in, and JSON.stringify is order-sensitive — which made identical schedules
 *  read as differences. Canonicalise to a fixed day order first. */
const hoursKey = (h) =>
  h ? DAY_KEYS.map((k) => `${k}:${h[k] ? `${h[k].open}-${h[k].close}` : 'x'}`).join('|') : null
const isEmpty = (v) =>
  v === null || v === undefined || (typeof v === 'string' && !v.trim()) ||
  (typeof v === 'object' && Object.keys(v).length === 0)

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,phone,details')
  .eq('status', 'approved')
  .not('details->>placeId', 'is', null)
if (error) throw new Error(error.message)

const ambiguous = []
let updated = 0
let alreadyRecorded = 0
let failed = 0

for (const r of rows) {
  if (Array.isArray(r.details?.googleFields)) {
    alreadyRecorded++
    continue
  }
  const result = await fetchDetails(r.details.placeId)
  if (!result) {
    failed++
    console.log('⚠️  lookup failed:', r.name)
    await sleep(200)
    continue
  }

  const owned = []
  const unclear = []

  // Phone
  const gPhone = result.formatted_phone_number ?? null
  if (isEmpty(r.phone)) owned.push('phone')
  else if (gPhone && digits(gPhone) === digits(r.phone)) owned.push('phone')
  else if (gPhone) unclear.push({ field: 'phone', stored: r.phone, google: gPhone })

  // Hours
  const gHours = mapHours(result.opening_hours)
  const stored = r.details?.hours
  if (isEmpty(stored)) owned.push('hours')
  else if (gHours && hoursKey(gHours) === hoursKey(stored)) owned.push('hours')
  else if (gHours) unclear.push({ field: 'hours', stored, google: gHours })

  if (unclear.length) ambiguous.push({ id: r.id, name: r.name, unclear })

  if (APPLY) {
    await s
      .from('resource')
      .update({ details: { ...r.details, googleFields: owned } })
      .eq('id', r.id)
    updated++
  }
  await sleep(200)
}

const summarizeHours = (h) =>
  h ? DAY_KEYS.map((k) => `${k} ${h[k] ? `${h[k].open}-${h[k].close}` : 'closed'}`).join(', ') : '(none)'

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${rows.length} listings, ${alreadyRecorded} already had provenance, ${failed} lookup failures.`)
if (APPLY) console.log(`Wrote googleFields on ${updated}.`)

if (ambiguous.length === 0) {
  console.log('\nNothing ambiguous — every field either matched Google or was empty.')
} else {
  console.log(`\n${ambiguous.length} listing(s) where the stored value differs from Google.`)
  console.log('These were left as the submitter\'s (Google will not touch them).')
  console.log('If any of these is actually just stale, clear that field in admin and the next sync fills it and takes it over.\n')
  for (const a of ambiguous) {
    console.log(`• ${a.name}`)
    for (const u of a.unclear) {
      if (u.field === 'hours') {
        console.log(`    hours stored: ${summarizeHours(u.stored)}`)
        console.log(`    hours google: ${summarizeHours(u.google)}`)
      } else {
        console.log(`    phone stored: ${u.stored}   google: ${u.google}`)
      }
    }
  }
}
