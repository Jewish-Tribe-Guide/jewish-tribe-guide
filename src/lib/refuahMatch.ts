import { haversineMiles, milesText } from './geo'
import { refuahHospitalId } from './refuahWatch'
import { REFUAH_MATCH_CREATOR, type Watch } from './watches'
import type { DirectoryResource } from '@/types'

export { REFUAH_MATCH_CREATOR }

// ── Hospitals matched to Refuah on their own (the user, Oct 21) ─────────────
// Until now each hospital's Refuah page was found and added by hand. Now
// the daily run (refuahMatchRun.ts) asks Refuah for the hospitals near each
// of the guide's, and gives each one the nearest as its watch,
// when it's near enough to be the same building. Matched by map position,
// not by name: searching Refuah for "Pennsylvania Hospital" puts HUP first.
// Checked on Philly's seven, Oct 21: each one's own record was the nearest,
// 10 to 115 m away, and the next nearest at least 128 m.
//
// A hospital an admin gave a Refuah page of their own is left alone, and
// the run's own watch on it goes. Two of the guide's hospitals can't share
// one Refuah record: the nearer one has it.
//
// Pure: no network, no database.

/** Near enough to be the same hospital. A campus's own buildings are a few
 *  hundred metres apart, and two hospitals side by side (CHOP and HUP)
 *  about 130 m, which is why the nearest one is taken, not every one this
 *  near. */
export const MATCH_MILES = 0.2

/** The category the guide's hospitals are in (as questionReader.ts). */
export const HOSPITAL_CATEGORY = 'hospital'

/** One of Refuah's hospitals, as its list gives it. */
export type RefuahListed = { _id: string; name: string; formattedAddress?: string; latitude: number; longitude: number }

export function refuahPageUrl(id: string): string {
  return `https://refuah.com/hospitals/${id}`
}

/** What the run made of one of the guide's hospitals. */
export type RefuahMatch =
  | { state: 'matched'; refuah: RefuahListed; miles: number }
  /** The nearest is too far to be this one. */
  | { state: 'too_far'; nearest: RefuahListed; miles: number }
  /** Its nearest is nearer another of the guide's hospitals. */
  | { state: 'taken'; refuah: RefuahListed; by: string }
  | { state: 'no_position' }
  | { state: 'not_listed' }

export type WantedRefuahWatch = { url: string; resourceId: string; label: string }

export function refuahWatchLabel(name: string): string {
  return `${name} on Refuah`
}

function nearest(at: { lat: number; lng: number }, list: readonly RefuahListed[]): { refuah: RefuahListed; miles: number } | null {
  let best: { refuah: RefuahListed; miles: number } | null = null
  for (const r of list) {
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue
    const miles = haversineMiles(at, { lat: r.latitude, lng: r.longitude })
    if (!best || miles < best.miles) best = { refuah: r, miles }
  }
  return best
}

/** Each hospital's match, by its id. */
export function matchRefuah(hospitals: readonly Pick<DirectoryResource, 'id' | 'name' | 'geo'>[], list: readonly RefuahListed[]): Map<string, RefuahMatch> {
  const out = new Map<string, RefuahMatch>()
  const claims = new Map<string, { id: string; miles: number }>()
  for (const h of hospitals) {
    if (!h.geo || !Number.isFinite(h.geo.lat) || !Number.isFinite(h.geo.lng)) {
      out.set(h.id, { state: 'no_position' })
      continue
    }
    const near = nearest(h.geo, list)
    if (!near) out.set(h.id, { state: 'not_listed' })
    else if (near.miles > MATCH_MILES) out.set(h.id, { state: 'too_far', nearest: near.refuah, miles: near.miles })
    else {
      out.set(h.id, { state: 'matched', ...near })
      const claim = claims.get(near.refuah._id)
      if (!claim || near.miles < claim.miles) claims.set(near.refuah._id, { id: h.id, miles: near.miles })
    }
  }
  for (const [id, m] of out) {
    if (m.state !== 'matched') continue
    const by = claims.get(m.refuah._id)!.id
    if (by !== id) out.set(id, { state: 'taken', refuah: m.refuah, by })
  }
  return out
}

/** The watches the run wants: one per matched hospital that has no Refuah
 *  page an admin gave it, and wasn't said not to be on Refuah. */
export function wantedRefuahWatches(
  hospitals: readonly Pick<DirectoryResource, 'id' | 'name' | 'geo'>[],
  matches: ReadonlyMap<string, RefuahMatch>,
  existing: readonly Pick<Watch, 'url' | 'resourceId' | 'createdBy'>[],
): WantedRefuahWatch[] {
  // An admin's own page for it, or their "Not on Refuah".
  const byHand = new Set(
    existing.filter((w) => w.resourceId && ((w.createdBy !== REFUAH_MATCH_CREATOR && refuahHospitalId(w.url)) || isNotOnRefuah(w))).map((w) => w.resourceId),
  )
  const out: WantedRefuahWatch[] = []
  for (const h of hospitals) {
    const m = matches.get(h.id)
    if (m?.state !== 'matched' || byHand.has(h.id)) continue
    out.push({ url: refuahPageUrl(m.refuah._id), resourceId: h.id, label: refuahWatchLabel(h.name) })
  }
  return out
}

/** What to add and remove: a wanted page nobody watches yet is added, and
 *  the run's own watches it no longer wants go. A page an admin watches is
 *  never added again, whichever listing it's on. */
export function refuahWatchChanges(
  wanted: readonly WantedRefuahWatch[],
  existing: readonly Pick<Watch, 'id' | 'url' | 'resourceId' | 'createdBy'>[],
): { add: WantedRefuahWatch[]; remove: string[] } {
  const watched = new Set(existing.map((w) => w.url))
  const want = new Set(wanted.map((w) => `${w.resourceId} ${w.url}`))
  return {
    add: wanted.filter((w) => !watched.has(w.url)),
    remove: existing.filter((w) => w.createdBy === REFUAH_MATCH_CREATOR && !want.has(`${w.resourceId} ${w.url}`)).map((w) => w.id),
  }
}

/** "800 Spruce St", from Refuah's "800 Spruce St, Philadelphia, PA 19107, USA". */
export function streetOf(address: string | undefined): string | null {
  return address?.split(',')[0].trim() || null
}

function apart(miles: number): string {
  return miles < 0.05 ? 'same spot on the map' : `${milesText(miles)} apart on the map`
}

function named(r: RefuahListed): string {
  const street = streetOf(r.formattedAddress)
  return `Refuah’s ${r.name}${street ? `, ${street}` : ''}`
}

/** Where a hospital's Refuah page came from, as its line on the Hospitals
 *  page says it. */
export function matchLine(match: RefuahMatch | undefined, names: ReadonlyMap<string, string> = new Map()): string {
  switch (match?.state) {
    case 'matched':
      return `Matched to ${named(match.refuah)} · ${apart(match.miles)}`
    case 'too_far':
      return `Not found on Refuah. The nearest hospital on Refuah is ${milesText(match.miles)} away, too far to be this one.`
    case 'taken':
      return `Not found on Refuah. The nearest one, ${match.refuah.name}, is matched to ${names.get(match.by) ?? 'another hospital in the guide'}, which is nearer it.`
    case 'no_position':
      return 'Not on the map, so it can’t be matched to Refuah.'
    default:
      return 'Refuah has no hospitals listed.'
  }
}

/** The line for a hospital whose Refuah page an admin gave: which
 *  hospital it is on Refuah, and how far from the listing. */
export function givenLine(record: RefuahListed | null, geo: { lat: number; lng: number } | null | undefined): string {
  if (!record) return 'Its Refuah page was given by hand.'
  const far = geo ? ` · ${apart(haversineMiles(geo, { lat: record.latitude, lng: record.longitude }))}` : ''
  return `Given by hand: ${named(record)}${far}`
}

/** Refuah's hospitals nearest a listing, nearest first, for "Choose a
 *  different Refuah hospital". */
export function nearestRefuah(geo: { lat: number; lng: number } | null | undefined, list: readonly RefuahListed[], n = 4): (RefuahListed & { miles: number })[] {
  if (!geo) return []
  return list
    .map((r) => ({ ...r, miles: haversineMiles(geo, { lat: r.latitude, lng: r.longitude }) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, n)
}

/** "Not on Refuah", said of one hospital: kept as a watch that never runs
 *  (it's never on), so the run doesn't match it again, and "Turn back on"
 *  takes it away. Its address isn't a Refuah hospital page. */
export const REFUAH_NOT_LISTED_CREATOR = 'not on Refuah'

export function notOnRefuahUrl(resourceId: string): string {
  return `https://refuah.com/hospitals?not-on-refuah=${resourceId}`
}

export function isNotOnRefuah(w: Pick<Watch, 'createdBy'>): boolean {
  return w.createdBy === REFUAH_NOT_LISTED_CREATOR
}

/** A watch the Hospitals page shows, not the Watches list: a hospital's
 *  Refuah page, or its "Not on Refuah". */
export function isHospitalWatch(w: Pick<Watch, 'url' | 'createdBy'>): boolean {
  return !!refuahHospitalId(w.url) || isNotOnRefuah(w)
}
