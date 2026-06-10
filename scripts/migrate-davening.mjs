// One-time migration: converts the legacy `davening` text on each synagogue row
// into a structured `minyanim` array in `details`.
//
//   node --env-file=.env.local scripts/migrate-davening.mjs
//
// Safe to re-run: skips rows that already have `details.minyanim`.
// The existing `details.davening` text is left in place as a harmless fallback.

import { createClient } from '@supabase/supabase-js'
import { synagogues } from '../src/data/synagogues.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing env vars. Run: node --env-file=.env.local scripts/migrate-davening.mjs')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

// ── Legacy-label parser ────────────────────────────────────────────────────────

let seq = 1

/**
 * Extract days from a davening label like "Shacharit (Mon–Fri)".
 * Priority order: most specific first.
 */
function detectDays(lower) {
  // Explicitly daily
  if (lower.includes('(daily)') || /^daily\b/.test(lower)) {
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  }
  // Saturday morning
  if (
    lower.includes('shabbat morning') ||
    lower.includes('shabbos morning') ||
    lower.includes('(sat)') ||
    lower.includes('shabbat (sat') ||
    lower.includes('shabbos (sat')
  ) {
    return ['sat']
  }
  // Friday / Kabbalas Shabbos
  if (
    lower.includes('friday evening') ||
    lower.includes('erev shabbat') ||
    lower.includes('(fri)') ||
    lower.includes('shabbat (fri') ||
    lower.includes('kabbalas')
  ) {
    return ['fri']
  }
  // Sunday
  if (lower.includes('(sun)') || /\bsunday\b/.test(lower)) {
    return ['sun']
  }
  // Weekdays Mon–Fri
  if (
    (lower.includes('mon') && lower.includes('fri')) ||
    lower.includes('weekday')
  ) {
    return ['mon', 'tue', 'wed', 'thu', 'fri']
  }
  // Generic Shabbat reference (e.g. "Tot Shabbat") → Saturday
  if (lower.includes('shabbat') || lower.includes('shabbos')) {
    return ['sat']
  }
  // Fallback: all days
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
}

/**
 * Determine tefillah from a davening label.
 * Returns null when the entry should be split into mincha + maariv.
 */
function detectTefillah(lower) {
  // "Mincha/Maariv" is a combined entry — caller must split it.
  if (lower.includes('mincha') && lower.includes('maariv')) return null

  // Shacharis — includes Saturday morning references
  if (
    lower.includes('shacharit') ||
    lower.includes('shacharis') ||
    lower.includes('shabbat morning') ||
    lower.includes('shabbos morning') ||
    lower.includes('(sat)') ||
    lower.includes('shabbat (sat') ||
    lower.includes('shabbos (sat')
  ) {
    return 'shacharis'
  }
  // Kabbalas Shabbos
  if (
    lower.includes('kabbalas') ||
    lower.includes('friday evening') ||
    lower.includes('shabbat (fri') ||
    lower.includes('shabbos (fri') ||
    lower.includes('(fri)') ||
    lower.includes('erev shabbat')
  ) {
    return 'kabbalas_shabbos'
  }
  // Mussaf
  if (lower.includes('mussaf')) return 'shabbos_mussaf'
  // Mincha only
  if (lower.includes('mincha')) return 'mincha'
  // Maariv only
  if (lower.includes('maariv') || lower.includes("ma'ariv")) return 'maariv'

  return 'other'
}

function parseLegacyEntry({ label, time }) {
  const lower = label.toLowerCase()
  const days = detectDays(lower)
  const tefillah = detectTefillah(lower)

  if (tefillah === null) {
    // Split Mincha/Maariv into two entries.
    return [
      { id: String(seq++), tefillah: 'mincha', days, time },
      {
        id: String(seq++),
        tefillah: 'maariv',
        days,
        time,
        notes: 'Immediately after Mincha',
      },
    ]
  }

  return [{ id: String(seq++), tefillah, days, time }]
}

function parseLegacyDavening(daveningArray) {
  return daveningArray.flatMap(parseLegacyEntry)
}

// ── Main ───────────────────────────────────────────────────────────────────────

const { data: rows, error } = await supabase
  .from('resource')
  .select('id,details')
  .eq('category', 'synagogue')

if (error) {
  console.error('❌ Failed to fetch rows:', error.message)
  process.exit(1)
}

console.log(`Found ${rows.length} synagogue row(s).`)

let updated = 0
let skipped = 0

for (const row of rows) {
  const legacyId = row.details?.legacyId

  if (!legacyId) {
    console.log(`  ⏭  skip (no legacyId): row ${row.id}`)
    skipped++
    continue
  }

  if (row.details?.minyanim) {
    console.log(`  ⏭  skip (already has minyanim): ${legacyId}`)
    skipped++
    continue
  }

  const source = synagogues.find((s) => s.id === legacyId)
  if (!source) {
    console.log(`  ⚠️  no source match for legacyId: ${legacyId}`)
    skipped++
    continue
  }

  const minyanim = parseLegacyDavening(source.davening)

  const { error: upErr } = await supabase
    .from('resource')
    .update({ details: { ...row.details, minyanim } })
    .eq('id', row.id)

  if (upErr) {
    console.error(`  ❌ update failed for ${legacyId}:`, upErr.message)
  } else {
    console.log(
      `  ✅ ${source.name}: ${minyanim.length} minyanim (${[...new Set(minyanim.map((m) => m.tefillah))].join(', ')})`,
    )
    updated++
  }
}

console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`)
