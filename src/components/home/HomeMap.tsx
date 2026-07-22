'use client'

import { useMemo } from 'react'
import ResourceMap, { type MapPoint } from '@/components/map/ResourceMap'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { useHospitals } from '@/lib/useHospitals'
import { DEFAULT_CATEGORY_ICON, resolveCapabilities } from '@/lib/categories'
import { community } from '@/community.config'
import type { NavigateFn } from '@/types'

const HOSPITAL_COLOR = '#dc2626'
const HOSPITAL_ICON = '🏥'

const PALETTE = [
  '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2',
  '#db2777', '#ca8a04', '#4f46e5', '#0d9488', '#65a30d',
]

/** The map, directly on the home screen instead of behind a "View Map"
 *  button — every listing with the Map capability on, plus hospitals, as
 *  plain pins (no filter chips/search here; that's what the full map screen,
 *  reachable via "Open full map" below, is for). Experimental — see if this
 *  reads better than the button it replaced in Landing.tsx. */
export default function HomeMap({ onNavigate }: { onNavigate: NavigateFn }) {
  const listings = useAllListings()
  const categories = useCategories()
  const hospitals = useHospitals() ?? []

  const colorById = useMemo(() => {
    const map = new Map<string, string>()
    ;(categories ?? []).forEach((c, i) => map.set(c.id, PALETTE[i % PALETTE.length]))
    return map
  }, [categories])

  const points = useMemo<MapPoint[]>(() => {
    const out: MapPoint[] = []

    if ((categories ?? []).some((c) => c.kind === 'medical')) {
      for (const h of hospitals) {
        out.push({
          id: `hospital:${h.id}`,
          lat: h.latitude,
          lng: h.longitude,
          name: h.name,
          color: HOSPITAL_COLOR,
          glyph: HOSPITAL_ICON,
          categoryLabel: 'Hospital',
        })
      }
    }

    const catById = new Map((categories ?? []).map((c) => [c.id, c]))
    for (const r of listings ?? []) {
      const lat = r.geo?.lat
      const lng = r.geo?.lng
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      const cat = catById.get(r.category)
      if (!cat || !resolveCapabilities(cat.capabilities).map) continue
      out.push({
        id: r.id,
        lat,
        lng,
        name: r.name,
        address: r.address || undefined,
        phone: r.phone,
        color: colorById.get(r.category) ?? '#64748b',
        glyph: cat.icon ?? DEFAULT_CATEGORY_ICON,
        categoryLabel: cat.label,
        filterId: r.category,
      })
    }
    return out
  }, [listings, categories, colorById, hospitals])

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-slate-900/5">
      <div className="h-72 sm:h-96 w-full">
        <ResourceMap
          points={points}
          fallbackCenter={community.mapCenter}
          onViewListing={(categoryId, listingId) =>
            onNavigate('patient', 'find', { findView: categoryId, findItemId: listingId })
          }
        />
      </div>
      <button
        onClick={() => onNavigate('patient', 'map')}
        className="w-full border-t border-slate-200 bg-white py-2 text-center text-sm font-medium text-primary hover:bg-slate-50 transition-colors cursor-pointer"
      >
        Open full map ↗
      </button>
    </div>
  )
}
