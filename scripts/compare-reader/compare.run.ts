// Today's search against the AI question reader (GPT-6 Luna), on the live
// listings, for the questions step 1 set out to answer (decided Sep 30: try
// the reader, and let this decide how many of the search fixes it replaces).
//
// Each question has the reading it should get, written by hand in the
// site's own words. Both answer every question; each answer is scored
// against what that reading finds in the same listings at the same moment:
// right (the same places, and the same nearest three when asked for
// nearest), partly (at least half the same places), or wrong.
//
// Reads production (read-only) and calls OpenAI with OPENAI_API_KEY, so it's
// not part of `npm test`:
//   npx vitest run --config scripts/compare-reader/vitest.config.mts
// Writes its report to REPORT_DIR (default: the working directory).

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from 'vitest'
import type { CategoryConfig } from '@/lib/categories'
import { selectValues } from '@/lib/categories'
import { searchAsk } from '@/lib/askSearch'
import { neighborhoodsFor } from '@/lib/places'
import { haversineMiles, type LatLng } from '@/lib/geo'
import { businessClosure, hoursOpenNow } from '@/lib/hours'
import { keepsHours, passesFields } from '@/lib/mapFilters'
import { readerVocabulary, type Reading } from '@/lib/questionReader'
import { DEFAULT_READER_MODEL, readQuestion } from '@/lib/readQuestion'
import type { DirectoryResource } from '@/types'

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve('.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)

// Tuesday Oct 6 2026, 12:30 PM in Philadelphia, standing in Rittenhouse Square.
const NOW = new Date('2026-10-06T12:30:00-04:00')
const ME: LatLng = { lat: 39.9496, lng: -75.1718 }
const HUP = 'Hospital of the University of Pennsylvania'
const ORTHODOX = ['Orthodox (Ashkenazi)', 'Orthodox (Sephardic)']

type Case = [question: string, gold: Reading | ((cats: CategoryConfig[]) => Reading)]
const food = (f: Omit<Reading['categories'][number], 'id'> = {}) => ({ id: 'restaurant', ...f })
const one = (c: Reading['categories'][number], rest: Partial<Reading> = {}): Reading => ({ categories: [c], ...rest })
const near = (where: string, rest: Partial<Reading> = {}) => ({ near: where, sortByDistance: true, ...rest })

const CASES: Case[] = [
  // The testers', and step 1's own list.
  ['chalav yisroel milk', { categories: [], items: ['Chalav Yisroel Milk'] }],
  ['where can I buy cholov yisroel milk', { categories: [], items: ['Chalav Yisroel Milk'] }],
  ['CY milk', { categories: [], items: ['Chalav Yisroel Milk'] }],
  ['challah', { categories: [], items: ['Challah'] }],
  ['where can i get challah', { categories: [], items: ['Challah'] }],
  ['kosher wine', { categories: [], items: ['Wine'] }],
  ['shabbos meals', { categories: [], items: ['Premade Shabbat Meals', 'Prepared Shabbos Food'] }],
  ['sushi', { categories: [], items: ['Sushi'] }],
  ['kosher food', one(food())],
  ['where can i eat', one(food())],
  ['kosher food near HUP', one(food(), near(HUP))],
  ['shul near me', one({ id: 'synagogue' }, near('me'))],
  ['where can i daven', one({ id: 'synagogue' })],
  ['meat restaurant', one(food({ select: { t: ['Meat'], foodType: ['Restaurant'] } }))],
  ['dairy restaurant', one(food({ select: { t: ['Dairy'], foodType: ['Restaurant'] } }))],
  ['shabbos friendly hotel', one({ id: 'hotel', bool: ['shabbatFriendly'] })],
  ['hotels', one({ id: 'hotel' })],
  ['mikvah', one({ id: 'mikvah' })],
  ['daycare', one({ id: 'childcare' })],
  // The search fixes (build plan, Sep 28–29).
  ['open meat keystone', one(food({ openNow: true, select: { t: ['Meat'], kosherCert: ['Keystone-K'] } }))],
  ['open meat within 3 miles only keystone', one(food({ openNow: true, select: { t: ['Meat'], kosherCert: ['Keystone-K'] } }), near('me', { withinMiles: 3 }))],
  ['restaurant near me', one(food({ select: { foodType: ['Restaurant'] } }), near('me'))],
  ['meat near me', one(food({ select: { t: ['Meat'] } }), near('me'))],
  ['where can I get a meat meal near center city', one(food({ select: { t: ['Meat'] } }), near('Center City'))],
  ['open meat near me within 3 miles', one(food({ openNow: true, select: { t: ['Meat'] } }), near('me', { withinMiles: 3 }))],
  ['meat sort by distance', one(food({ select: { t: ['Meat'] } }), near('me'))],
  ['orthodox shul', one({ id: 'synagogue', select: { denomination: ORTHODOX } })],
  ['sephardic synagogue', one({ id: 'synagogue', select: { denomination: ['Orthodox (Sephardic)'] } })],
  ['conservative synagogue', one({ id: 'synagogue', select: { denomination: ['Conservative'] } })],
  ['ice cream', one(food({ select: { foodType: ['Ice Cream & Treats'] } }))],
  ['bakery', one(food({ select: { foodType: ['Bakery'] } }))],
  ['food trucks', one(food({ select: { foodType: ['Food Truck'] } }))],
  ['catering', one(food({ select: { foodType: ['Catering'] } }))],
  ['parve open now', one(food({ openNow: true, select: { t: ['Parve'] } }))],
  ['IKC dairy', one(food({ select: { t: ['Dairy'], kosherCert: ['IKC'] } }))],
  ['star-k restaurants', one(food({ select: { kosherCert: ['Star-K'], foodType: ['Restaurant'] } }))],
  ['mikvah for men', one({ id: 'mikvah', bool: ['menTevillah'] })],
  ['keilim mikvah', one({ id: 'mikvah', bool: ['keilim'] })],
  ['shabbos friendly hotels near HUP', one({ id: 'hotel', bool: ['shabbatFriendly'] }, near(HUP))],
  ['kosher store', one({ id: 'grocery', select: { isKosher: ['Kosher Store'] } })],
  ['after school program', one({ id: 'childcare', select: { s: ['After School'] } })],
  ['kosher grocery near me', one({ id: 'grocery' }, near('me'))],
  ['open now', (cats) => ({ categories: cats.filter(keepsHours).map((c) => ({ id: c.id, openNow: true })) })],
  // The user's own, Sep 30.
  [
    'show me all the food places that are meat and open now, all synagogues regardless of open now, and the shabbos friendly hotels',
    { categories: [food({ openNow: true, select: { t: ['Meat'] } }), { id: 'synagogue' }, { id: 'hotel', bool: ['shabbatFriendly'] }] },
  ],
  ['dairy or parve places open now near HUP', one(food({ openNow: true, select: { t: ['Dairy', 'Parve'] } }), near(HUP))],
]

// ── Doing what a reading says, on the listings ──────────────────────────────

type Anchor = { name: string; geo: LatLng }

function applyReading(reading: Reading, listings: DirectoryResource[], cats: CategoryConfig[], anchors: Map<string, Anchor>): string[] {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const wanted = new Map(reading.categories.map((c) => [c.id, c]))
  const items = new Set((reading.items ?? []).map((i) => i.toLowerCase()))
  const from = reading.near === 'me' ? ME : reading.near ? anchors.get(reading.near.toLowerCase())?.geo : null
  let hits = listings.filter((l) => {
    const cat = byId.get(l.category)
    if (!cat) return false
    const c = wanted.get(l.category)
    if (wanted.size && !c) return false
    if (!wanted.size && !items.size) return false
    const raw = l as unknown as Record<string, unknown>
    if (c && !passesFields(raw, { bool: c.bool, select: c.select })) return false
    if (c?.openNow) {
      if (businessClosure(raw)) return false
      const keys = cat.detailFields.filter((f) => f.type === 'hours' && f.filterable).map((f) => f.key)
      if (!keys.some((k) => hoursOpenNow(raw[k], NOW) === true)) return false
    }
    if (items.size) {
      const tags = cat.detailFields.filter((f) => f.type === 'tags').flatMap((f) => [...selectValues(raw[f.key]), ...selectValues(raw[`${f.key}_sometimes`])])
      if (!tags.some((t) => items.has(t.toLowerCase()))) return false
    }
    if (reading.withinMiles && from && l.geo && haversineMiles(from, l.geo as LatLng) > reading.withinMiles) return false
    return true
  })
  if (reading.sortByDistance && from) {
    const d = (l: DirectoryResource) => (l.geo ? haversineMiles(from, l.geo as LatLng) : Infinity)
    hits = [...hits].sort((a, b) => d(a) - d(b))
  }
  return hits.map((l) => l.id)
}

function score(got: string[], want: string[], ordered: boolean): 'right' | 'partly' | 'wrong' {
  const g = new Set(got)
  const w = new Set(want)
  const same = g.size === w.size && [...w].every((id) => g.has(id))
  if (same && (!ordered || want.slice(0, 3).every((id, i) => got[i] === id))) return 'right'
  const overlap = [...w].filter((id) => g.has(id)).length
  const union = new Set([...g, ...w]).size
  return union && overlap / union >= 0.5 ? 'partly' : 'wrong'
}

test('today’s search against the question reader', { timeout: 600_000 }, async () => {
  expect(env.OPENAI_API_KEY, 'OPENAI_API_KEY in .env.local').toBeTruthy()
  const sb = createClient(env.PROD_SUPABASE_URL, env.PROD_SUPABASE_SERVICE_ROLE_KEY)
  const [{ data: catRows }, { data: rows }] = await Promise.all([
    sb.from('category').select('*').eq('community_id', 'philly'),
    sb.from('resource').select('*').eq('status', 'approved').eq('community_id', 'philly'),
  ])
  const cats: CategoryConfig[] = (catRows ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    pluralLabel: r.plural_label,
    icon: r.icon,
    description: r.description ?? '',
    detailFields: r.fields ?? [],
    kind: r.kind,
    hasAddress: r.has_address !== false,
  }))
  const listings: DirectoryResource[] = (rows ?? []).map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    anchorId: r.anchor_id,
    distance: r.distance ?? 0,
    address: r.address ?? '',
    phone: r.phone ?? undefined,
    ...r.details,
  }))

  // Places the reader may name: towns and neighbourhoods, and the hospitals.
  const anchors = new Map<string, Anchor>()
  for (const p of neighborhoodsFor('philly')) for (const n of [p.name, ...(p.aliases ?? [])]) anchors.set(n.toLowerCase(), { name: p.name, geo: p.geo })
  for (const h of listings.filter((l) => l.category === 'hospital' && l.geo)) {
    anchors.set(h.name.toLowerCase(), { name: h.name, geo: h.geo as LatLng })
    const initials = h.name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter((w) => /^[A-Z]/.test(w) && !/^(of|the)$/i.test(w)).map((w) => w[0]).join('')
    if (initials.length >= 3) anchors.set(initials.toLowerCase(), { name: h.name, geo: h.geo as LatLng })
  }
  anchors.set('hup', { name: HUP, geo: anchors.get(HUP.toLowerCase())!.geo })
  const vocab = readerVocabulary(cats, listings, [...new Set([...anchors.keys()].map((k) => anchors.get(k)!.name)), 'HUP'])

  const rowsOut: string[] = []
  const tally = { today: { right: 0, partly: 0, wrong: 0 }, luna: { right: 0, partly: 0, wrong: 0 } }
  let cost = 0
  let msTotal = 0
  const fails: string[] = []
  for (const [question, goldOf] of CASES) {
    const gold = typeof goldOf === 'function' ? goldOf(cats) : goldOf
    const want = applyReading(gold, listings, cats, anchors)
    const ordered = !!gold.sortByDistance

    const today = searchAsk(listings, cats, question, { coords: ME, now: NOW, places: neighborhoodsFor('philly') }).hits.map((h) => h.item.id)
    const todayScore = score(today, want, ordered)

    let lunaScore: 'right' | 'partly' | 'wrong' = 'wrong'
    let lunaGot: string[] = []
    let readingText = ''
    try {
      const r = await readQuestion(question, vocab, {
        apiKey: env.OPENAI_API_KEY,
        model: process.env.READER_MODEL || DEFAULT_READER_MODEL,
        effort: process.env.READER_EFFORT === 'default' ? null : process.env.READER_EFFORT || undefined,
      })
      if (r.reading.near && r.reading.near !== 'me' && !anchors.has(r.reading.near.toLowerCase())) r.reading.near = null
      lunaGot = applyReading(r.reading, listings, cats, anchors)
      lunaScore = score(lunaGot, want, ordered)
      readingText = JSON.stringify(r.reading)
      // GPT-6 Luna, per third-party price lists (Sep 2026): $0.10 per million
      // tokens read ($0.01 cached), $0.50 per million written.
      cost += ((r.usage.input - r.usage.cachedInput) * 0.1 + r.usage.cachedInput * 0.01 + r.usage.output * 0.5) / 1e6
      msTotal += r.ms
    } catch (e) {
      readingText = `ERROR ${(e as Error).message}`
    }
    tally.today[todayScore]++
    tally.luna[lunaScore]++
    if (lunaScore !== 'right') fails.push(`- **${question}**: wanted ${JSON.stringify(gold)}; read ${readingText}`)
    rowsOut.push(`| ${question} | ${want.length} | ${todayScore} (${today.length}) | ${lunaScore} (${lunaGot.length}) |`)
  }

  const n = CASES.length
  const report = [
    `# Today's search vs the question reader (${process.env.READER_MODEL || DEFAULT_READER_MODEL}, thinking: ${process.env.READER_EFFORT || 'none'})`,
    '',
    `${n} questions, live listings, Tue Oct 6 2026 12:30 PM from Rittenhouse Square.`,
    '',
    `- Today's search: ${tally.today.right} right, ${tally.today.partly} partly, ${tally.today.wrong} wrong`,
    `- Reader: ${tally.luna.right} right, ${tally.luna.partly} partly, ${tally.luna.wrong} wrong`,
    `- Reader cost for all ${n}: $${cost.toFixed(4)} (≈ $${((cost / n) * 1000).toFixed(2)} per 1,000 questions); average ${Math.round(msTotal / n)} ms each`,
    '',
    '| Question | Places it should find | Today (found) | Reader (found) |',
    '|---|---|---|---|',
    ...rowsOut,
    '',
    '## Where the reader wasn’t right',
    ...fails,
  ].join('\n')
  const out = path.resolve(process.env.REPORT_DIR || '.', `reader-compare-${process.env.READER_EFFORT || 'none'}.md`)
  fs.writeFileSync(out, report)
  console.log(report.split('\n').slice(0, 8).join('\n'), `\n\nReport: ${out}`)
})
