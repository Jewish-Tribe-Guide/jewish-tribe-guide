import type { DirectoryResource } from '@/types'
import { shortDay } from './todo'

// Places, the admin's every listing in one list (the admin redesign's step
// 3, board 5): find one by name, narrow it by category, or by what's
// wrong with it. Archived is one of those, not a tab of its own.

/** One listing as Places lists it, and the listing itself to edit. */
export type AdminPlace = {
  id: string
  name: string
  category: string
  status: 'approved' | 'archived'
  hasAddress: boolean
  /** When it last changed: approved, edited, archived or brought back. */
  changedAt: string
  listing: DirectoryResource
}

/** The pills: on the site, on the site with no address, archived. */
export type PlaceShow = 'site' | 'no-address' | 'archived'

export const PLACE_SHOWS: { show: PlaceShow; label: string }[] = [
  { show: 'site', label: 'On the site' },
  { show: 'no-address', label: 'No address' },
  { show: 'archived', label: 'Archived' },
]

export function isPlaceShow(v: unknown): v is PlaceShow {
  return PLACE_SHOWS.some((s) => s.show === v)
}

function shows(p: AdminPlace, show: PlaceShow): boolean {
  if (show === 'archived') return p.status === 'archived'
  if (p.status === 'archived') return false
  return show === 'site' || !p.hasAddress
}

export function placeCounts(places: AdminPlace[], category?: string): Record<PlaceShow, number> {
  const inCategory = category ? places.filter((p) => p.category === category) : places
  return {
    site: inCategory.filter((p) => shows(p, 'site')).length,
    'no-address': inCategory.filter((p) => shows(p, 'no-address')).length,
    archived: inCategory.filter((p) => shows(p, 'archived')).length,
  }
}

/** The places a pill, a category and the name box leave, by name. The name
 *  box matches any part of the name, ignoring case and accents. */
export function filterPlaces(places: AdminPlace[], { show, category, query }: { show: PlaceShow; category?: string; query?: string }): AdminPlace[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = fold(query?.trim() ?? '')
  return places
    .filter((p) => shows(p, show) && (!category || p.category === category) && (!q || fold(p.name).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The line under a place's name: "Changed Aug 16", "No address · changed
 *  Sep 3", "Archived Oct 3". */
export function placeLine(p: AdminPlace): string {
  const day = shortDay(p.changedAt)
  if (p.status === 'archived') return `Archived ${day}`
  return p.hasAddress ? `Changed ${day}` : `No address · changed ${day}`
}
