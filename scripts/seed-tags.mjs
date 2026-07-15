// Seeds the kosher-item tag vocabulary and, if the grocery category is present,
// enables a `kosherItems` tags field on it. Idempotent, and safe when grocery
// wasn't seeded. No new DDL — uses the existing `tag` table.
//
//   node --env-file=.env.local scripts/seed-tags.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing env. Run: node --env-file=.env.local scripts/seed-tags.mjs')
  process.exit(1)
}
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const GROUP = 'kosher_product'
const ITEMS = [
  'Kosher Cheese',
  'Cholov Yisroel Milk',
  'Glatt Kosher Meat',
  'Kosher Wine',
  'Pas Yisroel Bread',
  'Kosher Bakery',
  'Kosher Deli',
  'Kosher Fish',
  'Prepared Shabbos Food',
  'Pareve Products',
]

const tagRows = ITEMS.map((label) => ({ slug: slugify(label), label, group: GROUP }))
const { error: tagErr } = await supabase.from('tag').upsert(tagRows, { onConflict: 'slug' })
if (tagErr) {
  console.error('❌ tag upsert failed:', tagErr.message)
  process.exit(1)
}
console.log(`✅ Seeded ${tagRows.length} kosher-item tags.`)

// Add the kosherItems tags field to the grocery category (if present). A
// community that didn't seed `grocery` just gets the tag vocabulary and no
// field — no error, so any subset of categories works with `npm run setup`.
const { data: grocery, error: gErr } = await supabase
  .from('category')
  .select('fields')
  .eq('id', 'grocery')
  .maybeSingle()
if (gErr) {
  console.error('❌ could not load grocery category:', gErr.message)
  process.exit(1)
}

if (!grocery) {
  console.log('• grocery category not seeded — skipping its kosherItems field.')
} else {
  const fields = grocery.fields ?? []
  if (!fields.some((f) => f.key === 'kosherItems')) {
    fields.push({
      key: 'kosherItems',
      label: 'Kosher items available',
      type: 'tags',
      tagGroup: GROUP,
      renderAs: 'badge',
      help: 'Which kosher products can people find here?',
    })
    const { error: upErr } = await supabase.from('category').update({ fields }).eq('id', 'grocery')
    if (upErr) {
      console.error('❌ could not update grocery fields:', upErr.message)
      process.exit(1)
    }
    console.log('✅ Added kosherItems tags field to grocery.')
  } else {
    console.log('• grocery already has a kosherItems field — left as is.')
  }
}
