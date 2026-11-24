import { useEffect, useEffectEvent, useRef } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { itemFields } from '@/lib/itemFilter'
import type { ParamsOpts } from './directoryAddress'

// The category page's Filters, written into its address as they change
// (`?f_<key>=1`, `?sel_<key>=a,b`, `?has_<key>=Challah,Wine`; GenericDirectory).

type Options = {
  category: CategoryConfig
  boolFilters: Record<string, boolean>
  selectFilters: Record<string, string[]>
  hasFilters: Record<string, string[]>
  onParamsChange?: (changes: Record<string, string | null>, opts?: ParamsOpts) => void
}

export function useFiltersInAddress({ category, boolFilters, selectFilters, hasFilters, onParamsChange }: Options) {
  const fields = category.detailFields
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')
  // The category's filterable fields as they are when a write goes out.
  // Read, not depended on: they're fresh arrays every render, and the
  // writes follow the filters, not the category (a category is its own
  // screen).
  const fieldsNow = useEffectEvent(() => ({ booleans: filterableBooleans, selects: filterableSelects, items: itemFields(category) }))

  // Sync boolFilters/selectFilters into the URL — same `?f_<key>=`/
  // `?sel_<key>=` shape initialFilters reads above, and the same
  // skip-the-first-render + replace (not push) reasoning as the search/
  // openNow sync effects. Recomputes the FULL set of this category's
  // filterable-field params from current state every time (not a diff
  // against the previous set) — cheap (a handful of fields per category)
  // and it means a field toggled off is still explicitly nulled out rather
  // than requiring separate bookkeeping of what was previously set.
  //
  // Debounced (like search) rather than firing on every click: a
  // multi-select filter is exactly the case where a visitor picks several
  // values in quick succession (e.g. three "Type" checkboxes in a row), and
  // an immediate `router.replace` per click meant each of those clicks
  // forced its own live navigation — a full re-render of this whole
  // directory's listing grid, back to back, only microseconds apart. That
  // read as actual jank (a lagging/"glitching" cursor while the main thread
  // was busy re-rendering) purely from clicking a checkbox list a few times,
  // not from anything wrong with the click handling itself. One replace
  // after the visitor pauses is both cheaper and closer to "done choosing."
  const boolFiltersSyncedOnce = useRef(false)
  useEffect(() => {
    if (!boolFiltersSyncedOnce.current) {
      boolFiltersSyncedOnce.current = true
      return
    }
    const timer = setTimeout(() => {
      const changes: Record<string, string | null> = {}
      for (const f of fieldsNow().booleans) changes[`f_${f.key}`] = boolFilters[f.key] ? '1' : null
      onParamsChange?.(changes, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [boolFilters, onParamsChange])

  const selectFiltersSyncedOnce = useRef(false)
  useEffect(() => {
    if (!selectFiltersSyncedOnce.current) {
      selectFiltersSyncedOnce.current = true
      return
    }
    const timer = setTimeout(() => {
      const changes: Record<string, string | null> = {}
      for (const f of fieldsNow().selects) {
        const chosen = selectFilters[f.key] ?? []
        changes[`sel_${f.key}`] = chosen.length > 0 ? chosen.join(',') : null
      }
      onParamsChange?.(changes, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [selectFilters, onParamsChange])

  const hasFiltersSyncedOnce = useRef(false)
  useEffect(() => {
    if (!hasFiltersSyncedOnce.current) {
      hasFiltersSyncedOnce.current = true
      return
    }
    const timer = setTimeout(() => {
      const changes: Record<string, string | null> = {}
      for (const f of fieldsNow().items) {
        const chosen = hasFilters[f.key] ?? []
        changes[`has_${f.key}`] = chosen.length > 0 ? chosen.join(',') : null
      }
      onParamsChange?.(changes, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [hasFilters, onParamsChange])
}
