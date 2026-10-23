import { getAdminClient } from '@/lib/supabase/admin'
import { community as communityConfig } from '@/community.config'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, listApprovedResources, normalizeRow } from '@/lib/resourceStore'
import { fetchPublic, htmlToText, type MenuSource } from '@/lib/menuReader'
import { menuHash } from '@/lib/menuWatch'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { readShulWeek } from '@/lib/shulWeekReading'
import { calendarPictures } from '@/lib/calendarPictures'
import { hasDaveningTimes } from '@/lib/hoursJob'
import type { ScheduleSource } from '@/lib/scheduleReader'
import {
  CALENDAR_HEADING,
  MAX_FEED_BYTES,
  calendarFeeds,
  calendarJoins,
  calendarLines,
  calendarWeeks,
  embeddedEntries,
  eventPagesToOpen,
  icsEntries,
  isIcs,
  isServiceTitle,
  joinLinkIn,
  withJoinLinks,
  type CalendarEntry,
  type CalendarWeek,
} from '@/lib/calendarFeed'
import { applyUpdate, changesAnything, datesBetween, datesHeldOverWebsite, sameTime, seasonOf, weekdayOf, type TimesUpdate } from '@/lib/scheduleUpdate'
import { dateText, readSchedules, regularMinyanim, schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { buildCatalog, readMessage } from '@/lib/messageReader'
import { fieldsEdit, readFieldChanges } from '@/lib/fieldChanges'
import { editSubmission } from '@/lib/editSubmission'
import { replacePendingSuggestion, submitListingUpdate } from '@/lib/submissionStore'
import { TIMES_PART_LABELS, partKey, partLines, partSize, partsGiven, readPartSource, splitParts, type PartGiven, type PartReading, type PartSource } from '@/lib/timesParts'
import { hoursSections, readSectionSource, splitSections, type HoursSection, type SectionSource } from '@/lib/hoursSections'
import { CONTACT_SECTION, contactBoxName, contactFields, googleKeeps, pageContacts, readContacts, type ContactField, type ContactReading, type PageContacts } from '@/lib/contactRead'
import { sendWatchDigest } from '@/lib/email'
import { jobPageFor } from '@/lib/watchFindings'
import type { MenuReadBudget } from '@/lib/menuWatchRun'
import type { CategoryConfig } from '@/lib/categories'
import type { Watch, WatchCheck, WatchOutcome } from '@/lib/watches'
import { parseTimeToMinutes, type Minyan, type Tefillah } from '@/lib/davening'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import {
  changedOn,
  checkFrom,
  filedBefore,
  hoursNowIntro,
  hoursReadLines,
  hoursReads,
  LISTING_PAGE_FOUND_CREATOR,
  LISTING_PAGE_WATCH_NAME,
  listingPageNote,
  listingPageSource,
  MAX_PAGE_TEXT,
  NOTES_READ_FROM,
  pageCheck,
  pageReadsFor,
  sameNoteAsListed,
  suggestionKey,
  timesReadLines,
  type PageReads,
} from '@/lib/listingPageWatch'

// A listing's own page: its database and network half (listingPageWatch.ts
// has the rules). Run daily by /api/cron/watches for every listing-page
// watch, and on demand from the admin Watches tab. Server-only.

/** A page as the readers take it: its text, a line per block, or a PDF,
 *  and when it has a calendar, its weeks (calendarWeeks), each read on its
 *  own for the shul's times. A calendar posted as pictures has its
 *  pictures' addresses (`pictures`), fetched only when the AI reads them. */
export type PageSource = MenuSource & { weeks?: CalendarWeek[]; contacts?: PageContacts; calendarEmpty?: CalendarEmpty; calendar?: CalendarRead }

/** A calendar found on the page and read: the weeks it was read for, and
 *  its services from the first of them through two months on, to tell
 *  whether it's the shul's whole schedule (calendarIsWhole). */
export type CalendarRead = { weeks: Omit<CalendarWeek, 'lines'>[]; services: CalendarEntry[] }

/** Whether a calendar is the shul's whole schedule: it lists each of the
 *  shul's usual minyanim on a date, that weekday, at that time (within 15
 *  minutes). The Little Shul's "Sabbath Service, 10:00 AM" on the first
 *  Shabbos of the month is its usual Shabbos 10:00am; a calendar of
 *  classes and events beside a daily minyan never lists that minyan, and
 *  an empty week there says nothing about it. A usual time set by a zman
 *  can't be held against a date's clock time, so it never is. */
export function calendarIsWhole(services: readonly CalendarEntry[], usual: readonly Minyan[]): boolean {
  if (!usual.length) return false
  return usual.every((m) => {
    const at = parseTimeToMinutes(m.time)
    if (m.anchor || !Number.isFinite(at)) return false
    return services.some((e) => {
      const t = e.time ? parseTimeToMinutes(e.time) : NaN
      return m.days.includes(weekdayOf(e.date)) && Number.isFinite(t) && Math.abs(t - at) <= 15
    })
  })
}

/** "No minyan Oct 18–24 (their calendar)": a week the calendar has no
 *  services in, read as such, which "nothing read" isn't. */
const noMinyanLine = (w: Pick<CalendarWeek, 'from' | 'to'>) => `No minyan ${weekText(w)} (their calendar)`

/** A calendar with no services in the weeks it's read for, and its next
 *  one: the Little Shul's, which meets the first Shabbos of the month,
 *  read as "can't find times" for the weeks between (the user, Oct 23). */
export type CalendarEmpty = { from: string; to: string; next: CalendarEntry | null }

/** How far ahead a calendar with nothing in its weeks is looked at for
 *  its next service: two months, a monthly minyan's next and then some. */
const NEXT_SERVICE_DAYS = 62

/** "Their calendar has no services Oct 18 – Oct 31. Next: Sat Nov 7,
 *  10:00 AM, Sabbath Service." */
export function calendarEmptyNote({ from, to, next }: CalendarEmpty): string {
  const none = `Their calendar has no services ${dateText(from)} – ${dateText(to)}.`
  return next ? `${none} Next: ${dateText(next.date, { weekday: true })}${next.time ? `, ${next.time}` : ''}, ${next.title}.` : `${none} None in the two months after either.`
}

/** A page as the readers take it. Without its menus (<nav>): a shul
 *  site's runs to thousands of words, crowding out the times in what the
 *  AI is given, and a new menu item isn't a change to the page.
 *  `pictures`: a shul's page, whose calendar may be posted as pictures. */
export async function readListingPage(url: string, opts: { fetchImpl?: typeof fetch; now?: number; pictures?: boolean } = {}): Promise<PageSource | null> {
  const page = await fetchPublic(url, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS })
  if (!page) return null
  if (page.type === 'pdf') return { url: page.url, text: null, pdf: page.body }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: communityConfig.timezone }).format(new Date(opts.now ?? Date.now()))
  const weeks = calendarWeeks(today)
  // From this week's Sunday, so the text is the same all week (withCalendar).
  const [first, last] = [weeks[0].sunday, weeks.at(-1)!.to]
  // The watch's address may be the calendar feed itself.
  const after = (n: number) => new Date(Date.parse(`${last}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const services = (all: readonly CalendarEntry[]) => all.filter((e) => e.date >= first && e.date <= after(NEXT_SERVICE_DAYS) && e.time && isServiceTitle(e.title))
  if (isIcs(page.body)) {
    const got = withCalendar(page.url, '', await withEventJoins(icsEntries(page.body, communityConfig.timezone, first, last), today, last, opts.fetchImpl), weeks, true)
    return got && { ...got, calendar: { weeks, services: services(icsEntries(page.body, communityConfig.timezone, first, after(NEXT_SERVICE_DAYS))) } }
  }
  // A calendar on the page: its feed (the first that reads) or the event
  // list in its scripts (calendarFeed.ts), ahead of the page's own words.
  let entries = embeddedEntries(page.body, communityConfig.timezone)
  let feedBody: string | null = null
  for (const feed of calendarFeeds(page.body, page.url).slice(0, 2)) {
    const got = await fetchPublic(feed, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS, maxBytes: MAX_FEED_BYTES })
    if (got?.type === 'html' && isIcs(got.body)) {
      entries = icsEntries(got.body, communityConfig.timezone, first, last)
      feedBody = got.body
      break
    }
  }
  // A calendar there, read: its feed, or the events in its scripts.
  const calendar: CalendarRead | null =
    feedBody !== null ? { weeks, services: services(icsEntries(feedBody, communityConfig.timezone, first, after(NEXT_SERVICE_DAYS))) } : entries.length ? { weeks, services: services(entries) } : null
  const calendarEmpty: CalendarEmpty | null =
    feedBody !== null && !calendarLines(entries, first, last).length
      ? { from: first, to: last, next: icsEntries(feedBody, communityConfig.timezone, after(1), after(NEXT_SERVICE_DAYS)).find((e) => isServiceTitle(e.title)) ?? null }
      : null
  entries = await withEventJoins(entries, today, last, opts.fetchImpl)
  const text = htmlToText(page.body.replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, ' '))
  // Its phones and emails, read by code (contactRead.ts): in its words and
  // its tel: and mailto: links, its menus' included.
  const contacts = pageContacts(htmlToText(page.body), page.body)
  // No calendar and no davening time in its words: the month may be
  // posted as pictures (calendarPictures). A page that gives its times in
  // words is read for them, whatever its pictures are called.
  if (opts.pictures && !calendarLines(entries, first, last).length && !hasDaveningTimes(text)) {
    const pictures = calendarPictures(page.body, page.url, weeks.flatMap((w) => [w.sunday, w.to]))
    if (pictures.length) return { ...withPictures(page.url, text, pictures, weeks), contacts }
  }
  const got = withCalendar(page.url, text, entries, weeks, calendar !== null)
  return got && { ...got, contacts, ...(calendarEmpty ? { calendarEmpty } : {}), ...(calendar ? { calendar } : {}) }
}

/** The calendar's services with the join links their own pages give: a
 *  few pages a read (eventPagesToOpen), from today on. Rodeph Shalom's
 *  Zoom link is only on its minyan's page (the user, Oct 22). A page that
 *  can't be opened, or gives none or several, leaves its entries as they
 *  were. */
async function withEventJoins(entries: CalendarEntry[], from: string, to: string, fetchImpl?: typeof fetch): Promise<CalendarEntry[]> {
  const pages = eventPagesToOpen(entries, from, to)
  if (!pages.length) return entries
  const found = new Map<string, string>()
  await Promise.all(
    pages.map(async (url) => {
      const got = await fetchPublic(url, { fetchImpl, headers: WATCH_FETCH_HEADERS }).catch(() => null)
      const join = got?.type === 'html' ? joinLinkIn(got.body) : null
      if (join) found.set(url, join)
    }),
  )
  return entries.map((e) => (!e.join && e.url && found.has(e.url) ? { ...e, join: found.get(e.url)! } : e))
}

/** What heads a page's calendar's join links in its text. */
export const JOINS_HEADING = 'Join links:'

/** What heads a page whose calendar is pictures. */
export const PICTURES_HEADING = 'Their calendar, as pictures, read a week at a time:'

/** A page whose calendar is pictures. Its text names the pictures and the
 *  weeks they're read for, from each week's Sunday, so its fingerprint
 *  (menuHash) changes when a picture is replaced, on a Sunday, and on the
 *  Thursday next week is added, as a calendar's text does (withCalendar):
 *  each week is read in its turn. */
function withPictures(url: string, text: string, pictures: string[], weeks: Omit<CalendarWeek, 'lines'>[]): PageSource {
  return {
    url,
    text: [PICTURES_HEADING, ...pictures, `Weeks from ${weeks.map((w) => w.sunday).join(', ')}`, '', text].join('\n').trim(),
    pdf: null,
    pictures,
    weeks: weeks.map((w) => ({ ...w, lines: [] })),
  }
}

/** The page as the readers take it: its calendar's entries for the weeks
 *  it's read for, when it has any, then its words. A page with neither
 *  isn't readable. Its text has the whole of each week from its Sunday,
 *  so it reads the same all week (its fingerprint, menuHash) and changes
 *  when the calendar does, on a Sunday, and on the Thursday next week is
 *  added. */
function withCalendar(url: string, text: string, entries: CalendarEntry[], weeks: Omit<CalendarWeek, 'lines'>[], found = false): PageSource | null {
  const lines = calendarLines(entries, weeks[0].sunday, weeks.at(-1)!.to)
  if (lines.length) {
    // Its join links in its text too, so a new one changes its fingerprint
    // and is read; the reader is given its lines alone (readCalendarWeeks).
    const joins = calendarJoins(entries, weeks[0].sunday, weeks.at(-1)!.to).map((j) => `${j.date} ${j.time}: ${j.link}`)
    return {
      url,
      text: [CALENDAR_HEADING, ...lines, ...(joins.length ? ['', JOINS_HEADING, ...joins] : []), '', text].join('\n').trim(),
      pdf: null,
      weeks: weeks.map((w) => {
        const joins = calendarJoins(entries, w.from, w.to)
        return { ...w, lines: calendarLines(entries, w.from, w.to), ...(joins.length ? { joins } : {}) }
      }),
    }
  }
  // A calendar with nothing in its weeks: said, so the page reads anew each
  // week (its fingerprint) and an empty week is read as one.
  if (found) return { url, text: [`Their calendar has nothing ${weeks[0].sunday} – ${weeks.at(-1)!.to}.`, '', text].join('\n').trim(), pdf: null }
  return text.length >= 200 ? { url, text, pdf: null } : null
}

/** What the page would change on the listing: the edit and its lines, or
 *  nothing (it agrees, the newsletter has those days, the AI found none). */
export type PageProposal = { submission: ResourceSubmission; lines: string[]; keys: string[] } | null

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
    // A dated time (a calendar's Shabbos service) is listed when it's the
    // usual time that weekday, or already on a schedule for that date.
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(r.day)
    const day = dated ? weekdayOf(r.day) : r.day
    return (
      current.some((m) => m.days.includes(day as Minyan['days'][number]) && sameMinyanName(m.tefillah, r.tefillah) && sameTime(m, r) && sameSeason(m, r)) ||
      (dated && schedules.some((s) => s.minyanim.some((m) => m.on.includes(r.day) && sameMinyanName(m.tefillah, r.tefillah) && sameTime(m, r))))
    )
  }
  return { ...update, rows: update.rows.filter((r) => r.status !== 'new' || !listed(r)) }
}

/** What the website gives for days the shul's newsletter (or a person)
 *  has already given a week for, taken out: the newsletter wins on any day
 *  both give (the user, Oct 20). A website is usually the one behind. A
 *  week of the website's keeps its other days. Null when no day is left. */
export function yieldToNewsletter(update: TimesUpdate, schedules: readonly SpecialSchedule[]): TimesUpdate | null {
  const held = datesHeldOverWebsite(schedules)
  const rows = update.rows.filter((r) => !held.has(r.day))
  if (update.kind !== 'week' || !update.from || !update.to) return { ...update, rows }
  const left = datesBetween(update.from, update.to).filter((d) => !held.has(d))
  return left.length ? { ...update, from: left[0], to: left.at(-1)!, rows } : null
}

/** A time a page gives on a date: a calendar's week, on the listing, in
 *  the queue or read just now. */
export type DatedTime = { on: string; tefillah: Tefillah; time: string; anchor?: unknown }

/** The dated times in a listing's weeks (and a week waiting), a row each. */
export const datedTimes = (schedules: readonly SpecialSchedule[]): DatedTime[] =>
  schedules.filter((s) => s.kind === 'week').flatMap((s) => s.minyanim.flatMap((m) => m.on.map((on) => ({ on, tefillah: m.tefillah, time: m.time, anchor: m.anchor }))))

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
    dated.filter((d) => DATE.test(d.on) && d.on >= today && !d.anchor && weekdayOf(d.on) === r.day && sameMinyanName(d.tefillah, r.tefillah)).map((d) => clock(d.time)).filter(Number.isFinite)
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
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** What the AI read off the page, a short line each (listingPageWatch.ts),
 *  and what it would change on the listing. `note` says when the
 *  newsletter's days were left to the newsletter. */
export type PageReading = { read: string[]; proposal: PageProposal; note?: string; unread?: string[]; parts?: PartGiven[] }

const NEWSLETTER_HELD = 'Some days differ, but the newsletter has given those days, and it wins.'
const DATED_HELD = 'Some usual times differ from what their calendar gives on a date, and the date wins.'

/** "2026-10-22", the community's day. */
const dayIn = (now: number) => new Intl.DateTimeFormat('en-CA', { timeZone: communityConfig.timezone }).format(now)

/** "Oct 25–31". */
function weekText(w: Pick<CalendarWeek, 'from' | 'to'>): string {
  const [fromMonth, fromDay] = dateText(w.from).split(' ')
  const [toMonth, toDay] = dateText(w.to).split(' ')
  return w.from === w.to ? dateText(w.from) : `${fromMonth} ${fromDay}–${toMonth === fromMonth ? toDay : `${toMonth} ${toDay}`}`
}

/** A result's lines that change the listing. */
const changing = (u: TimesUpdate | null) => (u ? u.rows.filter((r) => r.status === 'changed' || r.status === 'new' || (r.status === 'gone' && !r.keep)).length : 0)

/** A page's words read for the shul's times (readPageFor), usual and
 *  dated, against the listing as it is now. */
async function readTimesText(
  listing: DirectoryResource,
  category: CategoryConfig,
  key: string,
  source: PageSource,
  text: string | null,
  { apiKey, now, dated, others }: { apiKey: string; now: number; dated: readonly DatedTime[]; others?: () => Promise<readonly DirectoryResource[]> },
): Promise<PageReading> {
  // The shul's times (scheduleUpdate.ts): its usual ones, and since Oct 20
  // the dated ones too, a week's, filed as that week's times. What the
  // newsletter has given for the same days wins. A page with a calendar
  // is read as its calendar's weeks (readCalendarWeeks): a usual time is
  // one the shul states, never one the guide works out from its calendar
  // (the user, Oct 20, on Leyv Ha-Ir's monthly services).
  // Its dated times go on as their week's schedule, apart from its usual
  // times (datedAsWeeks).
  const read = await readShulWeek(listing, key, text !== null ? { text } : { pdf: source.pdf! }, apiKey, { others })
  const sk = schedulesKey(key)
  let minyanim = regularMinyanim(listing[key])
  let schedules = readSchedules(listing[sk])
  const lines = timesReadLines(read.update.rows)
  const parts = partsGiven(read.updates)
  const changes: string[] = []
  let held = false
  let heldByDate = false
  // What a date gives: the listing's weeks, one waiting, and this page's own.
  const today = dayIn(now)
  const datedRead = read.updates.flatMap((u) => (u.kind === 'week' ? u.rows.filter((r) => r.status !== 'gone' && r.status !== 'kept').map((r) => ({ on: r.day, tefillah: r.tefillah, time: r.time, anchor: r.anchor })) : []))
  const onDates = [...datedTimes(schedules), ...dated, ...datedRead]
  for (const u of read.updates) {
    const week = u.kind === 'week'
    // A week's own times stay in it: one the listing has that weekday
    // still belongs to that week's schedule.
    const listed = week ? keepUncovered(u) : dropListed(keepUncovered(u), minyanim, schedules)
    const own = yieldToDated(listed, onDates, today)
    if (changing(own) < changing(listed)) heldByDate = true
    const update = yieldToNewsletter(own, schedules)
    if (changing(update) < changing(own)) held = true
    if (!update || !changesAnything(update)) continue
    const applied = applyUpdate(minyanim, schedules, update, { postedBy: 'website' })
    if (applied.changes.length === 0) continue
    // Already on the listing as it would be (read again the next day).
    if (suggestionKey({ [key]: applied.minyanim, [sk]: applied.schedules }, [key, sk]) === suggestionKey({ [key]: minyanim, [sk]: schedules }, [key, sk])) continue
    minyanim = applied.minyanim
    schedules = applied.schedules
    changes.push(...applied.changes)
  }
  const note = [held ? NEWSLETTER_HELD : null, heldByDate ? DATED_HELD : null, ...read.elsewhere.map((l) => `${l}.`)].filter(Boolean).join(' ') || undefined
  if (changes.length === 0) return { read: lines, proposal: null, note, parts }
  return {
    read: lines,
    proposal: { submission: editSubmission(category, listing, { [key]: minyanim, [sk]: schedules }), lines: changes, keys: [key, sk] },
    note,
    parts,
  }
}

/** Has the AI read the page for the listing, and compares what it read
 *  with the listing as it is now. */
export async function readPageFor(
  listing: DirectoryResource,
  category: CategoryConfig,
  reads: PageReads,
  source: PageSource,
  {
    apiKey,
    communityName,
    fetchImpl,
    now = Date.now(),
    dated = [],
    others,
  }: {
    apiKey: string
    communityName: string
    fetchImpl?: typeof fetch
    now?: number
    /** Dated times waiting in the queue (a calendar's week another page
     *  filed): they win over this page's usual times too (yieldToDated). */
    dated?: readonly DatedTime[]
    /** The guide's listings, for a minyan the page says is at another
     *  shul (heldElsewhere.ts). */
    others?: () => Promise<readonly DirectoryResource[]>
  },
): Promise<PageReading> {
  const text = source.text?.slice(0, MAX_PAGE_TEXT) ?? null
  if (reads.kind === 'times' && source.weeks && source.pictures?.length) {
    // A calendar posted as pictures, read together, a week at a time.
    const got = await Promise.all(source.pictures.map((u) => fetchPublic(u, { fetchImpl, headers: WATCH_FETCH_HEADERS, pictures: true }).catch(() => null)))
    const images = got.flatMap((g) => (g?.type === 'picture' ? [{ mime: g.mime, b64: g.body }] : []))
    if (!images.length) return { read: [], proposal: null, note: 'Their calendar’s pictures couldn’t be opened.' }
    return readCalendarWeeks(listing, category, reads.key, source.weeks, apiKey, () => ({ images }), others)
  }
  // A calendar that is the shul's whole schedule: its weeks as whole weeks,
  // and one with no services is no minyan (noMinyanWeeks).
  const whole = reads.kind === 'times' && !!source.calendar && calendarIsWhole(source.calendar.services, regularMinyanim(listing[reads.key]))
  if (reads.kind === 'times' && source.weeks) {
    const words = (w: CalendarWeek) => (w.lines.length ? { text: [CALENDAR_HEADING, ...w.lines].join('\n') } : null)
    const got = await readCalendarWeeks(listing, category, reads.key, source.weeks, apiKey, words, others, whole)
    return whole ? noMinyanWeeks(got, listing, category, reads.key, source.calendar!) : got
  }
  if (reads.kind === 'times') {
    const got = await readTimesText(listing, category, reads.key, source, text, { apiKey, now, dated, others })
    return whole ? noMinyanWeeks(got, listing, category, reads.key, source.calendar!) : got
  }
  // Weekly hours: the any-field reader (messageReader.ts), told only of this
  // listing, and only its hours kept.
  const intro = hoursNowIntro(listing.name, category, reads.keys, listing, reads.notes)
  // Only the hours fields it reads are offered (pageReadsFor).
  const offered = { ...category, detailFields: category.detailFields.filter((f) => f.type !== 'hours' || reads.keys.includes(f.key)) }
  const reading = await readMessage(
    {
      text: text !== null ? `${intro ? `${intro}\n\n` : ''}${listing.name}’s own web page (${source.url ?? ''}), as it reads today:\n\n${text}` : intro ?? '',
      images: source.pdf ? [{ mime: 'application/pdf', b64: source.pdf }] : [],
    },
    buildCatalog([listing], [offered]),
    { apiKey, communityName, about: listing.id, fetchImpl },
  )
  const changes = sameNoteAsListed(hoursReads(reading.proposals, listing.id, reads.keys, reads.notes), reads.notes, listing)
  const lines = hoursReadLines(changes, category)
  if (changes.length === 0) return { read: lines, proposal: null }
  const { values, unread } = readFieldChanges(category, listing, changes)
  const { submission, lines: edits } = fieldsEdit(category, listing, values)
  return { read: lines, proposal: edits.length ? { submission, lines: edits, keys: [...reads.keys, ...reads.notes] } : null, ...(unread.length ? { unread } : {}) }
}

/** A calendar's week's name: the whole week, so reading it again on a
 *  later day merges with it (mergeSchedule). */
const weekName = (w: Pick<CalendarWeek, 'sunday' | 'to'>) => `Times for ${dateText(w.sunday)} – ${dateText(w.to)}`

/**
 * The weeks a whole calendar (calendarIsWhole) has no services in, on top
 * of what was read: each posted as the shul's whole week with no minyan,
 * through the queue like any week, and said in what was read ("No minyan
 * Oct 18–24 (their calendar)"), which is reading nothing apart. A week
 * the newsletter (or a person) has given days of is left to it; one
 * already on the listing as no minyan files nothing.
 */
export function noMinyanWeeks(reading: PageReading, listing: DirectoryResource, category: CategoryConfig, key: string, calendar: CalendarRead, now = Date.now()): PageReading {
  const sk = schedulesKey(key)
  const details = reading.proposal?.submission.details ?? listing
  let minyanim = regularMinyanim(details[key])
  let schedules = readSchedules(details[sk])
  const before = suggestionKey({ [key]: regularMinyanim(listing[key]), [sk]: readSchedules(listing[sk]) }, [key, sk])
  const read = [...reading.read]
  const lines = [...(reading.proposal?.lines ?? [])]
  const held = datesHeldOverWebsite(schedules)
  for (const w of calendar.weeks) {
    if (calendar.services.some((e) => e.date >= w.from && e.date <= w.to)) continue
    read.push(noMinyanLine(w))
    if (datesBetween(w.from, w.to).some((d) => held.has(d))) continue
    const empty = { kind: 'week' as const, complete: true, season: null, title: null, startsOn: null, from: w.from, to: w.to, rows: [] }
    const applied = applyUpdate(minyanim, schedules, empty, { postedBy: 'website', name: weekName(w), whole: true, now })
    // Already on the listing as no minyan (read again the next day).
    const was = readSchedules(listing[sk]).find((s) => s.name === weekName(w))
    if (was?.whole && !was.minyanim.length && was.from <= w.from && was.to >= w.to) continue
    minyanim = applied.minyanim
    schedules = applied.schedules
    lines.push(...applied.changes)
  }
  const proposal =
    suggestionKey({ [key]: minyanim, [sk]: schedules }, [key, sk]) === before
      ? null
      : { submission: editSubmission(category, listing, { [key]: minyanim, [sk]: schedules }), lines, keys: [key, sk] }
  return { ...reading, read, proposal }
}

/**
 * A calendar's weeks (calendarWeeks), each read on its own as that week's
 * schedule (the user, Oct 20): every time it gives on its dates, the ones
 * that match the usual times too, and a usual minyan it doesn't mention
 * kept (keepUncovered). Filed even when it all matches: a week the shul's
 * calendar gives is "confirmed this week's schedule", which usual times
 * aren't. Through the queue all the same ("everything through the queue").
 *
 * A calendar that is events, not services (Leyv Ha-Ir's monthly
 * Kabbalat Shabbat), has none of the shul's usual minyanim in its week:
 * then only what differs goes on, each on its date, as well as the usual
 * times, and the watch says so. A week already on the listing as it would
 * be (read again on the Thursday) files nothing; the newsletter keeps its
 * days (yieldToNewsletter). `sourceFor`: what's read for a week, its
 * calendar's lines or the calendar's pictures, or nothing that week.
 *
 * A calendar that is the shul's whole schedule (`whole`, calendarIsWhole)
 * is read as that: a usual minyan its week doesn't give isn't held that
 * week, and a week with no services at all is no minyan (noMinyanWeeks).
 */
async function readCalendarWeeks(
  listing: DirectoryResource,
  category: CategoryConfig,
  key: string,
  weeks: readonly CalendarWeek[],
  apiKey: string,
  sourceFor: (w: CalendarWeek) => ScheduleSource | null,
  others?: () => Promise<readonly DirectoryResource[]>,
  whole = false,
): Promise<PageReading> {
  const sk = schedulesKey(key)
  let minyanim = regularMinyanim(listing[key])
  let schedules = readSchedules(listing[sk])
  const read: string[] = []
  const lines: string[] = []
  const notes: string[] = []
  // Every time a calendar gives is on its date: this week's schedule.
  let given = 0
  for (const w of weeks) {
    const source = sourceFor(w)
    if (!source) continue
    const got = await readShulWeek(listing, key, source, apiKey, { week: w, others })
    notes.push(...got.elsewhere.map((l) => `${l}.`))
    read.push(...timesReadLines(got.update.rows))
    given += partsGiven([{ ...got.update, kind: 'week' }]).reduce((n, p) => n + p.size, 0)
    const week = whole ? got.update : keepUncovered(got.update)
    const usualThere = week.rows.some((r) => r.status === 'kept' || r.status === 'gone')
    const eventsOnly = !whole && usualThere && !week.rows.some((r) => r.status === 'same' || r.status === 'changed')
    const own = eventsOnly ? dropListed({ ...week, kind: 'schedule', from: null, to: null, rows: week.rows.filter((r) => r.status === 'new') }, minyanim, schedules) : week
    if (eventsOnly && got.update.rows.some((r) => r.status === 'new'))
      notes.push(`Their calendar for ${weekText(w)} has none of their usual minyanim, so only its other services go on, each on its own date, and their usual times stay.`)
    const update = yieldToNewsletter(own, schedules)
    if (changing(update) < changing(own) || (!update && own.rows.length)) notes.push(NEWSLETTER_HELD)
    if (!update || !update.rows.length) continue
    const posted = applyUpdate(minyanim, schedules, update, { postedBy: 'website', name: weekName(w), evenIfSame: true, whole })
    // The calendar's join links onto its times (withJoinLinks), by code.
    const linked = withJoinLinks(posted.schedules, w.joins ?? [])
    const applied = { ...posted, schedules: linked.schedules, changes: [...posted.changes, ...linked.changes] }
    // Already on the listing as it would be: nothing to file for this week.
    if (suggestionKey({ [key]: applied.minyanim, [sk]: applied.schedules }, [key, sk]) === suggestionKey({ [key]: minyanim, [sk]: schedules }, [key, sk])) continue
    minyanim = applied.minyanim
    schedules = applied.schedules
    lines.push(...applied.changes)
  }
  const note = notes.length ? [...new Set(notes)].join(' ') : undefined
  const parts: PartGiven[] = given ? [{ part: 'week', size: given }] : []
  if (!lines.length) return { read, proposal: null, note, parts }
  return { read, proposal: { submission: editSubmission(category, listing, { [key]: minyanim, [sk]: schedules }), lines, keys: [key, sk] }, note, parts }
}

/** What the page would change on the listing, or nothing. */
export async function proposeFromPage(...args: Parameters<typeof readPageFor>): Promise<PageProposal> {
  return (await readPageFor(...args)).proposal
}

async function communityName(slug: string): Promise<string> {
  const { data } = await getAdminClient().from('community').select('name').eq('slug', slug).maybeSingle()
  return (data as { name?: string } | null)?.name ?? communityConfig.name
}

/** Whether the listing has a suggestion waiting in the queue, from anyone:
 *  one at a time, so approving one can't undo the other. */
export async function hasPendingSuggestion(community: string, listingId: string): Promise<boolean> {
  return (await pendingSuggestions(community, listingId)).length > 0
}

type Filed = { id: string; payload: unknown }

/** The listing's suggestions waiting in the queue, from anyone. */
async function pendingSuggestions(community: string, listingId: string): Promise<Filed[]> {
  const { data, error } = await getAdminClient().from('submission').select('id, payload').eq('community_id', community).eq('target_id', listingId).eq('status', 'pending')
  if (error) throw new Error(`Couldn’t read the queue: ${error.message}`)
  return (data ?? []) as Filed[]
}

/** The part of a shul's times a suggestion is about (timesParts.ts), if
 *  it's one of them. */
const partOf = (s: { payload: unknown }): PartSource | null => readPartSource((s.payload as { source?: { part?: unknown } } | null)?.source?.part)
const detailsOf = (s: { payload: unknown }) => (s.payload as { details?: Record<string, unknown> } | null)?.details ?? {}
/** What a suggestion would set: its details and the listing's own phone. */
const valuesOf = (s: { payload: unknown }) => ({ ...detailsOf(s), phone: (s.payload as { phone?: unknown } | null)?.phone ?? null })
/** The section of a mikvah's hours a suggestion is about (hoursSections.ts). */
const sectionOf = (s: { payload: unknown }): SectionSource | null => readSectionSource((s.payload as { source?: { section?: unknown } } | null)?.source?.section)

/** Everything this watch has filed for the listing, whatever became of it. */
export async function earlierSuggestions(community: string, listingId: string): Promise<{ payload: unknown }[]> {
  const { data, error } = await getAdminClient()
    .from('submission')
    .select('payload')
    .eq('community_id', community)
    .eq('target_id', listingId)
    .eq('submitted_by->>name', LISTING_PAGE_WATCH_NAME)
  if (error) throw new Error(`Couldn’t read earlier suggestions: ${error.message}`)
  return (data ?? []) as { payload: unknown }[]
}

/** One listing's page: read it, and when its words changed, have the AI
 *  read it and file what differs from the listing. A page that agrees
 *  leaves the listing's date alone (listingPageWatch.ts).
 *
 *  `full` is the admin's "Check now" (the user, Oct 20): the AI reads the
 *  page whether or not it changed, files what differs just as a change
 *  would (never the same suggestion twice), and the result says what it
 *  read and whether that agrees with the listing. The daily run reads with
 *  the AI only a page that changed: it costs. */
export async function runListingPageWatch(
  watch: Pick<Watch, 'communityId' | 'url' | 'resourceId' | 'pageHash'> & Partial<Pick<Watch, 'createdBy' | 'lastCheck'>>,
  budget?: MenuReadBudget,
  opts: { fetchImpl?: typeof fetch; apiKey?: string | undefined; now?: number; full?: boolean } = {},
): Promise<WatchOutcome> {
  if (!watch.resourceId) return { ok: false, error: 'Tie this watch to the listing it keeps current' }
  const row = await getResourceRowById(watch.resourceId, watch.communityId)
  if (!row || row.status !== 'approved') return { ok: false, error: 'The listing this page belongs to isn’t in the guide any more' }
  const listing = normalizeRow(row)
  const category = (await listCategoriesUncached(watch.communityId)).find((c) => c.id === listing.category)
  const reads = category && pageReadsFor(category)
  if (!category || !reads) return { ok: false, error: 'The listing this page belongs to has no davening times or hours to keep current' }

  const source = await readListingPage(watch.url, { fetchImpl: opts.fetchImpl, now: opts.now, pictures: reads.kind === 'times' })
  if (!source) {
    return {
      ok: false,
      error: 'Couldn’t read the page (blocked, moved, or built in the browser)',
      ...(opts.full ? { check: { what: reads.kind, from: null, result: 'unreadable', read: [], differences: [], queue: null } as const } : {}),
    }
  }
  const pageHash = menuHash(source)
  const changed = !!watch.pageHash && watch.pageHash !== pageHash
  // A page the hours or times job found (hoursJob.ts) is read on its first
  // morning, as one an admin gives is read when it's given: else its job
  // page could never say what it reads until the page changed (Oct 21).
  const firstFound = !watch.pageHash && watch.createdBy === LISTING_PAGE_FOUND_CREATOR
  // Its phone and email (contactRead.ts): only what Google doesn't keep,
  // read by code, so on a page never read for them yet (one watched before
  // they were) as well as on every read below.
  const contacts = contactFields(category, listing)
  const contactRead = contacts.length && source.contacts ? readContacts(contacts, listing, source.contacts) : null
  // A page that gives none of them says nothing of them.
  const contactReading = contactRead && (contactRead.same.length || Object.keys(contactRead.changes).length) ? contactRead : null
  const contactUnread = !!contactReading && !watch.lastCheck?.contact
  // A mikvah's page read before its notes were (NOTES_READ_FROM).
  const notesUnread = reads.kind === 'hours' && reads.notes.length > 0 && !!watch.pageHash && !(watch.lastCheck && watch.lastCheck.at >= NOTES_READ_FROM)
  // Else the first read sets the baseline; an unchanged page is left
  // alone, and its listing's date with it.
  if (!opts.full && !changed && !firstFound && !contactUnread && !notesUnread) return { ok: true, filed: 0, pageHash }

  // Changed. A suggestion already waiting, no AI, or this run's reads spent:
  // the old fingerprint stays, so the change is still news next time. A
  // check reads it all the same, to say what it found.
  // A part of a shul's times waiting holds back only that part
  // (timesParts.ts): its other parts can still be filed beside it.
  const waitingNow = await pendingSuggestions(watch.communityId, listing.id)
  const blocked = waitingNow.some((s) => !partOf(s) && !sectionOf(s))
  const seen = changed ? 'changed' : 'read'
  // Filed as a box of its own, as a mikvah's sections are; held back only
  // by a whole suggestion waiting.
  const contact = contactReading ? await fileContact(watch, category, listing, contacts, contactReading, waitingNow, blocked, source.text, { now: opts.now, seen }) : null
  const merge = (o: WatchOutcome): WatchOutcome => withContact(o, contact, watch.lastCheck ?? null, reads.kind, checkFrom(source, { pictures: !!source.pictures?.length }))
  // Read for its phone and email alone: the rest waits for the page to change.
  if (!opts.full && !changed && !firstFound && !notesUnread) return merge({ ok: true, filed: 0, pageHash })
  // Hours Google keeps on this listing are Google's to check, not the website's.
  const ownReads: PageReads = reads.kind === 'hours' ? { ...reads, keys: reads.keys.filter((k) => !(k === 'hours' && googleKeeps(listing, 'hours'))) } : reads
  if (ownReads.kind === 'hours' && !ownReads.keys.length && !ownReads.notes.length) return merge({ ok: true, filed: 0, pageHash })
  if (blocked && !opts.full) return merge({ ok: true, filed: 0 })
  const apiKey = 'apiKey' in opts ? opts.apiKey : process.env.OPENAI_API_KEY
  if (!apiKey) {
    if (!opts.full) return merge({ ok: true, filed: 0 })
    return merge({ ok: true, filed: 0, check: { what: reads.kind, from: checkFrom(source, { pictures: !!source.pictures?.length }), result: 'nothing', read: [], differences: [], queue: null, note: 'The AI isn’t set up here, so the page wasn’t read.' } })
  }
  if (budget && !opts.full) {
    if (budget.aiReads <= 0) return merge({ ok: true, filed: 0 })
    budget.aiReads--
  }
  return merge(await readAndFile(watch, listing, category, ownReads, source, waitingNow, blocked, { ...opts, apiKey, changed, pageHash }))
}

/** The AI's read of a page that changed (or a check's), and what it files:
 *  a shul's times a part at a time, a mikvah's hours a section at a time,
 *  anything else whole. */
async function readAndFile(
  watch: Pick<Watch, 'communityId' | 'url' | 'pageHash'>,
  listing: DirectoryResource,
  category: CategoryConfig,
  reads: PageReads,
  source: PageSource,
  waitingNow: readonly Filed[],
  blocked: boolean,
  opts: { fetchImpl?: typeof fetch; apiKey: string; now?: number; full?: boolean; changed: boolean; pageHash: string },
): Promise<WatchOutcome> {
  const { apiKey, changed, pageHash } = opts
  const pending = waitingNow.length > 0

  let reading: PageReading
  try {
    // A calendar's week another page filed, still waiting, has its dates too.
    const dated = waitingNow.flatMap((s) => {
      const part = partOf(s)
      if (part?.part !== 'week') return []
      const ids = new Set(part.schedules)
      return datedTimes(readSchedules(detailsOf(s)[schedulesKey(part.field)]).filter((x) => ids.has(x.id)))
    })
    const others = () => listApprovedResources(watch.communityId)
    reading = await readPageFor(listing, category, reads, source, { apiKey, communityName: await communityName(watch.communityId), fetchImpl: opts.fetchImpl, now: opts.now, dated, others })
  } catch (err) {
    return { ok: false, error: `${changed ? 'The page changed, and the AI' : 'The AI'} couldn’t read it (${err instanceof Error ? err.message : String(err)})` }
  }
  if (source.calendarEmpty && !reading.read.length) reading = { ...reading, note: [reading.note, calendarEmptyNote(source.calendarEmpty)].filter(Boolean).join(' ') }
  const { proposal } = reading
  const check = (queue: WatchCheck['queue']) =>
    pageCheck(reads.kind, checkFrom(source, { pictures: !!source.pictures?.length }), reading.read, { differences: proposal?.lines ?? [], queue, note: reading.note, unread: reading.unread, parts: reading.parts })
  if (!proposal) return { ok: true, filed: 0, pageHash, check: check(null) }
  // A shul's times: filed as the parts they change, each on its own.
  const [timesKey, sk] = proposal.keys
  const parts =
    reads.kind === 'times' && proposal.keys.length === 2 && sk === schedulesKey(timesKey)
      ? splitParts({ ...proposal.submission.details, [timesKey]: listing[timesKey] ?? null, [sk]: listing[sk] ?? null }, proposal.submission.details, timesKey)
      : []
  if (parts.length) {
    if (blocked) return { ok: true, filed: 0, ...(watch.pageHash ? {} : { pageHash }), check: check('waiting') }
    const { queue, filed } = await fileParts(watch, listing, proposal, parts, waitingNow, source.text, { now: opts.now, seen: changed ? 'changed' : 'read' })
    if (filed.length) {
      await sendWatchDigest(watch.communityId, `${listing.name}’s website`, filed.map((what) => ({ name: listing.name, what })), jobPageFor(watch.communityId, category)).catch((err) =>
        console.error('[watch-listing-page] digest failed:', err),
      )
    }
    return { ok: true, filed: filed.length, ...(queue === 'waiting' && watch.pageHash ? {} : { pageHash }), check: check(queue) }
  }
  // A mikvah's hours: filed as the sections they change, each on its own.
  const sections = reads.kind === 'hours' ? splitSections(hoursSections(category, reads.keys), listing, proposal.submission.details) : []
  if (sections.length) {
    if (blocked) return { ok: true, filed: 0, ...(watch.pageHash ? {} : { pageHash }), check: check('waiting') }
    const { queue, filed } = await fileSections(watch, category, listing, sections, waitingNow, source.text, { now: opts.now, seen: changed ? 'changed' : 'read' })
    if (filed.length) {
      await sendWatchDigest(watch.communityId, `${listing.name}’s website`, filed.map((what) => ({ name: listing.name, what })), jobPageFor(watch.communityId, category)).catch((err) =>
        console.error('[watch-listing-page] digest failed:', err),
      )
    }
    return { ok: true, filed: filed.length, ...(queue === 'waiting' && watch.pageHash ? {} : { pageHash }), check: check(queue) }
  }
  // Only a check gets here with one waiting: it says so, files nothing, and
  // a change stays news for the daily run.
  if (pending) return { ok: true, filed: 0, ...(watch.pageHash ? {} : { pageHash }), check: check('waiting') }
  if (filedBefore(await earlierSuggestions(watch.communityId, listing.id), proposal.submission.details, proposal.keys)) return { ok: true, filed: 0, pageHash, check: check('before') }

  const on = changedOn(opts.now ?? Date.now(), communityConfig.timezone)
  const seen = changed ? 'changed' : 'read'
  const note = listingPageNote(watch.url, on, proposal.lines, seen)
  await submitListingUpdate(
    watch.communityId,
    listing.id,
    { ...proposal.submission, source: listingPageSource(listing.name, watch.url, on, source.text, seen) } as ResourceSubmission,
    note,
    { name: LISTING_PAGE_WATCH_NAME },
  )
  await sendWatchDigest(watch.communityId, `${listing.name}’s website`, [{ name: listing.name, what: proposal.lines.join('; ') }], jobPageFor(watch.communityId, category)).catch((err) =>
    console.error('[watch-listing-page] digest failed:', err),
  )
  return { ok: true, filed: 1, pageHash, check: check('filed') }
}

/** A shul's times, filed a part at a time: the usual weekday times, the
 *  usual Shabbos times and this week's schedule each a finding of its own
 *  (the user, Oct 21: "Readings should very clearly fall into one of
 *  those"). A part already waiting as read here is left waiting; one
 *  filed before isn't filed again; one waiting from another page is
 *  replaced only by a page that gives more of it (Sons of Israel's
 *  Tefillot page, beside its home page's few lines). `filed`: what each
 *  part filed, for the email. */
async function fileParts(
  watch: Pick<Watch, 'communityId' | 'url'>,
  listing: DirectoryResource,
  proposal: NonNullable<PageProposal>,
  parts: readonly PartReading[],
  waiting: readonly Filed[],
  text: string | null,
  at: { now?: number; seen: 'changed' | 'read' },
): Promise<{ queue: 'filed' | 'waiting' | 'before'; filed: string[] }> {
  const { submission } = proposal
  const earlier = await earlierSuggestions(watch.communityId, listing.id)
  const on = changedOn(at.now ?? Date.now(), communityConfig.timezone)
  const listingDetails = { ...submission.details, ...Object.fromEntries(parts.flatMap((p) => [p.source.field, schedulesKey(p.source.field)]).map((k) => [k, listing[k] ?? null])) }
  const outcomes: ('filed' | 'waiting' | 'before')[] = []
  const filed: string[] = []
  for (const p of parts) {
    const key = partKey(p.source, p.details)
    const same = waiting.filter((s) => partOf(s)?.part === p.part)
    if (same.some((s) => partKey(partOf(s)!, detailsOf(s)) === key)) {
      outcomes.push('waiting')
      continue
    }
    // Filed before as this part, or (a box) inside a whole reading from
    // before the parts.
    if (earlier.some((s) => { const sp = partOf(s); return sp ? sp.part === p.part && partKey(sp, detailsOf(s)) === key : p.part !== 'week' && partKey(p.source, detailsOf(s)) === key })) {
      outcomes.push('before')
      continue
    }
    // The reader's own lines when they're all this part's.
    const lines = parts.length === 1 ? proposal.lines : partLines(p.source, listingDetails, p.details)
    const payload = { ...submission, details: p.details, source: { ...listingPageSource(listing.name, watch.url, on, text, at.seen), part: p.source } } as ResourceSubmission
    const note = listingPageNote(watch.url, on, lines, at.seen)
    const what = `${TIMES_PART_LABELS[p.part]}: ${lines.join('; ')}`
    const there = same[0]
    if (there) {
      if (p.size <= partSize(partOf(there)!, detailsOf(there)) || !(await replacePendingSuggestion(watch.communityId, there.id, payload, note))) {
        outcomes.push('waiting')
        continue
      }
    } else {
      await submitListingUpdate(watch.communityId, listing.id, payload, note, { name: LISTING_PAGE_WATCH_NAME })
    }
    outcomes.push('filed')
    filed.push(what)
  }
  const queue = outcomes.includes('filed') ? 'filed' : outcomes.includes('waiting') ? 'waiting' : 'before'
  return { queue, filed }
}

/** A mikvah's hours, filed a section at a time (hoursSections.ts): the
 *  women's, men's and keilim hours and notes each a finding of its own, as
 *  Mikvah hours shows them, a box each. A section already waiting as read
 *  here is left waiting, and one filed before isn't filed again. One
 *  waiting from this page is replaced by what it says now; one from
 *  another page is left for the admin. */
async function fileSections(
  watch: Pick<Watch, 'communityId' | 'url'>,
  category: CategoryConfig,
  listing: DirectoryResource,
  sections: readonly { section: HoursSection; details: Record<string, unknown>; source: SectionSource }[],
  waiting: readonly Filed[],
  text: string | null,
  at: { now?: number; seen: 'changed' | 'read' },
): Promise<{ queue: 'filed' | 'waiting' | 'before'; filed: string[] }> {
  const earlier = await earlierSuggestions(watch.communityId, listing.id)
  const on = changedOn(at.now ?? Date.now(), communityConfig.timezone)
  const outcomes: ('filed' | 'waiting' | 'before')[] = []
  const filed: string[] = []
  for (const p of sections) {
    const keys = p.source.keys
    const key = suggestionKey(p.details, keys)
    const same = waiting.filter((s) => sectionOf(s)?.section === p.source.section)
    if (same.some((s) => suggestionKey(valuesOf(s), keys) === key)) {
      outcomes.push('waiting')
      continue
    }
    // Filed before as this section, or inside a whole reading from before
    // the sections.
    if (earlier.some((s) => (sectionOf(s)?.section ?? p.source.section) === p.source.section && suggestionKey(valuesOf(s), keys) === key)) {
      outcomes.push('before')
      continue
    }
    const { submission, lines } = fieldsEdit(category, listing, Object.fromEntries(keys.map((k) => [k, p.details[k] ?? null])))
    if (!lines.length) continue
    const payload = { ...submission, source: { ...listingPageSource(listing.name, watch.url, on, text, at.seen), section: p.source } } as ResourceSubmission
    const note = listingPageNote(watch.url, on, lines, at.seen)
    const there = same[0]
    if (there) {
      const from = (there.payload as { source?: { note?: unknown } } | null)?.source?.note
      if (typeof from !== 'string' || !from.endsWith(watch.url) || !(await replacePendingSuggestion(watch.communityId, there.id, payload, note))) {
        outcomes.push('waiting')
        continue
      }
    } else {
      await submitListingUpdate(watch.communityId, listing.id, payload, note, { name: LISTING_PAGE_WATCH_NAME })
    }
    outcomes.push('filed')
    filed.push(`${p.section.label}: ${lines.join('; ')}`)
  }
  const queue = outcomes.includes('filed') ? 'filed' : outcomes.includes('waiting') ? 'waiting' : 'before'
  return { queue, filed }
}

type ContactFiled = { reading: ContactReading; lines: string[]; queue: WatchCheck['queue']; filed: string[] }

/** A page's phone and email, filed as a box of their own (the section
 *  `contact`, its keys the fields it changes), as a mikvah's sections are,
 *  so using it never undoes anything else on the listing. Held back only
 *  by a whole suggestion waiting. */
async function fileContact(
  watch: Pick<Watch, 'communityId' | 'url'>,
  category: CategoryConfig,
  listing: DirectoryResource,
  fields: readonly ContactField[],
  reading: ContactReading,
  waiting: readonly Filed[],
  blocked: boolean,
  text: string | null,
  at: { now?: number; seen: 'changed' | 'read' },
): Promise<ContactFiled> {
  const keys = Object.keys(reading.changes)
  const { lines } = keys.length ? fieldsEdit(category, listing, reading.changes) : { lines: [] }
  if (!lines.length) return { reading, lines: [], queue: null, filed: [] }
  if (blocked) return { reading, lines, queue: 'waiting', filed: [] }
  const section: HoursSection = { section: CONTACT_SECTION, label: contactBoxName(fields), hours: null, notes: null }
  const { queue, filed } = await fileSections(watch, category, listing, [{ section, details: reading.changes, source: { section: CONTACT_SECTION, keys } }], waiting, text, at)
  if (filed.length) {
    await sendWatchDigest(watch.communityId, `${listing.name}’s website`, filed.map((what) => ({ name: listing.name, what })), jobPageFor(watch.communityId, category)).catch((err) =>
      console.error('[watch-listing-page] digest failed:', err),
    )
  }
  return { reading, lines, queue, filed }
}

/** A run's outcome with what the page said of the phone and email: kept
 *  on its check (the last one, when this run had the AI read nothing), its
 *  differences among the check's, what it filed counted. */
export function withContact(o: WatchOutcome, contact: ContactFiled | null, last: WatchCheck | null, what: PageReads['kind'], from: WatchCheck['from']): WatchOutcome {
  if (!contact || !o.ok) return o
  const { at: _at, ...was } = last ?? { at: '' }
  void _at
  const base: Omit<WatchCheck, 'at'> = o.check ?? (last ? (was as Omit<WatchCheck, 'at'>) : { what, from, result: 'nothing', read: [], differences: [], queue: null })
  const { same, changes } = contact.reading
  const differences = [...base.differences.filter((d) => !contact.lines.includes(d)), ...contact.lines]
  // A phone that agrees doesn't make a page that gave no hours a read one:
  // the place stays "can't be read" for its hours (Mikvah hours board 3).
  const result: WatchCheck['result'] = contact.lines.length ? 'differs' : base.result
  return {
    ...o,
    filed: o.filed + contact.filed.length,
    check: { ...base, result, differences, queue: base.queue ?? contact.queue, contact: { same, changes: Object.keys(changes) } },
  }
}
