import { getAdminClient } from './supabase/admin'
import { listCategoriesUncached, getCategoryById } from './categoryStore'
import { isCategorySyncEligible, type CategoryConfig } from './categories'
import { fetchPlaceSync, namesOverlap, nextGoogleFields, searchPlaces, syncMayWrite, type PlaceSync } from './googlePlaces'
import { formatHoursSummary } from './hours'
import { listWatches } from './watchStore'
import { readOwnSiteNow } from './hoursJobRun'
import { MENU_WATCH_CREATOR, watchHealth, type Watch } from './watches'
import { isListingPageWatch, pageReadsFor } from './listingPageWatch'
import { isLinkCheck } from './linkCheck'
import { approveSubmission, submitListingUpdate } from './submissionStore'
import { listingSlug } from './listingSlug'
import { routes } from './routes'
import {
  CHECKED_FIELDS,
  CHECKED_LABELS,
  googleSection,
  streetOf,
  websiteKeyOf,
  type CheckedField,
  type Checker,
  type GoogleClosure,
  type GoogleCompare,
  type GoogleFieldRow,
  type GooglePlace,
} from './googleJob'
import type { ResourceSubmission } from '@/types'

// ── The Watches tab's Google page, on the server (googleJob.ts) ─────────────
// Who checks each field is worked out here from each job's own rule:
//   Google       the listing has a match and the sync may write the field
//                (syncMayWrite, the rule the morning's sync follows).
//   Its website  a page of its website a job reads loads: any of them for
//                its Website, one a listing-page job reads its hours from
//                for its Hours (pageReadsFor), and any listing page for its
//                Phone (contactRead.ts reads it off every one).
//   You          Keep the listing, or Not on Google (details.googleKept),
//                for a year.
//   Nothing      none of these.
// What Check against Google found is kept on the listing
// (details.googleCheck), so Use Google's and Keep the listing need no
// second paid call.

type Row = {
  id: string
  name: string
  category: string
  phone: string | null
  address: string | null
  anchor_id: string
  distance: number | null
  details: Record<string, unknown> | null
}

/** Google's answer, kept for Use Google's: its raw values. */
type CheckValues = Partial<Record<CheckedField, unknown>>
type StoredCheck = { at: string; values: CheckValues; decided?: { what: 'used' | 'kept'; at: string } }

/** A field you checked is yours this long, then nothing checks it again
 *  (agreed Oct 24): a year on, the listing is worth a second look. */
const KEPT_FOR_MS = 365 * 86_400_000
/** A check's answer stays usable this long; after it, it's asked again. */
const CHECK_KEEPS_MS = 7 * 86_400_000
/** "Used Oct 22" shows this long after the decision. */
const DECIDED_SHOWS_MS = 86_400_000

/** The fields this listing's category has. */
export function fieldsOf(category: CategoryConfig): CheckedField[] {
  return CHECKED_FIELDS.filter((f) => {
    if (f === 'hours') return category.detailFields.some((d) => d.key === 'hours' && d.type === 'hours')
    if (f === 'phone') return category.hasPhone !== false
    if (f === 'website') return !!websiteKeyOf(category)
    return true
  })
}

function valueOf(field: CheckedField, row: Row, category: CategoryConfig): unknown {
  if (field === 'name') return row.name
  if (field === 'phone') return row.phone
  if (field === 'hours') return row.details?.hours
  const key = websiteKeyOf(category)
  return key ? row.details?.[key] : undefined
}

function shown(field: CheckedField, v: unknown): string {
  if (field === 'hours') return v && typeof v === 'object' && Object.keys(v).length ? formatHoursSummary(v) : '—'
  return typeof v === 'string' && v.trim() ? v.trim() : '—'
}

const hostOf = (url: unknown) => {
  if (typeof url !== 'string' || !url.trim()) return null
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

const loads = (w: Watch, now: number) => {
  const state = watchHealth(w, now).state
  return w.active && state !== 'failing' && state !== 'stale' && !!w.lastRunAt
}

/** The fields a page of its website checks: a job reads one there and it
 *  loads. */
export function websiteChecks(row: Row, category: CategoryConfig, watches: readonly Watch[], now: number): Set<CheckedField> {
  const out = new Set<CheckedField>()
  const site = hostOf(valueOf('website', row, category))
  const mine = watches.filter((w) => w.resourceId === row.id && loads(w, now))
  const pages = mine.filter((w) => isListingPageWatch(w))
  if (site && mine.some((w) => (isListingPageWatch(w) || w.createdBy === MENU_WATCH_CREATOR) && hostOf(w.url) === site)) out.add('website')
  if (pages.length) {
    if (category.hasPhone !== false) out.add('phone')
    const reads = pageReadsFor(category)
    if (reads?.kind === 'hours' && reads.keys.includes('hours')) out.add('hours')
  }
  return out
}

const isoOr = (v: unknown) => (typeof v === 'string' && v ? v : null)
const storedCheck = (details: Record<string, unknown>): StoredCheck | null => {
  const c = details.googleCheck as StoredCheck | undefined
  return c && typeof c.at === 'string' && c.values && typeof c.values === 'object' ? c : null
}

const matchOf = (details: Record<string, unknown>) => (typeof details.placeId === 'string' && details.placeId ? details.placeId : null)

/** Who checks each of the listing's fields. */
export function fieldRows(row: Row, category: CategoryConfig, watches: readonly Watch[], now: number): GoogleFieldRow[] {
  const details = row.details ?? {}
  const matched = !!matchOf(details)
  const failing = matched && !!isoOr(details.lastSyncError)
  const readAt = isoOr(details.googleSyncedAt) ?? isoOr(details.googleStatusCheckedAt)
  const site = websiteChecks(row, category, watches, now)
  const kept = (details.googleKept ?? {}) as Partial<Record<CheckedField, string>>
  return fieldsOf(category).map((field) => {
    const value = valueOf(field, row, category)
    const by: Checker =
      matched && syncMayWrite(details, field, value)
        ? { kind: 'google', ...(failing ? { at: readAt } : {}) }
        : site.has(field)
          ? { kind: 'website' }
          : typeof kept[field] === 'string' && now - Date.parse(kept[field]) < KEPT_FOR_MS
            ? { kind: 'you', at: kept[field] }
            : field === 'website' && linkOpenedAt(row.id, value, watches)
              ? { kind: 'links', at: linkOpenedAt(row.id, value, watches) }
              : { kind: 'nothing' }
    return { field, label: CHECKED_LABELS[field], value: shown(field, value), by }
  })
}

/** When the Links job last opened this website of the listing's, on a
 *  check of this link that opened: a website Google doesn't have is checked
 *  that way (PKS Kosher Market's, the airport's page for it: the user, Oct
 *  27). */
function linkOpenedAt(id: string, website: unknown, watches: readonly Watch[]): string | null {
  if (typeof website !== 'string' || !website) return null
  const record = watches.find((w) => isLinkCheck(w) && w.resourceId === id && w.pageHash === website.trim())
  return record && !record.failingSince ? record.lastOkAt : null
}

function closureOf(details: Record<string, unknown>): GoogleClosure | null {
  const status = details.businessStatus
  if (status !== 'CLOSED_TEMPORARILY' && status !== 'CLOSED_PERMANENTLY') return null
  // Every read asks whether it's open; a status-only read asks nothing else.
  const reads = [isoOr(details.googleSyncedAt), isoOr(details.googleStatusCheckedAt)].filter((d): d is string => !!d).sort()
  const since = isoOr(details.businessStatusChangedAt)
  // Kept before Google last changed its answer is no longer an answer.
  const keptAt = isoOr(details.businessStatusKeptAt)
  const kept = keptAt && (!since || keptAt >= since) ? keptAt : null
  return { status, shownOpen: details.businessStatusOverride === 'OPERATIONAL', since, readAt: reads.at(-1) ?? null, kept }
}

/** What a stored check left to decide, set against the listing as it is. */
function compareOf(row: Row, category: CategoryConfig, fields: readonly GoogleFieldRow[], check: StoredCheck | null, now: number): GoogleCompare | null {
  if (!check || check.decided || now - Date.parse(check.at) > CHECK_KEEPS_MS) return null
  const rows = fields.map((f) => {
    const google = check.values[f.field]
    const none = shown(f.field, google) === '—'
    const changed = !none && f.by.kind !== 'google' && !same(f.field, google, valueOf(f.field, row, category))
    return { field: f.field, label: f.label, google: none ? '—' : shown(f.field, google), changed, ...(none ? { none: true } : changed ? { raw: google } : {}) }
  })
  return { at: check.at, rows }
}

function same(field: CheckedField, a: unknown, b: unknown): boolean {
  if (field === 'hours') return stable(a) === stable(b)
  if (field === 'phone') return digits(a) === digits(b)
  if (field === 'website') return hostPath(a) === hostPath(b)
  return typeof a === 'string' && typeof b === 'string' && a.trim() === b.trim()
}
const digits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') : '')
const hostPath = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '') : '')
function stable(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
}

function placeOf(row: Row, category: CategoryConfig, watches: readonly Watch[], now: number, community: string, street: string | null): GooglePlace {
  const details = row.details ?? {}
  const matched = !!matchOf(details)
  const fields = fieldRows(row, category, watches, now)
  const check = storedCheck(details)
  const decided = check?.decided && now - Date.parse(check.decided.at) < DECIDED_SHOWS_MS ? check.decided : null
  return {
    id: row.id,
    name: row.name,
    street,
    address: row.address,
    category: row.category,
    categoryLabel: category.pluralLabel,
    href: routes.listing(community, row.category, listingSlug(row)),
    matched,
    section: googleSection({ matched, failing: !!isoOr(details.lastSyncError), fields }),
    fields,
    readAt: isoOr(details.googleSyncedAt) ?? isoOr(details.googleStatusCheckedAt),
    failedAt: isoOr(details.lastSyncFailedAt),
    notOnGoogle: isoOr(details.notOnGoogle),
    closure: closureOf(details),
    compare: compareOf(row, category, fields, check, now),
    decided,
  }
}

const COLUMNS = 'id,name,category,phone,address,anchor_id,distance,details'

/** Every listing the sync covers: in a category with an address. */
export async function loadGoogleJob(community: string, now = Date.now()): Promise<GooglePlace[]> {
  const [categories, { data, error }, { watches }] = await Promise.all([
    listCategoriesUncached(community),
    getAdminClient().from('resource').select(COLUMNS).eq('community_id', community).eq('status', 'approved'),
    listWatches(community),
  ])
  if (error) throw new Error(`Failed to load listings: ${error.message}`)
  const byId = new Map(categories.filter(isCategorySyncEligible).map((c) => [c.id, c]))
  const rows = ((data ?? []) as Row[]).filter((r) => byId.has(r.category))
  const names = new Map<string, number>()
  for (const r of rows) names.set(r.name.trim().toLowerCase(), (names.get(r.name.trim().toLowerCase()) ?? 0) + 1)
  return rows.map((r) => placeOf(r, byId.get(r.category)!, watches, now, community, (names.get(r.name.trim().toLowerCase()) ?? 0) > 1 ? streetOf(r.address) : null))
}

async function loadOne(community: string, id: string): Promise<{ row: Row; category: CategoryConfig }> {
  const { data, error } = await getAdminClient().from('resource').select(COLUMNS).eq('community_id', community).eq('id', id).eq('status', 'approved').maybeSingle()
  if (error) throw new Error(`Failed to load the listing: ${error.message}`)
  if (!data) throw new GoogleJobError('Listing not found.', 404)
  const row = data as Row
  const category = await getCategoryById(community, row.category)
  if (!category || !isCategorySyncEligible(category)) throw new GoogleJobError('Google doesn’t check this kind of listing.', 400)
  return { row, category }
}

/** A refusal the page can say as it is. */
export class GoogleJobError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function onePlace(community: string, id: string, now: number): Promise<GooglePlace> {
  const [{ row, category }, { watches }] = await Promise.all([loadOne(community, id), listWatches(community)])
  return placeOf(row, category, watches, now, community, null)
}

async function writeDetails(community: string, id: string, details: Record<string, unknown>): Promise<void> {
  const { error } = await getAdminClient().from('resource').update({ details }).eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to save: ${error.message}`)
}

function googleValues(sync: PlaceSync): CheckValues {
  return { name: sync.name ?? null, hours: sync.hours ?? null, phone: sync.phone ?? null, website: sync.website ?? null }
}

/** Asks Google about the listing's match: the fields that already match
 *  become Google's to keep, and its answer is kept to decide the rest. */
async function compareWithGoogle(community: string, row: Row, category: CategoryConfig, placeId: string, now: number, extra: Record<string, unknown> = {}): Promise<void> {
  const sync = await fetchPlaceSync(placeId)
  if (!sync) throw new GoogleJobError('Google didn’t answer. Try again shortly.', 502)
  const values = googleValues(sync)
  const details = { ...(row.details ?? {}), ...extra }
  const matches = fieldsOf(category).filter((f) => !syncMayWrite(details, f, valueOf(f, row, category)) && shown(f, values[f]) !== '—' && same(f, values[f], valueOf(f, row, category)))
  const at = new Date(now).toISOString()
  await writeDetails(community, row.id, {
    ...details,
    ...(matches.length || !Array.isArray(details.googleFields) ? { googleFields: nextGoogleFields(details, matches) } : {}),
    googleCheck: { at, values } satisfies StoredCheck,
  })
}

/** Check against Google. */
export async function checkAgainstGoogle(community: string, id: string, now = Date.now()): Promise<GooglePlace> {
  const { row, category } = await loadOne(community, id)
  const placeId = matchOf(row.details ?? {})
  if (!placeId) throw new GoogleJobError('This listing has no Google match. Find it on Google first.', 400)
  await compareWithGoogle(community, row, category, placeId, now)
  return onePlace(community, id, now)
}

/** Find it on Google: what Google finds for the listing. */
export async function findOnGoogle(community: string, id: string, query?: string): Promise<{ placeId: string; name: string; address: string }[]> {
  const { row } = await loadOne(community, id)
  const found = await searchPlaces(query?.trim() || [row.name, row.address].filter(Boolean).join(', '))
  if (found === null) throw new GoogleJobError('Google didn’t answer. Try again shortly.', 502)
  // A place said to be the wrong one isn't offered again.
  const wrong = (row.details ?? {}).googleWrong
  return Array.isArray(wrong) ? found.filter((f) => !wrong.includes(f.placeId)) : found
}

/** A place picked on Find it on Google becomes the listing's match, and is
 *  compared with it at once. */
export async function pickGooglePlace(community: string, id: string, placeId: string, now = Date.now()): Promise<GooglePlace> {
  const { row, category } = await loadOne(community, id)
  const details = { ...(row.details ?? {}) }
  const before = matchOf(details)
  // A different match: what the old one said describes another place.
  for (const k of ['lastSyncError', 'lastSyncFailedAt', 'notOnGoogle', 'verifiedPlaceId', ...(before && before !== placeId ? ['googleSyncedAt', 'googleStatusCheckedAt'] : [])]) delete details[k]
  await compareWithGoogle(community, { ...row, details }, category, placeId, now, { placeId })
  return onePlace(community, id, now)
}

/** Its fields nothing checks become yours, from today. */
function keptNow(row: Row, category: CategoryConfig, watches: readonly Watch[], now: number): Record<string, string> {
  const at = new Date(now).toISOString()
  const prior = ((row.details ?? {}).googleKept ?? {}) as Record<string, string>
  const nothing = fieldRows(row, category, watches, now).filter((f) => f.by.kind === 'nothing').map((f) => f.field)
  return { ...prior, ...Object.fromEntries(nothing.map((f) => [f, at])) }
}

/** Keep the listing: nothing on the listing changes, and you become the
 *  checker of each field nothing checks. */
export async function keepTheListing(community: string, id: string, now = Date.now()): Promise<GooglePlace> {
  const [{ row, category }, { watches }] = await Promise.all([loadOne(community, id), listWatches(community)])
  const details = row.details ?? {}
  const check = storedCheck(details)
  await writeDetails(community, id, {
    ...details,
    googleKept: keptNow(row, category, watches, now),
    ...(check ? { googleCheck: { ...check, decided: { what: 'kept', at: new Date(now).toISOString() } } } : {}),
  })
  return onePlace(community, id, now)
}

/** Not on Google: said once. Its website, when its kind's is read for
 *  what Google doesn't have, is watched and read at once (readOwnSiteNow),
 *  and only the fields nothing checks after that become yours: until Oct
 *  25 they all did, and a place no page had read yet showed as up to
 *  date, with nothing checking it. */
export async function notOnGoogle(community: string, id: string, now = Date.now()): Promise<GooglePlace> {
  const { row, category } = await loadOne(community, id)
  const details = { ...(row.details ?? {}) }
  if (matchOf(details)) {
    // A match Google stopped answering for is dropped (agreed Oct 24); a
    // live one stays.
    if (!isoOr(details.lastSyncError)) throw new GoogleJobError('This listing has a Google match.', 400)
    for (const k of ['placeId', 'lastSyncError', 'lastSyncFailedAt', 'verifiedPlaceId', 'googleSyncedAt', 'googleStatusCheckedAt']) delete details[k]
  }
  const said = { ...details, notOnGoogle: new Date(now).toISOString() }
  await writeDetails(community, id, said)
  // A page that won't read leaves its fields to you, as before.
  await readOwnSiteNow(community, id).catch((err) => console.error('[googleJob] reading its website failed:', err))
  const [{ row: after }, { watches }] = await Promise.all([loadOne(community, id), listWatches(community)])
  await writeDetails(community, id, { ...(after.details ?? said), googleKept: keptNow(after, category, watches, now) })
  return onePlace(community, id, now)
}

/** What a Google match wrote about the place, and what was decided about
 *  it: all of it describes another place once the match is wrong. */
const MATCH_KEYS = [
  'placeId', 'verifiedPlaceId', 'googleSyncedAt', 'googleStatusCheckedAt', 'lastSyncError', 'lastSyncFailedAt', 'googleFields', 'googleCheck', 'googleKept',
  'businessStatus', 'businessStatusBefore', 'businessStatusChangedAt', 'businessStatusOverride', 'businessStatusKeptAt', 'googleDescription',
]

/** Wrong place (Oct 26): Google matched it to another place (BZBI Early
 *  Childhood to the temple). The match and all it said go, Find it on
 *  Google stops offering it, and nothing checks the listing until it is
 *  found on Google or said not to be. Its fields keep their values. */
export async function wrongPlace(community: string, id: string, now = Date.now()): Promise<GooglePlace> {
  const { row } = await loadOne(community, id)
  const details = { ...(row.details ?? {}) }
  const placeId = matchOf(details)
  if (!placeId) throw new GoogleJobError('This listing has no Google match.', 400)
  const wrong = Array.isArray(details.googleWrong) ? (details.googleWrong as unknown[]).filter((x): x is string => typeof x === 'string') : []
  for (const k of MATCH_KEYS) delete details[k]
  await writeDetails(community, id, { ...details, googleWrong: [...new Set([...wrong, placeId])] })
  return onePlace(community, id, now)
}

/** The listing with some of its fields set, through the queue and
 *  approved at once, so its history says so; Google keeps each field left
 *  as Google has it (googleAutofill, submissionStore.ts). */
async function saveFields(community: string, row: Row, category: CategoryConfig, set: Partial<Record<CheckedField, unknown>>, google: CheckValues, admin: string, note: string): Promise<void> {
  const websiteKey = websiteKeyOf(category)
  const details: Record<string, unknown> = { ...(row.details ?? {}) }
  if ('hours' in set) details.hours = set.hours
  if ('website' in set && websiteKey) details[websiteKey] = set.website
  const name = typeof set.name === 'string' && set.name.trim() ? set.name.trim() : row.name
  const phone = 'phone' in set ? (typeof set.phone === 'string' ? set.phone : '') : (row.phone ?? '')
  // Google's version of each field set, for approval to compare against.
  // Its name only where the names overlap: one that doesn't takes the
  // listing's match away (withResolvedPlaceId).
  const autofill = Object.fromEntries(
    (Object.keys(set) as CheckedField[]).flatMap((f) => {
      const g = google[f]
      if (g === null || g === undefined || (f === 'name' && !(typeof g === 'string' && namesOverlap(g, name)))) return []
      return [[f, typeof g === 'string' ? g : JSON.stringify(g)]]
    }),
  )
  const payload = {
    category: row.category,
    name,
    anchorId: row.anchor_id,
    distance: row.distance,
    address: row.address ?? '',
    phone,
    details: { ...details, ...(Object.keys(autofill).length ? { googleAutofill: autofill } : {}) },
  } as ResourceSubmission
  const filed = await submitListingUpdate(community, row.id, payload, note, { name: 'Google Maps' })
  await approveSubmission(filed.id, community, admin)
}

async function freshCheck(community: string, row: Row, category: CategoryConfig, now: number): Promise<{ row: Row; check: StoredCheck }> {
  let check = storedCheck(row.details ?? {})
  if (!check || now - Date.parse(check.at) > CHECK_KEEPS_MS) {
    const placeId = matchOf(row.details ?? {})
    if (!placeId) throw new GoogleJobError('This listing has no Google match.', 400)
    await compareWithGoogle(community, row, category, placeId, now)
    row = (await loadOne(community, row.id)).row
    check = storedCheck(row.details ?? {})!
  }
  return { row, check }
}

/** Use Google's: its version on the listing, and from then on Google
 *  keeps those fields. */
export async function applyGoogles(community: string, id: string, admin: string, now = Date.now()): Promise<GooglePlace> {
  const [loaded, { watches }] = await Promise.all([loadOne(community, id), listWatches(community)])
  const { category } = loaded
  const { row, check } = await freshCheck(community, loaded.row, category, now)
  const fields = fieldRows(row, category, watches, now)
  const compare = compareOf(row, category, fields, { ...check, decided: undefined }, now)
  const set = Object.fromEntries((compare?.rows ?? []).filter((r) => r.changed).map((r) => [r.field, check.values[r.field]]))
  if (Object.keys(set).length) await saveFields(community, row, category, set, check.values, admin, 'From Google Maps, used on the Watches tab’s Google page.')
  await markDecided(community, id, 'used', now)
  return onePlace(community, id, now)
}

/** Edit: the listing's own edit, filled in with Google's version, saved as
 *  the admin left it. Its fields nothing checks after it are theirs. */
export async function editFromGoogle(community: string, id: string, values: Partial<Record<CheckedField, unknown>>, admin: string, now = Date.now()): Promise<GooglePlace> {
  const { row, category } = await loadOne(community, id)
  const check = storedCheck(row.details ?? {})
  const set = Object.fromEntries(fieldsOf(category).filter((f) => f in values).map((f) => [f, values[f]]))
  if (Object.keys(set).length) await saveFields(community, row, category, set, check?.values ?? {}, admin, 'Edited from Google Maps on the Watches tab’s Google page.')
  const [{ row: after }, { watches }] = await Promise.all([loadOne(community, id), listWatches(community)])
  const details = after.details ?? {}
  const latest = storedCheck(details)
  await writeDetails(community, id, {
    ...details,
    googleKept: keptNow(after, category, watches, now),
    ...(latest ? { googleCheck: { ...latest, decided: { what: 'used', at: new Date(now).toISOString() } } } : {}),
  })
  return onePlace(community, id, now)
}

async function markDecided(community: string, id: string, what: 'used' | 'kept', now: number) {
  const { row } = await loadOne(community, id)
  const details = row.details ?? {}
  const check = storedCheck(details)
  if (check) await writeDetails(community, id, { ...details, googleCheck: { ...check, decided: { what, at: new Date(now).toISOString() } } })
}

/** Show as open, over Google's closure; or Google's answer again, which is
 *  Keep closed (dated, so the closure stops waiting). Only the override is
 *  written: Google's own `businessStatus` stays as the sync last had it, so
 *  the page still says what Google says, and clearing the override goes
 *  back to it. */
export async function showAsOpen(community: string, id: string, open: boolean, now = Date.now()): Promise<GooglePlace> {
  const { row } = await loadOne(community, id)
  const details = { ...(row.details ?? {}) }
  if (open) details.businessStatusOverride = 'OPERATIONAL'
  else {
    delete details.businessStatusOverride
    details.businessStatusKeptAt = new Date(now).toISOString()
  }
  await writeDetails(community, id, details)
  return onePlace(community, id, now)
}
