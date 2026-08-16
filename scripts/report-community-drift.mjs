// Read-only report for the categories Google Places sync has always excluded
// (synagogue, mikvah, bikur-cholim): unlike scripts/reconcile-google-provenance.mjs,
// these listings have no `placeId` to look up yet, so this first attempts a
// name+address match, then diffs whatever it finds against what's stored.
//
// Writes nothing — no --apply flag, this is purely for a human to read and
// decide from. Two things it flags for that review:
//
//   • LOW CONFIDENCE matches — the found place's name doesn't look much like
//     the listing's name, so the match itself may be wrong (a shared address,
//     a neighboring business, a building's generic listing). Field diffs
//     below a low-confidence match are only as trustworthy as the match.
//   • Field diffs — for fields the category actually has (synagogue has no
//     generic `hours` field at all; its schedule lives in `minyanim`, which
//     Google has no concept of and this script never touches).
//
//   node --env-file=.env.local scripts/report-community-drift.mjs

import { createClient } from '@supabase/supabase-js'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
// Categories this script covers — the ones sync has always skipped. Mirrors
// SYNC_EXCLUDED_CATEGORY_IDS in src/lib/categories.ts minus 'whatsapp' (not a
// physical place, nothing to match).
const CATEGORIES = ['synagogue', 'mikvah', 'bikur-cholim']
// Only mikvah has a generic `hours` field — synagogue's schedule lives in a
// `minyanim` field Google has no equivalent for, and bikur-cholim has no
// field config in this codebase at all yet.
const HOURS_FIELD_BY_CATEGORY = { mikvah: 'hours' }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY
if (!url || !serviceRoleKey || !mapsKey) {
  console.error('Run: node --env-file=.env.local scripts/report-community-drift.mjs')
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_SERVER_KEY.')
  process.exit(1)
}
const s = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Matching ─────────────────────────────────────────────────────────────
// Name+address (not address-only, unlike backfill-place-ids.mjs) — these
// categories skew toward shared buildings and home-based listings, where an
// address-only search is far more likely to land on the wrong entry.
async function findPlace(name, address) {
  const input = [name, address].filter(Boolean).join(', ')
  const fields = 'place_id,name,formatted_address'
  const u =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(input)}&inputtype=textquery&fields=${fields}&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  const c = data.status === 'OK' && data.candidates?.[0]
  if (!c?.place_id) return null
  return { placeId: c.place_id, name: c.name, address: c.formatted_address }
}

async function fetchDetails(placeId) {
  const fields = 'name,formatted_phone_number,formatted_address,opening_hours'
  const u =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK' || !data.result) return null
  return data.result
}

// Crude but effective: normalize, tokenize, Jaccard overlap. Enough to catch
// "this is obviously not the same business" without a fuzzy-match dependency.
function normalize(str) {
  return (str ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}
function nameSimilarity(a, b) {
  const setA = new Set(normalize(a))
  const setB = new Set(normalize(b))
  if (setA.size === 0 || setB.size === 0) return 0
  let overlap = 0
  for (const w of setA) if (setB.has(w)) overlap++
  return overlap / new Set([...setA, ...setB]).size
}
const CONFIDENCE_THRESHOLD = 0.3

// ── Hours mapping (same as sync-google-hours.mjs) ───────────────────────
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
const summarizeHours = (h) =>
  h ? DAY_KEYS.map((k) => `${k} ${h[k] ? `${h[k].open}-${h[k].close}` : 'closed'}`).join(', ') : '(none)'
const hoursKey = (h) =>
  h ? DAY_KEYS.map((k) => `${k}:${h[k] ? `${h[k].open}-${h[k].close}` : 'x'}`).join('|') : null
const digits = (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : '')
const isEmpty = (v) =>
  v === null || v === undefined || (typeof v === 'string' && !v.trim()) ||
  (typeof v === 'object' && Object.keys(v).length === 0)

// ── Run ──────────────────────────────────────────────────────────────────
const { data: rows, error } = await s
  .from('resource')
  .select('id,name,phone,address,category,details')
  .eq('status', 'approved')
  .in('category', CATEGORIES)
if (error) throw new Error(error.message)

let noMatch = 0
let lowConfidence = 0
let clean = 0
let withDiffs = 0
const report = []

for (const r of rows) {
  const match = await findPlace(r.name, r.address)
  if (!match) {
    noMatch++
    console.log(`—  no Google match: ${r.name} (${r.category})`)
    await sleep(200)
    continue
  }

  const confidence = nameSimilarity(r.name, match.name)
  const flagged = confidence < CONFIDENCE_THRESHOLD

  const details = await fetchDetails(match.placeId)
  if (!details) {
    console.log(`⚠️  match found but details fetch failed: ${r.name}`)
    await sleep(200)
    continue
  }

  const diffs = []
  const gName = details.name ?? null
  if (!isEmpty(r.name) && gName && gName.trim() !== r.name.trim()) {
    diffs.push({ field: 'name', stored: r.name, google: gName })
  }
  const gPhone = details.formatted_phone_number ?? null
  if (!isEmpty(r.phone) && gPhone && digits(gPhone) !== digits(r.phone)) {
    diffs.push({ field: 'phone', stored: r.phone, google: gPhone })
  }
  const gAddress = details.formatted_address ?? null
  if (!isEmpty(r.address) && gAddress && gAddress.trim() !== r.address.trim()) {
    diffs.push({ field: 'address', stored: r.address, google: gAddress })
  }
  const hoursField = HOURS_FIELD_BY_CATEGORY[r.category]
  if (hoursField) {
    const stored = r.details?.[hoursField]
    const gHours = mapHours(details.opening_hours)
    if (!isEmpty(stored) && gHours && hoursKey(gHours) !== hoursKey(stored)) {
      diffs.push({ field: 'hours', stored, google: gHours })
    }
  }

  if (flagged) lowConfidence++
  if (diffs.length) withDiffs++
  else if (!flagged) clean++

  report.push({ listing: r, match, confidence, flagged, diffs })
  await sleep(200)
}

console.log(`\n${rows.length} listings checked — ${noMatch} no match, ${lowConfidence} low-confidence match, ${clean} clean (matched, no field diffs), ${withDiffs} with field diffs.\n`)

for (const { listing, match, confidence, flagged, diffs } of report) {
  if (!flagged && diffs.length === 0) continue // clean ones don't need a look
  console.log(`• ${listing.name} (${listing.category})`)
  console.log(`    matched: ${match.name} — ${match.address}${flagged ? '   ⚠️  LOW CONFIDENCE MATCH — verify this is the right place' : ''}`)
  for (const d of diffs) {
    if (d.field === 'hours') {
      console.log(`    hours stored: ${summarizeHours(d.stored)}`)
      console.log(`    hours google: ${summarizeHours(d.google)}`)
    } else {
      console.log(`    ${d.field} stored: ${d.stored}   google: ${d.google}`)
    }
  }
}

console.log('\nNothing was written. This is a report only — no placeId or field is assigned by this script.')
