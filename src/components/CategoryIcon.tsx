'use client'

import Image from 'next/image'
import { isOptimizableImage } from '@/lib/imageHosts'

type Props = {
  icon: string
  /** An admin-uploaded picture, shown instead of `icon` when present — see
   *  CategoryConfig.iconImageUrl. */
  iconImageUrl?: string | null
  color: string
  /** Tailwind size + font-size classes for the circle, e.g. "h-10 w-10
   *  text-xl" — the font-size only matters for the emoji fallback, but is
   *  kept in one string since every call site sets both together. */
  className?: string
  /** Pixel size passed to next/image's `sizes` — should match the box size
   *  implied by `className`. */
  sizePx?: number
}

/** The circular category avatar — a category's emoji icon in a tinted
 *  circle, or an uploaded picture in its place. One component so every
 *  render site (listing rows, the map's nearby list/place detail, category
 *  chips) shows a place the same way regardless of which it's using, and so
 *  the image-vs-emoji fallback logic exists exactly once. */
export default function CategoryIcon({ icon, iconImageUrl, color, className = 'h-10 w-10 text-xl', sizePx = 40 }: Props) {
  const hasImage = !!iconImageUrl?.trim()
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ backgroundColor: color + '22' }}
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
        icon
      )}
    </span>
  )
}
