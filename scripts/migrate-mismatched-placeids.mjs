// One-time (re-runnable) catch-up for listings created before
// submissionStore.ts's withResolvedPlaceId existed.
//
// That function now checks, at every approval, whether a picked placeId's
// Google name actually resembles the listing's name — catching the case
// where someone picks a big venue's address in the autocomplete (Citizens
// Bank Park, a shul a mikvah is housed in) and then renames the listing to
// the actual business. That's genuinely useful for Directions (see
// verifiedPlaceId), but the placeId must never stay sync-eligible: the
// recurring cron would otherwise compare this listing's fields against a
// different business's Google data forever, and — the real risk — always
// trusts that OTHER business's businessStatus unconditionally, so a
// seasonal "closed" on the venue's own listing could falsely flag THIS
// listing for removal.
//
// This script applies the same check retroactively to every listing that
// already has a placeId, since existing rows never went through
// withResolvedPlaceId. A mismatch moves placeId → verifiedPlaceId (and
// clears businessStatus/googleSyncedAt/googleFields, since they reflected
// the wrong business) rather than deleting anything.
//
//   node --env-file=.env.local scripts/migrate-mismatched-placeids.mjs
//   node --env-file=.env.local scripts/migrate-mismatched-placeids.mjs --apply
//
// Without --apply nothing is written. Costs one Places call per listing that
// has a placeId. Safe to re-run — a listing already fixed (or already a
// confirmed match) does nothing on a later run.

import { createClient } from '@supabase/supabase-js'

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

// Mirrors namesOverlap in src/lib/googlePlaces.ts (scripts can't import the
// TS module) — keep the two in sync.
function significantWords(name) {
  return new Set(name.toLowerCase().match(/[a-z0-9']{3,}/g) ?? [])
}
function namesOverlap(a, b) {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (na && nb && (na === nb || na.includes(nb) || nb.includes(na))) return true
  const wordsA = significantWords(a)
  for (const w of significantWords(b)) if (wordsA.has(w)) return true
  return false
}

async function fetchGoogleName(placeId) {
  const u =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=name&key=${mapsKey}`
  const res = await fetch(u)
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK' || !data.result?.name) return null
  return data.result.name
}

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,details')
  .eq('status', 'approved')
  .not('details->>placeId', 'is', null)
if (error) throw new Error(error.message)

let checked = 0
let matched = 0
let mismatched = 0
let failed = 0

for (const r of rows) {
  const placeId = r.details.placeId
  checked++
  const googleName = await fetchGoogleName(placeId)
  if (!googleName) {
    failed++
    console.log('⚠️  lookup failed:', r.name)
    await sleep(200)
    continue
  }
  if (namesOverlap(googleName, r.name)) {
    matched++
    await sleep(200)
    continue
  }

  mismatched++
  console.log(`↳ mismatch: "${r.name}" — placeId is actually "${googleName}"`)
  if (APPLY) {
    const details = { ...r.details, verifiedPlaceId: placeId }
    delete details.placeId
    delete details.businessStatus
    delete details.googleSyncedAt
    delete details.googleFields
    await s.from('resource').update({ details }).eq('id', r.id)
  }
  await sleep(200)
}

console.log(
  `\n${APPLY ? 'APPLIED' : 'DRY RUN'} — checked ${checked}, ${matched} matched, ${mismatched} mismatched (moved to verifiedPlaceId), ${failed} lookup failures.`,
)
