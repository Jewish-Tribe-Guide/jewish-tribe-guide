'use client'

// ResourceMapView's leaf components (split out Nov 21, no behaviour change).

import { useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import ResourceMap from './ResourceMap'
import MapBoundary from './MapBoundary'
import type { Highlight } from './highlight'
import { PinIcon } from '@/components/icons'
import { categoryTint } from '@/lib/categoryColor'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { DROPPED_FILTER_ID, type SelectablePoint } from './mapViewShared'

/** The search box's dropdown, on the computer and the phone alike (it was
 *  written out twice, Nov 18 review item 42): "Open now" when the words
 *  could mean it, then the matching places, each a tap straight to its
 *  card, then what to do when nothing matched. A press doesn't take the
 *  focus off the box, which would close the list before the tap landed. */
export function SearchSuggestions<P extends SelectablePoint>({ className, rowPadding, openNow, onOpenNow, places, onPick, nothing }: {
  className: string
  rowPadding: string
  openNow: boolean
  onOpenNow: () => void
  places: P[]
  onPick: (p: P) => void
  nothing: ReactNode
}) {
  const row = `flex w-full items-center gap-3 ${rowPadding} py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 cursor-pointer`
  return (
    <div className={className}>
      {openNow && (
        <button onMouseDown={(e) => e.preventDefault()} onClick={onOpenNow} className={row}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden="true">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Open now</p>
            <p className="truncate text-xs text-slate-400">Show only listings open right now</p>
          </span>
        </button>
      )}
      {places.map((p) => (
        <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(p)} className={row}>
          <SuggestionIcon point={p} />
          <span className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{p.name}</p>
            <p className="truncate text-xs text-slate-400">
              {p.categoryLabel}
              {p.address ? ` · ${p.address}` : ''}
            </p>
          </span>
        </button>
      ))}
      {nothing}
    </div>
  )
}

/** A search line's icon: the place's category's line icon on its tint, a
 *  pin for a pin of your own. Category emoji used to show here, and 📍 for
 *  the rest (Nov 18: no emoji as icons). */
export function SuggestionIcon({ point }: { point: SelectablePoint }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: categoryTint(point.color), color: point.color }}
      aria-hidden="true"
    >
      {point.filterId === DROPPED_FILTER_ID ? <PinIcon className="h-4 w-4" /> : <CategoryGlyph categoryId={point.filterId} className="h-4 w-4" />}
    </span>
  )
}

/** The map, with the sidebar's hovered row's pin lifted: the place open in
 *  the sidebar first, else the row under the pointer. Reads the hover store
 *  itself, so only the map redraws as the pointer moves down the list. A
 *  hover never moves the map: ResourceMap frames only on frameToken. */
export function MapWithHover({ highlight, selectedId, ...props }: ComponentProps<typeof ResourceMap> & { highlight: Highlight }) {
  const hovered = useSyncExternalStore(highlight.subscribe, highlight.get, () => null)
  // A map Google broke stays in its own box: the page's search, chips and
  // list go on working (MapBoundary).
  return (
    <MapBoundary>
      <ResourceMap {...props} selectedId={selectedId ?? hovered ?? undefined} />
    </MapBoundary>
  )
}
