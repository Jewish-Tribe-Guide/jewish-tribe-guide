// Test data for step 7 (What changed, credit): about two weeks of activity
// log rows on DEV, against real dev listings and their real items, so the
// strip, the page and credit can be seen working before the real log has
// any history.
//
//   node --env-file=.env.local scripts/seed-dev-activity.mjs            # dry run: prints the rows
//   node --env-file=.env.local scripts/seed-dev-activity.mjs --apply    # writes them
//   node --env-file=.env.local scripts/seed-dev-activity.mjs --remove   # deletes every seeded row
//
// Dev only. There is no --prod, and it refuses to run if the URL is
// production's. Every row's actor_email ends in @seed.activity.test, which is
// how --remove finds them and nothing else; re-running --apply removes the
// previous seed first, so it never piles up.
import { createClient } from '@supabase/supabase-js'

const SEED_DOMAIN = '@seed.activity.test'
const APPLY = process.argv.includes('--apply')
const REMOVE = process.argv.includes('--remove')
const community = 'philly'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
if (url === process.env.PROD_SUPABASE_URL) {
  console.error('Refusing: NEXT_PUBLIC_SUPABASE_URL is production. This script is for dev only.')
  process.exit(1)
}
const supabase = createClient(url, key)
console.log(`\nTarget:  dev/test (${new URL(url).host})`)

async function removeSeed() {
  const { error, count } = await supabase.from('activity').delete({ count: 'exact' }).like('actor_email', `%${SEED_DOMAIN}`)
  if (error) throw new Error(error.message)
  return count ?? 0
}

if (REMOVE) {
  console.log(`Removed ${await removeSeed()} seeded rows.`)
  process.exit(0)
}

// Real dev listings, in a fixed order so the same run gives the same rows.
// Category ids repeat across communities, so only this one's.
const { data: cats } = await supabase.from('category').select('id, fields').eq('community_id', community)
const itemKeys = new Map((cats ?? []).map((c) => [c.id, (c.fields ?? []).filter((f) => f.type === 'tags').map((f) => f.key)]))
const { data: listings, error } = await supabase
  .from('resource')
  .select('id, name, category, details')
  .eq('community_id', community)
  .eq('status', 'approved')
  .order('name')
if (error) throw new Error(error.message)

const inCategory = (category) => listings.filter((l) => l.category === category)
const withItems = listings.flatMap((l) =>
  (itemKeys.get(l.category) ?? []).flatMap((k) => (Array.isArray(l.details?.[k]) ? l.details[k].slice(0, 3).map((item) => ({ l, k, item })) : [])),
)
const pick = (list, i) => list[i % Math.max(list.length, 1)]

// Three neighbours and the Google sync, by email (never shown; credit groups
// by it).
const ruth = `ruth${SEED_DOMAIN}`
const dov = `dov${SEED_DOMAIN}`
const neighbor = `neighbor${SEED_DOMAIN}`
const google = `google${SEED_DOMAIN}`

// [days ago, hour in New York, kind, source, who, listing, item?]
const food = inCategory('restaurant')
const grocery = inCategory('grocery')
const shuls = inCategory('synagogue')
const hotels = inCategory('hotel')
const plan = [
  [0, 10, 'item_confirmed', 'visitor', ruth, withItems[0]],
  [0, 9, 'listing_confirmed', 'visitor', neighbor, pick(shuls, 0)],
  [1, 18, 'listing_edited', 'submission', dov, pick(food, 3)],
  [1, 12, 'item_added', 'submission', ruth, withItems[4]],
  [2, 15, 'listing_added', 'submission', dov, pick(food, 7)],
  [2, 11, 'listing_edited', 'google', google, pick(grocery, 2)],
  [3, 20, 'item_reported_gone', 'visitor', neighbor, withItems[7]],
  [4, 13, 'listing_confirmed', 'visitor', ruth, pick(grocery, 1)],
  [5, 10, 'listing_edited', 'submission', ruth, pick(shuls, 3)],
  [5, 9, 'item_confirmed', 'visitor', dov, withItems[2]],
  [6, 16, 'listing_confirmed', 'visitor', neighbor, pick(hotels, 0)],
  // Last week: fewer.
  [8, 14, 'listing_added', 'submission', ruth, pick(grocery, 5)],
  [9, 11, 'listing_edited', 'google', google, pick(food, 11)],
  [10, 19, 'item_added', 'submission', dov, withItems[10]],
  [12, 10, 'listing_confirmed', 'visitor', ruth, pick(food, 1)],
  [13, 17, 'listing_edited', 'submission', neighbor, pick(shuls, 5)],
]

/** That many days ago at that hour in New York (EDT, UTC-4, in October). */
const at = (daysAgo, hour) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  d.setUTCHours(hour + 4, 0, 0, 0)
  return d.toISOString()
}
const rows = plan
  .filter(([, , , , , target]) => target)
  .map(([daysAgo, hour, kind, source, who, target]) => {
    const isItem = kind.startsWith('item_')
    const l = isItem ? target.l : target
    return {
      community_id: community,
      resource_id: l.id,
      kind,
      source,
      field_key: isItem ? target.k : null,
      item: isItem ? target.item : null,
      actor_email: who,
      submission_id: null,
      created_at: at(daysAgo, hour),
      _show: `${l.name} (${l.category})${isItem ? ` "${target.item}"` : ''}`,
    }
  })

for (const r of rows) console.log(`  ${r.created_at.slice(0, 16).replace('T', ' ')}Z  ${r.source}/${r.kind}  ${r._show}  [${r.actor_email.split('@')[0]}]`)
console.log(`${rows.length} rows (of ${plan.length} planned; a missing category or item drops its row).`)

if (!APPLY) {
  console.log('Dry run: nothing written. Re-run with --apply.')
  process.exit(0)
}
const removed = await removeSeed()
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- _show is the dry run's label, not a column
const { error: insertError } = await supabase.from('activity').insert(rows.map(({ _show, ...r }) => r))
if (insertError) throw new Error(insertError.message)
console.log(`Removed ${removed} earlier seeded rows; wrote ${rows.length}.`)
