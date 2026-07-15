// Seeds the synagogue starter data (from src/data/synagogues.js) as approved
// `resource` rows, geocoding each address via OSM Nominatim at ~1 req/sec. The
// synagogue CATEGORY itself is defined in src/data/categories.js (seeded by
// seed-categories.mjs) — remove it there to leave shuls out entirely, and this
// script skips itself.
//
//   node --env-file=.env.local scripts/seed-synagogues.mjs
//
// Safe to re-run: upserts the category and skips existing synagogue rows
// (matches by legacyId inside details). Does NOT touch other categories or rows.

import { createClient } from '@supabase/supabase-js'
import { synagogues } from '../src/data/synagogues.js'
import { categories } from '../src/data/categories.js'

// Respect the category catalog: if a community removed the synagogue category,
// don't seed shul data (there'd be no card to show it under).
const SYNAGOGUE_CATEGORY = categories.find((c) => c.id === 'synagogue')
if (!SYNAGOGUE_CATEGORY) {
  console.log('• synagogue category not in src/data/categories.js — skipping shul seed.')
  process.exit(0)
}

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

// ── 1. Upsert the synagogue category (from the catalog) ───────────────────────
// seed-categories.mjs already seeds it; upserting here too keeps this script
// correct when run on its own.

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
    anchor_id: s.hospitalId ?? 'community',
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
