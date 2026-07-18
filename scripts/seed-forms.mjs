// Seeds the intake forms into the `form` table. The forms themselves — their
// questions, options, and branching — are defined in src/data/forms.js; edit
// that file to change what ships by default. This script just loads whatever
// is there. Idempotent: upserts by id, and never touches `draft_steps` (so
// re-running this doesn't clobber an admin's in-progress, unpublished edit).
// Normally invoked via `npm run setup`; to run on its own:
//
//   node --env-file=.env.local scripts/seed-forms.mjs

import { createClient } from '@supabase/supabase-js'
import { forms } from '../src/data/forms.js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

if (forms.length === 0) {
  console.log('• src/data/forms.js is empty — no forms to seed.')
  process.exit(0)
}

const rows = forms.map((f) => ({
  id: f.id,
  title: f.title,
  submit_label: f.submit_label,
  success_title: f.success_title,
  success_message: f.success_message,
  steps: f.steps,
}))

const { error } = await supabase.from('form').upsert(rows, { onConflict: 'id' })
if (error) {
  console.error('❌ Seed failed:', error.message)
  process.exit(1)
}
console.log(`✅ Seeded ${rows.length} forms:`, rows.map((f) => f.id).join(', '))
