import { getAdminClient } from '@/lib/supabase/admin'
import { dayInTimezone } from '@/lib/isoDay'
import { resolveCommunity } from '@/lib/communityStore'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, listApprovedResources, normalizeRow } from '@/lib/resourceStore'
import { fetchPublic, htmlToText, troubleClause, type MenuSource, type Trouble } from '@/lib/menuReader'
import { menuHash } from '@/lib/menuWatch'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import type { CommunityPlace } from '@/lib/shulWeekReading'
import { calendarPictures } from '@/lib/calendarPictures'
import { hasDaveningTimes } from '@/lib/hoursJob'
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
  type CalendarEntry,
  type CalendarWeek,
} from '@/lib/calendarFeed'
import { dateText, readSchedules, schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { buildCatalog, readMessage } from '@/lib/messageReader'
import { fieldsEdit, readFieldChanges } from '@/lib/fieldChanges'
import { replacePendingSuggestion, submitListingUpdate } from '@/lib/submissionStore'
import { TIMES_PART_LABELS, isHomePage, pageOfNote, partKey, partLines, partSize, readPartSource, scheduleTakesPart, splitParts, type PartGiven, type PartReading, type PartSource } from '@/lib/timesParts'
import { hoursSections, readSectionSource, splitSections, type HoursSection, type SectionSource } from '@/lib/hoursSections'
import { CONTACT_SECTION, contactBoxName, contactFields, googleKeeps, pageContacts, readContacts, type ContactField, type ContactReading, type PageContacts } from '@/lib/contactRead'
import { confirmFromSource } from '@/lib/sourceConfirm'
import { readShulPage } from '@/lib/shulPageRead'
import { getReadings, otherShulPages, otherShulReads } from '@/lib/watchStore'
import { readingMemo, type ReadingMemo, type Readings } from '@/lib/readingMemo'
import type { SourceRead } from '@/lib/shulTimes'
import { withMinyanLinks } from '@/lib/minyanLinks'
import { withoutTodaysDate } from '@/lib/todaysDateLine'
import type { MenuReadBudget } from '@/lib/menuWatchRun'
import type { CategoryConfig } from '@/lib/categories'
import type { Watch, WatchCheck, WatchOutcome } from '@/lib/watches'
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
  pageReadBoxes,
  pageReadsFor,
  sameNoteAsListed,
  suggestionKey,
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
 *  whether it lists the shul's usual minyanim (calendarListsUsual) and
 *  its last date with anything on it. */
export type CalendarRead = { weeks: Omit<CalendarWeek, 'lines'>[]; services: CalendarEntry[] }

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
export async function readListingPage(url: string, opts: { timezone: string; fetchImpl?: typeof fetch; now?: number; pictures?: boolean; trouble?: (t: Trouble) => void }): Promise<PageSource | null> {
  const page = await fetchPublic(url, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS, trouble: opts.trouble })
  if (!page) return null
  if (page.type === 'pdf') return { url: page.url, text: null, pdf: page.body }
  const today = dayInTimezone(opts.timezone, opts.now ?? Date.now())
  const weeks = calendarWeeks(today)
  // From this week's Sunday, so the text is the same all week (withCalendar).
  const [first, last] = [weeks[0].sunday, weeks.at(-1)!.to]
  // The watch's address may be the calendar feed itself.
  const after = (n: number) => new Date(Date.parse(`${last}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const services = (all: readonly CalendarEntry[]) => all.filter((e) => e.date >= first && e.date <= after(NEXT_SERVICE_DAYS) && e.time && isServiceTitle(e.title))
  if (isIcs(page.body)) {
    const got = withCalendar(page.url, '', await withEventJoins(icsEntries(page.body, opts.timezone, first, last), today, last, opts.fetchImpl), weeks, true)
    return got && { ...got, calendar: { weeks, services: services(icsEntries(page.body, opts.timezone, first, after(NEXT_SERVICE_DAYS))) } }
  }
  // A calendar on the page: its feed (the first that reads) or the event
  // list in its scripts (calendarFeed.ts), ahead of the page's own words.
  let entries = embeddedEntries(page.body, opts.timezone)
  let feedBody: string | null = null
  for (const feed of calendarFeeds(page.body, page.url).slice(0, 2)) {
    const got = await fetchPublic(feed, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS, maxBytes: MAX_FEED_BYTES })
    if (got?.type === 'html' && isIcs(got.body)) {
      entries = icsEntries(got.body, opts.timezone, first, last)
      feedBody = got.body
      break
    }
  }
  // A calendar there, read: its feed, or the events in its scripts.
  const calendar: CalendarRead | null =
    feedBody !== null ? { weeks, services: services(icsEntries(feedBody, opts.timezone, first, after(NEXT_SERVICE_DAYS))) } : entries.length ? { weeks, services: services(entries) } : null
  const calendarEmpty: CalendarEmpty | null =
    feedBody !== null && !calendarLines(entries, first, last).length
      ? { from: first, to: last, next: icsEntries(feedBody, opts.timezone, after(1), after(NEXT_SERVICE_DAYS)).find((e) => isServiceTitle(e.title)) ?? null }
      : null
  entries = await withEventJoins(entries, today, last, opts.fetchImpl)
  // Its WhatsApp groups and Zoom links with their addresses, so the
  // reader can give a minyan its own (minyanLinks.ts). Without a line
  // that only says what day it is, so the page isn't new every night
  // (todaysDateLine.ts).
  const text = withoutTodaysDate(htmlToText(withMinyanLinks(page.body.replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, ' '))), today)
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
    // and is read; the reader is given its lines alone (shulPageRead.ts).
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
export type PageProposal = { submission: ResourceSubmission; lines: string[]; keys: string[]; weekLines?: Record<string, string[]> } | null

/** What the AI read off the page, a short line each (listingPageWatch.ts),
 *  and what it would change on the listing. `note` says when the
 *  newsletter's days were left to the newsletter. */
export type PageReading = {
  read: string[]
  proposal: PageProposal
  note?: string
  unread?: string[]
  parts?: PartGiven[]
  /** A shul's page, as sources (shulPageRead.ts): kept on its check. */
  shulReads?: SourceRead[]
}

/** The last morning a shul's page was due its read, changed or not (the
 *  user, Oct 26): Friday's (Thursday night's run), for this Shabbos's
 *  times, and Saturday's (Friday night's), for the week after it, so it's
 *  up at havdalah; nothing posts on Shabbos. A read since then is enough.
 *  On a Saturday the weeks read include the next one (calendarWeeks). */
export function weeklyReadDue(today: string): string {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  if (weekday >= 5) return today
  return new Date(Date.parse(`${today}T12:00:00Z`) - (weekday + 1) * 86_400_000).toISOString().slice(0, 10)
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
    others,
    otherReads = [],
    waiting = [],
    where,
    memo,
  }: {
    apiKey: string
    communityName: string
    /** The community's timezone and map centre (CommunityPlace). */
    where: CommunityPlace
    fetchImpl?: typeof fetch
    now?: number
    /** The guide's listings, for a minyan the page says is at another
     *  shul (heldElsewhere.ts). */
    others?: () => Promise<readonly DirectoryResource[]>
    /** A shul's other pages' last reads (shulPageRead.ts). */
    otherReads?: readonly SourceRead[]
    /** Weeks waiting in To do: the newsletter's, and other pages'. */
    waiting?: readonly SpecialSchedule[]
    /** A shul page's kept readings (readingMemo.ts). */
    memo?: ReadingMemo
  },
): Promise<PageReading> {
  const text = source.text?.slice(0, MAX_PAGE_TEXT) ?? null
  // A shul's times: read as sources and decided by the rule (shulTimes.ts).
  if (reads.kind === 'times') return readShulPage(listing, category, reads.key, { ...source, text }, source.url ?? '', { apiKey, where, now, fetchImpl, others, otherReads, waiting, memo })
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

/** What the page would change on the listing, or nothing. */
export async function proposeFromPage(...args: Parameters<typeof readPageFor>): Promise<PageProposal> {
  return (await readPageFor(...args)).proposal
}


/** Whether the listing has a suggestion waiting in the queue, from anyone:
 *  one at a time, so approving one can't undo the other. */
export async function hasPendingSuggestion(community: string, listingId: string): Promise<boolean> {
  return (await pendingSuggestions(community, listingId)).length > 0
}

type Filed = { id: string; payload: unknown }
/** A suggestion this watch filed, and what became of it. */
type Earlier = { payload: unknown; status?: string; reviewed_at?: string | null }

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
export async function earlierSuggestions(community: string, listingId: string): Promise<Earlier[]> {
  const { data, error } = await getAdminClient()
    .from('submission')
    .select('payload, status, reviewed_at')
    .eq('community_id', community)
    .eq('target_id', listingId)
    .eq('submitted_by->>name', LISTING_PAGE_WATCH_NAME)
  if (error) throw new Error(`Couldn’t read earlier suggestions: ${error.message}`)
  return (data ?? []) as Earlier[]
}

/** The listing's own times or hours, as a fingerprint: what a page's read
 *  agreed or differed with. */
export function listedAs(listing: DirectoryResource, reads: PageReads): string {
  const keys = reads.kind === 'times' ? [reads.key, schedulesKey(reads.key)] : [...reads.keys, ...reads.notes]
  return suggestionKey(listing as unknown as Record<string, unknown>, keys)
}

/** One listing's page: read it, and when its words changed, have the AI
 *  read it and file what differs from the listing. A page that agrees
 *  dates the listing by name, as an approval of its suggestion would
 *  (listingPageWatch.ts).
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
  // A place with no hours field (a hotel) is read for its phone and email
  // alone: by code, so no AI (ownSiteCategories).
  const reads: PageReads | null | undefined = category && (pageReadsFor(category) ?? (contactFields(category, listing).length ? { kind: 'hours', keys: [], notes: [] } : null))
  if (!category || !reads) return { ok: false, error: 'The listing this page belongs to has no davening times or hours to keep current' }
  // Its own community's day and centre, not the static config's.
  const community = await resolveCommunity(watch.communityId)
  const where: CommunityPlace = { timezone: community.timezone, mapCenter: community.mapCenter }

  // Why it couldn't, when the site said (the user, Oct 23: Shivtei
  // Yeshuron's page read at 8:31 and "couldn't be read" at 10:54).
  let trouble: Trouble | null = null
  const source = await readListingPage(watch.url, { timezone: where.timezone, fetchImpl: opts.fetchImpl, now: opts.now, pictures: reads.kind === 'times', trouble: (t) => void (trouble ??= t) })
  if (!source) {
    const why: Trouble | null = trouble
    return {
      ok: false,
      error: why ? `Couldn’t read the page: ${troubleClause(why)}` : 'Couldn’t read the page (blocked, moved, or built in the browser)',
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
  // The listing as it is, beside the one the last read compared with: read
  // again once the listing changes (an approval, an admin's edit) or was
  // never compared, so whether the page agrees is always about the listing
  // as it stands. While both stay as they were, a page that agreed still
  // agrees, and dates the listing without the AI.
  const listed = listedAs(listing, reads)
  const listingMoved = !!watch.pageHash && watch.lastCheck?.listedAs !== listed
  // A shul's page is read twice a week, changed or not (the user, Oct 26):
  // a page whose words stay put still gives the new week's times, and one
  // read on a Thursday filed only up to Saturday week (weeklyReadDue).
  const today = dayInTimezone(where.timezone, opts.now ?? Date.now())
  const weekDue = reads.kind === 'times' && !!watch.pageHash && (watch.lastCheck?.readWeek ?? '') < weeklyReadDue(today)
  // A difference that waited behind a suggestion already in the queue is
  // read again in full once nothing waits for the listing: what still
  // differs is filed, what doesn't clears. It used to settle only on a
  // decision dated after it, and a run that carried it re-dated it each
  // morning, so Lower Merion's men's page and Ohel Leah's what-to-expect
  // said "Waiting for you" with nothing to open (Oct 26).
  const stoodBehind =
    !opts.full && !!watch.pageHash && watch.lastCheck?.queue === 'waiting' && watch.lastCheck.result === 'differs' && !(await pendingSuggestions(watch.communityId, listing.id)).length
  const stillAgrees = watch.lastCheck?.result === 'agrees' && !listingMoved
  // A shul page's kept readings, read once and only when needed; a check
  // made without reading again carries them on (readingMemo.ts).
  let kept: Promise<Readings> | null = null
  const keptReadings = () => (kept ??= reads.kind === 'times' ? getReadings(watch.communityId, watch.url) : Promise.resolve({}))
  const dated = async (o: WatchOutcome, agrees: boolean): Promise<WatchOutcome> => {
    if (reads.kind === 'times' && o.check && !o.check.readings) {
      const had = await keptReadings()
      if (Object.keys(had).length) o = { ...o, check: { ...o.check, readings: had } }
    }
    // What it read, and only that (pageReadBoxes): its phone and email too
    // when the page gives them and they agree. Those whatever else differs
    // (the user, Nov 5): the Kosher Grill's page gave its phone as listed
    // every night, and its Contact box stayed "Not confirmed yet" because
    // the same page listed dishes the listing didn't have.
    const contactAgrees = !!contactReading && Object.keys(contactReading.changes).length === 0
    const boxes = agrees ? pageReadBoxes(category, listing as unknown as Record<string, unknown>, reads, contactAgrees) : contactAgrees ? [CONTACT_SECTION] : []
    if (o.ok && boxes.length) await confirmFromSource(watch.communityId, [listing.id], listing.name, boxes, new Date(opts.now ?? Date.now()).toISOString())
    return o
  }
  // Else the first read sets the baseline; an unchanged page is left alone.
  if (!opts.full && !changed && !firstFound && !contactUnread && !notesUnread && !listingMoved && !weekDue && !stoodBehind) return dated({ ok: true, filed: 0, pageHash }, stillAgrees)

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
  const contact = contactReading ? await fileContact(watch, category, listing, contacts, contactReading, waitingNow, blocked, source.text, { now: opts.now, seen, timezone: where.timezone }) : null
  const merge = (o: WatchOutcome): WatchOutcome => withContact(o, contact, watch.lastCheck ?? null, reads.kind, checkFrom(source, { pictures: !!source.pictures?.length }))
  // Read for its phone and email alone: the rest waits for the page to change.
  if (!opts.full && !changed && !firstFound && !notesUnread && !listingMoved && !weekDue && !stoodBehind) {
    const o = merge({ ok: true, filed: 0, pageHash })
    return dated(o, stillAgrees && o.check?.result === 'agrees')
  }
  // Hours Google keeps on this listing are Google's to check, not the website's.
  const ownReads: PageReads = reads.kind === 'hours' ? { ...reads, keys: reads.keys.filter((k) => !(k === 'hours' && googleKeeps(listing, 'hours'))) } : reads
  if (ownReads.kind === 'hours' && !ownReads.keys.length && !ownReads.notes.length) return dated(merge({ ok: true, filed: 0, pageHash }), false)
  if (blocked && !opts.full) return dated(merge({ ok: true, filed: 0 }), false)
  const apiKey = 'apiKey' in opts ? opts.apiKey : process.env.OPENAI_API_KEY
  if (!apiKey) {
    if (!opts.full) return dated(merge({ ok: true, filed: 0 }), false)
    return dated(merge({ ok: true, filed: 0, check: { what: reads.kind, from: checkFrom(source, { pictures: !!source.pictures?.length }), result: 'nothing', read: [], differences: [], queue: null, note: 'The AI isn’t set up here, so the page wasn’t read.' } }), false)
  }
  // Read again only because the listing moved: the page said nothing new,
  // so a standing difference is the listing being newer (a newsletter, an
  // approval), never filed; it says whether the two still agree. Its own
  // few reads a run, so it never takes a changed page's.
  const compareOnly = !opts.full && !changed && !firstFound && !notesUnread && !weekDue && !stoodBehind
  if (budget && !opts.full) {
    // A shul's page takes from the run's times reads first (TIMES_READS_PER_RUN).
    if (reads.kind === 'times' && (budget.timesReads ?? 0) > 0) budget.timesReads!--
    else {
      const left = compareOnly ? (budget.compares ?? 0) : budget.aiReads
      if (left <= 0) return dated(merge({ ok: true, filed: 0, skipped: true }), false)
      if (compareOnly) budget.compares = left - 1
      else budget.aiReads--
    }
  }
  const o = merge(await readAndFile(watch, listing, category, ownReads, source, waitingNow, blocked, { ...opts, apiKey, changed, pageHash, compareOnly, where, communityName: community.name, readings: keptReadings }))
  // A compare files nothing, so it isn't the week's read.
  const read = o.check ? { listedAs: listed, ...(reads.kind === 'times' && !compareOnly ? { readWeek: today } : {}) } : {}
  return dated(o.check ? { ...o, check: { ...o.check, ...read } } : o, o.check?.result === 'agrees')
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
  opts: { fetchImpl?: typeof fetch; apiKey: string; now?: number; full?: boolean; changed: boolean; pageHash: string; compareOnly?: boolean; where: CommunityPlace; communityName: string; readings?: () => Promise<Readings> },
): Promise<WatchOutcome> {
  // A shul's page: the same words read as they were last time, and what
  // this read used kept for the next (readingMemo.ts).
  const memo = reads.kind === 'times' ? readingMemo(await opts.readings?.()) : undefined
  const o = await readAndFileOnce(watch, listing, category, reads, source, waitingNow, blocked, { ...opts, memo })
  const used = memo?.used()
  return o.check && used && Object.keys(used).length ? { ...o, check: { ...o.check, readings: used } } : o
}

async function readAndFileOnce(
  watch: Pick<Watch, 'communityId' | 'url' | 'pageHash'>,
  listing: DirectoryResource,
  category: CategoryConfig,
  reads: PageReads,
  source: PageSource,
  waitingNow: readonly Filed[],
  blocked: boolean,
  opts: { fetchImpl?: typeof fetch; apiKey: string; now?: number; full?: boolean; changed: boolean; pageHash: string; compareOnly?: boolean; where: CommunityPlace; communityName: string; memo?: ReadingMemo },
): Promise<WatchOutcome> {
  const { apiKey, changed, pageHash } = opts
  const pending = waitingNow.length > 0
  const { memo } = opts

  let reading: PageReading
  try {
    // The newsletter's weeks still waiting in To do count as its; and the
    // shul's other pages' last reads are weighed beside this one's.
    const waiting = waitingNow.flatMap((s) => {
      const part = partOf(s)
      if (part?.part !== 'week') return []
      const ids = new Set(part.schedules)
      return readSchedules(detailsOf(s)[schedulesKey(part.field)]).filter((x) => ids.has(x.id))
    })
    const otherReads = reads.kind === 'times' && listing.id ? await otherShulReads(watch.communityId, listing.id, watch.url) : []
    const others = () => listApprovedResources(watch.communityId)
    reading = await readPageFor(listing, category, reads, source, { apiKey, communityName: opts.communityName, where: opts.where, fetchImpl: opts.fetchImpl, now: opts.now, others, otherReads, waiting, memo })
  } catch (err) {
    return { ok: false, error: `${changed ? 'The page changed, and the AI' : 'The AI'} couldn’t read it (${err instanceof Error ? err.message : String(err)})` }
  }
  if (source.calendarEmpty && !reading.read.length) reading = { ...reading, note: [reading.note, calendarEmptyNote(source.calendarEmpty)].filter(Boolean).join(' ') }
  const { proposal } = reading
  const shulReads = reading.shulReads
  const check = (queue: WatchCheck['queue'], also?: string) => ({
    ...pageCheck(reads.kind, checkFrom(source, { pictures: !!source.pictures?.length }), reading.read, { differences: proposal?.lines ?? [], queue, note: [reading.note, also].filter(Boolean).join(' ') || undefined, unread: reading.unread, parts: reading.parts }),
    ...(shulReads?.length ? { shulReads } : {}),
  })
  if (!proposal || opts.compareOnly) return { ok: true, filed: 0, pageHash, check: check(null) }
  // A shul's times: filed as the parts they change, each on its own.
  const [timesKey, sk] = proposal.keys
  const parts =
    reads.kind === 'times' && proposal.keys.length === 2 && sk === schedulesKey(timesKey)
      ? splitParts({ ...proposal.submission.details, [timesKey]: listing[timesKey] ?? null, [sk]: listing[sk] ?? null }, proposal.submission.details, timesKey)
      : []
  if (parts.length) {
    // A home page leaves a usual part to the shul's own schedule page.
    const pages = isHomePage(watch.url) && listing.id ? await otherShulPages(watch.communityId, listing.id, watch.url) : []
    const leftTo = parts.flatMap((p) => { const to = scheduleTakesPart(watch.url, p.part, pages); return to ? [{ part: p.part, to }] : [] })
    const left = leftTo.length ? leftTo.map((l) => `${TIMES_PART_LABELS[l.part]} are left to ${l.to}.`).join(' ') : undefined
    const toFile = parts.filter((p) => !leftTo.some((l) => l.part === p.part))
    if (!toFile.length) return { ok: true, filed: 0, pageHash, check: check(null, left) }
    if (blocked) return { ok: true, filed: 0, ...(watch.pageHash ? {} : { pageHash }), check: check('waiting', left) }
    const { queue, filed } = await fileParts(watch, listing, proposal, toFile, waitingNow, source.text, { now: opts.now, seen: changed ? 'changed' : 'read', timezone: opts.where.timezone })
    // Read, so its fingerprint is kept even with a part waiting: once
    // nothing waits it's read again (stoodBehind), and keeping the old one
    // read it with the AI every night till then (Nov 18 review).
    return { ok: true, filed: filed.length, pageHash, check: check(queue, left) }
  }
  // A mikvah's hours: filed as the sections they change, each on its own.
  const sections = reads.kind === 'hours' ? splitSections(hoursSections(category, reads.keys), listing, proposal.submission.details) : []
  if (sections.length) {
    if (blocked) return { ok: true, filed: 0, ...(watch.pageHash ? {} : { pageHash }), check: check('waiting') }
    const { queue, filed } = await fileSections(watch, category, listing, sections, waitingNow, source.text, { now: opts.now, seen: changed ? 'changed' : 'read', timezone: opts.where.timezone })
    return { ok: true, filed: filed.length, pageHash, check: check(queue) }
  }
  // Only a check gets here with one waiting: it says so, files nothing, and
  // a change stays news for the daily run.
  if (pending) return { ok: true, filed: 0, ...(watch.pageHash ? {} : { pageHash }), check: check('waiting') }
  if (filedBefore(await earlierSuggestions(watch.communityId, listing.id), proposal.submission.details, proposal.keys)) return { ok: true, filed: 0, pageHash, check: check('before') }

  const on = changedOn(opts.now ?? Date.now(), opts.where.timezone)
  const seen = changed ? 'changed' : 'read'
  const note = listingPageNote(watch.url, on, proposal.lines, seen)
  await submitListingUpdate(
    watch.communityId,
    listing.id,
    { ...proposal.submission, source: listingPageSource(listing.name, watch.url, on, source.text, seen) } as ResourceSubmission,
    note,
    { name: LISTING_PAGE_WATCH_NAME },
  )
  return { ok: true, filed: 1, pageHash, check: check('filed') }
}

/** A shul's times, filed a part at a time: the usual weekday times, the
 *  usual Shabbos times and this week's schedule each a finding of its own
 *  (the user, Oct 21: "Readings should very clearly fall into one of
 *  those"). A part already waiting as read here is left waiting; one
 *  filed before isn't filed again; one waiting from another page is
 *  replaced only by a page that gives more of it (Sons of Israel's
 *  Tefillot page, beside its home page's few lines), or by any page but
 *  the home page when the home page filed it. `filed`: what each part
 *  filed, for the email. */
async function fileParts(
  watch: Pick<Watch, 'communityId' | 'url'>,
  listing: DirectoryResource,
  proposal: NonNullable<PageProposal>,
  parts: readonly PartReading[],
  waiting: readonly Filed[],
  text: string | null,
  at: { now?: number; seen: 'changed' | 'read'; timezone: string },
): Promise<{ queue: 'filed' | 'waiting' | 'before'; filed: string[] }> {
  const { submission } = proposal
  const earlier = await earlierSuggestions(watch.communityId, listing.id)
  const on = changedOn(at.now ?? Date.now(), at.timezone)
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
    // A week's are what its findings say (shulWeekFiling.ts), after what it posts.
    const weekLines = p.part === 'week' ? (p.source.schedules ?? []).flatMap((id) => proposal.weekLines?.[id] ?? []) : []
    const lines = weekLines.length ? [...partLines(p.source, listingDetails, p.details), ...weekLines] : parts.length === 1 ? proposal.lines : partLines(p.source, listingDetails, p.details)
    const payload = { ...submission, details: p.details, source: { ...listingPageSource(listing.name, watch.url, on, text, at.seen), part: p.source } } as ResourceSubmission
    const note = listingPageNote(watch.url, on, lines, at.seen)
    const what = `${TIMES_PART_LABELS[p.part]}: ${lines.join('; ')}`
    const there = same[0]
    if (there) {
      const overHome = !isHomePage(watch.url) && isHomePage(pageOfNote((there.payload as { source?: { note?: unknown } } | null)?.source?.note))
      if ((!overHome && p.size <= partSize(partOf(there)!, detailsOf(there))) || !(await replacePendingSuggestion(watch.communityId, there.id, payload, note))) {
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
  at: { now?: number; seen: 'changed' | 'read'; timezone: string },
): Promise<{ queue: 'filed' | 'waiting' | 'before'; filed: string[] }> {
  const earlier = await earlierSuggestions(watch.communityId, listing.id)
  const on = changedOn(at.now ?? Date.now(), at.timezone)
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
  at: { now?: number; seen: 'changed' | 'read'; timezone: string },
): Promise<ContactFiled> {
  const keys = Object.keys(reading.changes)
  const { lines } = keys.length ? fieldsEdit(category, listing, reading.changes) : { lines: [] }
  if (!lines.length) return { reading, lines: [], queue: null, filed: [] }
  if (blocked) return { reading, lines, queue: 'waiting', filed: [] }
  const section: HoursSection = { section: CONTACT_SECTION, label: contactBoxName(fields), hours: null, notes: null }
  const { queue, filed } = await fileSections(watch, category, listing, [{ section, details: reading.changes, source: { section: CONTACT_SECTION, keys } }], waiting, text, at)
  return { reading, lines, queue, filed }
}

/** A run's outcome with what the page said of the phone and email: kept
 *  on its check (the last one, when this run had the AI read nothing), its
 *  differences among the check's, what it filed counted. */
export function withContact(o: WatchOutcome, contact: ContactFiled | null, last: WatchCheck | null, what: PageReads['kind'], from: WatchCheck['from']): WatchOutcome {
  if (!contact || !o.ok) return o
  const { at, ...was } = last ?? { at: '' }
  const carried = !o.check && !!last
  const base: Omit<WatchCheck, 'at'> = o.check ?? (last ? (was as Omit<WatchCheck, 'at'>) : { what, from, result: 'nothing', read: [], differences: [], queue: null })
  const { same, changes } = contact.reading
  const differences = [...base.differences.filter((d) => !contact.lines.includes(d)), ...contact.lines]
  // A phone that agrees doesn't make a page that gave no hours a read one:
  // the place stays "can't be read" for its hours (Mikvah hours board 3).
  const result: WatchCheck['result'] = contact.lines.length ? 'differs' : base.result
  return {
    ...o,
    filed: o.filed + contact.filed.length,
    check: {
      ...base,
      result,
      differences,
      queue: base.queue ?? contact.queue,
      contact: { same, changes: Object.keys(changes) },
      // The last read's, carried with nothing new: dated by that read, not
      // this morning's run (CheckFound).
      ...(carried && !contact.lines.length ? { at } : {}),
    },
  }
}
