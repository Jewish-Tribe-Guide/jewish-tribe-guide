// One Denomination list on every page, and Nusach for shuls (agreed Nov 5,
// docs/where-things-stand.md, "Denomination gets one list").
//
// Four Denomination fields differed: Philly Synagogues ("Orthodox
// (Ashkenazi)", "Orthodox (Sephardic)", Other, one choice), Philly Schools
// (key `d`, several), Washington Synagogues and UES Synagogues (several).
// Ashkenazi/Sephardic on a shul is really its nusach, and schools have none.
// So every page gets the same Denomination field, one choice, and shul pages
// get a Nusach field that may be left empty:
//
//   "Orthodox (Ashkenazi)" → Orthodox, no Nusach ("Ashkenazi" isn't a
//                            nusach, and both Chabads are among them)
//   "Orthodox (Sephardic)" → Orthodox, and on a shul Nusach Sephardi
//   key `d`                → `denomination`
//
// Pending submissions are rewritten the same way, so approving one later
// doesn't put an old value back.
//
//   node --env-file=.env.local scripts/denomination-nusach.mjs                   # dry run, dev/test
//   node --env-file=.env.local scripts/denomination-nusach.mjs --apply           # write, dev/test
//   node --env-file=.env.local scripts/denomination-nusach.mjs --prod            # dry run, production
//   node --env-file=.env.local scripts/denomination-nusach.mjs --prod --apply    # write, production
//
// Production only with --prod, from PROD_SUPABASE_URL /
// PROD_SUPABASE_SERVICE_ROLE_KEY, as promote-page-headings.mjs does. Writes
// nothing without --apply. A value it doesn't know, or a place with more than
// one denomination, stops the run before anything is written.

import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const DENOMINATIONS = ['Orthodox', 'Conservative', 'Reform', 'Reconstructionist', 'Non-Denominational', 'Other']
export const NUSACHOT = ['Ashkenaz', 'Sefard', 'Ari (Chabad)', 'Sephardi (Edot HaMizrach)', 'Other']
const SEPHARDI = 'Sephardi (Edot HaMizrach)'
const RENAMED = { 'Orthodox (Ashkenazi)': 'Orthodox', 'Orthodox (Sephardic)': 'Orthodox' }

const SHUL_SLUGS = new Set(['synagogue', 'synagogues', 'shul', 'shuls'])
export const isShulPage = (category) => (category.place_kind ?? null) === 'shuls' || SHUL_SLUGS.has(category.id)

const isDenomination = (f) => f.type === 'select' && (f.key === 'denomination' || f.key === 'd') && /denomination/i.test(f.label ?? '')
const opts = (values) => values.map((v) => ({ value: v, label: v }))

/** A page's fields with its Denomination field made the shared one, and
 *  Nusach after it on a shul page. How it shows (badge, filter, Other box,
 *  card) stays as the page had it. Null when there's nothing to change. */
export function planFields(fields, shul) {
  const i = fields.findIndex(isDenomination)
  if (i < 0) return null
  const old = fields[i]
  const denomination = { ...old, key: 'denomination', label: 'Denomination', options: opts(DENOMINATIONS), multiSelect: false, filterLabel: 'Denomination' }
  const next = [...fields]
  next[i] = denomination
  if (shul && !fields.some((f) => f.key === 'nusach')) {
    next.splice(i + 1, 0, { key: 'nusach', label: 'Nusach', type: 'select', options: opts(NUSACHOT), renderAs: 'row', filterable: true, filterLabel: 'Nusach', multiSelect: false })
  }
  return JSON.stringify(next) === JSON.stringify(fields) ? null : next
}

/** A place's (or a pending submission's) details, moved to the shared
 *  list. `problem` says why it can't be, and nothing should be written. */
export function planDetails(details, shul) {
  if (!details || !('denomination' in details || 'd' in details)) return { next: null, change: null, problem: null }
  const { d, ...rest } = details
  let value = 'denomination' in details ? details.denomination : d
  if (Array.isArray(value)) {
    if (value.length > 1) return { next: null, change: null, problem: `more than one denomination: ${JSON.stringify(value)}` }
    value = value[0] ?? null
  }
  const next = { ...rest }
  let change = null
  if (value === null || value === undefined || value === '') next.denomination = value ?? null
  else if (RENAMED[value]) {
    next.denomination = RENAMED[value]
    change = `${value} → ${RENAMED[value]}`
    if (shul && value === 'Orthodox (Sephardic)' && !details.nusach) {
      next.nusach = SEPHARDI
      change += `, Nusach ${SEPHARDI}`
    }
  } else if (DENOMINATIONS.includes(value)) next.denomination = value
  else return { next: null, change: null, problem: `a value not on the list: ${JSON.stringify(value)}` }
  if ('d' in details) change = change ? `${change}, key d → denomination` : 'key d → denomination'
  if (JSON.stringify(details.denomination) !== JSON.stringify(next.denomination) && !change) change = `${JSON.stringify(details.denomination)} → ${JSON.stringify(next.denomination)}`
  return JSON.stringify(next) === JSON.stringify(details) ? { next: null, change: null, problem: null } : { next, change, problem: null }
}

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
  const { data: categories, error } = await db.from('category').select('*')
  if (error) fail('Could not read categories', error)
  const { data: pending, error: subError } = await db.from('submission').select('id,payload,community_id,case_number').eq('status', 'pending')
  if (subError) fail('Could not read submissions', subError)

  const writes = []
  const problems = []
  for (const c of categories) {
    if (!(c.fields ?? []).some(isDenomination)) continue
    const shul = isShulPage(c)
    console.log(`${c.community_id} / ${c.id}${shul ? ' (shuls)' : ''}`)
    const fields = planFields(c.fields, shul)
    if (fields) {
      const old = c.fields.find(isDenomination)
      console.log(`  page: Denomination ${JSON.stringify(old.options.map((o) => o.value))}${old.multiSelect ? ', several' : ''}${old.key === 'd' ? ', key d' : ''}`)
      console.log(`     → ${JSON.stringify(DENOMINATIONS)}, one choice${shul && !c.fields.some((f) => f.key === 'nusach') ? `; adds Nusach ${JSON.stringify(NUSACHOT)}` : ''}`)
      writes.push({ table: 'category', match: { id: c.id, community_id: c.community_id }, set: { fields } })
    }
    const { data: places, error: placeError } = await db.from('resource').select('id,name,status,details').eq('category', c.id).eq('community_id', c.community_id)
    if (placeError) fail('Could not read places', placeError)
    for (const p of places) {
      const plan = planDetails(p.details, shul)
      if (plan.problem) problems.push(`  ${p.name}: ${plan.problem}`)
      else if (plan.next) {
        console.log(`  ${p.name}${p.status !== 'approved' ? ` [${p.status}]` : ''}: ${plan.change}`)
        writes.push({ table: 'resource', match: { id: p.id }, set: { details: plan.next } })
      }
    }
    for (const s of pending.filter((s) => s.payload?.category === c.id && s.community_id === c.community_id)) {
      const plan = planDetails(s.payload.details, shul)
      if (plan.problem) problems.push(`  pending #${s.case_number}: ${plan.problem}`)
      else if (plan.next) {
        console.log(`  pending #${s.case_number} (${s.payload.name}): ${plan.change}`)
        writes.push({ table: 'submission', match: { id: s.id }, set: { payload: { ...s.payload, details: plan.next } } })
      }
    }
  }

  if (problems.length) {
    console.log('\nStopped, nothing written:')
    for (const p of problems) console.log(p)
    process.exit(1)
  }
  console.log(`\n${writes.length} row(s): ${['category', 'resource', 'submission'].map((t) => `${writes.filter((w) => w.table === t).length} ${t}`).join(', ')}`)
  if (!writes.length) return console.log('Nothing to do.')
  if (!APPLY) return console.log('Read the list above, then re-run with --apply.')
  for (const w of writes) {
    let q = db.from(w.table).update(w.set)
    for (const [k, v] of Object.entries(w.match)) q = q.eq(k, v)
    const { error: writeError } = await q
    if (writeError) fail(`FAILED on ${w.table} ${JSON.stringify(w.match)}`, writeError)
  }
  console.log('Saved. The running site caches its content, so clear it with a redeploy')
  console.log('or POST /api/admin/revalidate with an admin token.')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
