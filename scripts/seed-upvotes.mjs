// Enables upvotes on the built-in categories that should have them
// (grocery, restaurant, hotel). Run after the schema migrations are applied
// (the `votes` migration adds category.upvotes_enabled). Idempotent.
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

// Only whichever of these a community actually seeded get updated — the rest
// are silently absent, so any subset of categories works.
const { data, error } = await s
  .from('category')
  .update({ upvotes_enabled: true })
  .in('id', ['grocery', 'restaurant', 'hotel'])
  .select('id')
if (error) {
  console.error('❌ failed:', error.message)
  process.exit(1)
}
const enabled = (data ?? []).map((c) => c.id)
console.log(
  enabled.length
    ? `✅ Enabled upvotes on ${enabled.join(', ')}.`
    : '• None of grocery/restaurant/hotel are seeded — nothing to enable.',
)
