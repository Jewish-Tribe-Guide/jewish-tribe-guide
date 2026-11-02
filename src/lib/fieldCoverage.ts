import type { CategoryConfig } from './categories'
import { contactFields } from './contactRead'
import { websiteKeyOf, type GooglePlace } from './googleJob'
import { hoursJobCategories } from './hoursJob'
import type { NightKindId } from './jobRuns'
import { KOSHER_JOB_CATEGORIES } from './kosherJob'
import { pageReadsFor } from './listingPageWatch'
import type { LinkStanding } from './linkCheck'
import { HOSPITAL_CATEGORY } from './refuahMatch'
import type { Watch } from './watches'

// ── What checks each thing on a listing (the user, Oct 31) ──────────────────
// A place is Not watched when anything on it that goes out of date has no
// check: its hours, phone, website, email, minyan times, hechsher or menu.
// Descriptions, notes and photos don't count, and the address is never
// checked. A blank field counts only when it's the place's main thing (a
// shul with no times is worth knowing; one with no email isn't). "You" kept
// a field isn't a check: nothing reads it again, so it counts as not watched
// (the user, Oct 31, of a place marked Not on Google). A job turned off
// checks nothing. Pure: Places and Watches both draw from it.

export type CoverageBy = 'google' | 'website' | 'newsletter' | 'certifier' | 'refuah' | 'links'

export type FieldCoverage = { key: string; label: string; by: CoverageBy[]; main: boolean }

export type PlaceCoverage = {
  fields: FieldCoverage[]
  /** What nothing checks, its main thing first. */
  notWatched: string[]
  /** Its main thing is among them. */
  mainMissing: boolean
  sources: CoverageBy[]
  /** What keeps its name: never Not watched, since a name rarely goes out of date. */
  nameBy: CoverageBy[]
}

type Page = { watch: Pick<Watch, 'active'> }
type PagesIn = { id: string; off?: boolean; pages: readonly Page[]; newsletters?: readonly Pick<Watch, 'active'>[] }

/** Each job's places, as the Watches tab loads them. Null: not loaded. */
export type CoverageIn = {
  google: readonly GooglePlace[] | null
  times: readonly PagesIn[] | null
  hours: readonly PagesIn[] | null
  sites: readonly PagesIn[] | null
  dishes: readonly { id: string; menuUrl: string | null; menuWatch?: { active: boolean } | null; pages?: readonly Pick<Watch, 'active'>[] }[] | null
  hospitals: readonly { id: string; watch: Pick<Watch, 'active'> | null; notOnRefuah: boolean }[] | null
  kosher: readonly { id: string; on: readonly unknown[] }[] | null
  links: readonly Pick<LinkStanding, 'resourceId' | 'field'>[] | null
  off: readonly NightKindId[]
}

type Listing = Record<string, unknown> & { id: string; phone?: string | null }

const filled = (v: unknown) => (typeof v === 'string' ? !!v.trim() : Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0)
const reads = (p: PagesIn | undefined) => !!p && !p.off && p.pages.some((x) => x.watch.active)

export function placeCoverage(listing: Listing, category: CategoryConfig, input: CoverageIn): PlaceCoverage {
  const on = (kind: NightKindId) => !input.off.includes(kind)
  const id = listing.id
  const find = <T extends { id: string }>(list: readonly T[] | null) => list?.find((x) => x.id === id)
  const google = find(input.google)
  const pageJob = pageReadsFor(category)?.kind
  const times = find(input.times)
  const hours = find(input.hours)
  const sites = find(input.sites)
  const dishes = find(input.dishes)
  // A page of its own, whichever job reads it: phones and emails are read off every one.
  const ownSite =
    (on('times') && reads(times)) || (on('hours') && reads(hours)) || (on('sites') && (reads(sites) || !!dishes?.pages?.some((w) => w.active)))
  const fromGoogle = (field: 'hours' | 'phone' | 'website'): CoverageBy[] => {
    const kind = google?.fields.find((f) => f.field === field)?.by.kind
    if (kind === 'google') return on('google') ? ['google'] : ownSite ? ['website'] : []
    if (kind === 'website') return ownSite ? ['website'] : []
    if (kind === 'links') return on('links') ? ['links'] : []
    return []
  }
  const fields: FieldCoverage[] = []
  const add = (key: string, label: string, by: CoverageBy[], main = false) => fields.push({ key, label, by, main })

  if (pageJob === 'times') {
    const by: CoverageBy[] = []
    if (on('times') && reads(times)) by.push('website')
    if (on('newsletters') && times?.newsletters?.some((w) => w.active)) by.push('newsletter')
    add('times', 'minyan times', by, true)
  }
  const mikvah = hoursJobCategories([category], 'hours').length > 0
  if (mikvah) add('hours', 'hours', on('hours') && reads(hours) ? ['website'] : [], true)
  else if (category.detailFields.some((f) => f.key === 'hours' && f.type === 'hours') && filled(listing.hours)) add('hours', 'hours', google ? fromGoogle('hours') : ownSite ? ['website'] : [])
  if (category.id === HOSPITAL_CATEGORY) {
    const h = find(input.hospitals)
    add('hospital', 'hospital contacts', on('hospitals') && h?.watch?.active && !h.notOnRefuah ? ['refuah'] : [], true)
  }
  if (KOSHER_JOB_CATEGORIES.includes(category.id)) add('hechsher', 'hechsher', on('kosher') && find(input.kosher)?.on.length ? ['certifier'] : [], true)
  if (dishes?.menuUrl) add('menu', 'menu', on('menus') && dishes.menuWatch?.active ? ['website'] : [])
  if (category.hasPhone !== false && filled(listing.phone)) add('phone', 'phone', google ? fromGoogle('phone') : ownSite ? ['website'] : [])
  const websiteKey = websiteKeyOf(category)
  if (websiteKey && filled(listing[websiteKey])) {
    const opened = on('links') && input.links?.some((l) => l.resourceId === id && /website/i.test(l.field)) ? (['links'] as CoverageBy[]) : []
    add('website', 'website', google ? fromGoogle('website') : opened)
  }
  for (const f of contactFields(category, listing)) {
    if (f.kind === 'email' && filled(listing[f.key])) add(f.key, 'email', ownSite ? ['website'] : [])
  }

  const missing = fields.filter((f) => f.by.length === 0)
  return {
    fields,
    notWatched: [...missing.filter((f) => f.main), ...missing.filter((f) => !f.main)].map((f) => f.label),
    mainMissing: missing.some((f) => f.main),
    sources: [...new Set(fields.flatMap((f) => f.by))],
    nameBy: on('google') && google?.fields.find((f) => f.field === 'name')?.by.kind === 'google' ? ['google'] : [],
  }
}

// ── Places' Checked by menu ─────────────────────────────────────────────────

export type CheckedBy = 'any' | 'not-watched' | 'google' | 'website' | 'newsletter' | 'certifier' | 'refuah' | 'links-only'

export const CHECKED_BY: { key: CheckedBy; label: string }[] = [
  { key: 'any', label: 'Anything' },
  { key: 'not-watched', label: 'Not watched' },
  { key: 'google', label: 'Google' },
  { key: 'website', label: 'Their website' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'certifier', label: 'Certifier’s list' },
  { key: 'refuah', label: 'Refuah' },
  { key: 'links-only', label: 'Link check only' },
]

export const isCheckedBy = (v: unknown): v is CheckedBy => CHECKED_BY.some((c) => c.key === v)

/** Whether a place fits the menu's choice. A broken check isn't one: those
 *  are fixed on To do (Nov 2). */
export function fitsCheckedBy(c: PlaceCoverage | undefined, choice: CheckedBy): boolean {
  if (choice === 'any') return true
  if (!c) return false
  if (choice === 'not-watched') return c.notWatched.length > 0
  if (choice === 'links-only') return c.sources.length === 1 && c.sources[0] === 'links'
  return c.sources.includes(choice)
}

/** "Not watched: minyan times, phone". */
export const notWatchedLine = (c: Pick<PlaceCoverage, 'notWatched'>) => `Not watched: ${c.notWatched.join(', ')}`
