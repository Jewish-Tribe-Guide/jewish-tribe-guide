// Recurring sync: refreshes hours / phone / business status for every listing
// that has a Google place id (set by scripts/backfill-place-ids.mjs). Run by
// hand whenever you want a refresh, or on a schedule. The cron route
// (src/app/api/cron/sync-hours) does the same thing for hosted scheduling.
//
// What it writes (into the listing's `details`, plus top-level `phone`):
//   • details.hours            — Google's opening hours, mapped to {sun:{open,close}|null,…}
//   • details.businessStatus   — OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
//   • details.googleDescription — Google's editorial summary, filled once and left
//                                 alone after (see the write-once check below) — a
//                                 category exposes it by adding a field with this
//                                 exact key (see src/lib/categories.ts's showInHeader).
//   • details.googleSyncedAt   — ISO timestamp of this run
//   • phone                    — Google's formatted number (overwrites)
//   • address                  — only filled when the listing has none (never overwrites)
//
// Requires GOOGLE_MAPS_SERVER_KEY (Places API enabled, NOT referrer-restricted).
//
//   node --env-file=.env.local scripts/sync-google-hours.mjs
//
// Pass --dry-run to see exactly what a real run would change without writing
// anything. It still makes the same (paid) Places calls — the only difference
// is that nothing is saved. Worth doing before the first run against a live
// directory, since phone numbers are overwritten and there's no undo:
//
//   node --env-file=.env.local scripts/sync-google-hours.mjs --dry-run

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

const DRY_RUN = process.argv.includes('--dry-run')

// Field ownership — the canonical (commented) version lives in
// src/lib/googlePlaces.ts; this mirrors it so the script and the cron route
// behave identically. In short: Google may write a field it filled itself
// (recorded in details.googleFields) or one that's still empty. A value with
// no ownership record was typed by a person — leave it alone.
const OWNABLE_SYNC_FIELDS = ['name', 'hours', 'phone', 'address']

function isEmptyValue(v) {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

function syncMayWrite(details, field, currentValue) {
  if (field === 'address') return isEmptyValue(currentValue)
  const owned = details?.googleFields
  if (Array.isArray(owned)) return owned.includes(field)
  return isEmptyValue(currentValue)
}

function nextGoogleFields(details, written) {
  const prior = Array.isArray(details?.googleFields) ? details.googleFields : []
  const merged = new Set([...prior, ...written])
  return OWNABLE_SYNC_FIELDS.filter((f) => merged.has(f))
}

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
  const fields = 'name,business_status,formatted_phone_number,formatted_address,opening_hours,editorial_summary'
  const u =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK' || !data.result) return null
  return data.result
}

/** One line per day that differs, so a dry run shows the actual change rather
 *  than two blobs of JSON to diff by eye. */
function describeHoursChange(before, after) {
  if (!after) return []
  const lines = []
  for (const k of DAY_KEYS) {
    const b = before?.[k]
    const a = after[k]
    const fmt = (v) => (v ? `${v.open}–${v.close}` : 'closed')
    if (fmt(b) !== fmt(a)) lines.push(`      ${k}: ${before ? fmt(b) : '(unset)'} → ${fmt(a)}`)
  }
  return lines
}

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,phone,address,details')
  .eq('status', 'approved')
  .not('details->>placeId', 'is', null)
if (error) throw new Error(error.message)

if (DRY_RUN) {
  console.log(`DRY RUN — ${rows.length} listings, nothing will be written.\n`)
}

let done = 0
let failed = 0
let unchanged = 0
const closures = []
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
  // Google-only concept, no curated counterpart — always refreshed.
  if (result.business_status) details.businessStatus = result.business_status
  // Also Google-only, but filled once rather than refreshed every run — an
  // admin who edits or clears it should see that stick, not get silently
  // overwritten by Google's wording on the next sync. Mirrors sync-hours/route.ts.
  const editorialSummary = result.editorial_summary?.overview
  if (editorialSummary && !details.googleDescription) details.googleDescription = editorialSummary

  const wrote = []
  const update = { details }
  if (result.name && syncMayWrite(r.details, 'name', r.name)) {
    update.name = result.name
    wrote.push('name')
  }
  if (hours && syncMayWrite(r.details, 'hours', r.details?.hours)) {
    details.hours = hours
    wrote.push('hours')
  }
  if (result.formatted_phone_number && syncMayWrite(r.details, 'phone', r.phone)) {
    update.phone = result.formatted_phone_number
    wrote.push('phone')
  }
  if (result.formatted_address && syncMayWrite(r.details, 'address', r.address)) {
    update.address = result.formatted_address
    wrote.push('address')
  }
  details.googleFields = nextGoogleFields(r.details, wrote)

  if (result.business_status === 'CLOSED_PERMANENTLY') closures.push(r.name)

  if (DRY_RUN) {
    // Report only what a real run would actually write — fields Google doesn't
    // own are skipped above, so they never show up here. A list of 111 "no
    // change" entries would bury the handful that matter.
    const changes = wrote.includes('hours') ? describeHoursChange(r.details.hours, hours) : []
    if (update.name && update.name !== r.name) {
      changes.push(`      name: ${r.name} → ${update.name}`)
    }
    if (update.phone && update.phone !== r.phone) {
      changes.push(`      phone: ${r.phone ?? '(none)'} → ${update.phone}`)
    }
    if (update.address) changes.push(`      address: (none) → ${update.address}`)
    const statusBefore = r.details.businessStatus
    if (result.business_status && result.business_status !== statusBefore) {
      changes.push(`      status: ${statusBefore ?? '(unset)'} → ${result.business_status}`)
    }
    if (editorialSummary && !r.details.googleDescription) {
      changes.push(`      description: (none) → ${editorialSummary}`)
    }
    // Say what was protected, so "why didn't my hours update" has an answer.
    const held = OWNABLE_SYNC_FIELDS.filter(
      (f) => !wrote.includes(f) && !isEmptyValue(f === 'phone' ? r.phone : f === 'address' ? r.address : r.details?.hours),
    )
    if (changes.length === 0) {
      unchanged++
    } else {
      done++
      console.log(`~ ${r.name}`)
      for (const line of changes) console.log(line)
      if (held.length) console.log(`      (kept manual: ${held.join(', ')})`)
    }
    await sleep(200)
    continue
  }

  await s.from('resource').update(update).eq('id', r.id)
  done++
  console.log(`✅ ${r.name} — ${result.business_status ?? 'OPERATIONAL'}`)
  await sleep(200)
}

if (DRY_RUN) {
  console.log(`\nDRY RUN complete. ${done} would change, ${unchanged} already match, ${failed} failed.`)
  if (closures.length) {
    console.log(`\n⚠️  ${closures.length} reported CLOSED_PERMANENTLY by Google:`)
    for (const n of closures) console.log(`   • ${n}`)
    console.log('   A real run files these to the moderation queue — it does not delete them.')
  }
  console.log('\nRe-run without --dry-run to apply.')
} else {
  console.log(`\nDone. synced ${done}, failed ${failed}.`)
}
