'use client'
// ResourceMapView's points (split out Nov 21, no behaviour change): each
// category's colour, every place the map can plot (hospitals included where
// the community has them), how many saved places it can show, and the chip
// row's categories. Memos only, so where it's called doesn't change when
// any effect runs.
import { useMemo } from 'react'
import type { FilterOption } from './CategoryFilter'
import type { MapPoint } from './ResourceMap'
import { DEFAULT_CATEGORY_ICON, resolveCapabilities } from '@/lib/categories'
import { getCategoryColor, HOSPITAL_COLOR, HOSPITAL_ICON } from '@/lib/categoryColor'
import { listingSearchText } from '@/lib/searchListing'
import type { useAllListings } from '@/lib/useAllListings'
import type { useCategories } from '@/lib/useCategories'
import type { useHospitals } from '@/lib/useHospitals'
import type { DirectoryResource } from '@/types'
import { HOSPITALS_ID } from './mapViewShared'

export function useMapPoints({
  categories,
  listings,
  hospitalsData,
  pinnedIds,
}: {
  categories: ReturnType<typeof useCategories>
  listings: ReturnType<typeof useAllListings>
  hospitalsData: ReturnType<typeof useHospitals>
  pinnedIds: Set<string>
}) {
  const colorById = useMemo(() => {
    const map = new Map<string, string>()
    ;(categories ?? []).forEach((c) => map.set(c.id, getCategoryColor(categories, c.id)))
    return map
  }, [categories])

  const allPoints = useMemo(() => {
    // `raw` carries the underlying listing so field filters (open-now / kosher /
    // type) can be applied; hospital pins have none.
    const out: (MapPoint & { filterId: string; searchText: string; raw?: DirectoryResource })[] = []

    // Hospital pins are a patient-oriented overlay — only when that module is on.
    if ((categories ?? []).some((c) => c.kind === 'medical')) {
      for (const h of hospitalsData ?? []) {
        out.push({
          filterId: HOSPITALS_ID,
          id: `hospital:${h.id}`,
          lat: h.latitude,
          lng: h.longitude,
          name: h.name,
          color: HOSPITAL_COLOR,
          glyph: HOSPITAL_ICON,
          categoryLabel: 'Hospital',
          searchText: h.name.toLowerCase(),
        })
      }
    }

    const catById = new Map((categories ?? []).map((c) => [c.id, c]))
    for (const r of listings ?? []) {
      const lat = r.geo?.lat
      const lng = r.geo?.lng
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      const cat = catById.get(r.category)
      // A category whose Map button capability is off (or that no longer
      // resolves — e.g. a stale/deleted category) never gets pins here, same
      // as it not showing up as a filter chip.
      if (!cat || !resolveCapabilities(cat.capabilities).map) continue
      out.push({
        filterId: r.category,
        id: r.id,
        lat,
        lng,
        name: r.name,
        address: r.address || undefined,
        phone: r.phone,
        color: colorById.get(r.category) ?? '#64748b',
        glyph: cat?.icon ?? DEFAULT_CATEGORY_ICON,
        // The map's pins always show the category's own icon, even for a
        // listing that's uploaded its own photo — a pin is too small and too
        // dense on-screen (often dozens at once) for a real photo to read as
        // anything but noise. NearbyList reads the listing's own photo off
        // `raw` directly (see PHOTO_FIELD_KEY) — a scrollable list of a few
        // rows is where a real logo actually helps recognition.
        categoryLabel: cat?.label ?? r.category,
        // Same haystack the category directory searches against (name, address,
        // tags, detail fields) — so a query that matches in the directory
        // matches here too.
        searchText: listingSearchText(r, cat),
        raw: r,
        pinned: pinnedIds.has(r.id),
      })
    }
    return out
  }, [listings, categories, colorById, hospitalsData, pinnedIds])

  // `pinned` (from usePinned) is every pinned listing regardless of category —
  // it has no idea a category can be non-mappable (WhatsApp Groups, Networking:
  // `hasAddress: false`, so `capabilities.map` is forced off — see categories.ts).
  // `allPoints` above already excludes those (no geo, no map capability), so an
  // entry that made it in and is still marked `pinned` is guaranteed mappable.
  // The Pinned chip's visibility/count must be driven by THIS, not by
  // `pinned.length` directly — otherwise pinning a WhatsApp group flips the
  // chip on and counts a pin that can never actually appear as a marker, the
  // same "chip with nothing behind it" bug categories.ts's own doc describes
  // for a stale/deleted category.
  const mappablePinnedCount = useMemo(() => allPoints.filter((p) => p.pinned).length, [allPoints])

  const options = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>()
    for (const p of allPoints) counts.set(p.filterId, (counts.get(p.filterId) ?? 0) + 1)

    const opts: FilterOption[] = []
    if (counts.get(HOSPITALS_ID)) {
      opts.push({ id: HOSPITALS_ID, label: 'Hospitals', icon: HOSPITAL_ICON, color: HOSPITAL_COLOR, count: counts.get(HOSPITALS_ID)! })
    }
    for (const c of categories ?? []) {
      const count = counts.get(c.id) ?? 0
      if (count === 0) continue
      opts.push({ id: c.id, label: c.pluralLabel, icon: c.icon, color: colorById.get(c.id) ?? '#64748b', count })
    }
    // Highest listing count first — the assumption being a category with more
    // listings is more likely to be the one a visitor's actually looking for.
    // Hospitals gets no special pinning here; it sorts in with everyone else.
    return opts.sort((a, b) => b.count - a.count)
  }, [allPoints, categories, colorById])

  return { colorById, allPoints, mappablePinnedCount, options }
}
