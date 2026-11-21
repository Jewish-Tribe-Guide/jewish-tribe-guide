'use client'
// ResourceMapView's Filters (split out Nov 21, no behaviour change): what
// the link said, what the visitor has changed since, and whether the sheet
// is open. State and memos only.
import { useMemo, useState } from 'react'
import { readMapFilters, type MapFilterState } from '@/lib/mapFilters'
import type { useCategories } from '@/lib/useCategories'
import type { ResourceMapViewProps } from './mapViewShared'

export function useMapFilters({
  initialFilters,
  initialCategory,
  initialSelectedCategories,
  categories,
}: {
  initialFilters: ResourceMapViewProps['initialFilters']
  initialCategory: ResourceMapViewProps['initialCategory']
  initialSelectedCategories: ResourceMapViewProps['initialSelectedCategories']
  categories: ReturnType<typeof useCategories>
}) {
  // ── Filters, per category (see mapFilters.ts) ────────────────────────────
  // Read from the link (or a category page's own Map button) once the
  // categories have loaded, since a filter belongs to one of them; the
  // visitor's own changes replace that reading from then on. Open now is
  // each category's own, where it keeps hours.
  const initialFiltersQuery = {
    open: initialFilters?.openNow ? '1' : initialFilters?.openIn?.join(',') || null,
    is: initialFilters?.bool?.join(',') || null,
    sel:
      Object.entries(initialFilters?.select ?? {})
        .filter(([, vs]) => vs.length)
        .map(([k, vs]) => `${k}:${vs.join('|')}`)
        .join(',') || null,
  }
  const filtersForCategory = initialCategory ?? (initialSelectedCategories && [...initialSelectedCategories].length === 1 ? [...initialSelectedCategories][0] : null)
  const [ownFilters, setOwnFilters] = useState<MapFilterState | null>(null)
  // What "no Filters of the visitor's own" falls back to: the Filters of the
  // address this screen was opened or navigated to, kept as they were then.
  // Not the live initial* props: those also carry this screen's own address
  // writes echoed back (see ownWritesRef), so clearing a reading's Open now
  // fell back to the Open now the reading had just written.
  const [baseFilters, setBaseFilters] = useState(() => ({ query: initialFiltersQuery, forCategory: filtersForCategory }))
  const filters = useMemo<MapFilterState>(
    () => ownFilters ?? (categories ? readMapFilters(baseFilters.query, categories, baseFilters.forCategory) : {}),
    [ownFilters, categories, baseFilters],
  )
  const hasFilters = Object.keys(filters).length > 0
  const filtersKey = JSON.stringify(filters)
  const updateFilters = (next: (f: MapFilterState) => MapFilterState) => setOwnFilters(next(filters))
  const [filtersOpen, setFiltersOpen] = useState(false)

  return {
    initialFiltersQuery,
    filtersForCategory,
    setOwnFilters,
    setBaseFilters,
    filters,
    hasFilters,
    filtersKey,
    updateFilters,
    filtersOpen,
    setFiltersOpen,
  }
}
