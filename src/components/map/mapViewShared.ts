// ResourceMapView's shared pieces (split out Nov 21, no behaviour change):
// its props, the ids and prefixes its points go by, and the pure helpers
// its search and filters use.

import type { MapPoint } from './ResourceMap'
import type { MapFilterState } from '@/lib/mapFilters'
import { hoursOpenNow, businessClosure } from '@/lib/hours'
import type { LatLng } from '@/lib/googleMapsLinks'
import type { LocationControls } from '@/components/home/LocationControl'
import type { DirectoryResource, MapFilters } from '@/types'

// Shared by the initial useState below and the resync effect further down
// (see its own comment) — one place for the initialSelectedCategories-vs-
// initialCategory precedence so the two can't drift apart.
export function resolveInitialSelected(categories: string[] | undefined, category: string | undefined, pinned = false, eruvim: boolean | 'only' = false): Set<string> | null {
  // Arriving on the Pinned chip alone ("See them on the map" on the Pinned
  // page): no category chip on, only the pins. Likewise the eruv lines
  // alone (the Eruv page's Full map); lines that are merely on (`eruv=1`)
  // don't narrow the places.
  if ((pinned || eruvim === 'only') && categories === undefined && !category) return new Set()
  return categories !== undefined ? new Set(categories) : category ? new Set([category]) : null
}

export const HOSPITALS_ID = '__hospitals__'

/** The places open right now among the categories whose Open now is on.
 *  Before the page has hydrated there's no time (see useNow): only closed
 *  businesses are left out until there is. */
export function openNowIdsFor(
  points: readonly { id: string; raw?: DirectoryResource | null }[],
  filters: MapFilterState,
  clock: number | null,
  hoursKeysByCat: Map<string, string[]>,
): string[] {
  if (!Object.values(filters).some((f) => f.openNow)) return []
  const now = clock === null ? null : new Date(clock)
  return points
    .filter((p) => {
      if (!p.raw || !filters[p.raw.category]?.openNow) return false
      // See GenericDirectory's copy of this: a closed business is never open,
      // whatever hours it still has saved.
      if (businessClosure(p.raw as unknown as Record<string, unknown>)) return false
      const keys = hoursKeysByCat.get(p.raw.category)
      return !keys?.length || now === null || keys.some((k) => hoursOpenNow(p.raw![k], now) === true)
    })
    .map((p) => p.id)
}
// A dropped pin's marker id is prefixed with this so a click handler can
// tell it apart from a real listing/hospital point without a separate prop
// threaded through every consumer — see droppedMapPoints below.
export const DROPPED_PREFIX = 'dropped:'
export const DROPPED_FILTER_ID = '__dropped__'
// An eruv opened from the Eruvim layer: not a pin, but it opens in the same
// sheet or sidebar a place does, with the same way back (id `eruv:<id>`).
export const ERUV_FILTER_ID = '__eruv__'
export const ERUV_PREFIX = 'eruv:'
export const DROPPED_PIN_COLOR = '#D85A30'

// Typing one of these in the search box searches "open now" instead of
// matching literal text.
export const OPEN_NOW_WORDS = new Set(['open', 'open now', 'opennow', 'open-now'])
export const isOpenNowWord = (v: string) => OPEN_NOW_WORDS.has(v.trim().toLowerCase())

// Apostrophes shouldn't matter for matching at all — searching "trader joes"
// (no apostrophe, as most people type it) should still find "Trader Joe's",
// same as a mobile keyboard's smart-punctuation autocorrect turning a typed
// straight apostrophe into a curly one shouldn't break the match either.
// Stripping every apostrophe variant from both sides makes all of that a
// non-issue.
export const stripApostrophes = (s: string) => s.replace(/['’‘ʼʻ]/g, '')

// The shape both selection surfaces (mobile's MobileNearbySheet, desktop's
// own sidebar detail panel) need for a "show this place" action — a subset
// of the richer point type this screen's own points carry (which also has
// searchText, used only for filtering).
export type SelectablePoint = MapPoint & { filterId: string; raw?: DirectoryResource }
// A point as the view builds it: one it can search, by its words.
export type MapViewPoint = SelectablePoint & { searchText: string }

export type ResourceMapViewProps = {
  /** Initial location from the header's "Set location" control, if already set. */
  userLocation?: LatLng | null
  /** Pre-select a single category filter on arrival (from a category's "Map" button). */
  initialCategory?: string
  /** Pre-fill the map's own search box on arrival — set when the directory the
   *  visitor came from had an active search (e.g. "insomnia cookies" within
   *  Food Establishments). */
  initialQuery?: string
  /** The exact category selection restored from history (browser back after
   *  the visitor toggled chips on the map itself). Takes precedence over
   *  initialCategory, which only covers the single-category arrival case. */
  initialSelectedCategories?: string[]
  /** The Pinned chip on, from the URL's `pinned` (see mapQueryString). */
  initialPinned?: boolean
  /** Eruv lines on, from the URL's `eruv` (see mapQueryString); 'only',
   *  the lines with no places. */
  initialEruvim?: boolean | 'only'
  /** Field filters (open-now / kosher / type / …) carried from the directory the
   *  visitor came from, applied to pins and shown as removable chips. */
  initialFilters?: MapFilters
  /** The pin id to open the detail panel/sheet for on arrival — the `place`
   *  query param (see mapQueryString/parseMapQuery), read once on mount.
   *  Standalone only: this is what makes a map link shareable down to the
   *  specific pin someone had open, not just the pins and filters. */
  initialPlaceId?: string
  /** The address bar's query string these initial* props were read from
   *  (MapScreen's useSearchParams). Lets the map tell its own address-bar
   *  writes, echoed back by Next, from a real navigation; see
   *  ownWritesRef below. */
  viewSearch?: string
  /** A round ‹ before the phone's search bar, back to the category the
   *  visitor came from (its list's Map button or a listing's map tile;
   *  board G1, Nov 16). The tab bar's Map has none: it is a tab. */
  backTo?: { label: string; onBack: () => void }
  /** Open a specific listing's detail card in its category directory. */
  onViewListing?: (categoryId: string, listingId: string) => void
  /** True for the one page-level map screen (mode 'map' in page.tsx) — the
   *  admin's category-preview map is the only other caller, and never sets
   *  this (it stays boxed). Desktop only in effect: a standalone map always
   *  opens (and stays) fullscreen — there's no boxed state for it — and its
   *  exit control always navigates away via onExitFullscreenToListing rather
   *  than collapsing in place, however the visitor got here (a listing's own
   *  "Map" button, the mobile tab bar, browser back/forward). */
  standalone?: boolean
  /** Whether the standalone map screen is the one currently on screen (mode
   *  === 'map') — since it stays mounted across tab switches (see page.tsx),
   *  this is how it knows to re-force fullscreen on every return visit, not
   *  just its first mount (e.g. after exiting once already reset it false).
   *  Ignored (and unnecessary) when `standalone` isn't set. */
  visible?: boolean
  /** Called whenever the standalone map's fullscreen exits — always
   *  provided when `standalone` is set, since a standalone map never just
   *  collapses to a boxed view in place; it navigates away instead (see
   *  MapScreen's own exitToPreviousScreen). */
  onExitFullscreenToListing?: () => void
  /** The site-wide live GPS watch (see useLiveLocation), lifted to page.tsx so
   *  starting it here also updates `userLocation` everywhere else the same
   *  live coords are read (search sorting, directory distances) — not just
   *  this screen. Optional (defaults to an inert no-op) for callers that don't
   *  wire up real tracking, e.g. the admin category-preview map. */
  liveTracking?: {
    tracking: boolean
    error: string | null
    start: () => void
    stop: () => void
  }
  /** Full address-entry + tracking controls, same object the header pill
   *  reads (see LocationProvider) — so an address set from the map's own copy
   *  of the control is set for the whole site, not just this screen. Desktop,
   *  fullscreen only: fullscreen is `desktop:fixed desktop:inset-0 desktop:z-50`
   *  below and paints over the header entirely, taking the header's pill with
   *  it, so this is the only place left to set an address. The boxed state
   *  doesn't need its own copy — the header is `sticky top-0` (SiteHeader.tsx)
   *  and stays visible above a boxed map. Mobile has no such copy either — its
   *  header is merely collapsed rather than covered, and its pin FAB already
   *  reopens the same popover. Omitted by callers with nowhere to set an
   *  address anyway (the admin category-preview map), which just means no
   *  control renders. */
  controls?: LocationControls
}

export const NOOP_LIVE_TRACKING = { tracking: false, error: null, start: () => {}, stop: () => {} }

/** A query string in one canonical form, "?" or not. */
export function normalizeSearch(search: string): string {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).toString()
}
