import { fetchPublic } from '@/lib/menuReader'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { readRegular } from '@/lib/scheduleReader'
import { fetchDatesInfo } from '@/lib/dateZmanim'
import { CALENDAR_HEADING, calendarWeeks } from '@/lib/calendarFeed'
import { leaveOutHeldElsewhere } from '@/lib/heldElsewhere'
import { currentSeason } from '@/lib/season'
import { applyUpdate, changesAnything, compareTimes, datesBetween, sameTime, seasonOf, weekdayOf, type RegularReading, type TimesUpdate, type UpdateRow } from '@/lib/scheduleUpdate'
import { readSchedules, regularMinyanim, schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { editSubmission } from '@/lib/editSubmission'
import { partsGiven, type PartGiven } from '@/lib/timesParts'
import { timesReadLines } from '@/lib/listingPageWatch'
import { calendarListsUsual, fromReading, weekFrom, type DatedTime, type Finding, type SourceKind, type SourceRead } from '@/lib/shulTimes'
import { heldWeeks, newsletterGives, newsletterReads, scheduleTimes, withFindings } from '@/lib/shulWeekFiling'
import type { CommunityPlace } from '@/lib/shulWeekReading'
import type { CategoryConfig } from '@/lib/categories'
import { parseTimeToMinutes, type Minyan, type Tefillah } from '@/lib/davening'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import type { PageSource } from '@/lib/listingPageRun'

// ── A shul's page, read for its times (the rebuilt watch, Nov 19) ────────────
// docs/shul-watch-rebuild.md. The page is read once, as what it is (a
// calendar, a schedule, a homepage box), and kept as sources
// (shulTimes.ts's SourceRead). With the shul's other pages' last reads and
// its newsletter's weeks, the rule says what each part of this week and
// next is; what this page decides is put on as that part's week
// (shulWeekFiling.ts). Its usual times are compared as they always were.

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const dayIn = (now: number, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now)

/** What a shul's page gave and would change, for the watch to file. */
export type ShulPageReading = {
  read: string[]
  proposal: { submission: ResourceSubmission; lines: string[]; keys: string[]; weekLines: Record<string, string[]> } | null
  note?: string
  parts: PartGiven[]
  /** What it read, as sources, kept on the watch's check for the shul's
   *  other pages to weigh. */
  shulReads: SourceRead[]
}

/** A shul's time comes off only where the page gives that tefillah on that
 *  day. A shul's site splits its times over pages (a weekday minyan's own
 *  page, a Shabbat page), and the AI calls one complete all the same:
 *  Society Hill's Monday-minyan page would have taken its Shabbos times
 *  off (Oct 19). The paste box asks a person, who can Keep it; here no
 *  one is asked. */
export function keepUncovered(update: TimesUpdate): TimesUpdate {
  // In its season, when the page gives both seasons': a page with only
  // winter's Mincha takes no summer Mincha off.
  const read = update.rows.filter((r) => r.status !== 'gone' && r.status !== 'kept')
  const covered = (g: TimesUpdate['rows'][number]) => read.some((r) => r.day === g.day && r.tefillah === g.tefillah && (!r.season || !g.season || r.season === g.season))
  return { ...update, rows: update.rows.map((r) => (r.status === 'gone' && !covered(r) ? { ...r, status: 'kept' } : r)) }
}

const EVENING: readonly Tefillah[] = ['mincha', 'maariv', 'mincha_maariv', 'kabbalas_shabbos']

/** One minyan, whatever the page calls it: Friday night's "Mincha /
 *  Kabbalat Shabbat / Ma'ariv" is the listing's Mincha/Maariv, and a time
 *  the AI couldn't name ("other") is the listing's at that hour. */
function sameMinyanName(a: Tefillah, b: Tefillah): boolean {
  return a === b || a === 'other' || b === 'other' || (EVENING.includes(a) && EVENING.includes(b))
}

/** A row for one season (both seasons' times) is listed only by a minyan
 *  held then: winter's 7:00 PM isn't summer's. */
const sameSeason = (m: Minyan, r: TimesUpdate['rows'][number]) => !r.season || !seasonOf(m) || seasonOf(m) === r.season

/** A time the page gives that the listing already has, that day at that
 *  time, isn't new. A shul's page gives both seasons at once and the
 *  reader compares one, so Mekor Habracha's winter Maariv, on the listing
 *  as winter's, came back as new all week (Oct 19); and the AI names a
 *  minyan its own way. The paste box asks a person; here no one is. */
export function dropListed(update: TimesUpdate, current: readonly Minyan[], schedules: readonly SpecialSchedule[] = []): TimesUpdate {
  const listed = (r: TimesUpdate['rows'][number]) => {
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(r.day)
    const day = dated ? weekdayOf(r.day) : r.day
    return (
      current.some((m) => m.days.includes(day as Minyan['days'][number]) && sameMinyanName(m.tefillah, r.tefillah) && sameTime(m, r) && sameSeason(m, r)) ||
      (dated && schedules.some((s) => s.minyanim.some((m) => m.on.includes(r.day) && sameMinyanName(m.tefillah, r.tefillah) && sameTime(m, r))))
    )
  }
  return { ...update, rows: update.rows.filter((r) => r.status !== 'new' || !listed(r)) }
}

/** What a page with no date says that a page with one says otherwise,
 *  taken out: the page with the date wins (the user, Oct 22, on Sons of
 *  Israel: its calendar gives this Saturday's Shacharis at 9:00, its
 *  Tefillot page 8:30, "since calendar has date and 9am we go with that").
 *  A usual time is held against what a date from today on gives that
 *  weekday, that tefillah; only clock times are, since "15 min before
 *  sunset" can't be held against a date's 5:50 PM, and only a time for
 *  the whole year, since a date is one season's. */
export function yieldToDated(update: TimesUpdate, dated: readonly DatedTime[], today: string): TimesUpdate {
  if (update.kind === 'week' || update.season) return update
  const clock = (time: string) => parseTimeToMinutes(time)
  const given = (r: TimesUpdate['rows'][number]) =>
    dated.filter((d) => d.date >= today && !d.anchor && weekdayOf(d.date) === r.day && sameMinyanName(d.tefillah, r.tefillah)).map((d) => clock(d.time)).filter(Number.isFinite)
  return {
    ...update,
    rows: update.rows.flatMap((r) => {
      if (r.season || r.anchor || !Number.isFinite(clock(r.time))) return [r]
      const times = given(r)
      if (!times.length) return [r]
      if (r.status === 'gone') return [times.includes(clock(r.time)) ? { ...r, status: 'kept' as const } : r]
      if (r.status === 'changed' || r.status === 'new') return times.includes(clock(r.time)) ? [r] : []
      return [r]
    }),
  }
}

/** A reading's weekday-only times put on the week it's about: a page that
 *  says "this week" by weekday ("Mon–Fri 7:00") gives dates. */
function onItsWeek(r: RegularReading, week: { from: string; to: string }): RegularReading {
  if (r.kind !== 'week') return r
  const from = r.from ?? week.from
  const to = r.to ?? week.to
  const dates = datesBetween(from, to)
  return { ...r, from, to, times: r.times.flatMap((t) => (t.date ? [t] : dates.filter((d) => t.days.includes(weekdayOf(d))).map((date) => ({ ...t, date })))) }
}

const DATED_HELD = 'Some usual times differ from what a date gives, and the date wins.'

/** "Their newsletter usually gives Shabbos, so this page waits for it." */
function waitingNote(findings: readonly Finding[]): string | null {
  const parts = [...new Set(findings.flatMap((f) => (f.do === 'nothing' && f.reason === 'waiting' ? [f.part] : [])))]
  if (!parts.length) return null
  const what = parts.length === 2 ? 'the week' : parts[0] === 'shabbos' ? 'Shabbos' : 'the weekdays'
  return `Their newsletter usually gives ${what}, so what this page says of it waits for it.`
}

/**
 * Reads a shul's page with the AI and decides what it files, against the
 * listing as it is now. `otherReads`: the shul's other pages' last reads.
 * `waiting`: weeks waiting in To do that no website posted (the
 * newsletter's), which win as the listing's do.
 */
export async function readShulPage(
  listing: DirectoryResource,
  category: CategoryConfig,
  key: string,
  source: PageSource,
  url: string,
  {
    apiKey,
    where,
    now = Date.now(),
    fetchImpl,
    others,
    otherReads = [],
    waiting = [],
    newId = () => crypto.randomUUID(),
  }: {
    apiKey: string
    where: CommunityPlace
    now?: number
    fetchImpl?: typeof fetch
    others?: () => Promise<readonly DirectoryResource[]>
    otherReads?: readonly SourceRead[]
    waiting?: readonly SpecialSchedule[]
    newId?: () => string
  },
): Promise<ShulPageReading> {
  const { timezone } = where
  const today = dayIn(now, timezone)
  const weeks = calendarWeeks(today).map((w) => ({ from: w.sunday, to: addDays(w.sunday, 6) }))
  const span = { from: weeks[0].from, to: weeks.at(-1)!.to }
  const coords = listing.geo ?? where.mapCenter
  const info = await fetchDatesInfo({ latitude: coords.lat, longitude: coords.lng, timezone }, span.from, span.to)
  const days = (from: string, to: string) => ({ today, days: datesBetween(from, to).map((date) => ({ date, names: info.names[date] ?? [] })) })
  const sk = schedulesKey(key)
  let minyanim = regularMinyanim(listing[key])
  let schedules = readSchedules(listing[sk])
  const season = currentSeason(now, timezone)
  const usual = minyanim.filter((m) => !seasonOf(m) || !season || seasonOf(m) === season)
  const at = new Date(now).toISOString()
  const src = (kind: SourceKind) => ({ id: url, kind, label: url, at })
  const elsewhere: string[] = []
  const notHeldElsewhere = async (r: RegularReading): Promise<RegularReading> => {
    const { times, left } = await leaveOutHeldElsewhere(r.times, { shulId: listing.id, key, zmanim: info.zmanim, others })
    elsewhere.push(...left)
    return { ...r, times }
  }

  const reads: SourceRead[] = []
  let usualUpdate: TimesUpdate | null = null
  if (source.weeks) {
    // A calendar: a week at a time. It is the shul's schedule when it
    // lists the usual minyanim, else its classes and events.
    const shape = source.calendar && calendarListsUsual(source.calendar.services, usual) ? ('schedule' as const) : ('highlight' as const)
    const lastPosted = source.calendar?.services.map((e) => e.date).sort().at(-1)
    let images: { mime: string; b64: string }[] | null = null
    if (source.pictures?.length) {
      const got = await Promise.all(source.pictures.map((u) => fetchPublic(u, { fetchImpl, headers: WATCH_FETCH_HEADERS, pictures: true }).catch(() => null)))
      images = got.flatMap((g) => (g?.type === 'picture' ? [{ mime: g.mime, b64: g.body }] : []))
      if (!images.length) return { read: [], proposal: null, note: 'Their calendar’s pictures couldn’t be opened.', parts: [], shulReads: [] }
    }
    for (const w of source.weeks) {
      // Read mid-week, a calendar lists from today: it shows those days.
      const shows = { from: w.from, to: w.to }
      const extra = lastPosted ? { lastPosted } : {}
      if (!images && !w.lines.length) {
        reads.push({ source: src('calendar'), shape, shows, ...extra, times: [] })
        continue
      }
      const r = await readRegular(images ? { images } : { text: [CALENDAR_HEADING, ...w.lines].join('\n') }, days(shows.from, shows.to), listing.name, { apiKey, fetchImpl, describe: true })
      const got = fromReading(await notHeldElsewhere(r), src('calendar'), { week: shows, shows, shape, ...extra })
      // The calendar's join links onto its times, by code: a time on a
      // date the calendar links, at that time (calendarJoins).
      const joins = w.joins ?? []
      const linked = got.times.map((t) => {
        const join = joins.find((j) => j.date === t.date && parseTimeToMinutes(j.time) === parseTimeToMinutes(t.time))
        return join && !t.joinLink ? { ...t, joinLink: join.link } : t
      })
      reads.push({ ...got, times: linked })
    }
  } else {
    const raw = await readRegular(source.text !== null ? { text: source.text } : { pdf: source.pdf! }, days(span.from, span.to), listing.name, { apiKey, fetchImpl, describe: true })
    const r = onItsWeek(await notHeldElsewhere(raw), { from: today, to: weeks[0].to })
    reads.push(fromReading(r, src(r.complete ? 'schedule' : 'page'), { week: span }))
    // Its usual times, compared as they always were: never a calendar's.
    const undated = r.times.filter((t) => !t.date)
    if (r.kind === 'schedule' && undated.length) usualUpdate = compareTimes(minyanim, { ...r, times: undated }, { season, zmanim: info.zmanim })
  }

  const changes: string[] = []
  let heldByDate = false
  if (usualUpdate) {
    // A date this page, another of the shul's or a week on the listing
    // gives wins over a usual time that says otherwise.
    const onDates = [...reads, ...otherReads].flatMap((r) => r.times).concat([...schedules, ...waiting].filter((s) => s.kind === 'week').flatMap(scheduleTimes))
    const listed = dropListed(keepUncovered(usualUpdate), minyanim, schedules)
    const update = yieldToDated(listed, onDates, today)
    if (update.rows.length < listed.rows.length || update.rows.some((r, i) => r.status !== listed.rows[i]?.status)) heldByDate = true
    if (changesAnything(update)) {
      const posted = applyUpdate(minyanim, schedules, update, { postedBy: 'website' })
      minyanim = posted.minyanim
      changes.push(...posted.changes)
    }
  }

  // This week and next, by the rule, with the shul's other sources.
  const weekLines: Record<string, string[]> = {}
  const decided: Finding[] = []
  const gives = newsletterGives(schedules, today)
  for (const week of weeks) {
    const sources = [...reads, ...otherReads.filter((r) => r.source.id !== url), ...newsletterReads([...schedules, ...waiting], week)]
    const ctx = { week, today, usual, held: heldWeeks([...schedules, ...waiting], week), zmanim: info.zmanim, newsletterGives: gives }
    const findings = weekFrom(sources, ctx)
    const mine = findings.filter((f) => f.do === 'nothing' || f.from.source.id === url)
    decided.push(...mine.filter((f) => f.do === 'nothing' && reads.some((r) => r.times.some((t) => t.date >= week.from && t.date <= week.to))))
    const put = withFindings(schedules, mine, ctx, { now, newId })
    schedules = put.schedules
    Object.assign(weekLines, put.lines)
    for (const lines of Object.values(put.lines)) changes.push(...lines)
  }

  const dated = reads.flatMap((r) => r.times.filter((t) => t.date >= span.from && t.date <= span.to))
  const row = (t: (typeof dated)[number]): UpdateRow => ({ id: '', day: t.date, tefillah: t.tefillah, time: t.time, status: 'new' })
  const read = [...timesReadLines(usualUpdate?.rows ?? []), ...timesReadLines(dated.map(row))]
  const parts = [...partsGiven(usualUpdate ? [usualUpdate] : []), ...(dated.length ? [{ part: 'week' as const, size: dated.length }] : [])]
  const note = [waitingNote(decided), heldByDate ? DATED_HELD : null, ...elsewhere.map((l) => `${l}.`)].filter(Boolean).join(' ') || undefined
  const proposal = changes.length ? { submission: editSubmission(category, listing, { [key]: minyanim, [sk]: schedules }), lines: changes, keys: [key, sk], weekLines } : null
  // Kept only when it says something of a date: a calendar's empty week
  // does, a page of usual times doesn't.
  const shulReads = reads.filter((r) => r.times.length || r.cancelled?.length || r.source.kind === 'calendar')
  return { read, proposal, ...(note ? { note } : {}), parts, shulReads }
}
