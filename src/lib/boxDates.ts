import type { ConfirmedBy, ConfirmedFrom, DirectoryResource } from '@/types'

// ── Each box dates what it shows (the user, Oct 23) ─────────────────────────
// "We're dating what we're checking. We're not dating a whole listing." A
// check that reads a place dates only what it read, in that box's own
// date (sectionConfirmed, with who gave it in sectionFrom): a shul's
// website its times, Refuah a hospital's boxes, a kosher list the
// certification (KOSHER_SECTION), a menu its dishes (itemMarks.ts), Google
// the contact box (googleSyncedAt). Wherever a date shows, it's the date
// of what it's beside.
//
// The listing's own date (confirmedAt) is still a person's, given to the
// whole place: an approved edit, an admin's stamp. It stands for any box
// with no later date of its own. One an outside source gave it is left
// out: before Oct 23 the checks dated the whole listing, so Mekor
// Habracha's read of a bakery's hechsher dated its description. Each check
// now dates its own box again on its next run.

/** The key a kosher list (Keystone-K's, Mekor Habracha's) dates a place's
 *  certification under. */
export const KOSHER_SECTION = 'kosher'

/** The key a shul's website dates this week's schedule under, when it gives
 *  the week's times and they agree: the box's date is the later of this
 *  and when the week was posted. */
export const THIS_WEEK_SECTION = 'week'

const own = (item: DirectoryResource, key: string): string | undefined => item.sectionConfirmed?.[key]

/** The listing's own date when a person gave it (or nobody is known to
 *  have): not one an outside source gave the whole listing. */
export function personConfirmedAt(item: DirectoryResource): string | undefined {
  const at = item.confirmedAt
  if (!at) return undefined
  return item.confirmedFrom?.at === at ? undefined : at
}

/** When a box was last confirmed: its own date, or the listing's when a
 *  person gave that later (an admin's approval, or a confirmation from
 *  before boxes had their own, which spoke for all of them). A mikvah's
 *  women's, men's and keilim hours; a shul's weekday and Shabbos times. */
export function sectionConfirmedAt(item: DirectoryResource, key: string): string | undefined {
  const mine = own(item, key)
  const all = personConfirmedAt(item)
  if (!mine) return all
  if (!all) return mine
  return Date.parse(mine) >= Date.parse(all) ? mine : all
}

/** Which check gave the date a box shows, when one did: "Confirmed by
 *  Keystone-K". */
export function sectionSource(item: DirectoryResource, key: string): ConfirmedFrom | undefined {
  const mine = own(item, key)
  const from = item.sectionFrom?.[key]
  return mine && from?.at === mine && sectionConfirmedAt(item, key) === mine ? from : undefined
}

/** Who gave the date a box shows (sectionConfirmedAt), when a person did:
 *  a box's own date that no check gave is a visitor's tap
 *  (confirm_section); the listing's is whoever its confirmedBy says.
 *  Without a key, the listing's own. */
export function confirmedByFor(item: DirectoryResource, key?: string): ConfirmedBy | undefined {
  if (!key) return item.confirmedBy
  const mine = own(item, key)
  if (mine && mine === sectionConfirmedAt(item, key)) return sectionSource(item, key) ? undefined : { by: 'visitor', at: mine }
  return item.confirmedBy
}

/** A box's date line's props (FreshnessFooter): its date, and who gave it. */
export function boxDate(item: DirectoryResource, key: string): { confirmedAt?: string; source?: ConfirmedFrom; by?: ConfirmedBy } {
  return { confirmedAt: sectionConfirmedAt(item, key), source: sectionSource(item, key), by: confirmedByFor(item, key) }
}

/** When a shul's times were last confirmed: the later of its usual weekday
 *  and usual Shabbos boxes' dates. */
export function timesConfirmedAt(item: DirectoryResource): string | undefined {
  const dates = ['weekday', 'shabbos'].map((k) => sectionConfirmedAt(item, k)).filter((d): d is string => !!d)
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0]
}

/** Whether anyone has confirmed anything on the place: the listing, a box,
 *  a dish or an item. */
export function confirmedAnywhere(item: DirectoryResource): boolean {
  if (personConfirmedAt(item)) return true
  if (Object.values(item.sectionConfirmed ?? {}).some(Boolean)) return true
  const dated = (map: unknown) => !!map && typeof map === 'object' && Object.values(map as Record<string, unknown>).some((m) => !!m && typeof m === 'object' && Object.keys(m).length > 0)
  return dated(item.itemMenu) || dated(item.itemSeen)
}

/** Whether anything on the place carries a date: anything confirmed, or
 *  Google's. */
export const hasAnyDate = (item: DirectoryResource): boolean => confirmedAnywhere(item) || !!item.googleSyncedAt
