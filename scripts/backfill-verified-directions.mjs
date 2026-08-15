// One-off (re-runnable): writes `details.verifiedPlaceId` for synagogue/mikvah/
// bikur-cholim listings whose Google name+address match is confident enough to
// trust for the "Directions" destination — see src/types.ts's own doc comment
// on `verifiedPlaceId` for why this is a SEPARATE field from `details.placeId`
// and never makes a listing sync-eligible.
//
// Uses the same name+address matching + confidence scoring as
// scripts/report-community-drift.mjs — run that first (or just read its
// output) to see what this would do before applying it.
//
//   node --env-file=.env.local scripts/backfill-verified-directions.mjs
//   node --env-file=.env.local scripts/backfill-verified-directions.mjs --apply
//
// Without --apply nothing is written. Low-confidence matches are never
// written regardless — those listings keep falling back to an address-only
// destination (see destinationQuery's own doc), which is the deliberately
// safe default now that we've seen how often an address-only match for these
// categories lands on a completely different building.

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const CATEGORIES = ['synagogue', 'mikvah', 'bikur-cholim']
const CONFIDENCE_THRESHOLD = 0.3

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY
if (!url || !serviceRoleKey || !mapsKey) {
  console.error('Run: node --env-file=.env.local scripts/backfill-verified-directions.mjs')
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_SERVER_KEY.')
  process.exit(1)
}
const s = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const { data: rows, error } = await s
  .from('resource')
  .select('id,name,address,category,details')
  .eq('status', 'approved')
  .in('category', CATEGORIES)
if (error) throw new Error(error.message)

let already = 0
let verified = 0
let lowConfidence = 0
let noMatch = 0

for (const r of rows) {
  if (r.details?.verifiedPlaceId) {
    already++
    continue
  }
  const match = await findPlace(r.name, r.address)
  if (!match) {
    noMatch++
    console.log(`—  no Google match: ${r.name}`)
    await sleep(200)
    continue
  }
  const confidence = nameSimilarity(r.name, match.name)
  if (confidence < CONFIDENCE_THRESHOLD) {
    lowConfidence++
    console.log(`⚠️  skipped (low confidence): ${r.name} → matched "${match.name}" at ${match.address}`)
    await sleep(200)
    continue
  }

  console.log(`✅ ${r.name} → verified "${match.name}" at ${match.address}`)
  if (APPLY) {
    const details = {
      ...(r.details ?? {}),
      verifiedPlaceId: match.placeId,
      verifiedPlaceName: match.name,
      verifiedAt: new Date().toISOString(),
    }
    await s.from('resource').update({ details }).eq('id', r.id)
  }
  verified++
  await sleep(200)
}

console.log(
  `\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${rows.length} checked, ${already} already verified, ` +
  `${verified} ${APPLY ? 'written' : 'would be written'}, ${lowConfidence} skipped (low confidence), ${noMatch} no match.`,
)
if (!APPLY) console.log('Re-run with --apply to write verifiedPlaceId for the ones above.')
