'use client'
// Three smaller pieces of ResourceMapView's state (split out Nov 21, no
// behaviour change): the dropped pins, the campaign chip's category, and
// the Filters sheet's sections. Each is called where its block sat.
import { useMemo, useState } from 'react'
import type { FilterOption } from './CategoryFilter'
import type { MapFilterSection } from './MapFiltersSheet'
import { useDroppedPins } from '@/lib/droppedPinsContext'
import { useCampaignBanners } from '@/lib/contentContext'
import { activeCampaignBanner } from '@/lib/campaignBanner'
import { useNow } from '@/lib/useNow'
import { selectValues } from '@/lib/categories'
import { filterCount, filterFields, keepsHours, openNowAll, type MapFilterState } from '@/lib/mapFilters'
import type { useCategories } from '@/lib/useCategories'
import { DROPPED_FILTER_ID, DROPPED_PIN_COLOR, DROPPED_PREFIX, type MapViewPoint, type SelectablePoint } from './mapViewShared'

export function useDroppedMapPins() {
  // Dropped pins — arbitrary points the visitor marks themselves, not tied
  // to a listing. `pendingDropAt` is the coordinate of a long-press waiting
  // to be named; `editingDroppedId` is an already-saved pin the visitor
  // tapped to rename/remove. At most one editor is ever open, so these don't
  // need to be one combined state.
  const { droppedPins, add: addDroppedPin, remove: removeDroppedPin, rename: renameDroppedPin } = useDroppedPins()
  const [pendingDropAt, setPendingDropAt] = useState<{ lat: number; lng: number } | null>(null)
  const [editingDroppedId, setEditingDroppedId] = useState<string | null>(null)
  const droppedMapPoints = useMemo<SelectablePoint[]>(
    () =>
      droppedPins.map((p) => ({
        id: `${DROPPED_PREFIX}${p.id}`,
        lat: p.lat,
        lng: p.lng,
        name: p.label,
        color: DROPPED_PIN_COLOR,
        categoryLabel: 'Your pin',
        filterId: DROPPED_FILTER_ID,
      })),
    [droppedPins],
  )
  return {
    droppedPins,
    addDroppedPin,
    removeDroppedPin,
    renameDroppedPin,
    pendingDropAt,
    setPendingDropAt,
    editingDroppedId,
    setEditingDroppedId,
    droppedMapPoints,
  }
}

// A live seasonal campaign's category (see CampaignBannerManager), given
// its own distinctly-styled chip rather than just sorting into `options`
// by count like every other category — the whole point is that a visitor
// notices it's not an ordinary category. Absent entirely outside the
// campaign's date range (activeCampaignBanner), and also when its
// category currently has no points to show (nothing to filter to).
// Which campaign is on waits for today's date, as the home card's does.
export function useCampaignOption(options: FilterOption[], timezone: string) {
  const campaignBanners = useCampaignBanners()
  const campaignClock = useNow()
  const activeCampaign = campaignClock === null ? null : activeCampaignBanner(campaignBanners, campaignClock, timezone)
  return activeCampaign ? options.find((o) => o.id === activeCampaign.categoryId) : undefined
}

export function useFilterSections({
  categories,
  options,
  effectiveSelected,
  filters,
  filtersKey,
  allPoints,
  optionsWithFilters,
  colorById,
}: {
  categories: ReturnType<typeof useCategories>
  options: FilterOption[]
  effectiveSelected: Set<string>
  filters: MapFilterState
  filtersKey: string
  allPoints: MapViewPoint[]
  optionsWithFilters: FilterOption[]
  colorById: Map<string, string>
}) {
  // ── Filters: one button, one sheet, the chips of what's on ───────────────
  // The categories showing, in the chip row's order: the sheet's sections.
  const showingCategories = useMemo(() => {
    const byId = new Map((categories ?? []).map((c) => [c.id, c]))
    return options.flatMap((o) => (effectiveSelected.has(o.id) && byId.has(o.id) ? [byId.get(o.id)!] : []))
  }, [options, effectiveSelected, categories])
  const topOpenNow = openNowAll(filters, showingCategories)
  const categorySections = useMemo<MapFilterSection[]>(() => {
    return showingCategories.flatMap((c) => {
      const f = filters[c.id] ?? {}
      const fields = filterFields(c)
      const catPoints = allPoints.filter((p) => p.filterId === c.id)
      const booleans = fields.filter((x) => x.type === 'boolean').map((x) => ({ key: x.key, label: x.filterLabel ?? x.label, on: !!f.bool?.includes(x.key) }))
      const selects = fields
        .filter((x) => x.type === 'select')
        .map((x) => {
          const chosen = f.select?.[x.key] ?? []
          // The values its places actually have, and whatever's chosen.
          const values = [...new Set([...catPoints.flatMap((p) => (p.raw ? selectValues(p.raw[x.key]) : [])), ...chosen])].filter(Boolean)
          return { key: x.key, label: x.filterLabel ?? x.label, values, chosen }
        })
        .filter((sel) => sel.values.length > 0)
      const openNow = keepsHours(c) ? !!f.openNow : null
      if (openNow === null && booleans.length === 0 && selects.length === 0) return []
      const shown = optionsWithFilters.find((o) => o.id === c.id)?.count ?? catPoints.length
      return [
        {
          id: c.id,
          label: c.pluralLabel,
          icon: c.icon,
          color: colorById.get(c.id) ?? '#64748b',
          note: shown === catPoints.length ? `all ${catPoints.length}` : `${shown} of ${catPoints.length}`,
          openNow,
          booleans,
          selects,
        },
      ]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingCategories, filtersKey, allPoints, optionsWithFilters, colorById])
  const filterSections = categorySections
  const andNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
  const topOpenNowNote = topOpenNow.on
    ? `For ${andNames(topOpenNow.withHours.map((c) => c.pluralLabel))}.`
    : topOpenNow.onFor.length > 0
      ? `On for ${andNames(topOpenNow.onFor)} only.`
      : null
  const filtersOn = filterCount(filters, showingCategories)
  return { topOpenNow, filterSections, topOpenNowNote, filtersOn }
}
