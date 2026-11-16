'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { LatLng } from '@/lib/geo'
import { milesText } from '@/lib/geo'
import { getCategoryTilePhoto } from '@/lib/categoryColor'
import { beforeCandles, candleItemHref } from '@/lib/todayHome'
import { TilePhoto } from './sections'

// ── Shabbos shopping, beside the candles card on Friday (board U3f, Nov 14) ──
// What was "Before candles" (the user: it said when, not what): the store
// category's picture under a dark fade, how many stores open now have any of
// the admin's items, the nearest, and a button per item, as the candles card
// has Minyanim and Zmanim. Each button opens the stores with that item, open
// now (candleItemHref). An item no store open now lists has no button; with
// none at all, no card.

type Props = {
  listings: readonly DirectoryResource[]
  categories: readonly CategoryConfig[]
  /** The admin's items: "Challah", "Wine", "Chicken". */
  items: readonly string[]
  now: number
  from: LatLng
  communitySlug: string
}

export default function ShabbosShopping({ listings, categories, items, now, from, communitySlug }: Props) {
  if (items.length === 0) return null
  const { rows, stores, closest } = beforeCandles(listings, categories, items, new Date(now), from)
  if (rows.length === 0) return null
  const photo = getCategoryTilePhoto(categories as CategoryConfig[], rows[0]!.category.id)
  return (
    <section data-testid="shabbos-shopping" className="relative flex flex-col overflow-hidden rounded-2xl bg-slate-700 px-4 py-3.5 text-white desktop:px-6 desktop:py-5">
      {photo && (
        <span aria-hidden="true" data-testid="shabbos-shopping-photo" className="absolute inset-0">
          <TilePhoto src={photo} px={400} sizes="(min-width: 640px) 600px, 100vw" />
        </span>
      )}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/35" />
      <h3 className="relative text-[13px] font-semibold text-slate-200">Shabbos shopping</h3>
      <p className="relative mt-0.5 text-[28px] font-extrabold tracking-tight">
        {stores} {stores === 1 ? 'store' : 'stores'} open
      </p>
      {closest != null && <p className="relative text-[13.5px] text-slate-200">{stores === 1 ? `${milesText(closest)} away` : `Closest ${milesText(closest)}`}</p>}
      <div className="relative mt-auto flex gap-2 pt-3">
        {rows.map((row) => (
          <Link
            key={row.item}
            href={candleItemHref(communitySlug, row)}
            prefetch={false}
            className="min-w-0 flex-1 truncate rounded-lg bg-white/15 px-2 py-2 text-center text-[13.5px] font-bold text-white hover:bg-white/25 desktop:max-w-40"
          >
            {row.item}
          </Link>
        ))}
      </div>
    </section>
  )
}

