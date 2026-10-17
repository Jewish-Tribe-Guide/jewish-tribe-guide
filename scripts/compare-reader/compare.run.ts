// Today's search against the AI question reader (GPT-6 Luna), on the live
// listings, for the questions step 1 set out to answer (decided Sep 30: try
// the reader, and let this decide how many of the search fixes it replaces).
//
// Each question has the reading it should get, written by hand in the
// site's own words, and when it asks a time, "best" or "other than", what
// our own parser should keep of it. Both answer every question; each answer
// is scored against what that right answer finds in the same listings at
// the same moment: right (the same places, and the same first three when
// asked for nearest or best), partly (at least half the same places), or
// wrong. The reader's side is scored as the site shows it: its reading and
// our parser's conditions together (readingSearch.ts), and today's search
// where the site falls back to it.
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
import { searchAsk } from '@/lib/askSearch'
import { withTaught } from '@/lib/askWords'
import { neighborhoodsFor } from '@/lib/places'
import type { LatLng } from '@/lib/geo'
import { keepsHours } from '@/lib/mapFilters'
import { placeFor, readerPlaces, readerVocabulary, type ReaderPlace, type Reading } from '@/lib/questionReader'
import { needsReading, ownFrom, readingAnswers, readingLoses, searchReading, type Asked, type OwnConditions } from '@/lib/readingSearch'
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

type Case = [question: string, gold: Reading | ((cats: CategoryConfig[]) => Reading), own?: Partial<OwnConditions> | ((places: ReadonlyMap<string, ReaderPlace>) => Partial<OwnConditions>)]
const inTown = (name: string) => (places: ReadonlyMap<string, ReaderPlace>) => ({ place: placeFor(name, places) })
// "Near" a neighbourhood is measured from it, nearest first, as our own
// search reads it; "in" is inside it (decided Oct 1, with "near HUP").
const nearTown = (name: string) => (places: ReadonlyMap<string, ReaderPlace>) => {
  const p = placeFor(name, places)
  return { place: p ? { name: p.name, label: p.label, geo: p.geo } : null }
}
const NONE: OwnConditions = { openNow: false, openToday: false, openAt: null, best: false, excluding: [], within: null, place: null }
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
  ['meat restaurant', one(food({ select: { t: ['Meat'] } }))],
  ['dairy restaurant', one(food({ select: { t: ['Dairy'] } }))],
  ['shabbos friendly hotel', one({ id: 'hotel', bool: ['shabbatFriendly'] })],
  ['hotels', one({ id: 'hotel' })],
  ['mikvah', one({ id: 'mikvah' })],
  ['daycare', one({ id: 'childcare' })],
  // The search fixes (build plan, Sep 28–29). "Restaurant" is read loosely,
  // as any food place, with Type: Restaurant offered (decided Sep 30: "we
  // need to not confidently say something that's wrong").
  ['open meat keystone', one(food({ openNow: true, select: { t: ['Meat'], kosherCert: ['Keystone-K'] } }))],
  ['open meat within 3 miles only keystone', one(food({ openNow: true, select: { t: ['Meat'], kosherCert: ['Keystone-K'] } }), near('me', { withinMiles: 3 }))],
  ['restaurant near me', one(food(), near('me'))],
  ['meat near me', one(food({ select: { t: ['Meat'] } }), near('me'))],
  ['where can I get a meat meal near center city', one(food({ select: { t: ['Meat'] } }), near('Center City')), nearTown('center city')],
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
  ['star-k restaurants', one(food({ select: { kosherCert: ['Star-K'] } }))],
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
  // Times, "best" and "other than": our own parser's to keep (Sep 30, after
  // the first of these lost its hours to the reader).
  ['can you show me meat restaurants that are open until 10pm or later', one(food({ select: { t: ['Meat'] } })), { openAt: { how: 'until', minutes: 22 * 60 } }],
  ['dairy places open after 6', one(food({ select: { t: ['Dairy'] } })), { openAt: { how: 'after', minutes: 18 * 60 } }],
  ['is there a mikvah open today', one({ id: 'mikvah' }), { openToday: true }],
  ['meat restaurants open late', one(food({ select: { t: ['Meat'] } })), { openNow: true }],
  ['best bakery', one(food({ select: { foodType: ['Bakery'] } })), { best: true }],
  ['kosher wine other than giant', { categories: [], items: ['Wine'] }, { excluding: ['giant'] }],
  // Towns from the listings' addresses, which our own search knew and the
  // reader didn't (Sep 30: "food in bala cynwyd" went back to all 72).
  ['food in bala cynwyd', one(food()), inTown('bala cynwyd')],
  ['meat in bala cynwyd', one(food({ select: { t: ['Meat'] } })), inTown('bala cynwyd')],
  ['kosher food in cherry hill', one(food()), inTown('cherry hill')],
  ['shul in merion station', one({ id: 'synagogue' }), inTown('merion station')],
]

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

  // Places the reader may name, as the route gives them: everything our
  // own search knows (see readerPlaces).
  const places = readerPlaces(listings, 'philly')
  const vocab = readerVocabulary(cats, listings, [...places.keys()])
  const answer = (asked: Asked, question: string) =>
    searchReading(listings, cats, asked, question, { coords: ME, now: NOW, places }).hits.map((h) => h.item.id)

  const rowsOut: string[] = []
  const tally = { today: { right: 0, partly: 0, wrong: 0 }, luna: { right: 0, partly: 0, wrong: 0 } }
  let cost = 0
  let msTotal = 0
  const fails: string[] = []
  let asked = 0
  for (const [question, goldOf, goldOwnOf] of CASES) {
    const gold = typeof goldOf === 'function' ? goldOf(cats) : goldOf
    const goldOwn = typeof goldOwnOf === 'function' ? goldOwnOf(places) : goldOwnOf
    const want = answer({ reading: gold, own: { ...NONE, ...goldOwn } }, question)
    const ordered = !!gold.sortByDistance || !!goldOwn?.best

    const todayResult = searchAsk(listings, cats, question, { coords: ME, now: NOW, places: neighborhoodsFor('philly') })
    const today = todayResult.hits.map((h) => h.item.id)
    const todayScore = score(today, want, ordered)

    // As the site does: the reader only when our own search left something
    // it didn't understand; otherwise our search's answer is the site's.
    let lunaScore: 'right' | 'partly' | 'wrong' = todayScore
    let lunaGot: string[] = today
    let readingText = 'not asked: our search understood it all'
    if (needsReading(todayResult)) try {
      asked++
      const r = await readQuestion(question, vocab, {
        apiKey: env.OPENAI_API_KEY,
        model: process.env.READER_MODEL || DEFAULT_READER_MODEL,
        effort: process.env.READER_EFFORT === 'default' ? null : process.env.READER_EFFORT || undefined,
      })
      // Today's search where the reading has nothing, or lost the kind of
      // place our parser heard and today's found something; otherwise the
      // reading added to what our own search understood (ownFrom).
      const fallBack = !readingAnswers(r.reading) || (today.length > 0 && readingLoses(question, r.reading, cats))
      const own = ownFrom(todayResult, places)
      lunaGot = fallBack ? today : answer({ reading: withTaught(r.reading, own.taught), own }, question)
      lunaScore = score(lunaGot, want, ordered)
      readingText = JSON.stringify(r.reading)
      // GPT-6 Luna, per third-party price lists (Sep 2026): $0.10 per million
      // tokens read ($0.01 cached), $0.50 per million written.
      cost += ((r.usage.input - r.usage.cachedInput) * 0.1 + r.usage.cachedInput * 0.01 + r.usage.output * 0.5) / 1e6
      msTotal += r.ms
    } catch (e) {
      lunaScore = 'wrong'
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
    `- The site with the reader: ${tally.luna.right} right, ${tally.luna.partly} partly, ${tally.luna.wrong} wrong`,
    `- The reader was asked ${asked} of ${n}; the rest our own search understood entirely`,
    `- Reader cost for those ${asked}: $${cost.toFixed(4)}; average ${Math.round(msTotal / Math.max(1, asked))} ms each`,
    '',
    '| Question | Places it should find | Today (found) | Site with the reader (found) |',
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
