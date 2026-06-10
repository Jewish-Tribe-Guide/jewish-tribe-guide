// Enables upvotes on the built-in categories that should have them
// (grocery, restaurant, hotel). Run after supabase/votes.sql. Idempotent.
//
//   node --env-file=.env.local scripts/seed-upvotes.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Run: node --env-file=.env.local scripts/seed-upvotes.mjs')
  process.exit(1)
}
const s = createClient(url, key, { auth: { persistSession: false } })

const { error } = await s
  .from('category')
  .update({ upvotes_enabled: true })
  .in('id', ['grocery', 'restaurant', 'hotel'])
if (error) {
  console.error('❌ failed:', error.message)
  process.exit(1)
}
console.log('✅ Enabled upvotes on grocery, restaurant, hotel.')
