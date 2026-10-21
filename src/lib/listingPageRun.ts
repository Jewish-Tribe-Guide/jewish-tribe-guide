import { getAdminClient } from '@/lib/supabase/admin'
import { community as communityConfig } from '@/community.config'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { fetchPublic, htmlToText, type MenuSource } from '@/lib/menuReader'
import { menuHash } from '@/lib/menuWatch'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { readShulWeek } from '@/lib/shulWeekReading'
import { calendarPictures } from '@/lib/calendarPictures'
import { hasDaveningTimes } from '@/lib/hoursJob'
import type { ScheduleSource } from '@/lib/scheduleReader'
import { CALENDAR_HEADING, MAX_FEED_BYTES, calendarFeeds, calendarLines, calendarWeeks, embeddedEntries, icsEntries, isIcs, type CalendarEntry, type CalendarWeek } from '@/lib/calendarFeed'
import { applyUpdate, changesAnything, datesBetween, datesHeldOverWebsite, sameTime, seasonOf, weekdayOf, type TimesUpdate } from '@/lib/scheduleUpdate'
import { dateText, readSchedules, regularMinyanim, schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { buildCatalog, readMessage } from '@/lib/messageReader'
import { fieldsEdit, readFieldChanges } from '@/lib/fieldChanges'
import { editSubmission } from '@/lib/editSubmission'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendWatchDigest } from '@/lib/email'
import { jobPageFor } from '@/lib/watchFindings'
import type { MenuReadBudget } from '@/lib/menuWatchRun'
import type { CategoryConfig } from '@/lib/categories'
import type { Watch, WatchCheck, WatchOutcome } from '@/lib/watches'
import type { Minyan, Tefillah } from '@/lib/davening'
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
  pageCheck,
  pageReadsFor,
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
export type PageSource = MenuSource & { weeks?: CalendarWeek[] }

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
  if (isIcs(page.body)) return withCalendar(page.url, '', icsEntries(page.body, communityConfig.timezone, first, last), weeks)
  // A calendar on the page: its feed (the first that reads) or the event
  // list in its scripts (calendarFeed.ts), ahead of the page's own words.
  let entries = embeddedEntries(page.body, communityConfig.timezone)
  for (const feed of calendarFeeds(page.body, page.url).slice(0, 2)) {
    const got = await fetchPublic(feed, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS, maxBytes: MAX_FEED_BYTES })
    if (got?.type === 'html' && isIcs(got.body)) {
      entries = icsEntries(got.body, communityConfig.timezone, first, last)
      break
    }
  }
  const text = htmlToText(page.body.replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, ' '))
  // No calendar and no davening time in its words: the month may be
  // posted as pictures (calendarPictures). A page that gives its times in
  // words is read for them, whatever its pictures are called.
  if (opts.pictures && !calendarLines(entries, first, last).length && !hasDaveningTimes(text)) {
    const pictures = calendarPictures(page.body, page.url, weeks.flatMap((w) => [w.sunday, w.to]))
    if (pictures.length) return withPictures(page.url, text, pictures, weeks)
  }
  return withCalendar(page.url, text, entries, weeks)
}

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
function withCalendar(url: string, text: string, entries: CalendarEntry[], weeks: Omit<CalendarWeek, 'lines'>[]): PageSource | null {
  const lines = calendarLines(entries, weeks[0].sunday, weeks.at(-1)!.to)
  if (lines.length) {
    return {
      url,
      text: [CALENDAR_HEADING, ...lines, '', text].join('\n').trim(),
      pdf: null,
      weeks: weeks.map((w) => ({ ...w, lines: calendarLines(entries, w.from, w.to) })),
    }
  }
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

/** What the AI read off the page, a short line each (listingPageWatch.ts),
 *  and what it would change on the listing. `note` says when the
 *  newsletter's days were left to the newsletter. */
export type PageReading = { read: string[]; proposal: PageProposal; note?: string; unread?: string[] }

const NEWSLETTER_HELD = 'Some days differ, but the newsletter has given those days, and it wins.'

/** "Oct 25–31". */
function weekText(w: Pick<CalendarWeek, 'from' | 'to'>): string {
  const [fromMonth, fromDay] = dateText(w.from).split(' ')
  const [toMonth, toDay] = dateText(w.to).split(' ')
  return w.from === w.to ? dateText(w.from) : `${fromMonth} ${fromDay}–${toMonth === fromMonth ? toDay : `${toMonth} ${toDay}`}`
}

/** A result's lines that change the listing. */
const changing = (u: TimesUpdate | null) => (u ? u.rows.filter((r) => r.status === 'changed' || r.status === 'new' || (r.status === 'gone' && !r.keep)).length : 0)

/** Has the AI read the page for the listing, and compares what it read
 *  with the listing as it is now. */
export async function readPageFor(
  listing: DirectoryResource,
  category: CategoryConfig,
  reads: PageReads,
  source: PageSource,
  { apiKey, communityName, fetchImpl }: { apiKey: string; communityName: string; fetchImpl?: typeof fetch },
): Promise<PageReading> {
  const text = source.text?.slice(0, MAX_PAGE_TEXT) ?? null
  if (reads.kind === 'times' && source.weeks && source.pictures?.length) {
    // A calendar posted as pictures, read together, a week at a time.
    const got = await Promise.all(source.pictures.map((u) => fetchPublic(u, { fetchImpl, headers: WATCH_FETCH_HEADERS, pictures: true }).catch(() => null)))
    const images = got.flatMap((g) => (g?.type === 'picture' ? [{ mime: g.mime, b64: g.body }] : []))
    if (!images.length) return { read: [], proposal: null, note: 'Their calendar’s pictures couldn’t be opened.' }
    return readCalendarWeeks(listing, category, reads.key, source.weeks, apiKey, () => ({ images }))
  }
  if (reads.kind === 'times' && source.weeks) {
    const words = (w: CalendarWeek) => (w.lines.length ? { text: [CALENDAR_HEADING, ...w.lines].join('\n') } : null)
    return readCalendarWeeks(listing, category, reads.key, source.weeks, apiKey, words)
  }
  if (reads.kind === 'times') {
    // The shul's times (scheduleUpdate.ts): its usual ones, and since Oct 20
    // the dated ones too, a week's, filed as that week's times. What the
    // newsletter has given for the same days wins. A page with a calendar
    // is read as its calendar's weeks (readCalendarWeeks): a usual time is
    // one the shul states, never one the guide works out from its calendar
    // (the user, Oct 20, on Leyv Ha-Ir's monthly services).
    // Its dated times go on as their week's schedule, apart from its usual
    // times (datedAsWeeks).
    const read = await readShulWeek(listing, reads.key, text !== null ? { text } : { pdf: source.pdf! }, apiKey)
    const sk = schedulesKey(reads.key)
    let minyanim = regularMinyanim(listing[reads.key])
    let schedules = readSchedules(listing[sk])
    const lines = timesReadLines(read.update.rows)
    const changes: string[] = []
    let held = false
    for (const u of read.updates) {
      const week = u.kind === 'week'
      // A week's own times stay in it: one the listing has that weekday
      // still belongs to that week's schedule.
      const own = week ? keepUncovered(u) : dropListed(keepUncovered(u), minyanim, schedules)
      const update = yieldToNewsletter(own, schedules)
      if (changing(update) < changing(own)) held = true
      if (!update || !changesAnything(update)) continue
      const applied = applyUpdate(minyanim, schedules, update, { postedBy: 'website' })
      if (applied.changes.length === 0) continue
      // Already on the listing as it would be (read again the next day).
      if (suggestionKey({ [reads.key]: applied.minyanim, [sk]: applied.schedules }, [reads.key, sk]) === suggestionKey({ [reads.key]: minyanim, [sk]: schedules }, [reads.key, sk])) continue
      minyanim = applied.minyanim
      schedules = applied.schedules
      changes.push(...applied.changes)
    }
    const note = held ? NEWSLETTER_HELD : undefined
    if (changes.length === 0) return { read: lines, proposal: null, note }
    return {
      read: lines,
      proposal: { submission: editSubmission(category, listing, { [reads.key]: minyanim, [sk]: schedules }), lines: changes, keys: [reads.key, sk] },
      note,
    }
  }
  // Weekly hours: the any-field reader (messageReader.ts), told only of this
  // listing, and only its hours kept.
  const intro = hoursNowIntro(listing.name, category, reads.keys, listing)
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
  const changes = hoursReads(reading.proposals, listing.id, reads.keys)
  const lines = hoursReadLines(changes, category)
  if (changes.length === 0) return { read: lines, proposal: null }
  const { values, unread } = readFieldChanges(category, listing, changes)
  const { submission, lines: edits } = fieldsEdit(category, listing, values)
  return { read: lines, proposal: edits.length ? { submission, lines: edits, keys: reads.keys } : null, ...(unread.length ? { unread } : {}) }
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
 */
async function readCalendarWeeks(
  listing: DirectoryResource,
  category: CategoryConfig,
  key: string,
  weeks: readonly CalendarWeek[],
  apiKey: string,
  sourceFor: (w: CalendarWeek) => ScheduleSource | null,
): Promise<PageReading> {
  const sk = schedulesKey(key)
  let minyanim = regularMinyanim(listing[key])
  let schedules = readSchedules(listing[sk])
  const read: string[] = []
  const lines: string[] = []
  const notes: string[] = []
  for (const w of weeks) {
    const source = sourceFor(w)
    if (!source) continue
    const got = await readShulWeek(listing, key, source, apiKey, { week: w })
    read.push(...timesReadLines(got.update.rows))
    const week = keepUncovered(got.update)
    const usualThere = week.rows.some((r) => r.status === 'kept' || r.status === 'gone')
    const eventsOnly = usualThere && !week.rows.some((r) => r.status === 'same' || r.status === 'changed')
    const own = eventsOnly ? dropListed({ ...week, kind: 'schedule', from: null, to: null, rows: week.rows.filter((r) => r.status === 'new') }, minyanim, schedules) : week
    if (eventsOnly && got.update.rows.some((r) => r.status === 'new'))
      notes.push(`Their calendar for ${weekText(w)} has none of their usual minyanim, so only its other services go on, each on its own date, and their usual times stay.`)
    const update = yieldToNewsletter(own, schedules)
    if (changing(update) < changing(own) || (!update && own.rows.length)) notes.push(NEWSLETTER_HELD)
    if (!update || !update.rows.length) continue
    const applied = applyUpdate(minyanim, schedules, update, { postedBy: 'website', name: `Times for ${dateText(w.sunday)} – ${dateText(w.to)}`, evenIfSame: true })
    // Already on the listing as it would be: nothing to file for this week.
    if (suggestionKey({ [key]: applied.minyanim, [sk]: applied.schedules }, [key, sk]) === suggestionKey({ [key]: minyanim, [sk]: schedules }, [key, sk])) continue
    minyanim = applied.minyanim
    schedules = applied.schedules
    lines.push(...applied.changes)
  }
  const note = notes.length ? [...new Set(notes)].join(' ') : undefined
  if (!lines.length) return { read, proposal: null, note }
  return { read, proposal: { submission: editSubmission(category, listing, { [key]: minyanim, [sk]: schedules }), lines, keys: [key, sk] }, note }
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
  const { data, error } = await getAdminClient()
    .from('submission')
    .select('id')
    .eq('community_id', community)
    .eq('target_id', listingId)
    .eq('status', 'pending')
    .limit(1)
  if (error) throw new Error(`Couldn’t read the queue: ${error.message}`)
  return (data ?? []).length > 0
}

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
  watch: Pick<Watch, 'communityId' | 'url' | 'resourceId' | 'pageHash'> & Partial<Pick<Watch, 'createdBy'>>,
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
  // Else the first read sets the baseline; an unchanged page is left
  // alone, and its listing's date with it.
  if (!opts.full && !changed && !firstFound) return { ok: true, filed: 0, pageHash }

  // Changed. A suggestion already waiting, no AI, or this run's reads spent:
  // the old fingerprint stays, so the change is still news next time. A
  // check reads it all the same, to say what it found.
  const pending = await hasPendingSuggestion(watch.communityId, listing.id)
  if (pending && !opts.full) return { ok: true, filed: 0 }
  const apiKey = 'apiKey' in opts ? opts.apiKey : process.env.OPENAI_API_KEY
  if (!apiKey) {
    if (!opts.full) return { ok: true, filed: 0 }
    return { ok: true, filed: 0, check: { what: reads.kind, from: checkFrom(source, { pictures: !!source.pictures?.length }), result: 'nothing', read: [], differences: [], queue: null, note: 'The AI isn’t set up here, so the page wasn’t read.' } }
  }
  if (budget && !opts.full) {
    if (budget.aiReads <= 0) return { ok: true, filed: 0 }
    budget.aiReads--
  }

  let reading: PageReading
  try {
    reading = await readPageFor(listing, category, reads, source, { apiKey, communityName: await communityName(watch.communityId), fetchImpl: opts.fetchImpl })
  } catch (err) {
    return { ok: false, error: `${changed ? 'The page changed, and the AI' : 'The AI'} couldn’t read it (${err instanceof Error ? err.message : String(err)})` }
  }
  const { proposal } = reading
  const check = (queue: WatchCheck['queue']) =>
    pageCheck(reads.kind, checkFrom(source, { pictures: !!source.pictures?.length }), reading.read, { differences: proposal?.lines ?? [], queue, note: reading.note, unread: reading.unread })
  if (!proposal) return { ok: true, filed: 0, pageHash, check: check(null) }
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
