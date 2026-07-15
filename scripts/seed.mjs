// One-time migration: load the existing hardcoded resources into Supabase as
// `approved` rows so nothing disappears when the app switches to the database.
//
// Usage (Node 20.6+, loads .env.local automatically):
//   node --env-file=.env.local scripts/seed.mjs
//
// Safe to be cautious: if the `resource` table already has rows, the script
// aborts unless you pass FORCE=1, which first deletes ALL rows and reseeds.
//   FORCE=1 node --env-file=.env.local scripts/seed.mjs

import { createClient } from '@supabase/supabase-js'
import { groceries, restaurants, hotels, mikvahs, whatsappGroups } from '../src/data/resources.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run with: node --env-file=.env.local scripts/seed.mjs')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Map each legacy record into a `resource` row. Shared fields at the top level;
// category-specific fields go into `details` (mirrors src/lib/categories.ts).
function toRow(category, item, details) {
  return {
    category,
    name: item.name,
    // Listings anchor on the visitor's address; anchor_id is just a grouping key.
    anchor_id: item.hospitalId ?? 'community',
    distance: item.distance ?? null,
    address: item.address ?? null,
    phone: item.phone ?? null,
    details: { legacyId: item.id, ...details },
    status: 'approved',
    reviewed_at: new Date().toISOString(),
  }
}

const rows = [
  ...groceries.map((g) => toRow('grocery', g, { isKosher: !!g.isKosher })),
  ...restaurants.map((r) => toRow('restaurant', r, { isKosher: !!r.isKosher })),
  ...hotels.map((h) =>
    toRow('hotel', h, {
      shabbatFriendly: !!h.shabbatFriendly,
      shuttleAvailable: !!h.shuttleAvailable,
      ...(h.notes ? { notes: h.notes } : {}),
    }),
  ),
  ...mikvahs.map((m) => toRow('mikvah', m, { hours: m.hours })),
  // WhatsApp groups belong to the whole community — no address/distance.
  ...whatsappGroups.map((g) => ({
    category: 'whatsapp',
    name: g.name,
    anchor_id: 'community',
    distance: null,
    address: null,
    phone: null,
    details: { legacyId: g.id, description: g.description ?? '', link: g.link },
    status: 'approved',
    reviewed_at: new Date().toISOString(),
  })),
]

async function main() {
  const { count, error: countErr } = await supabase
    .from('resource')
    .select('*', { count: 'exact', head: true })
  if (countErr) throw new Error(`Count failed: ${countErr.message}`)

  if (count && count > 0) {
    if (process.env.FORCE !== '1') {
      console.error(`Aborting: \`resource\` already has ${count} row(s).`)
      console.error('Re-run with FORCE=1 to delete all rows and reseed.')
      process.exit(1)
    }
    console.log(`FORCE=1 — deleting ${count} existing row(s)…`)
    const { error: delErr } = await supabase
      .from('resource')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (delErr) throw new Error(`Delete failed: ${delErr.message}`)
  }

  console.log(`Inserting ${rows.length} resources…`)
  const { data, error } = await supabase.from('resource').insert(rows).select('id')
  if (error) throw new Error(`Insert failed: ${error.message}`)

  console.log(`✅ Seeded ${data.length} resources (all approved).`)
  const byCat = rows.reduce((acc, r) => ((acc[r.category] = (acc[r.category] ?? 0) + 1), acc), {})
  console.log('   By category:', byCat)
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
