'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { mapQueryString, routes } from '@/lib/routes'
import { possessive, staticMapUrl } from '@/lib/staticMap'
import { MapFoldIcon } from '@/components/icons'

// ── The listing's map tile (board B1, Nov 16; built Nov 17) ──────────────
// A small map at the top of the address box, where people already look
// for where a place is. A tap opens the Map tab on this place, with its
// pin above its sheet and a ‹ back to the listing (D3). Only on a phone:
// a computer has the map beside the list.
//
// The picture is Google's (staticMap.ts). Where Google won't draw it (no
// key, or a key it refuses, as on CI's localhost) the tile isn't there,
// rather than a broken image.

const HEIGHT = 120

export default function ListingMapTile({ item, category, community }: { item: DirectoryResource; category: CategoryConfig; community: string }) {
  const [failed, setFailed] = useState(false)
  // The picture is asked for at the tile's own width: a wider one, cropped
  // to fit, cut off Google's logo and credit at its corners.
  const box = useRef<HTMLAnchorElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const w = box.current?.clientWidth
    if (w) setWidth(w)
  }, [])
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!item.geo || !key || failed) return null
  const href = `${routes.map(community)}${mapQueryString({ categories: [category.id], place: item.id, from: category.id })}`
  const label = `On ${possessive(category.pluralLabel || category.label)} map`
  return (
    <Link
      ref={box}
      href={href}
      data-testid="listing-map-tile"
      className="relative mt-3 mb-1 block overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      style={{ height: HEIGHT }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Google's own
          image service: Next's optimizer would fetch and keep it, which
          Google's terms don't allow. */}
      {width && <img
        src={staticMapUrl(item.geo, key, { width, height: HEIGHT })}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />}
      {/* Top left, not the board's bottom left: Google's logo and its map
          credit sit along the bottom, and its terms say they stay visible. */}
      <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[0.84375rem] font-bold text-primary shadow-sm">
        <MapFoldIcon className="h-4 w-4" />
        {label}
      </span>
    </Link>
  )
}
