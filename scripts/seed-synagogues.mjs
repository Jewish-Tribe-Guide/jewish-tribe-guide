// One-time migration: seed the `synagogue` category and insert the 12 hardcoded
// synagogues (from src/data/synagogues.js) as approved `resource` rows with
// flat details fields. Geocodes each address via OSM Nominatim at ~1 req/sec.
//
//   node --env-file=.env.local scripts/seed-synagogues.mjs
//
// Safe to re-run: upserts the category and skips existing synagogue rows
// (matches by legacyId inside details). Does NOT touch other categories or rows.

import { createClient } from '@supabase/supabase-js'
import { synagogues } from '../src/data/synagogues.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run with: node --env-file=.env.local scripts/seed-synagogues.mjs')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function geocode(address) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(u, {
    headers: { 'User-Agent': 'JewishPatientConnect/1.0 (yhagler@gmail.com)' },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data[0]) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

// ── 1. Upsert the synagogue category ──────────────────────────────────────────

const SYNAGOGUE_CATEGORY = {
  id: 'synagogue',
  label: 'Synagogue',
  plural_label: 'Synagogues',
  icon: '✡️',
  description: 'Nearby shuls with davening times, contacts, and WhatsApp groups',
  sort_order: 5,
  fields: [
    {
      key: 'denomination',
      label: 'Denomination',
      type: 'select',
      renderAs: 'badge',
      filterable: true,
      filterLabel: 'Denomination',
      options: [
        { value: 'Orthodox', label: 'Orthodox' },
        { value: 'Orthodox (Sephardic)', label: 'Orthodox (Sephardic)' },
        { value: 'Conservative', label: 'Conservative' },
        { value: 'Reform', label: 'Reform' },
        { value: 'Other', label: 'Other' },
      ],
    },
    {
      // Structured minyanim field — rendered by SynagogueCard, not GenericDirectory.
      // Legacy `davening` text field removed from the form; existing rows keep
      // `details.davening` as a fallback until migrate-davening.mjs is run.
      key: 'minyanim',
      label: 'Davening Times (Minyanim)',
      type: 'minyanim',
      renderAs: 'hidden',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp Group',
      type: 'url',
      linkLabel: 'Join WhatsApp',
    },
  ],
}

console.log('Upserting synagogue category…')
const { error: catErr } = await supabase
  .from('category')
  .upsert(SYNAGOGUE_CATEGORY, { onConflict: 'id' })
if (catErr) {
  console.error('❌ Category upsert failed:', catErr.message)
  process.exit(1)
}
console.log('✅ Synagogue category upserted.')

// ── 2. Find which legacyIds are already in the DB (idempotent re-runs) ────────

const { data: existing } = await supabase
  .from('resource')
  .select('id,details')
  .eq('category', 'synagogue')

const existingLegacyIds = new Set(
  (existing ?? []).map((r) => r.details?.legacyId).filter(Boolean),
)
console.log(`Found ${existingLegacyIds.size} existing synagogue row(s) — will skip those.`)

// ── 3. Insert new synagogues with geocoding ────────────────────────────────────

let inserted = 0
let skipped = 0

for (const s of synagogues) {
  if (existingLegacyIds.has(s.id)) {
    console.log(`  ⏭  skip (already exists): ${s.name}`)
    skipped++
    continue
  }

  // Flatten davening times into a readable text block.
  const daveningText = s.davening.map((d) => `${d.label}: ${d.time}`).join(' • ')

  // Use the first WhatsApp group link, if any.
  const whatsappUrl = s.whatsappGroups?.[0]?.link ?? null

  // Primary contact phone: first contact entry.
  const phone = s.contacts?.[0]?.phone ?? null

  // Geocode the full address (s.location is more precise than s.address).
  let geo = null
  if (s.location) {
    console.log(`  📍 geocoding: ${s.name} — ${s.location}`)
    geo = await geocode(s.location)
    if (geo) {
      console.log(`     → ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`)
    } else {
      console.log(`  ⚠️  geocode failed for: ${s.name}`)
    }
    await sleep(1100) // Nominatim rate limit
  }

  const row = {
    category: 'synagogue',
    name: s.name,
    hospital_id: s.hospitalId,
    distance: s.distance ?? null,
    address: s.location ?? s.address ?? null,
    phone,
    details: {
      legacyId: s.id,
      denomination: s.denomination,
      davening: daveningText,
      ...(whatsappUrl ? { whatsapp: whatsappUrl } : {}),
      ...(geo ? { geo } : {}),
    },
    status: 'approved',
    reviewed_at: new Date().toISOString(),
  }

  const { error: insErr } = await supabase.from('resource').insert(row)
  if (insErr) {
    console.error(`  ❌ insert failed for ${s.name}:`, insErr.message)
  } else {
    console.log(`  ✅ inserted: ${s.name}`)
    inserted++
  }
}

console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`)
