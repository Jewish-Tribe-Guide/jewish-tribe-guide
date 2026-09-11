// Seeds the built-in home-screen blocks (Categories & Search, Davening
// Times, Update Listings, the embedded Map, Email Signup, Jewish Times)
// into `home_section`, at Landing.tsx's current default order — so a fresh
// community (never touched the ordering in /admin) matches what a new
// visitor sees on the home page without needing a manual reorder first.
// Every one of these six also has its own independent code-level fallback
// (see homeSections.ts and Landing.tsx's own doc) for a community that has
// ALREADY configured some subset of them without the rest — so running this
// script isn't strictly required for any single card to show up, just for
// it to become admin-reorderable rather than pinned to its default
// position.
//
// 'featured' ("Popular right now") isn't seeded at all any more — the
// feature was removed from admin (see homeSections.ts's own doc);
// Landing.tsx's own "Browse everything" grid already shows every card flat,
// so a curated repeat of three of them right below it added nothing.
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

// Negative sort_order so the first four sit ahead of every category section
// (which start at sort_order 100, in steps of 100 — see
// homeSectionStore.ts). Only matters until the first admin save, which
// renumbers everything to clean multiples of 100 based on final on-screen
// order.
const BUILT_INS = [
  { id: 'browse', kind: 'browse', title: 'Categories and Search Card', sort_order: -500, card_ids: [] },
  { id: 'davening', kind: 'davening', title: 'Davening Times Card', sort_order: -400, card_ids: [] },
  { id: 'listings', kind: 'listings', title: 'Update Listings Card', sort_order: -300, card_ids: [] },
  { id: 'map', kind: 'map', title: 'Map Card', sort_order: -200, card_ids: [] },
  // Deliberately huge sort_orders, not just "after the earlier built-ins" —
  // they need to sort after every category section too (those start at
  // 100, step 100), matching where these two always rendered before they
  // were reorderable (unconditionally last).
  { id: 'subscribe', kind: 'subscribe', title: 'Email Signup Card', sort_order: 999_000, card_ids: [] },
  { id: 'jewishTimes', kind: 'jewishTimes', title: 'Jewish Times Card', sort_order: 999_100, card_ids: [] },
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
