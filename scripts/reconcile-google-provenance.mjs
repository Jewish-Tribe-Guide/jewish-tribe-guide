// One-off: works out `details.googleFields` for listings that predate
// approval-time provenance resolution.
//
// Every approval now decides this itself (submissionStore.ts's
// resolveGoogleFields), by comparing the submitted value against Google's own
// data — same rule this script has always used for legacy rows, just applied
// going forward instead of after the fact. Rows approved before that existed
// have no such record, so this infers it the only way available: compare
// what's stored against what Google says today.
//
//   • stored value matches Google  → Google's, keep it fresh
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
//
// By default this SKIPS any row that already has a `googleFields` array
// recorded — it exists to backfill rows that predate provenance tracking,
// not to re-verify rows that already have it. That means "N already had
// provenance" is not a claim those N are accurate, just that they weren't
// touched. Pass --recheck to actually verify them against Google today:
//
//   node --env-file=.env.local scripts/reconcile-google-provenance.mjs --recheck
//   node --env-file=.env.local scripts/reconcile-google-provenance.mjs --recheck --apply
//
// --recheck --apply is ADDITIVE ONLY — it only ever ADDS a field (name/
// phone/hours) to the existing googleFields array once verified to match
// Google today; it never removes or replaces an entry. That matters because
// this script has never checked `website`, so overwriting an already-
// recorded array wholesale (the way the no-args backfill path does, for
// rows with NO prior array) could silently drop a correctly-recorded
// website ownership. Additive-only means that risk doesn't exist here.

import { createClient } from '@supabase/supabase-js'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const APPLY = process.argv.includes('--apply')
const RECHECK = process.argv.includes('--recheck')

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
  const fields = 'name,formatted_phone_number,opening_hours'
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
// --recheck only:
let rechecked = 0
let stillProtected = 0
const wouldNowMatch = []

for (const r of rows) {
  const priorOwned = Array.isArray(r.details?.googleFields) ? r.details.googleFields : null
  if (priorOwned && !RECHECK) {
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

  // Name — exact match means the submitter kept what autofill supplied.
  const gName = result.name ?? null
  if (isEmpty(r.name)) owned.push('name')
  else if (gName && gName.trim() === r.name.trim()) owned.push('name')
  else if (gName) unclear.push({ field: 'name', stored: r.name, google: gName })

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

  if (priorOwned) {
    // Already had provenance recorded — --recheck verifies it against Google
    // today. Only fields that were PROTECTED (absent from the prior array)
    // are interesting here: was that decision still right, or does the
    // field actually match Google now?
    rechecked++
    const confirmed = []
    for (const field of ['name', 'phone', 'hours']) {
      if (priorOwned.includes(field)) continue // was already owned — not what we're checking
      if (owned.includes(field)) {
        wouldNowMatch.push({ id: r.id, name: r.name, field })
        confirmed.push(field)
      } else {
        stillProtected++
      }
    }
    if (APPLY && confirmed.length > 0) {
      // Additive only — union with what's already there, never drop or
      // replace an entry (see the top-of-file note on why).
      const nextOwned = [...new Set([...priorOwned, ...confirmed])]
      await s.from('resource').update({ details: { ...r.details, googleFields: nextOwned } }).eq('id', r.id)
      updated++
    }
    await sleep(200)
    continue
  }

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

if (RECHECK) {
  console.log(
    `\nRE-CHECK — verified ${rechecked} already-provenanced listing(s) against Google today` +
      (APPLY ? ` (wrote confirmed fields on ${updated}).` : ' (nothing written — pass --apply too).'),
  )
  if (wouldNowMatch.length === 0) {
    console.log(`Every currently-protected name/phone/hours field (${stillProtected} of them) still genuinely differs from Google.`)
  } else {
    const verb = APPLY ? 'now match Google and were added to googleFields' : 'would now match Google — recorded provenance on these looks stale'
    console.log(`${stillProtected} protected field(s) still genuinely differ. ${wouldNowMatch.length} ${verb}:`)
    for (const w of wouldNowMatch) console.log(`  • ${w.name} — ${w.field}`)
  }
  console.log('\n(Only checks name/phone/hours — this script has never verified website.)')
}

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
        console.log(`    ${u.field} stored: ${u.stored}   google: ${u.google}`)
      }
    }
  }
}
