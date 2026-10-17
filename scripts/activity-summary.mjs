// What the activity log (step 0) holds: how many changes a week, of which
// kinds and from where, and the most recent ones by listing name. Read-only:
// there is no --apply, and nothing here writes.
//
// For step 7's "This week in Philly" strip and What changed page, which show
// up on their own at about five updates a week; this says whether a real
// week reaches that, and gives the mockups real entries to draw.
//
//   node --env-file=.env.local scripts/activity-summary.mjs           # dev/test
//   node --env-file=.env.local scripts/activity-summary.mjs --prod    # production
//
// Same --prod flag and env pair as promote-page-headings.mjs. Never prints who
// made a change (actor_email): only what changed.
import { createClient } from '@supabase/supabase-js'

const PROD = process.argv.includes('--prod')
const community = process.argv.find((a) => a.startsWith('--community='))?.slice(12) ?? 'philly'
const url = PROD ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
const key = PROD ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(PROD ? 'Needs PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY.' : 'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const supabase = createClient(url, key)

// Weeks start on Sunday, in New York.
const weekOf = (iso) => {
  // The New York calendar date, as plain numbers, then back to that Sunday.
  const [y, m, d] = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  day.setUTCDate(day.getUTCDate() - day.getUTCDay())
  return day.toISOString().slice(0, 10)
}
const { data: rows, error } = await supabase
  .from('activity')
  .select('created_at, kind, source, field_key, item, resource_id')
  .eq('community_id', community)
  .order('created_at', { ascending: false })
  .limit(5000)
if (error && !/activity/.test(error.message)) {
  console.error(`Could not read the activity log: ${error.message}`)
  process.exit(1)
}
if (error) {
  // No activity table: migration 057 isn't on this database (production,
  // until launch). The approved moderation queue is the same history: each
  // approval is what the log would have recorded as added, edited or
  // removed.
  console.log(`\nNo activity log here (${error.message}).`)
  await fromSubmissions()
  process.exit(0)
}

const ids = [...new Set(rows.map((r) => r.resource_id).filter(Boolean))]
const names = new Map()
for (let i = 0; i < ids.length; i += 200) {
  const { data } = await supabase.from('resource').select('id, name, category').in('id', ids.slice(i, i + 200))
  for (const r of data ?? []) names.set(r.id, `${r.name} (${r.category})`)
}

console.log(`\nTarget:    ${PROD ? 'PRODUCTION (read-only)' : 'dev/test'}`)
console.log(`Community: ${community}`)
console.log(`Entries:   ${rows.length}${rows.length ? `, ${rows.at(-1).created_at.slice(0, 10)} to ${rows[0].created_at.slice(0, 10)}` : ''}`)

const weeks = new Map()
for (const r of rows) {
  const w = weekOf(r.created_at)
  const k = `${r.source}/${r.kind}`
  if (!weeks.has(w)) weeks.set(w, new Map())
  weeks.get(w).set(k, (weeks.get(w).get(k) ?? 0) + 1)
}
console.log('\nBy week (Sunday start): total, then source/kind counts')
for (const [w, kinds] of [...weeks].sort().reverse()) {
  const total = [...kinds.values()].reduce((a, b) => a + b, 0)
  console.log(`  ${w}  ${String(total).padStart(4)}  ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`)
}

console.log('\nThe 25 most recent (deleted listings show as "(gone)")')
for (const r of rows.slice(0, 25)) {
  const what = r.item ? ` "${r.item}"` : ''
  console.log(`  ${r.created_at.slice(0, 16).replace('T', ' ')}  ${r.source}/${r.kind}${what}  ${names.get(r.resource_id) ?? '(gone)'}`)
}

/** The approved submissions, by the week they were approved. */
async function fromSubmissions() {
  const { data: subs, error: subError } = await supabase
    .from('submission')
    .select('operation, target_type, target_id, payload, reviewed_at, created_at')
    .eq('community_id', community)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(5000)
  if (subError) {
    console.error(`Could not read submissions: ${subError.message}`)
    process.exit(1)
  }
  const ids = [...new Set(subs.map((r) => r.target_id).filter(Boolean))]
  const names = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('resource').select('id, name, category').in('id', ids.slice(i, i + 200))
    for (const r of data ?? []) names.set(r.id, `${r.name} (${r.category})`)
  }
  const when = (r) => r.reviewed_at ?? r.created_at
  const nameOf = (r) => names.get(r.target_id) ?? (r.payload?.name ? `${r.payload.name} (${r.payload.category ?? '?'})` : '(gone)')
  console.log(`\nTarget:    ${PROD ? 'PRODUCTION (read-only)' : 'dev/test'}, approved submissions`)
  console.log(`Community: ${community}`)
  console.log(`Approved:  ${subs.length}${subs.length ? `, ${when(subs.at(-1)).slice(0, 10)} to ${when(subs[0]).slice(0, 10)}` : ''}`)
  const weeks = new Map()
  for (const r of subs) {
    const w = weekOf(when(r))
    const k = `${r.target_type}/${r.operation}`
    if (!weeks.has(w)) weeks.set(w, new Map())
    weeks.get(w).set(k, (weeks.get(w).get(k) ?? 0) + 1)
  }
  console.log('\nApproved by week (Sunday start): total, then type/operation counts')
  for (const [w, kinds] of [...weeks].sort().reverse()) {
    const total = [...kinds.values()].reduce((a, b) => a + b, 0)
    console.log(`  ${w}  ${String(total).padStart(4)}  ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`)
  }
  console.log('\nThe 25 most recent approvals')
  for (const r of subs.slice(0, 25)) {
    console.log(`  ${when(r).slice(0, 16).replace('T', ' ')}  ${r.target_type}/${r.operation}  ${nameOf(r)}`)
  }
}
