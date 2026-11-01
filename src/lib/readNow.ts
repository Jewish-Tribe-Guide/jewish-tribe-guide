import { randomUUID } from 'node:crypto'
import type { CategoryConfig } from './categories'
import { contactFields, readContacts as readPageContacts } from './contactRead'
import { websiteKeyOf } from './googleJob'
import { searchHoursPages } from './hoursJobRun'
import { compareKeystone, entryFor, type KeystoneEntry } from './keystoneWatch'
import { KOSHER_LIST_NAMES } from './kosherJob'
import { readListingPage, readPageFor } from './listingPageRun'
import { pageReadsFor } from './listingPageWatch'
import { compareMekor, matchEntries, type GuideListing, type MekorEntry } from './mekorWatch'
import { MENU_LINK_KEY } from './menuLink'
import { dishKinds, readPlaceMenuPages } from './menuPlaceRead'
import { selectValues } from './categories'
import { matchRefuah } from './refuahMatch'
import { readRefuahHospital, readRefuahNear } from './refuahRun'
import { refuahFields, refuahHospitalId } from './refuahWatch'
import type { DirectoryResource } from '@/types'

// ── Read now (boards *13): a place not added yet, read while it's added ──────
// The same readers the watches use, told of a listing that doesn't exist yet,
// and what they read goes back to the screen to fill in. Nothing here saves
// anything: no watch, no submission, no stored reading. Add listing reads the
// place again as a real one (AddPlace.tsx).

export type ReadNowDraft = { name: string; address: string; phone: string; details: Record<string, unknown>; coords?: { lat: number; lng: number } | null }
/** What was read, to fill in; or why there's nothing. */
export type ReadNowAnswer = { state: 'done'; phone?: string; details: Record<string, unknown> } | { state: 'none' | 'failed' | 'not-found' }

/** As much of a page's reading as is new. */
const MAX_PAGES = 3

function blank(category: CategoryConfig, draft: ReadNowDraft): DirectoryResource {
  return { id: randomUUID(), category: category.id, name: draft.name, anchorId: 'all', distance: 0, address: draft.address, phone: draft.phone || undefined, ...draft.details } as DirectoryResource
}

const websiteOf = (category: CategoryConfig, draft: ReadNowDraft) => {
  const key = websiteKeyOf(category)
  const v = key ? draft.details[key] : null
  return typeof v === 'string' ? v.trim() : ''
}

function answer(draft: ReadNowDraft, phone: string, details: Record<string, unknown>): ReadNowAnswer {
  const changed = Object.fromEntries(Object.entries(details).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(draft.details[k])))
  const newPhone = phone && phone !== draft.phone ? phone : null
  if (!newPhone && Object.keys(changed).length === 0) return { state: 'none' }
  return { state: 'done', ...(newPhone ? { phone: newPhone } : {}), details: changed }
}

/** A shul's or a mikvah's page, or the pages its website has for them. */
export async function readPageNow(category: CategoryConfig, draft: ReadNowDraft, url: string | null, { apiKey, communityName }: { apiKey: string; communityName: string }): Promise<ReadNowAnswer> {
  const reads = pageReadsFor(category)
  if (!reads) return { state: 'none' }
  const website = websiteOf(category, draft)
  let urls = url ? [url] : []
  if (!url) {
    if (!website) return { state: 'none' }
    const search = await searchHoursPages(website, {}, reads.kind)
    if (!search || 'error' in search) return { state: 'failed' }
    urls = search.found.slice(0, MAX_PAGES).map((p) => p.url)
    if (!urls.length) return { state: 'none' }
  }
  const contacts = contactFields(category, {})
  let details = { ...draft.details }
  let phone = draft.phone
  let opened = 0
  for (const u of urls) {
    const source = await readListingPage(u, { pictures: reads.kind === 'times' }).catch(() => null)
    if (!source) continue
    opened++
    const listing = blank(category, { ...draft, phone, details })
    const reading = await readPageFor(listing, category, reads, source, { apiKey, communityName })
    const got = reading.proposal?.submission as { phone?: unknown; details?: Record<string, unknown> } | undefined
    if (got?.details) details = { ...details, ...got.details }
    if (typeof got?.phone === 'string') phone = got.phone
    if (source.contacts) {
      const { changes } = readPageContacts(contacts, blank(category, { ...draft, phone, details }), source.contacts)
      for (const [key, value] of Object.entries(changes)) {
        if (key === 'phone') phone ||= value
        else if (!details[key]) details[key] = value
      }
    }
  }
  return opened ? answer(draft, phone, details) : { state: 'failed' }
}

/** A place's own website, for its phone and email. */
export async function readSiteNow(category: CategoryConfig, draft: ReadNowDraft): Promise<ReadNowAnswer> {
  const website = websiteOf(category, draft)
  if (!website) return { state: 'none' }
  const source = await readListingPage(website).catch(() => null)
  if (!source) return { state: 'failed' }
  if (!source.contacts) return { state: 'none' }
  const { changes } = readPageContacts(contactFields(category, {}), blank(category, draft), source.contacts)
  const { phone, ...details } = changes
  return answer(draft, draft.phone || phone || '', { ...draft.details, ...details })
}

/** A food place's dishes, from its menu page or its website. */
export async function readMenuNow(category: CategoryConfig, draft: ReadNowDraft, url: string | null, apiKey: string): Promise<ReadNowAnswer> {
  const kind = dishKinds([category])[0]
  if (!kind) return { state: 'none' }
  const listing = blank(category, { ...draft, details: { ...draft.details, ...(url ? { [MENU_LINK_KEY]: url } : {}) } })
  const read = await readPlaceMenuPages(listing, kind, apiKey)
  if (read.status === 'failed' && !read.dishes.length) return { state: 'failed' }
  const had = selectValues(draft.details[kind.field.key])
  const names = read.dishes.map((d) => d.name).filter((n) => !had.includes(n))
  return answer(draft, draft.phone, { ...draft.details, [kind.field.key]: [...had, ...names] })
}

/** A hospital's contacts on Refuah: the page given, or the one where it is. */
export async function readRefuahNow(category: CategoryConfig, draft: ReadNowDraft, url: string | null): Promise<ReadNowAnswer> {
  let id = url ? refuahHospitalId(url) : null
  if (!id) {
    if (url || !draft.coords) return { state: 'not-found' }
    const near = await readRefuahNear([draft.coords])
    if ('error' in near) return { state: 'failed' }
    const match = matchRefuah([{ id: 'new', name: draft.name, geo: draft.coords }], near).get('new')
    if (match?.state !== 'matched') return { state: 'not-found' }
    id = match.refuah._id
  }
  const record = await readRefuahHospital(id)
  if ('error' in record) return { state: 'failed' }
  const fields = category.detailFields.filter((f) => f.type === 'contacts')
  const found = refuahFields(record, new Set(fields.map((f) => f.key)), new Set(fields.filter((f) => f.entryFrom).map((f) => f.key)))
  return answer(draft, draft.phone, { ...draft.details, ...found })
}

/** Whether a place is on the kosher lists, from their last read: nothing
 *  outside is asked, so this is at once. `null`: neither list has been read. */
export function kosherLookup(
  category: CategoryConfig,
  draft: Pick<ReadNowDraft, 'name' | 'address' | 'phone' | 'details'>,
  { keystone, mekor }: { keystone: readonly KeystoneEntry[] | null; mekor: readonly MekorEntry[] | null },
): { lists: { name: string; url: string; values: Record<string, unknown> }[]; none: string } | null {
  if (!keystone && !mekor) return null
  const place = { id: 'new', category: category.id, status: 'approved', name: draft.name, address: draft.address, phone: draft.phone, details: draft.details } as unknown as GuideListing
  const lists: { name: string; url: string; values: Record<string, unknown> }[] = []
  const delta = (details: Record<string, unknown> | undefined) =>
    Object.fromEntries(Object.entries(details ?? {}).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(draft.details[k])))
  if (keystone) {
    const entry = entryFor(place, keystone as KeystoneEntry[])
    if (entry) {
      const found = compareKeystone(keystone as KeystoneEntry[], [place]).find((f) => f.kind === 'update')
      lists.push({ name: KOSHER_LIST_NAMES.keystone, url: entry.url, values: delta(found && 'details' in found ? found.details : undefined) })
    }
  }
  if (mekor) {
    const slug = [...matchEntries(mekor as MekorEntry[], [place]).matched.keys()][0]
    const entry = slug ? mekor.find((e) => e.slug === slug) : null
    if (entry) {
      const found = compareMekor(mekor as MekorEntry[], [place], []).find((f) => f.kind === 'hechsher')
      lists.push({ name: KOSHER_LIST_NAMES.mekor, url: entry.url, values: delta(found && 'details' in found ? found.details : { kosherCert: entry.certs }) })
    }
  }
  const names = [keystone && 'Keystone-K', mekor && 'Mekor Habracha'].filter(Boolean).join(' or ')
  return { lists, none: `Not on ${names}’s list` }
}
