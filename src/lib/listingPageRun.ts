import { getAdminClient } from '@/lib/supabase/admin'
import { community as communityConfig } from '@/community.config'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { fetchPublic, htmlToText, type MenuSource } from '@/lib/menuReader'
import { menuHash } from '@/lib/menuWatch'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { readShulWeek } from '@/lib/shulWeekReading'
import { applyUpdate, changesAnything, sameTime, type TimesUpdate } from '@/lib/scheduleUpdate'
import { readSchedules, regularMinyanim, schedulesKey } from '@/lib/schedules'
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
export async function readListingPage(url: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<MenuSource | null> {
  const page = await fetchPublic(url, { fetchImpl: opts.fetchImpl, headers: WATCH_FETCH_HEADERS })
  if (!page) return null
  if (page.type === 'pdf') return { url: page.url, text: null, pdf: page.body }
  const text = htmlToText(page.body.replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, ' '))
  return text.length >= 200 ? { url: page.url, text, pdf: null } : null
}

/** What the page would change on the listing: the edit and its lines, or
 *  nothing (it agrees, it's one week's times, the AI found none). */
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
export function dropListed(update: TimesUpdate, current: readonly Minyan[]): TimesUpdate {
  const listed = (r: TimesUpdate['rows'][number]) =>
    current.some((m) => m.days.includes(r.day as Minyan['days'][number]) && sameMinyanName(m.tefillah, r.tefillah) && sameTime(m, r))
  return { ...update, rows: update.rows.filter((r) => r.status !== 'new' || !listed(r)) }
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
    // The shul's usual times (scheduleUpdate.ts): a page of one week's
    // times is the newsletter's job, not a change to the usual ones.
    const read = await readShulWeek(listing, reads.key, text !== null ? { text } : { pdf: source.pdf! }, apiKey)
    const update = dropListed(keepUncovered(read.update), regularMinyanim(listing[reads.key]))
    if (update.kind !== 'schedule' || !changesAnything(update)) return null
    const sk = schedulesKey(reads.key)
    const applied = applyUpdate(regularMinyanim(listing[reads.key]), readSchedules(listing[sk]), update)
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

  const source = await readListingPage(watch.url, { fetchImpl: opts.fetchImpl })
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
