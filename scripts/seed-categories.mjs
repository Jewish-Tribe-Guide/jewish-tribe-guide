// Seeds the directory categories into the `category` table. The categories
// themselves — which ones, their labels, icons, and fields — are defined in
// src/data/categories.js; edit that file to choose them. This script just loads
// whatever is there. Idempotent: upserts by id. Normally invoked via
// `npm run setup`; to run on its own:
//
//   node --env-file=.env.local scripts/seed-categories.mjs

import { createClient } from '@supabase/supabase-js'
import { categories } from '../src/data/categories.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

if (categories.length === 0) {
  console.log('• src/data/categories.js is empty — no categories to seed.')
  process.exit(0)
}

const { error } = await supabase.from('category').upsert(categories, { onConflict: 'id' })
if (error) {
  console.error('❌ Seed failed:', error.message)
  process.exit(1)
}
console.log(`✅ Seeded ${categories.length} categories:`, categories.map((c) => c.id).join(', '))
