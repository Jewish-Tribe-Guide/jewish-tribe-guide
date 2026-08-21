'use client'

import Image from 'next/image'
import { isOptimizableImage } from '@/lib/imageHosts'
import { CategoryGlyph } from '@/lib/categoryIcons'

type Props = {
  icon: string
  /** CategoryConfig.id (or the map's synthetic hospitals filter id) — which
   *  hand-built line icon (see lib/categoryIcons.tsx) to draw instead of
   *  `icon`'s plain emoji, when one exists. Omit for a caller with no
   *  category id handy (e.g. a raw emoji with nothing behind it); `icon`
   *  itself still renders in that case. */
  categoryId?: string
  /** An admin-uploaded picture, shown instead of `icon`/the line icon when
   *  present — see CategoryConfig.iconImageUrl. */
  iconImageUrl?: string | null
  color: string
  /** Tailwind size + font-size classes for the circle, e.g. "h-10 w-10
   *  text-xl" — the font-size only matters for the emoji fallback (a line
   *  icon sizes itself off the circle instead — see glyphClassName below),
   *  but is kept in one string since every call site sets both together. */
  className?: string
  /** Pixel size passed to next/image's `sizes` — should match the box size
   *  implied by `className`. */
  sizePx?: number
}

/** The circular category avatar — a category's line icon (or, lacking one,
 *  its plain emoji) in a tinted circle, or an uploaded picture in its place.
 *  One component so every render site (listing rows, the map's nearby
 *  list/place detail, category chips) shows a place the same way regardless
 *  of which it's using, and so the image-vs-icon-vs-emoji fallback logic
 *  exists exactly once. */
export default function CategoryIcon({ icon, categoryId, iconImageUrl, color, className = 'h-10 w-10 text-xl', sizePx = 40 }: Props) {
  const hasImage = !!iconImageUrl?.trim()
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ backgroundColor: color + '22', color }}
      aria-hidden="true"
    >
      {hasImage ? (
        // unoptimized for anything outside our own storage/Unsplash — an
        // admin-pasted URL from an unlisted host throws in next/image
        // otherwise (see isOptimizableImage's own note), and that's a
        // thrown error, not a broken image icon.
        <Image
          src={iconImageUrl!}
          alt=""
          fill
          sizes={`${sizePx}px`}
          className="object-cover"
          unoptimized={!isOptimizableImage(iconImageUrl!)}
        />
      ) : (
        // w-[55%]/h-[55%]: a line icon reads as too small relative to its
        // tinted circle at the emoji's own natural size, and too large at
        // the circle's full size (crowds the tint ring) — 55% of the
        // circle's own box, not a fixed px size, is what keeps it
        // proportional across every className this component gets called
        // with (h-6 chips through h-14 place-detail avatars alike).
        <CategoryGlyph categoryId={categoryId} icon={icon} className="w-[55%] h-[55%]" />
      )}
    </span>
  )
}
