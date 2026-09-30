'use client'

import Link from 'next/link'
import { Component, lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { DEFAULT_CATEGORY_ICON } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { usePinned } from '@/lib/pinnedContext'
import { useOptionalLocation } from '@/lib/locationContext'
import { useIsMobile } from '@/lib/useIsMobile'
import type { MapPoint } from '@/components/map/ResourceMap'

// ── The map beside a category's list, on a wide screen ───────────────────────
// List and map as equals: the map shows exactly the places the list holds
// (the search's results, the filters'), a row and its pin light up
// together, and a click on a pin finds its row. "Hide map" gives the list the
// whole width (remembered, see GenericDirectory); the expand button opens
// the full Map page on the same places.
//
// The list never waits for it. The map's code and Google's script load only
// on a screen wide enough to show it, after the page, so a phone downloads
// neither (e2e/budgets.spec.ts).

// React's lazy, not next/dynamic: next/dynamic fetched the map's code on a
// phone too, where it's never drawn (seen in the browser). lazy fetches it
// the first time it renders, which is only on a wide screen.
const ResourceMap = lazy(() => import('@/components/map/ResourceMap'))

/** Wide enough for list and map side by side: Tailwind's lg, and tall
 *  enough to be a desktop rather than a phone on its side. */
const WIDE = '(min-width: 1024px) and (min-height: 640px)'

/** Whether the screen is that wide. False until known, so nothing loads
 *  before it's measured, and false wherever the page is shown as a phone
 *  (useIsMobile honours the admin preview's forced viewport). */
function useWide(): boolean {
  const mobile = useIsMobile()
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(WIDE)
    const update = () => setWide(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return wide && !mobile
}

/** Which row the pointer is on, shared between the list and the map without
 *  re-rendering the list: moving across rows would otherwise redraw every
 *  row on the page, just to enlarge one pin. */
export type Highlight = {
  get: () => string | null
  set: (id: string | null) => void
  subscribe: (onChange: () => void) => () => void
}

export function createHighlight(): Highlight {
  let current: string | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (id) => {
      if (id === current) return
      current = id
      listeners.forEach((l) => l())
    },
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** Keeps a failing map from taking the page down with it. Seen with Google
 *  refusing the map (a key that doesn't allow the address): Google's own
 *  code then threw as soon as a row's pin was lit, and the error replaced
 *  the whole page, list and all. Now only the map's box says so. */
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[category map]', error)
    Sentry.captureException(error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="status" className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-100 px-8 text-center text-[14px] text-slate-600">
        The map couldn’t load. Everything on it is in the list.
      </div>
    )
  }
}

type Props = {
  category: CategoryConfig
  /** The places the list shows now, filters and search applied. */
  items: readonly DirectoryResource[]
  /** Whether a search or filter is narrowing them: the map then frames the
   *  results, as the Map page does. */
  searchActive: boolean
  /** The row the pointer is on, whose pin is drawn larger. */
  highlight: Highlight
  /** The listing open beside the map (desktop's listing column). */
  selectedId?: string | null
  /** A pin was clicked: find its row. */
  onSelect: (id: string) => void
  onHide: () => void
  /** The full Map page, on the same places. */
  fullMapHref: string
}

export default function CategoryMap({ category, items, searchActive, highlight, selectedId = null, onSelect, onHide, fullMapHref }: Props) {
  const highlightedId = useSyncExternalStore(highlight.subscribe, highlight.get, () => null)
  // Asks the map to come to each listing opened beside it: a new number
  // each time one opens (worked out during render, React's way of
  // following a prop, rather than an effect a frame late).
  const [framed, setFramed] = useState<{ id: string | null; n: number }>({ id: null, n: 0 })
  if ((selectedId ?? null) !== framed.id) setFramed({ id: selectedId ?? null, n: framed.n + 1 })
  const frame = framed.n
  const wide = useWide()
  const categories = useCategories()
  const { pinned } = usePinned()
  const coords = useOptionalLocation()?.coords ?? null
  const color = getCategoryColor(categories ?? [category], category.id)
  const zoomRadiusMiles = categories?.find((c) => c.kind === 'map')?.mapZoomRadiusMiles ?? null

  // Rebuilt only when the places or the pins change, not on every render of
  // the list (a hover re-renders it): the map redraws its markers for each
  // new array.
  const pinnedKey = pinned.map((p) => p.id).join('|')
  const itemsKey = items.map((i) => i.id).join('|')
  const points = useMemo(() => {
    const pinnedIds = new Set(pinnedKey.split('|'))
    const out: MapPoint[] = []
    for (const item of items) {
      const lat = item.geo?.lat
      const lng = item.geo?.lng
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      out.push({
        id: item.id,
        lat,
        lng,
        name: item.name,
        address: item.address || undefined,
        phone: item.phone,
        color,
        glyph: category.icon ?? DEFAULT_CATEGORY_ICON,
        glyphSrc: category.iconImageUrl ?? undefined,
        categoryLabel: category.label,
        filterId: category.id,
        raw: item,
        pinned: pinnedIds.has(item.id),
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on which places and pins, not the array's identity
  }, [itemsKey, pinnedKey, color, category.icon, category.iconImageUrl, category.label, category.id])

  const button =
    'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-[13.5px] font-semibold text-slate-700 shadow-md ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50'

  return (
    <div data-testid="category-map" className="relative h-full w-full">
      {wide && (
        <MapBoundary>
        <Suspense fallback={<div className="h-full w-full animate-pulse rounded-2xl bg-slate-100" />}>
        <ResourceMap
          points={points}
          userLocation={coords}
          searchActive={searchActive}
          // The listing open beside the map: its pin lit, the map on it.
          // Otherwise the row under the pointer.
          selectedId={selectedId ?? highlightedId ?? undefined}
          // A listing opened beside the map brings the map to it; a row
          // under the pointer only lights its pin.
          frameToken={selectedId ? frame : undefined}
          onSelectPoint={(p) => onSelect(p.id)}
          onDeselectPoint={() => undefined}
          zoomRadiusMiles={zoomRadiusMiles}
        />
        </Suspense>
        </MapBoundary>
      )}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between">
        <button type="button" onClick={onHide} className={`pointer-events-auto ${button}`}>
          Hide map
        </button>
        <Link href={fullMapHref} aria-label="Open the full map" className={`pointer-events-auto ${button} px-2.5`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
          Full map
        </Link>
      </div>
    </div>
  )
}
