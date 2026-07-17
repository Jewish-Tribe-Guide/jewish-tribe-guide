// npm run import — bulk-load a directory from a spreadsheet (CSV). Point it at a
// CSV whose header row names the columns and it creates one listing per row,
// mapping columns to the category's fields (from src/data/categories.js),
// geocoding addresses, and inserting them.
//
//   npm run import -- path/to/groceries.csv --category grocery
//   npm run import -- shuls.csv --category synagogue --status pending
//   npm run import -- food.csv --category restaurant --dry-run   (preview only)
//
// Flags:
//   --category <id>   required — which category these rows belong to
//   --status <s>      approved (default) | pending (send to the moderation queue)
//   --dry-run         parse + map + report, insert nothing
//   --no-geocode      skip address geocoding (faster; no map pins / distance)
//
// Recognized columns (case-insensitive): `name` (required), `address`, `phone`,
// and any of the category's field keys/labels. Booleans accept yes/true/x/1;
// tag/list fields split on ; or |. Unknown columns are ignored (and listed).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { categories } from '../src/data/categories.js'

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(`--${name}`)
const file = args.find((a) => !a.startsWith('--') && a !== flag('category') && a !== flag('status'))
const categoryId = flag('category')
const status = flag('status') ?? 'approved'
const dryRun = has('dry-run')
const geocodeOn = !has('no-geocode')

if (!file || !categoryId) {
  console.error('Usage: npm run import -- <file.csv> --category <id> [--status pending] [--dry-run] [--no-geocode]')
  process.exit(1)
}
if (status !== 'approved' && status !== 'pending') {
  console.error(`--status must be "approved" or "pending" (got "${status}").`)
  process.exit(1)
}
const category = categories.find((c) => c.id === categoryId)
if (!category) {
  console.error(`Unknown category "${categoryId}". Options: ${categories.map((c) => c.id).join(', ')}`)
  process.exit(1)
}

// ── Minimal CSV parser (handles quoted fields, embedded commas/newlines) ──────
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* ignore */ }
    else field += c
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// ── Column → field mapping ───────────────────────────────────────────────────
const norm = (s) => s.trim().toLowerCase()
const truthy = (v) => ['yes', 'true', 'x', '1', 'y'].includes(norm(v))

// Map a category field key/label to itself for header matching.
const fieldByHeader = new Map()
for (const f of category.fields ?? []) {
  fieldByHeader.set(norm(f.key), f)
  if (f.label) fieldByHeader.set(norm(f.label), f)
}

function coerce(field, raw) {
  const v = raw.trim()
  if (v === '') return undefined
  switch (field.type) {
    case 'boolean': return truthy(v)
    case 'tags': return v.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
    default: return v // select / text / textarea / url / hours (as string)
  }
}

// ── Geocoding (OSM Nominatim, ~1 req/sec) ────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function geocode(address) {
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    const res = await fetch(u, { headers: { 'User-Agent': 'JewishCommunityDirectory/1.0 (import script)' } })
    if (!res.ok) return null
    const data = await res.json()
    return data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null
  } catch {
    return null
  }
}

// ── Parse ────────────────────────────────────────────────────────────────────
const rows = parseCsv(readFileSync(file, 'utf8'))
if (rows.length < 2) {
  console.error('CSV needs a header row and at least one data row.')
  process.exit(1)
}
const headers = rows[0].map(norm)
const nameIdx = headers.indexOf('name')
if (nameIdx < 0) {
  console.error('CSV must have a "name" column.')
  process.exit(1)
}
const addrIdx = headers.indexOf('address')
const phoneIdx = headers.indexOf('phone')

const unknownCols = headers.filter(
  (h) => h && !['name', 'address', 'phone'].includes(h) && !fieldByHeader.has(h),
)

const records = rows.slice(1).map((cells) => {
  const details = {}
  headers.forEach((h, i) => {
    const f = fieldByHeader.get(h)
    if (f) {
      const val = coerce(f, cells[i] ?? '')
      if (val !== undefined) details[f.key] = val
    }
  })
  return {
    name: (cells[nameIdx] ?? '').trim(),
    address: addrIdx >= 0 ? (cells[addrIdx] ?? '').trim() : '',
    phone: phoneIdx >= 0 ? (cells[phoneIdx] ?? '').trim() : '',
    details,
  }
}).filter((r) => r.name)

console.log(`\n📄 ${file} → category "${categoryId}" (${status})`)
console.log(`   ${records.length} row(s) with a name.`)
if (unknownCols.length) console.log(`   Ignored columns: ${unknownCols.join(', ')}`)
console.log(`   Mapped fields: ${[...new Set(records.flatMap((r) => Object.keys(r.details)))].join(', ') || '(none)'}`)

// ── Dry run: show a sample and stop ──────────────────────────────────────────
if (dryRun) {
  console.log('\n🔎 Dry run — nothing inserted. Sample of the first rows:\n')
  for (const r of records.slice(0, 3)) console.log('   ', JSON.stringify(r))
  console.log('')
  process.exit(0)
}

// ── Insert ───────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run via `npm run import`.')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

// Skip names already present in this category (idempotent re-runs).
const { data: existing } = await supabase.from('resource').select('name').eq('category', categoryId)
const seen = new Set((existing ?? []).map((r) => norm(r.name)))

let inserted = 0
let skipped = 0
for (const r of records) {
  if (seen.has(norm(r.name))) { console.log(`  ⏭  ${r.name} (already exists)`); skipped++; continue }
  let geo = null
  if (geocodeOn && r.address) {
    geo = await geocode(r.address)
    await sleep(1100)
  }
  const { error } = await supabase.from('resource').insert({
    category: categoryId,
    name: r.name,
    anchor_id: 'community',
    distance: null,
    address: r.address || null,
    phone: r.phone || null,
    details: geo ? { ...r.details, geo } : r.details,
    status,
    reviewed_at: status === 'approved' ? new Date().toISOString() : null,
  })
  if (error) console.error(`  ❌ ${r.name}: ${error.message}`)
  else { console.log(`  ✅ ${r.name}${geo ? '' : r.address ? ' (no geo)' : ''}`); inserted++; seen.add(norm(r.name)) }
}

console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (${status}).\n`)
