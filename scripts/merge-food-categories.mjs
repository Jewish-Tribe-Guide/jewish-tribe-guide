// Merges bakery-cafe and ice-cream into the restaurant category, renamed to
// "Food Establishments". Each listing gets a `foodType` detail field so its
// original category type is preserved as a badge.
//
//   node --env-file=.env.local scripts/merge-food-categories.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

// ── 1. Update the restaurant category config ─────────────────────────────────

const updatedFields = [
  {
    key: 'foodType',
    label: 'Type',
    type: 'select',
    options: [
      { value: 'Restaurant', label: 'Restaurant' },
      { value: 'Bakery & Cafe', label: 'Bakery & Cafe' },
      { value: 'Ice Cream', label: 'Ice Cream' },
    ],
    renderAs: 'badge',
    filterable: true,
    filterLabel: 'Type',
  },
  { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
  {
    key: 'kosherCert',
    label: 'Kosher Certification',
    type: 'select',
    options: [
      { value: 'IKC', label: 'IKC' },
      { value: 'Keystone-K', label: 'Keystone-K' },
      { value: 'Cherry-K', label: 'Cherry-K' },
      { value: 'OU', label: 'OU' },
      { value: 'Star-K', label: 'Star-K' },
      { value: 'OK Kosher', label: 'OK Kosher' },
      { value: 'cRc', label: 'cRc' },
      { value: 'Kof-K', label: 'Kof-K' },
      { value: 'Other Kosher', label: 'Other Kosher' },
    ],
    renderAs: 'badge',
    filterable: true,
    filterLabel: 'Kosher Cert',
  },
  {
    key: 'dietary',
    label: 'Dietary options',
    type: 'tags',
    tagGroup: 'dietary_option',
    renderAs: 'badge',
    help: 'E.g. Vegan, Vegetarian, Gluten-free',
  },
  {
    key: 'menu',
    label: 'Menu',
    type: 'url',
    renderAs: 'row',
    linkLabel: 'View menu',
    placeholder: 'https://…',
  },
]

const { error: catErr } = await supabase
  .from('category')
  .update({
    label: 'Food Establishment',
    plural_label: 'Food Establishments',
    fields: updatedFields,
  })
  .eq('id', 'restaurant')

if (catErr) { console.error('❌ Failed to update restaurant category:', catErr.message); process.exit(1) }
console.log('✅ Restaurant category renamed → Food Establishments, foodType field added')

// ── 2. Stamp existing restaurant listings with foodType = 'Restaurant' ───────

const { data: restaurants, error: rErr } = await supabase
  .from('resource')
  .select('id, details')
  .eq('category', 'restaurant')

if (rErr) { console.error('❌ Failed to fetch restaurant listings:', rErr.message); process.exit(1) }

let stamped = 0
for (const row of restaurants ?? []) {
  const details = { ...(row.details ?? {}), foodType: 'Restaurant' }
  const { error } = await supabase.from('resource').update({ details }).eq('id', row.id)
  if (error) console.error(`  ❌ ${row.id}:`, error.message)
  else stamped++
}
console.log(`✅ Stamped ${stamped} restaurant listings with foodType = 'Restaurant'`)

// ── 3. Move bakery-cafe listings → restaurant with foodType = 'Bakery & Cafe' ──

const { data: bakeries, error: bErr } = await supabase
  .from('resource')
  .select('id, details')
  .eq('category', 'bakery-cafe')

if (bErr) { console.error('❌ Failed to fetch bakery-cafe listings:', bErr.message); process.exit(1) }

let moved = 0
for (const row of bakeries ?? []) {
  const details = { ...(row.details ?? {}), foodType: 'Bakery & Cafe' }
  const { error } = await supabase.from('resource').update({ category: 'restaurant', details }).eq('id', row.id)
  if (error) console.error(`  ❌ ${row.id}:`, error.message)
  else moved++
}
console.log(`✅ Moved ${moved} bakery-cafe listings → restaurant (foodType = 'Bakery & Cafe')`)

// ── 4. Move ice-cream listings → restaurant with foodType = 'Ice Cream' ──────

const { data: iceCreams, error: iErr } = await supabase
  .from('resource')
  .select('id, details')
  .eq('category', 'ice-cream')

if (iErr) { console.error('❌ Failed to fetch ice-cream listings:', iErr.message); process.exit(1) }

let moved2 = 0
for (const row of iceCreams ?? []) {
  const details = { ...(row.details ?? {}), foodType: 'Ice Cream' }
  const { error } = await supabase.from('resource').update({ category: 'restaurant', details }).eq('id', row.id)
  if (error) console.error(`  ❌ ${row.id}:`, error.message)
  else moved2++
}
console.log(`✅ Moved ${moved2} ice-cream listings → restaurant (foodType = 'Ice Cream')`)

// ── 5. Delete the now-empty bakery-cafe and ice-cream categories ──────────────

for (const id of ['bakery-cafe', 'ice-cream']) {
  const { error } = await supabase.from('category').delete().eq('id', id)
  if (error) console.error(`❌ Failed to delete category "${id}":`, error.message)
  else console.log(`✅ Deleted category "${id}"`)
}

console.log('\nDone.')
