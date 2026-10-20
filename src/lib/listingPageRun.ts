import { getAdminClient } from '@/lib/supabase/admin'
import { community as communityConfig } from '@/community.config'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { fetchPublic, htmlToText, type MenuSource } from '@/lib/menuReader'
import { menuHash } from '@/lib/menuWatch'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { readShulWeek } from '@/lib/shulWeekReading'
import { CALENDAR_DAYS, CALENDAR_HEADING, calendarFeeds, calendarLines, embeddedEntries, icsEntries, isIcs, type CalendarEntry } from '@/lib/calendarFeed'
import { applyUpdate, changesAnything, datesBetween, datesHeldOverWebsite, sameTime, weekdayOf, type TimesUpdate } from '@/lib/scheduleUpdate'
import { readSchedules, regularMinyanim, schedulesKey, type SpecialSchedule } from '@/lib/schedules'
import { buildCatalog, readMessage } from '@/lib/messageReader'
import { fieldsEdit, readFieldChanges } from '@/lib/fieldChanges'
import { editSubmission } from '@/lib/editSubmission'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendWatchDigest } from '@/lib/email'
import type { MenuReadBudget } from '@/lib/menuWatchRun'
import type { CategoryConfig } from '@/lib/categories'
import type { Watch, WatchOutcome } from '@/lib/watches'
import type { Minyan, Tefillah } from '@/lib/davening'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import {
  changedOn,
  filedBefore,
  hoursReads,
  LISTING_PAGE_WATCH_NAME,
  listingPageNote,
  listingPageSource,
  MAX_PAGE_TEXT,
  pageReadsFor,
  type PageReads,
} from '@/lib/listingPageWatch'

// A listing's own page: its database and network half (listingPageWatch.ts
// has the rules). Run daily by /api/cron/watches for every listing-page
// watch, and on demand from the admin Watches tab. Server-only.

/** A page as the readers take it: its text, a line per block, or a PDF.
 *  Without its menus (<nav>): a shul site's runs to thousands of words,
 *  crowding out the times in what the AI is given, and a new menu item
 *  isn't a change to the page. */
export async function readListingPage(url: string, opts: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<MenuSource | null> {
  const page = await fetchPublic(url, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS })
  if (!page) return null
  if (page.type === 'pdf') return { url: page.url, text: null, pdf: page.body }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: communityConfig.timezone }).format(new Date(opts.now ?? Date.now()))
  const last = new Date(Date.parse(`${today}T12:00:00Z`) + (CALENDAR_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
  // The watch's address may be the calendar feed itself.
  if (isIcs(page.body)) return withCalendar(page.url, '', icsEntries(page.body, communityConfig.timezone, today, last), today)
  // A calendar on the page: its feed (the first that reads) or the event
  // list in its scripts (calendarFeed.ts), ahead of the page's own words.
  let entries = embeddedEntries(page.body, communityConfig.timezone)
  for (const feed of calendarFeeds(page.body, page.url).slice(0, 2)) {
    const got = await fetchPublic(feed, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS })
    if (got?.type === 'html' && isIcs(got.body)) {
      entries = icsEntries(got.body, communityConfig.timezone, today, last)
      break
    }
  }
  const text = htmlToText(page.body.replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, ' '))
  return withCalendar(page.url, text, entries, today)
}

/** The page as the reader takes it: its calendar's coming entries, when it
 *  has any, then its words. A page with neither isn't readable. */
function withCalendar(url: string, text: string, entries: CalendarEntry[], today: string): MenuSource | null {
  const lines = calendarLines(entries, today)
  if (lines.length) return { url, text: [CALENDAR_HEADING, ...lines, '', text].join('\n').trim(), pdf: null }
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
  const read = new Set(update.rows.filter((r) => r.status !== 'gone' && r.status !== 'kept').map((r) => `${r.day} ${r.tefillah}`))
  return { ...update, rows: update.rows.map((r) => (r.status === 'gone' && !read.has(`${r.day} ${r.tefillah}`) ? { ...r, status: 'kept' } : r)) }
}

const EVENING: readonly Tefillah[] = ['mincha', 'maariv', 'mincha_maariv', 'kabbalas_shabbos']

/** One minyan, whatever the page calls it: Friday night's "Mincha /
 *  Kabbalat Shabbat / Ma'ariv" is the listing's Mincha/Maariv, and a time
 *  the AI couldn't name ("other") is the listing's at that hour. */
function sameMinyanName(a: Tefillah, b: Tefillah): boolean {
  return a === b || a === 'other' || b === 'other' || (EVENING.includes(a) && EVENING.includes(b))
}

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
      current.some((m) => m.days.includes(day as Minyan['days'][number]) && sameMinyanName(m.tefillah, r.tefillah) && sameTime(m, r)) ||
      (dated && schedules.some((s) => s.minyanim.some((m) => m.on.includes(r.day) && sameMinyanName(m.tefillah, r.tefillah) && sameTime(m, r))))
    )
  }
  return { ...update, rows: update.rows.filter((r) => r.status !== 'new' || !listed(r)) }
}

/** A calendar lists a weekly minyan once a date, and the reader passes each
 *  on as a one-off: Rodeph Shalom's Thursday morning minyan came out as
 *  "that day only" twice (Oct 20). The same tefillah at the same time on
 *  the same weekday, two weeks or more, is a usual time: a change to the
 *  shul's one such minyan that day, or a new one beside them. Run after
 *  dropListed, so a date at the usual time is already gone. */
export function weeklyFromCalendar(update: TimesUpdate, current: readonly Minyan[]): TimesUpdate {
  if (update.kind !== 'schedule') return update
  const dated = update.rows.filter((r) => r.status === 'new' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) && !r.occasion)
  const groups: (typeof dated)[] = []
  for (const r of dated) {
    const g = groups.find(([x]) => weekdayOf(x.day) === weekdayOf(r.day) && x.tefillah === r.tefillah && sameTime(x, r))
    if (g) g.push(r)
    else groups.push([r])
  }
  const folded = new Set<string>()
  const weekly = groups.flatMap((g) => {
    if (new Set(g.map((r) => r.day)).size < 2) return []
    for (const r of g) folded.add(r.id)
    const day = weekdayOf(g[0].day)
    const usual = current.filter((m) => m.days.includes(day) && sameMinyanName(m.tefillah, g[0].tefillah))
    const row = { ...g[0], day }
    return [usual.length === 1 ? { ...row, status: 'changed' as const, was: usual[0].time, rowId: usual[0].id } : row]
  })
  return weekly.length ? { ...update, rows: [...update.rows.filter((r) => !folded.has(r.id)), ...weekly] } : update
}

/** What the website gives for days the shul's newsletter (or a person)
 *  has already given a week for, taken out: the newsletter wins (the user,
 *  Oct 20). A website is usually the one behind. A week of the website's
 *  that touches such a day is left out whole, since it would replace that
 *  day's times. Null when nothing is left. */
export function yieldToNewsletter(update: TimesUpdate, schedules: readonly SpecialSchedule[]): TimesUpdate | null {
  const held = datesHeldOverWebsite(schedules)
  if (update.kind === 'week') return update.from && update.to && datesBetween(update.from, update.to).some((d) => held.has(d)) ? null : update
  return { ...update, rows: update.rows.filter((r) => !held.has(r.day)) }
}

/** Has the AI read the page for the listing, and compares what it read
 *  with the listing as it is now. */
export async function proposeFromPage(
  listing: DirectoryResource,
  category: CategoryConfig,
  reads: PageReads,
  source: MenuSource,
  { apiKey, communityName, fetchImpl }: { apiKey: string; communityName: string; fetchImpl?: typeof fetch },
): Promise<PageProposal> {
  const text = source.text?.slice(0, MAX_PAGE_TEXT) ?? null
  if (reads.kind === 'times') {
    // The shul's times (scheduleUpdate.ts): its usual ones, and since Oct 20
    // the dated ones too, a week's or a calendar's (calendarFeed.ts), filed
    // as that week's times. What the newsletter has given for the same
    // days wins.
    const read = await readShulWeek(listing, reads.key, text !== null ? { text } : { pdf: source.pdf! }, apiKey)
    const sk = schedulesKey(reads.key)
    const regular = regularMinyanim(listing[reads.key])
    const schedules = readSchedules(listing[sk])
    const update = yieldToNewsletter(weeklyFromCalendar(dropListed(keepUncovered(read.update), regular, schedules), regular), schedules)
    if (!update || !changesAnything(update)) return null
    const applied = applyUpdate(regular, schedules, update, { postedBy: 'website' })
    if (applied.changes.length === 0) return null
    return { submission: editSubmission(category, listing, { [reads.key]: applied.minyanim, [sk]: applied.schedules }), lines: applied.changes, keys: [reads.key, sk] }
  }
  // Weekly hours: the any-field reader (messageReader.ts), told only of this
  // listing, and only its hours kept.
  const reading = await readMessage(
    {
      text: text !== null ? `${listing.name}’s own web page (${source.url ?? ''}), as it reads today:\n\n${text}` : '',
      images: source.pdf ? [{ mime: 'application/pdf', b64: source.pdf }] : [],
    },
    buildCatalog([listing], [category]),
    { apiKey, communityName, about: listing.id, fetchImpl },
  )
  const changes = hoursReads(reading.proposals, listing.id, reads.keys)
  if (changes.length === 0) return null
  const { values } = readFieldChanges(category, listing, changes)
  const { submission, lines } = fieldsEdit(category, listing, values)
  return lines.length ? { submission, lines, keys: reads.keys } : null
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
 *  leaves the listing's date alone (listingPageWatch.ts). */
export async function runListingPageWatch(
  watch: Pick<Watch, 'communityId' | 'url' | 'resourceId' | 'pageHash'>,
  budget?: MenuReadBudget,
  opts: { fetchImpl?: typeof fetch; apiKey?: string | undefined; now?: number } = {},
): Promise<WatchOutcome> {
  if (!watch.resourceId) return { ok: false, error: 'Tie this watch to the listing it keeps current' }
  const row = await getResourceRowById(watch.resourceId, watch.communityId)
  if (!row || row.status !== 'approved') return { ok: false, error: 'The listing this page belongs to isn’t in the guide any more' }
  const listing = normalizeRow(row)
  const category = (await listCategoriesUncached(watch.communityId)).find((c) => c.id === listing.category)
  const reads = category && pageReadsFor(category)
  if (!category || !reads) return { ok: false, error: 'The listing this page belongs to has no davening times or hours to keep current' }

  const source = await readListingPage(watch.url, { fetchImpl: opts.fetchImpl, now: opts.now })
  if (!source) return { ok: false, error: 'Couldn’t read the page (blocked, moved, or built in the browser)' }
  const pageHash = menuHash(source)
  // The first read sets the baseline; an unchanged page is left alone, and
  // its listing's date with it.
  if (!watch.pageHash || watch.pageHash === pageHash) return { ok: true, filed: 0, pageHash }

  // Changed. A suggestion already waiting, no AI, or this run's reads spent:
  // the old fingerprint stays, so the change is still news next time.
  if (await hasPendingSuggestion(watch.communityId, listing.id)) return { ok: true, filed: 0 }
  const apiKey = 'apiKey' in opts ? opts.apiKey : process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: true, filed: 0 }
  if (budget) {
    if (budget.aiReads <= 0) return { ok: true, filed: 0 }
    budget.aiReads--
  }

  let proposal: PageProposal
  try {
    proposal = await proposeFromPage(listing, category, reads, source, { apiKey, communityName: await communityName(watch.communityId), fetchImpl: opts.fetchImpl })
  } catch (err) {
    return { ok: false, error: `The page changed, and the AI couldn’t read it (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!proposal) return { ok: true, filed: 0, pageHash }
  if (filedBefore(await earlierSuggestions(watch.communityId, listing.id), proposal.submission.details, proposal.keys)) return { ok: true, filed: 0, pageHash }

  const on = changedOn(opts.now ?? Date.now(), communityConfig.timezone)
  const note = listingPageNote(watch.url, on, proposal.lines)
  await submitListingUpdate(
    watch.communityId,
    listing.id,
    { ...proposal.submission, source: listingPageSource(listing.name, watch.url, on, source.text) } as ResourceSubmission,
    note,
    { name: LISTING_PAGE_WATCH_NAME },
  )
  await sendWatchDigest(watch.communityId, `${listing.name}’s website`, [{ name: listing.name, what: proposal.lines.join('; ') }]).catch((err) =>
    console.error('[watch-listing-page] digest failed:', err),
  )
  return { ok: true, filed: 1, pageHash }
}
