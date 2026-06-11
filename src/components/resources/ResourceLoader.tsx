'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DirectoryResource, DirectoryAnchor } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { distanceMiles } from '@/lib/geo'
import GenericDirectory from './GenericDirectory'
import SynagogueDirectory from './SynagogueDirectory'
import UpButton from '@/components/UpButton'

type Props = {
  category: CategoryConfig
  anchor: DirectoryAnchor
  /** When returning from a form, re-expand this listing's card. */
  reopenItemId?: string | null
  onUp: () => void
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
}

// Per-listing real travel times fetched from /api/travel for address-mode anchors.
type RealTimes = Record<string, { drive?: number; walk?: number }>

// Every category renders via the generic, hint-driven card renderer (badges,
// filters, kosher-item tags + search, and upvotes — all from category config).
export default function ResourceLoader({ category, anchor, reopenItemId, onUp, onAdd, onEdit, onReport }: Props) {
  const [items, setItems] = useState<DirectoryResource[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Real driving/walking times for address-mode anchors, populated asynchronously
  // after the listings load. Falls back to straight-line miles until ready.
  const [realTimes, setRealTimes] = useState<RealTimes>({})
  const title = category.pluralLabel

  // Extract stable deps from the anchor object (anchor itself is re-created each
  // parent render, so referencing it directly in effect deps would over-fire).
  const anchorKind = anchor.kind
  const anchorCoords = anchor.kind === 'address' ? anchor.coords : null

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setError(null)

    fetch(`/api/resources?category=${encodeURIComponent(category.id)}`)
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
  }, [category.id])

  // Once listings have loaded in address mode, fetch real driving + walking times
  // from /api/travel. Until the response arrives the component shows straight-line
  // miles as a placeholder; on success those are replaced with 🚗 / 🚶 times
  // matching the patient-tab format. Silently falls back to miles on error.
  useEffect(() => {
    if (anchorKind !== 'address' || !anchorCoords || !items || category.community) {
      setRealTimes({})
      return
    }

    const destinations = items
      .filter((item) => item.geo != null)
      .map((item) => ({ id: item.id, lat: item.geo!.lat, lng: item.geo!.lng }))

    if (destinations.length === 0) return

    let cancelled = false
    setRealTimes({}) // clear stale times while new fetch is in flight

    fetch('/api/travel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: anchorCoords, destinations }),
    })
      .then(async (res) => {
        const body = (await res.json()) as { ok: boolean; results?: RealTimes }
        if (!cancelled && body.ok && body.results) setRealTimes(body.results)
      })
      .catch(() => {
        // Silently keep the straight-line-miles fallback
      })

    return () => {
      cancelled = true
    }
  }, [items, anchorKind, anchorCoords, category.community])

  // Distance to the visitor's anchor:
  //  - hospital → precomputed driving/walking minutes (computed at approval)
  //  - address  → real driving/walking minutes from /api/travel, or straight-line
  //               miles as a placeholder while the fetch is in flight
  const withDistance = useMemo(() => {
    if (!items) return items
    if (category.community) return items

    if (anchor.kind === 'hospital') {
      const hid = anchor.hospitalId
      return items.map((item) => {
        const times = item.travel?.[hid]
        return times ? { ...item, driveMinutes: times.drive, walkMinutes: times.walk } : item
      })
    }

    // Address mode
    const coords = anchorCoords
    if (!coords) return items
    return items.map((item) => {
      if (!item.geo) return item
      const rt = realTimes[item.id]
      if (rt) {
        // Real times available — show 🚗 / 🚶 just like the patient tab
        return { ...item, driveMinutes: rt.drive, walkMinutes: rt.walk }
      }
      // Placeholder while the Distance Matrix call is in flight
      return { ...item, milesFromAddress: distanceMiles(coords, item.geo) }
    })
  }, [items, anchor, anchorCoords, category.community, realTimes])

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

  // Subtitle shown under the category title — mirrors "About Your Hospital" pattern.
  const anchorLabel =
    anchor.kind === 'hospital'
      ? anchor.hospitalName
      : anchor.label || undefined

  // Distance-sorted categories prompt for a location when none is set yet.
  // Community categories (e.g. WhatsApp groups) aren't distance-based, so skip it.
  const addressPrompt = anchor.kind === 'address' && !anchor.label && !category.community

  // Synagogues get the rich collapsible card instead of the generic flat-row renderer.
  if (category.id === 'synagogue') {
    return (
      <SynagogueDirectory
        items={withDistance}
        anchorLabel={anchorLabel}
        addressPrompt={addressPrompt}
        reopenItemId={reopenItemId}
        onUp={onUp}
        onAdd={onAdd}
        onEdit={onEdit}
        onReport={onReport}
      />
    )
  }

  return (
    <GenericDirectory category={category} items={withDistance} anchorLabel={anchorLabel} addressPrompt={addressPrompt} onUp={onUp} onAdd={onAdd} onEdit={onEdit} onReport={onReport} />
  )
}
