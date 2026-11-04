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
import { MENU_CANT_READ_NOTE } from './watchJobs'

// ── What checks each thing on a listing (the user, Oct 31) ──────────────────
// A place is Not checked when anything on it that goes out of date has no
// check: its hours, phone, website, email, minyan times, hechsher or menu.
// Descriptions, notes and photos don't count, and the address is never
// checked. A blank field counts only when it's the place's main thing (a
// shul with no times is worth knowing; one with no email isn't). "You" kept
// a field isn't a check: nothing reads it again, so it counts as not checked
// (the user, Oct 31, of a place marked Not on Google). A job turned off
// checks nothing. Pure: Places and Watches both draw from it.
//
// To do is for what to act on, Places for how things stand (the user, Nov
// 3): a check To do was told to stop (No menu online, Not on Google, Stop
// reading it) lands here as Not checked, saying why.

export type CoverageBy = 'google' | 'website' | 'newsletter' | 'certifier' | 'refuah' | 'links'

/** `why`: when nothing checks it because it was stopped, or can't be:
 *  "no menu online", "not on Google", "stopped reading", "its job is off". */
export type FieldCoverage = { key: string; label: string; by: CoverageBy[]; main: boolean; why?: string }

export type PlaceCoverage = {
  fields: FieldCoverage[]
  /** What nothing checks, its main thing first. */
  notWatched: string[]
  /** Beside each of notWatched, why, when it was stopped or can't be. */
  notCheckedWhy?: (string | null)[]
  /** Its main thing is among them. */
  mainMissing: boolean
  sources: CoverageBy[]
  /** What keeps its name: never Not checked, since a name rarely goes out of date. */
  nameBy: CoverageBy[]
}

type Page = { watch: Pick<Watch, 'active'> }
type PagesIn = { id: string; off?: boolean; pages: readonly Page[]; newsletters?: readonly Pick<Watch, 'active'>[]; stopped?: readonly unknown[] }

/** Each job's places, as the Watches tab loads them. Null: not loaded. */
export type CoverageIn = {
  google: readonly GooglePlace[] | null
  times: readonly PagesIn[] | null
  hours: readonly PagesIn[] | null
  sites: readonly PagesIn[] | null
  dishes: readonly { id: string; menuUrl: string | null; menuWatch?: { active: boolean } | null; pages?: readonly Pick<Watch, 'active'>[]; menuAt?: string | null; reading?: { status: string; readAt?: string; note?: string | null } | null }[] | null
  hospitals: readonly { id: string; watch: Pick<Watch, 'active'> | null; notOnRefuah: boolean }[] | null
  kosher: readonly { id: string; on: readonly unknown[] }[] | null
  links: readonly Pick<LinkStanding, 'resourceId' | 'field'>[] | null
  off: readonly NightKindId[]
}

type Listing = Record<string, unknown> & { id: string; phone?: string | null }

const filled = (v: unknown) => (typeof v === 'string' ? !!v.trim() : Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0)
const reads = (p: PagesIn | undefined) => !!p && !p.off && p.pages.some((x) => x.watch.active)
const JOB_OFF = 'its job is off'
const STOPPED = 'stopped reading'
const CANT_READ = 'can’t be read'

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
  const googleWhy = (field: 'hours' | 'phone' | 'website') => {
    const kind = google?.fields.find((f) => f.field === field)?.by.kind
    if (kind === 'google' && !on('google')) return JOB_OFF
    if (kind === 'you' && google?.notOnGoogle) return 'not on Google'
  }
  // Pages it had, all stopped, or their job turned off.
  const pagesWhy = (kind: NightKindId, p: PagesIn | undefined) => {
    if (!p?.pages.length && !p?.stopped?.length) return undefined
    if (!on(kind)) return JOB_OFF
    if (p.off || !p.pages.some((x) => x.watch.active)) return STOPPED
  }
  const fields: FieldCoverage[] = []
  const add = (key: string, label: string, by: CoverageBy[], main = false, why?: string) => fields.push({ key, label, by, main, ...(by.length === 0 && why ? { why } : {}) })

  if (pageJob === 'times') {
    const by: CoverageBy[] = []
    if (on('times') && reads(times)) by.push('website')
    if (on('newsletters') && times?.newsletters?.some((w) => w.active)) by.push('newsletter')
    add('times', 'minyan times', by, true, pagesWhy('times', times))
  }
  const mikvah = hoursJobCategories([category], 'hours').length > 0
  if (mikvah) add('hours', 'hours', on('hours') && reads(hours) ? ['website'] : [], true, pagesWhy('hours', hours))
  else if (category.detailFields.some((f) => f.key === 'hours' && f.type === 'hours') && filled(listing.hours)) add('hours', 'hours', google ? fromGoogle('hours') : ownSite ? ['website'] : [], false, googleWhy('hours'))
  if (category.id === HOSPITAL_CATEGORY) {
    const h = find(input.hospitals)
    const why = h?.notOnRefuah ? 'not on Refuah' : h?.watch && !h.watch.active ? STOPPED : h?.watch && !on('hospitals') ? JOB_OFF : undefined
    add('hospital', 'hospital contacts', on('hospitals') && h?.watch?.active && !h.notOnRefuah ? ['refuah'] : [], true, why)
  }
  if (KOSHER_JOB_CATEGORIES.includes(category.id)) add('hechsher', 'hechsher', on('kosher') && find(input.kosher)?.on.length ? ['certifier'] : [], true)
  // No menu online (Ben & Jerry's, Nov 2) left To do and was nowhere on Places.
  // One that can't be read isn't checked either, though its watch runs
  // (the user, Nov 4), until its dishes are given by hand.
  const r = dishes?.reading
  const cantRead = r?.status === 'failed' && !(dishes?.menuAt && r.readAt && Date.parse(dishes.menuAt) > Date.parse(r.readAt))
  if (r?.status === 'no_menu') add('menu', 'menu', [], false, r.note === MENU_CANT_READ_NOTE ? CANT_READ : 'no menu online')
  else if (dishes?.menuUrl) add('menu', 'menu', on('menus') && dishes.menuWatch?.active && !cantRead ? ['website'] : [], false, !on('menus') ? JOB_OFF : cantRead ? CANT_READ : dishes.menuWatch ? STOPPED : undefined)
  if (category.hasPhone !== false && filled(listing.phone)) add('phone', 'phone', google ? fromGoogle('phone') : ownSite ? ['website'] : [], false, googleWhy('phone'))
  const websiteKey = websiteKeyOf(category)
  if (websiteKey && filled(listing[websiteKey])) {
    const opened = on('links') && input.links?.some((l) => l.resourceId === id && /website/i.test(l.field)) ? (['links'] as CoverageBy[]) : []
    add('website', 'website', google ? fromGoogle('website') : opened, false, google ? googleWhy('website') : undefined)
  }
  for (const f of contactFields(category, listing)) {
    if (f.kind === 'email' && filled(listing[f.key])) add(f.key, 'email', ownSite ? ['website'] : [])
  }

  const missing = fields.filter((f) => f.by.length === 0)
  const ordered = [...missing.filter((f) => f.main), ...missing.filter((f) => !f.main)]
  return {
    fields,
    notWatched: ordered.map((f) => f.label),
    notCheckedWhy: ordered.map((f) => f.why ?? null),
    mainMissing: missing.some((f) => f.main),
    sources: [...new Set(fields.flatMap((f) => f.by))],
    nameBy: on('google') && google?.fields.find((f) => f.field === 'name')?.by.kind === 'google' ? ['google'] : [],
  }
}

// ── Places' Checked by menu ─────────────────────────────────────────────────

export type CheckedBy = 'any' | 'not-watched' | 'google' | 'website' | 'newsletter' | 'certifier' | 'refuah' | 'links-only'

export const CHECKED_BY: { key: CheckedBy; label: string }[] = [
  { key: 'any', label: 'Anything' },
  { key: 'not-watched', label: 'Not checked' },
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

/** "Not checked: menu (no menu online), phone". */
export const notCheckedLine = (c: Pick<PlaceCoverage, 'notWatched' | 'notCheckedWhy'>) =>
  `Not checked: ${c.notWatched.map((label, i) => (c.notCheckedWhy?.[i] ? `${label} (${c.notCheckedWhy[i]})` : label)).join(', ')}`
