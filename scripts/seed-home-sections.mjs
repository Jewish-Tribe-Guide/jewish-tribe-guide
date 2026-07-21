// Seeds the starter home-screen sections into the `home_section` table — the
// same grouping the app used before sections became admin-editable. Idempotent:
// upserts by id, and only fires when the table is still empty (an admin's own
// edits are never overwritten by a later `npm run setup`). Normally invoked via
// `npm run setup`; to run on its own:
//
//   node --env-file=.env.local scripts/seed-home-sections.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

const sections = [
  { id: 'food-establishments', title: 'Food Establishments', sort_order: 100, card_ids: ['restaurant', 'grocery'] },
  { id: 'jewish-institutions-and-information', title: 'Jewish Institutions and Information', sort_order: 200, card_ids: ['synagogue', 'mikvah', 'eruv', 'zmanim'] },
  { id: 'family-resources', title: 'Family Resources', sort_order: 300, card_ids: ['childcare', 'school'] },
  { id: 'medical-resources', title: 'Medical Resources', sort_order: 400, card_ids: ['medical', 'support', 'volunteer'] },
  { id: 'get-connected', title: 'Get Connected', sort_order: 500, card_ids: ['whatsapp', 'young-professional'] },
]

const { count, error: countErr } = await supabase
  .from('home_section')
  .select('id', { count: 'exact', head: true })
if (countErr) {
  console.error('❌ Seed failed:', countErr.message)
  process.exit(1)
}
if (count && count > 0) {
  console.log(`•  Skipping — \`home_section\` already has ${count} row(s) (admin-edited). Leaving as-is.`)
  process.exit(0)
}

const { error } = await supabase.from('home_section').upsert(sections, { onConflict: 'id' })
if (error) {
  console.error('❌ Seed failed:', error.message)
  process.exit(1)
}
console.log(`✅ Seeded ${sections.length} home sections:`, sections.map((s) => s.id).join(', '))
