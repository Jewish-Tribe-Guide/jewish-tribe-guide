'use client'

import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource, Hospital, NavigateFn } from '@/types'
import Collapsible from '@/components/Collapsible'
import CategoryRow from './CategoryRow'
import HospitalRow from './HospitalRow'
import { HOSPITALS_ID } from '@/components/map/ResourceMapView'
import { ExternalIcon } from '@/components/icons'
import { eruvim } from '@/data/resources'

type Props = {
  /** The categories that actually have pins on the map (Medical + any listing
   *  category with at least one geocoded point) — see Landing.tsx. */
  categories: CategoryConfig[]
  listings: DirectoryResource[]
  hospitals: Hospital[]
  onNavigate: NavigateFn
  /** The visitor's location — when set, each category's items sort nearest
   *  first and show their distance, same as the directory/map/Places do. */
  coords: { lat: number; lng: number } | null
  /** Tapping a facility calls this with its map point id (or null to clear) —
   *  isolates + zooms to it on the map beside this list. */
  onFocusListing?: (mapPointId: string | null) => void
  /** The category (or HOSPITALS_ID) currently isolated on the map — a row is
   *  expanded exactly when its map id matches, and expanding/collapsing it
   *  calls `onFocusCategory` instead of managing its own open state. */
  focusedCategoryId?: string | null
  onFocusCategory?: (id: string | null) => void
  /** Same color as this category's pins/chip on the map — see Landing.tsx,
   *  which computes this from the exact same palette ResourceMapView uses. */
  colorFor?: (mapId: string) => string
  /** Reports the map point ids currently surviving the expanded row's own
   *  filters, so the map can narrow to exactly what's shown there. */
  onVisibleIdsChange?: (ids: string[]) => void
}

// The map's chip for hospitals uses a fixed id (not the category's own slug)
// since hospital pins aren't tied to a single category row — see HOSPITALS_ID.
const mapIdFor = (c: CategoryConfig): string => (c.kind === 'medical' ? HOSPITALS_ID : c.id)

/** Desktop home page: every on-map category as a collapsible row (title as
 *  the dropdown), expanding in place to the exact same search/sort/filters +
 *  listing cards its own directory page has (see CategoryRow/HospitalRow) —
 *  Open Now, Popular/Distance sort, and every filterable boolean/select field
 *  (denomination, kosher, shabbat-friendly, chaplain, …), nearest-first.
 *  Expanding a row isolates + zooms the map to fit that whole category (same
 *  as toggling just its chip on the map), and narrows further as its own
 *  filters are applied; tapping an individual facility narrows the isolation
 *  down to just that one point. */
export default function CategoryList({ categories, listings, hospitals, onNavigate, coords, onFocusListing, focusedCategoryId, onFocusCategory, colorFor, onVisibleIdsChange }: Props) {
  if (categories.length === 0) return null

  return (
    <div className="space-y-3">
      {categories.map((c) => {
        const mapId = mapIdFor(c)
        const title = c.icon ? `${c.icon} ${c.pluralLabel}` : c.pluralLabel
        const synced = focusedCategoryId !== undefined
        const collapsibleProps = synced
          ? { open: focusedCategoryId === mapId, onToggle: () => onFocusCategory?.(focusedCategoryId === mapId ? null : mapId) }
          : {}
        const accentColor = colorFor?.(mapId)

        if (c.kind === 'medical') {
          return (
            <Collapsible key={c.id} title={title} accentColor={accentColor} count={hospitals.length} {...collapsibleProps}>
              <HospitalRow hospitals={hospitals} coords={coords} onNavigate={onNavigate} onFocusListing={onFocusListing} onVisibleIdsChange={onVisibleIdsChange} />
            </Collapsible>
          )
        }

        if (c.kind === 'eruv') {
          // Not tied to any map pin (eruvim aren't geocoded listings) — expanding
          // this row just shows its static status info, nothing changes on the map.
          return (
            <Collapsible key={c.id} title={title} accentColor={accentColor} count={eruvim.length} {...collapsibleProps}>
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button
                    onClick={() => onNavigate('patient', 'find', { findView: 'eruv' })}
                    className="text-xs font-medium text-primary hover:underline cursor-pointer"
                  >
                    View full page →
                  </button>
                </div>
                {eruvim.map((eruv) => (
                  <div key={eruv.id} className="border-2 border-slate-300 bg-white px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-900">{eruv.name}</p>
                    <p className="text-xs text-muted mb-1.5">{eruv.area}</p>
                    <a
                      href={eruv.statusLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Check status &amp; boundary map <ExternalIcon />
                    </a>
                  </div>
                ))}
              </div>
            </Collapsible>
          )
        }

        const items = listings.filter((item) => item.category === c.id)
        return (
          <Collapsible key={c.id} title={title} accentColor={accentColor} count={items.length} {...collapsibleProps}>
            <CategoryRow
              category={c}
              items={items}
              coords={coords}
              onNavigate={onNavigate}
              onFocusListing={onFocusListing}
              onVisibleIdsChange={onVisibleIdsChange}
            />
          </Collapsible>
        )
      })}
    </div>
  )
}
