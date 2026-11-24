'use client'
// ResourceMapView's re-sync from its address (split out Nov 21, no
// behaviour change): a new link's view is applied once, and the view's own
// address writes echoed back by Next are told apart from a navigation. The
// write itself stays in the view (see its effect there), and uses what this
// returns. Called where the block it came from sat, so the view's effects
// run in the same order.
import { useEffect, useEffectEvent, useRef, type Dispatch, type SetStateAction } from 'react'
import type { MapFilterState } from '@/lib/mapFilters'
import { normalizeSearch, resolveInitialSelected, type ResourceMapViewProps } from './mapViewShared'

type FiltersQuery = { open: string | null; is: string | null; sel: string | null }

export function useViewFromLink({
  initialSelectedCategories,
  initialCategory,
  initialPinned,
  initialEruvim,
  initialQueryText,
  initialFilters,
  initialFiltersQuery,
  filtersForCategory,
  viewSearch,
  setSelected,
  setPinnedSelected,
  setEruvimOn,
  setInput,
  setCommittedQuery,
  setOwnFilters,
  setBaseFilters,
}: {
  initialSelectedCategories: ResourceMapViewProps['initialSelectedCategories']
  initialCategory: ResourceMapViewProps['initialCategory']
  initialPinned: boolean
  initialEruvim: ResourceMapViewProps['initialEruvim']
  initialQueryText: string
  initialFilters: ResourceMapViewProps['initialFilters']
  initialFiltersQuery: FiltersQuery
  filtersForCategory: string | null
  viewSearch: ResourceMapViewProps['viewSearch']
  setSelected: Dispatch<SetStateAction<Set<string> | null>>
  setPinnedSelected: (on: boolean) => void
  setEruvimOn: (on: boolean) => void
  setInput: (v: string) => void
  setCommittedQuery: (v: string) => void
  setOwnFilters: (f: MapFilterState | null) => void
  setBaseFilters: (base: { query: FiltersQuery; forCategory: string | null }) => void
}) {
  // Re-applies the query-string-derived view (selected chips, search text,
  // bool/select filters) whenever a NEW navigation actually changes it — a
  // category directory's own "Map" button (or any shared map link) carries
  // its filter as a query param specifically so the map it opens matches
  // what was clicked, per this component's whole initial*-props design (see
  // MapScreen's own top comment). But every one of those props above is only
  // ever read by a useState *initializer*, which React runs once, on this
  // component's very first mount — and since Cache Components keeps this
  // screen mounted (not remounted) across navigations away and back (see
  // next.config.ts's cacheComponents note), a visitor who toggles a chip on
  // the map, leaves for a category directory, and clicks that category's own
  // "Map" button back kept seeing whatever they'd toggled last: the new
  // props arrived, but nothing ever re-read them.
  //
  // Keyed off a plain string built from the props themselves, not the props
  // directly — MapScreen recomputes initialSelectedCategories/initialFilters
  // as new array/object literals from parseMapQuery() on every one of ITS
  // renders even when the URL hasn't changed, so comparing by reference would
  // treat every unrelated re-render as a fresh navigation and stomp on
  // whatever the visitor had just toggled. Comparing by value (via the ref
  // below) only re-syncs when the URL's own filter actually changed.
  const categoriesKey =
    initialSelectedCategories !== undefined
      ? `set:${[...initialSelectedCategories].sort().join(',')}`
      : initialCategory
        ? `one:${initialCategory}`
        : 'all'
  const initialViewKey = [
    categoriesKey,
    initialPinned ? 'pinned' : '',
    initialEruvim === 'only' ? 'eruv-only' : initialEruvim ? 'eruv' : '',
    initialQueryText,
    initialFiltersQuery.open ?? '',
    [...(initialFilters?.bool ?? [])].sort().join(','),
    Object.entries(initialFilters?.select ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${[...v].sort().join('|')}`)
      .join(';'),
  ].join('::')
  const appliedInitialViewKeyRef = useRef<string | null>(initialViewKey)
  // Each render's own mark, and the render whose commit applied a link.
  const thisRender = {}
  const applyingRenderRef = useRef<object | null>(null)
  // The query strings this screen wrote to its own address bar (the sync
  // effect below), oldest first, until Next echoes each one back. Next does:
  // history.replaceState feeds useSearchParams in this version (see
  // node_modules/next/dist/docs, "Native History API"), so every write
  // returns as new initial* props a moment later. Those are this screen's
  // own state, not a navigation, and must not be re-applied: one that
  // arrives after the visitor has moved on (tapped "Clear search" right
  // after a reading set the categories and Open now) would put the old
  // search back. A real navigation's address was never written here.
  const ownWritesRef = useRef<string[]>([])
  // Hidden (another screen showing; this one is kept mounted), nothing
  // echoes: what it wrote and never heard back would otherwise take the
  // next link to that address for an echo, and ignore it.
  useEffect(
    () => () => {
      ownWritesRef.current = []
    },
    [],
  )
  // Keyed on the link's view by value (above); the rest is read as it is.
  const applyLink = useEffectEvent(() => {
    if (initialViewKey === appliedInitialViewKeyRef.current) return
    const echo = viewSearch === undefined ? -1 : ownWritesRef.current.indexOf(normalizeSearch(viewSearch))
    if (echo >= 0) {
      // Next may skip echoing a write that a later one replaced: those go too.
      ownWritesRef.current = ownWritesRef.current.slice(echo + 1)
      appliedInitialViewKeyRef.current = initialViewKey
      return
    }
    appliedInitialViewKeyRef.current = initialViewKey
    applyingRenderRef.current = thisRender
    setSelected(resolveInitialSelected(initialSelectedCategories, initialCategory, initialPinned, initialEruvim))
    // The link's Pinned too: "All" turns it on, and it outlives this screen.
    setPinnedSelected(initialPinned)
    setEruvimOn(!!initialEruvim)
    setInput(initialQueryText)
    setCommittedQuery(initialQueryText)
    setOwnFilters(null)
    setBaseFilters({ query: initialFiltersQuery, forCategory: filtersForCategory })
  })
  useEffect(() => applyLink(), [initialViewKey])

  return { thisRender, applyingRenderRef, ownWritesRef, appliedInitialViewKeyRef }
}
