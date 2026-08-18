// Seeds the three built-in home-screen blocks (featured cards, the embedded
// map, Zmanim & Shabbos) into `home_section`, at the position they've always
// had as hardcoded fixed spots in Landing.tsx (featured + map first, zmanim
// last) — so an existing site's home screen renders identically after this
// migration as it did before it, until an admin actually reorders something
// via the new unified block list in /admin.
//
// Idempotent: upserts by (community_id, id), safe to run again (e.g. after
// adding a second community) without disturbing an admin's own reordering —
// each run only touches rows for kinds that don't already exist for that
// community. Normally invoked via `npm run setup`; to run on its own:
//
//   node --env-file=.env.local scripts/seed-home-blocks.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

// Same sort_order values Landing.tsx used to hardcode this order with:
// featured and map both ahead of every category section (which start at
// sort_order 100, in steps of 100 — see homeSectionStore.ts), zmanim after
// all of them. Only matters until the first admin save, which renumbers
// everything to clean multiples of 100 based on final on-screen order.
const BUILT_INS = [
  { id: 'featured', kind: 'featured', title: 'Popular right now', sort_order: -300, card_ids: [] },
  { id: 'map', kind: 'map', title: 'Explore the map', sort_order: -200, card_ids: [] },
  { id: 'zmanim', kind: 'zmanim', title: 'Zmanim & Shabbos', sort_order: 999999, card_ids: [] },
]

const { data: existing, error: readErr } = await supabase
  .from('home_section')
  .select('id, community_id')
  .in('id', BUILT_INS.map((b) => b.id))
if (readErr) {
  console.error('❌ Seed failed:', readErr.message)
  process.exit(1)
}

const existingIds = new Set((existing ?? []).map((r) => r.id))
const toInsert = BUILT_INS.filter((b) => !existingIds.has(b.id))
if (toInsert.length === 0) {
  console.log('•  Skipping — every built-in block already exists. Leaving as-is.')
  process.exit(0)
}

const { error } = await supabase.from('home_section').upsert(toInsert, { onConflict: 'community_id,id' })
if (error) {
  console.error('❌ Seed failed:', error.message)
  process.exit(1)
}
console.log(`✅ Seeded ${toInsert.length} built-in home block(s):`, toInsert.map((b) => b.id).join(', '))
