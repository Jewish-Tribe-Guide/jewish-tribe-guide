// Updates bakery, cafe, and ice-cream categories to match the restaurant card:
// hours, kosher badge, kosher certification, menu (bakery/cafe only), upvotes.
//
//   node --env-file=.env.local scripts/update-food-categories.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

const restaurantFields = [
  { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
  { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Kosher' },
  {
    key: 'certification',
    label: 'Kosher certification (Hechsher)',
    type: 'text',
    renderAs: 'row',
    placeholder: 'e.g. OU, Star-K, local Vaad',
    showIf: { field: 'isKosher', equals: true },
  },
  { key: 'menu', label: 'Menu', type: 'url', linkLabel: 'View menu', renderAs: 'row', placeholder: 'https://…' },
]

const fieldsNoMenu = restaurantFields.filter((f) => f.key !== 'menu')

// First, look up the actual ids in the DB (they may differ from the slugified label).
const { data: existing, error: fetchErr } = await supabase
  .from('category')
  .select('id, label')
  .in('id', ['bakery', 'cafe', 'ice-cream'])

if (fetchErr) {
  console.error('❌ Fetch failed:', fetchErr.message)
  process.exit(1)
}

console.log('Found categories:', existing?.map((c) => `${c.id} (${c.label})`).join(', ') || 'none')

const updates = [
  { id: 'bakery', fields: restaurantFields },
  { id: 'cafe', fields: restaurantFields },
  { id: 'ice-cream', fields: fieldsNoMenu },
]

let updated = 0
for (const { id, fields } of updates) {
  const exists = existing?.find((c) => c.id === id)
  if (!exists) {
    console.warn(`⚠️  Category "${id}" not found in DB — skipping`)
    continue
  }
  const { error } = await supabase
    .from('category')
    .update({ fields, upvotes_enabled: true })
    .eq('id', id)
  if (error) {
    console.error(`❌ Failed to update "${id}":`, error.message)
  } else {
    console.log(`✅ Updated "${id}"`)
    updated++
  }
}

console.log(`\nDone: ${updated}/${updates.length} categories updated.`)
