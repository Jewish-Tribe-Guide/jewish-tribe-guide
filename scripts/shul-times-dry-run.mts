// A dry run of the rebuilt shul watch (src/lib/shulTimes.ts) against the
// LIVE database, reading only: for each shul with a watched page, what each
// source says about this week and next, and what the new rules would do
// with each part, beside what the old watch filed this week. Files
// nothing, dates nothing. docs/shul-watch-rebuild.md, step 5.
//
//   npx tsx scripts/shul-times-dry-run.mts [today] [> out.json]
//
// Newsletters aren't stored, only what they gave: a week on the listing
// that no website posted is taken as the newsletter's read of it.
// It asks the AI for every page. A few cents on the cheapest model.

import { existsSync, writeFileSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.PROD_SUPABASE_URL
const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || !process.env.OPENAI_API_KEY) {
  console.error('Needs PROD_SUPABASE_URL, PROD_SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY.')
  process.exit(1)
}

// Reads only, and made so: anything but a read sent to the live database
// throws before it leaves this process.
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (target.startsWith(url) && method !== 'GET' && method !== 'HEAD') throw new Error(`Dry run: refused ${method} ${target}`)
  return realFetch(input, init)
}) as typeof fetch

process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = key

const { listCategoriesUncached } = await import('../src/lib/categoryStore')
const { normalizeRow } = await import('../src/lib/resourceStore')
const { getAdminClient } = await import('../src/lib/supabase/admin')
const { readListingPage } = await import('../src/lib/listingPageRun')
const { pageReadsFor } = await import('../src/lib/listingPageWatch')
const { readRegular } = await import('../src/lib/scheduleReader')
const { fetchDatesInfo } = await import('../src/lib/dateZmanim')
const { CALENDAR_HEADING } = await import('../src/lib/calendarFeed')
const { readSchedules, regularMinyanim, schedulesKey } = await import('../src/lib/schedules')
const { seasonOf, datesBetween, scheduleDayDates } = await import('../src/lib/scheduleUpdate')
const { fetchPublic } = await import('../src/lib/menuReader')
const { WATCH_FETCH_HEADERS } = await import('../src/lib/websiteWatch')
const { currentSeason } = await import('../src/lib/season')
const { calendarListsUsual, fromReading, partOf, weekFrom } = await import('../src/lib/shulTimes')
import type { DatedTime, Finding, Part, SourceRead } from '../src/lib/shulTimes'
import type { ResourceRow } from '../src/types'

const COMMUNITY = 'philly'
const TODAY = process.argv[2] ?? '2026-11-19'
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const sunday = addDays(TODAY, -new Date(`${TODAY}T12:00:00Z`).getUTCDay())
const WEEKS = [0, 7].map((n) => ({ from: addDays(sunday, n), to: addDays(sunday, n + 6) }))
const ALL = { from: WEEKS[0].from, to: WEEKS.at(-1)!.to }

/** What each shul's newsletter gives most weeks (read Nov 19 from the
 *  listings' weeks since October). The run will keep this itself. */
const NEWSLETTER_GIVES: Record<string, Part[]> = {
  'Mekor Habracha': ['weekdays', 'shabbos'],
  'Temple Beth Zion-Beth Israel': ['weekdays', 'shabbos'],
  'Society Hill Synagogue': ['weekdays', 'shabbos'],
  'Kol Tzedek': ['weekdays', 'shabbos'],
  'The Shtiebel': ['shabbos'],
}

const categories = await listCategoriesUncached(COMMUNITY)
const { data: community } = await getAdminClient().from('community').select('timezone, map_center').eq('slug', COMMUNITY).maybeSingle()
const { timezone, map_center: center } = community as { timezone: string; map_center: { lat: number; lng: number } }
const season = currentSeason(Date.parse(`${TODAY}T17:00:00Z`), timezone)

const { data: watches } = await getAdminClient().from('watch').select('url, resource_id, active').eq('community_id', COMMUNITY).eq('kind', 'website').eq('active', true)
const { data: rows } = await getAdminClient().from('resource').select('*').eq('community_id', COMMUNITY).eq('status', 'approved')
const shuls = (rows as ResourceRow[])
  .map(normalizeRow)
  .flatMap((l) => {
    const c = categories.find((x) => x.id === l.category)
    const reads = c && pageReadsFor(c)
    return reads?.kind === 'times' ? [{ listing: l, key: reads.key }] : []
  })
  .filter(({ listing }) => (watches ?? []).some((w) => w.resource_id === listing.id))

const { data: filed } = await getAdminClient()
  .from('submission')
  .select('target_id, payload, status, created_at, submitted_by')
  .eq('community_id', COMMUNITY)
  .gte('created_at', `${WEEKS[0].from}T00:00:00Z`)

const toDated = (date: string, m: { tefillah: DatedTime['tefillah']; time: string; anchor?: DatedTime['anchor']; offsetMinutes?: number; notes?: string }): DatedTime => ({
  date,
  tefillah: m.tefillah,
  time: m.time,
  ...(m.anchor ? { anchor: m.anchor } : {}),
  ...(m.offsetMinutes != null ? { offsetMinutes: m.offsetMinutes } : {}),
  ...(m.notes ? { notes: m.notes } : {}),
})

const out: unknown[] = []
for (const { listing, key } of shuls) {
  const urls = (watches ?? []).filter((w) => w.resource_id === listing.id).map((w) => w.url as string)
  console.error(`── ${listing.name}: ${urls.join(', ')}`)
  const coords = listing.geo ?? center
  const info = await fetchDatesInfo({ latitude: coords.lat, longitude: coords.lng, timezone }, ALL.from, ALL.to)
  const days = { today: TODAY, days: datesBetween(ALL.from, ALL.to).map((date) => ({ date, names: info.names[date] ?? [] })) }
  const usual = regularMinyanim(listing[key]).filter((m) => !seasonOf(m) || seasonOf(m) === season)
  const schedules = readSchedules(listing[schedulesKey(key)]).filter((s) => s.kind === 'week')
  const datedOf = (s: (typeof schedules)[number]) => s.minyanim.flatMap((m) => m.on.flatMap((d) => scheduleDayDates(d, s)).map((date) => toDated(date, m)))

  const reads: SourceRead[] = []
  const notes: string[] = []
  // The newsletter: a week no website posted.
  for (const s of schedules.filter((s) => !s.postedBy && s.to >= ALL.from && s.from <= ALL.to)) {
    reads.push({ source: { id: `listing:${s.id}`, kind: 'newsletter', label: `Newsletter, as on the listing (“${s.name}”)`, at: s.postedAt ?? s.from }, shape: 'schedule', shows: { from: s.from, to: s.to }, times: datedOf(s) })
  }
  for (const page of urls) {
    // An email address is the newsletter, read above from the listing.
    if (!/^https?:/.test(page)) continue
    let why = ''
    const source = await readListingPage(page, { timezone, pictures: true, now: Date.parse(`${TODAY}T17:00:00Z`), trouble: (t) => (why = JSON.stringify(t)) }).catch((err) => {
      why = err instanceof Error ? err.message : String(err)
      return null
    })
    if (!source) {
      notes.push(`${page}: couldn’t be read${why ? ` (${why})` : ''}`)
      continue
    }
    const at = new Date().toISOString()
    const lastPosted = source.calendar?.services.map((e) => e.date).sort().at(-1)
    // A calendar is the shul's schedule when it lists the usual minyanim;
    // else one of classes and events, whose empty week says nothing.
    const calendarShape = source.calendar && calendarListsUsual(source.calendar.services, usual) ? ('schedule' as const) : ('highlight' as const)
    try {
      if (source.weeks) {
        // A calendar posted as pictures: read together, a week at a time.
        let images: { mime: string; b64: string }[] | null = null
        if (source.pictures?.length) {
          const got = await Promise.all(source.pictures.map((u) => fetchPublic(u, { headers: WATCH_FETCH_HEADERS, pictures: true }).catch(() => null)))
          images = got.flatMap((g) => (g?.type === 'picture' ? [{ mime: g.mime, b64: g.body }] : []))
          if (!images.length) {
            notes.push(`${page}: its calendar's pictures couldn't be opened`)
            continue
          }
        }
        for (const w of source.weeks) {
          // A calendar read mid-week lists from today: it shows those days only.
          const shows = { from: w.from, to: w.to }
          if (!images && !w.lines.length) {
            reads.push({ source: { id: page, kind: 'calendar', label: page, at }, shape: calendarShape, shows, ...(lastPosted ? { lastPosted } : {}), times: [] })
            continue
          }
          const weekDays = { today: TODAY, days: datesBetween(shows.from, shows.to).map((date) => ({ date, names: info.names[date] ?? [] })) }
          const r = await readRegular(images ? { images } : { text: [CALENDAR_HEADING, ...w.lines].join('\n') }, weekDays, listing.name, { apiKey: process.env.OPENAI_API_KEY!, describe: true })
          reads.push(fromReading(r, { id: page, kind: 'calendar', label: page, at }, { week: shows, shows, shape: calendarShape, ...(lastPosted ? { lastPosted } : {}) }))
        }
        continue
      }
      const r = await readRegular(source.text !== null ? { text: source.text } : { pdf: source.pdf! }, days, listing.name, { apiKey: process.env.OPENAI_API_KEY!, describe: true })
      reads.push(fromReading(r, { id: page, kind: r.complete ? 'schedule' : 'page', label: page, at }, { week: ALL }))
    } catch (err) {
      notes.push(`${page}: the AI couldn’t read it (${err instanceof Error ? err.message : String(err)})`)
    }
  }

  const weeks = WEEKS.map((week) => {
    // A part is held when a week on the listing covers its days: one with
    // no minyanim is "no minyan", which isn't the same as holding nothing.
    const partDays = (part: Part) => datesBetween(week.from, week.to).filter((d) => (part === 'shabbos' ? ['fri', 'sat'] : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri']).includes(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${d}T12:00:00Z`).getUTCDay()]))
    const held = (['weekdays', 'shabbos'] as Part[]).flatMap((part) => {
      const days = partDays(part)
      const covering = schedules.filter((s) => s.from <= days.at(-1)! && s.to >= days[0])
      if (!covering.length) return []
      return [{ part, times: covering.flatMap(datedOf).filter((t) => t.date >= week.from && t.date <= week.to && partOf(t) === part) }]
    })
    const ctx = { week, today: TODAY, usual, held, zmanim: info.zmanim, newsletterGives: NEWSLETTER_GIVES[listing.name] }
    // Against an empty listing too, to show what it reads as the week even
    // where it would file nothing because the listing has it already.
    const findings = weekFrom(reads, ctx)
    const fresh = weekFrom(reads, { ...ctx, held: [] })
    return { week, findings, fresh, sources: reads.map((r) => ({ id: r.source.id, kind: r.source.kind, shape: r.shape, heading: r.heading, shows: r.shows, times: r.times.filter((t) => t.date >= week.from && t.date <= week.to).length })) }
  })
  const oldFiled = (filed ?? [])
    .filter((f) => f.target_id === listing.id && (f.submitted_by as { name?: string } | null)?.name)
    .map((f) => ({ at: f.created_at, by: (f.submitted_by as { name?: string }).name, status: f.status, note: (f.payload as { note?: string; message?: string } | null)?.note ?? (f.payload as { message?: string } | null)?.message ?? null }))
  out.push({ name: listing.name, urls, notes, usual: usual.length, weeks, oldFiled })
}

const describe = (f: Finding) =>
  f.do === 'nothing'
    ? `nothing (${f.reason})`
    : f.do === 'take'
      ? `take ${f.whole ? 'whole' : 'matches usual'} from ${f.from.source.kind}: ${f.times.length} times${f.quotes.length ? `; quotes ${f.quotes.join(' / ')}` : ''}`
      : `ask (${f.readAs}, ${f.from.source.kind}): ${f.extra.length} extra, ${f.different.length} different, ${f.missing.length} missing${f.quotes.length ? `; quotes ${f.quotes.join(' / ')}` : ''}`
const file = process.env.DRY_RUN_OUT ?? `shul-times-dry-run-${TODAY}.json`
writeFileSync(file, JSON.stringify(out, null, 2))
for (const s of out as { name: string; notes: string[]; weeks: { week: { from: string }; findings: Finding[] }[]; oldFiled: unknown[] }[]) {
  console.log(`\n${s.name}${s.notes.length ? `  [${s.notes.join('; ')}]` : ''}`)
  for (const w of s.weeks) for (const f of w.findings) console.log(`  ${w.week.from} ${f.part.padEnd(8)} ${describe(f)}`)
  console.log(`  old watch filed since ${WEEKS[0].from}: ${s.oldFiled.length}`)
}
console.error(`\nAll of it: ${file}`)
