// Seeds the `hospital` table from the starter data in src/data/hospitals.js and
// src/data/hospitalInfo.js (the per-hospital "Jewish life" details fold into the
// `info` jsonb column). Idempotent: upserts by id. A non-hospital community
// leaves hospitals.js empty and this seeds nothing. Normally run via
// `npm run setup`; on its own:
//
//   node --env-file=.env.local scripts/seed-hospitals.mjs

import { createClient } from '@supabase/supabase-js'
import { hospitals } from '../src/data/hospitals.js'
import { hospitalInfo } from '../src/data/hospitalInfo.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

if (!hospitals.length) {
  console.log('• src/data/hospitals.js is empty — no hospitals to seed.')
  process.exit(0)
}

const rows = hospitals.map((h, i) => ({
  id: h.id,
  name: h.name,
  latitude: h.latitude,
  longitude: h.longitude,
  timezone: h.timezone,
  sort_order: i,
  info: hospitalInfo[h.id] ?? null,
}))

const { error } = await supabase.from('hospital').upsert(rows, { onConflict: 'id' })
if (error) {
  console.error('❌ Seed failed:', error.message)
  process.exit(1)
}
console.log(`✅ Seeded ${rows.length} hospital(s):`, rows.map((r) => r.id).join(', '))
