// Kosher Certification lets people type a hechsher in, so a choice called
// "Other Kosher" is a second Other (the user, Nov 9,
// docs/where-things-stand.md). Takes it off every Kosher Certification
// field that has a typed-in Other. A place or pending submission that
// picked it keeps it, shown as typed in; the run lists them.
//
//   node --env-file=.env.local scripts/kosher-cert-no-other.mjs                 # dry run, dev/test
//   node --env-file=.env.local scripts/kosher-cert-no-other.mjs --apply         # write, dev/test
//   node --env-file=.env.local scripts/kosher-cert-no-other.mjs --prod          # dry run, production
//   node --env-file=.env.local scripts/kosher-cert-no-other.mjs --prod --apply  # write, production
//
// Production only with --prod, and only with the user's go-ahead. Writes
// nothing without --apply.

import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const isCert = (f) => f.type === 'select' && f.allowOther && /^kosher certification$/i.test((f.label ?? '').trim())
const isOther = (o) => /^other\b/i.test((o.label ?? '').trim())

/** A page's fields without Kosher Certification's "Other …", or null if it has none. */
export function planFields(fields) {
  const next = fields.map((f) => (isCert(f) && f.options?.some(isOther) ? { ...f, options: f.options.filter((o) => !isOther(o)) } : f))
  return JSON.stringify(next) === JSON.stringify(fields) ? null : next
}

const picked = (details, key) => [details?.[key]].flat().some((v) => typeof v === 'string' && /^other\b/i.test(v.trim()))

async function main() {
  const APPLY = process.argv.includes('--apply')
  const PROD = process.argv.includes('--prod')
  const url = PROD ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = PROD ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(PROD ? 'Needs PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY.' : 'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  const db = createClient(url, key)
  console.log(`\nTarget:  ${PROD ? 'PRODUCTION' : 'dev/test'}`)
  console.log(`Project: ${url}`)
  console.log(APPLY ? 'Mode:    APPLY (writing)\n' : 'Mode:    dry run (pass --apply to write)\n')
  const fail = (what, error) => {
    console.error(`${what}: ${error.message}`)
    process.exit(1)
  }

  const { data: categories, error } = await db.from('category').select('id,community_id,fields')
  if (error) fail('Could not read categories', error)
  const { data: pending, error: subError } = await db.from('submission').select('id,payload,community_id').eq('status', 'pending')
  if (subError) fail('Could not read submissions', subError)

  const writes = []
  for (const c of categories) {
    const fields = planFields(c.fields ?? [])
    if (!fields) continue
    const keys = (c.fields ?? []).filter(isCert).map((f) => f.key)
    const { data: places, error: placeError } = await db.from('resource').select('id,name,details').eq('category', c.id).eq('community_id', c.community_id)
    if (placeError) fail(`Could not read ${c.community_id}/${c.id}'s places`, placeError)
    const before = c.fields.find(isCert).options.map((o) => o.label)
    console.log(`${c.community_id} / ${c.id}: Kosher Certification ${JSON.stringify(before)} → ${JSON.stringify(before.filter((l) => !/^other\b/i.test(l.trim())))}`)
    for (const p of places) for (const k of keys) if (picked(p.details, k)) console.log(`  keeps it, as typed in: ${p.name}`)
    for (const s of pending.filter((s) => s.community_id === c.community_id)) for (const k of keys) if (picked(s.payload?.details, k)) console.log(`  keeps it, as typed in: pending submission ${s.id}`)
    writes.push({ match: { id: c.id, community_id: c.community_id }, fields })
  }

  if (!writes.length) return console.log('Nothing to change.')
  if (!APPLY) return console.log(`\n${writes.length} page(s) would change.`)
  for (const w of writes) {
    const { error: writeError } = await db.from('category').update({ fields: w.fields }).match(w.match)
    if (writeError) fail(`Could not write ${w.match.community_id}/${w.match.id}`, writeError)
  }
  console.log(`\nWrote ${writes.length} page(s). The site keeps its cached copy until a redeploy`)
  console.log('or POST /api/admin/revalidate with an admin token.')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
