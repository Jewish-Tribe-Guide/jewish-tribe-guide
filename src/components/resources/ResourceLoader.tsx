'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DirectoryResource, DirectoryAnchor, MapFilters } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { distanceMiles } from '@/lib/geo'
import GenericDirectory from './GenericDirectory'
import UpButton from '@/components/UpButton'
import { useActiveCommunity } from '@/lib/useCommunities'
import { withCommunity } from '@/lib/useCommunityData'

type Props = {
  category: CategoryConfig
  anchor: DirectoryAnchor
  /** When returning from a form, re-expand this listing's card. */
  reopenItemId?: string | null
  /** Pre-fill the directory's search box (from a landing "Places" result). */
  initialSearch?: string
  onUp: () => void
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
  /** Navigate to the map screen, carrying the directory's active search + field
   *  filters so the map opens showing the same results. */
  onViewMap?: (query?: string, filters?: MapFilters) => void
}

// Every category renders via the generic, hint-driven card renderer (badges,
// filters, kosher-item tags + search, and upvotes — all from category config).
export default function ResourceLoader({ category, anchor, reopenItemId, initialSearch, onUp, onAdd, onEdit, onReport, onViewMap }: Props) {
  const [items, setItems] = useState<DirectoryResource[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const title = category.pluralLabel

  // Extract stable deps from the anchor object (anchor itself is re-created each
  // parent render, so referencing it directly in effect deps would over-fire).
  const anchorCoords = anchor.coords
  const communitySlug = useActiveCommunity().community?.slug ?? ''

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setError(null)

    // Scoped to the active community — without this a directory opened in one
    // community lists another's places, since category slugs repeat across them.
    fetch(withCommunity(`/api/resources?category=${encodeURIComponent(category.id)}`, communitySlug))
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Failed to load.')
        if (!cancelled) setItems(body.resources as DirectoryResource[])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Something went wrong.')
      })

    return () => {
      cancelled = true
    }
  }, [category.id, communitySlug])

  // Distance to the visitor's anchor: straight-line miles (haversine) from their
  // typed address to each listing's geocoded coordinates.
  const withDistance = useMemo(() => {
    if (!items) return items
    if (category.hasAddress === false) return items

    const coords = anchorCoords
    if (!coords) return items
    return items.map((item) => {
      if (!item.geo) return item
      return { ...item, milesFromAddress: distanceMiles(coords, item.geo) }
    })
  }, [items, anchorCoords, category.hasAddress])

  if (error) {
    return (
      <div>
        <UpButton label="All resources" onClick={onUp} />
        <h2 className="text-xl font-semibold text-slate-800 mb-4">{title}</h2>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (withDistance === null || withDistance === undefined) {
    return (
      <div>
        <UpButton label="All resources" onClick={onUp} />
        <h2 className="text-xl font-semibold text-slate-800 mb-4">{title}</h2>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    )
  }

  // Subtitle shown under the category title — the visitor's typed location.
  const anchorLabel = anchor.label || undefined

  // Distance-sorted categories prompt for a location when none is set yet.
  // Categories with no address (e.g. WhatsApp groups) aren't distance-based, so skip it.
  const addressPrompt = !anchor.label && category.hasAddress !== false

  return (
    <GenericDirectory category={category} items={withDistance} anchorLabel={anchorLabel} addressPrompt={addressPrompt} reopenItemId={reopenItemId} initialSearch={initialSearch} onUp={onUp} onAdd={onAdd} onEdit={onEdit} onReport={onReport} onViewMap={onViewMap} />
  )
}
