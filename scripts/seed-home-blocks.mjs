// Seeds the built-in home-screen blocks (Browse & search, the embedded map,
// Zmanim & Shabbos, and Shabbat Times & Stay in the Loop) into `home_section`,
// at Landing.tsx's current default order — so a fresh community (never
// touched the ordering in /admin) matches what a new visitor sees on the
// home page without needing a manual reorder first. Browse and Shabbat also
// have their own independent code-level fallback (see homeSections.ts and
// Landing.tsx's own doc) for a community that has ALREADY configured some of
// the other built-ins without either of these two — so running this script
// isn't strictly required for either to show up, just for either to become
// admin-reorderable rather than pinned to its default position.
//
// 'featured' ("Popular right now") isn't seeded by default any more —
// Landing.tsx's own "Browse everything" grid already shows every card flat,
// so a curated repeat of three of them right below it added nothing; an
// admin who still wants a curated highlight can add the block back from the
// Desktop tab's "+ Add" button. An existing site that already has
// these rows is untouched by this script (see the idempotent note below) —
// reorder or remove those via the admin's own block list, same as any other
// admin edit, not by re-running this.
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

// Negative sort_order so all three sit ahead of every category section
// (which start at sort_order 100, in steps of 100 — see
// homeSectionStore.ts): featured, then zmanim, then map. Only matters until
// the first admin save, which renumbers everything to clean multiples of 100
// based on final on-screen order.
const BUILT_INS = [
  { id: 'browse', kind: 'browse', title: 'Browse & search', sort_order: -400, card_ids: [] },
  { id: 'featured', kind: 'featured', title: 'Popular right now', sort_order: -300, card_ids: [] },
  { id: 'zmanim', kind: 'zmanim', title: 'Zmanim & Shabbos', sort_order: -200, card_ids: [] },
  { id: 'map', kind: 'map', title: 'Explore the map', sort_order: -100, card_ids: [] },
  // Deliberately a huge sort_order, not just "after the other built-ins" —
  // it needs to sort after every category section too (those start at 100,
  // step 100 — see homeSectionStore.ts), matching where this block always
  // rendered before it was reorderable (unconditionally last).
  { id: 'shabbat', kind: 'shabbat', title: 'Shabbat Times & Stay in the Loop', sort_order: 999_000, card_ids: [] },
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
