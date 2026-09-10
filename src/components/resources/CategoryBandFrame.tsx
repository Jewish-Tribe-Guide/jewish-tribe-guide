'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import { isOptimizableImage } from '@/lib/imageHosts'
import { categoryTint, categoryRing } from '@/lib/categoryColor'
import { useIsMobile } from '@/lib/useIsMobile'

type FrameProps = {
  /** The band's color — a category's own pin color (getCategoryColor), or a
   *  fixed color for a pseudo-category with no CategoryConfig row (see
   *  HospitalsDirectory's HOSPITAL_COLOR). */
  color: string
  /** A photo to show muted under the color, e.g. CategoryConfig.cardImageUrl.
   *  Omit (or null) for the plain wash — most categories, and every caller
   *  with nowhere to store a photo (Hospitals has no CategoryConfig row). */
  imageUrl?: string | null
  children: ReactNode
}

/** The full-bleed photo/color band, plus the thin frame that continues
 *  around everything the caller wraps in it (header, filters, listing
 *  content) — one continuous piece rather than a banner floating above
 *  ungrouped text. Desktop only: on mobile this renders `children` with no
 *  wrapping at all, since mobile's own home->category slide (navTransitions)
 *  already communicates hierarchy on its own.
 *
 *  The frame breaks out to the full viewport width the same way
 *  ResourceMapView's mobile map band does (relative left-1/2 w-screen
 *  -translate-x-1/2 — safe against horizontal scroll because the element is
 *  exactly 100vw, same reasoning as globals.css's html{overflow-x:hidden});
 *  the photo fills it edge to edge, while a nested max-w-6xl/px-4 column
 *  keeps `children` aligned with the rest of the page.
 *
 *  `-mt-12` cancels SlugScreen's `<main>` `pt-8` (32px) plus the 16px of
 *  margin the TurnstileWidget placeholder (`my-2`, rendered ahead of every
 *  directory screen whether or not the widget itself is visible) adds above
 *  it — 48px total — so the frame starts flush under SiteHeader instead of
 *  floating below a gap. */
export function CategoryBandFrame({ color, imageUrl, children }: FrameProps) {
  const isMobile = useIsMobile()
  if (isMobile) return <>{children}</>

  const bandImage = imageUrl?.trim() || null

  return (
    <div className="relative left-1/2 -mt-12 w-screen -translate-x-1/2 border border-slate-200">
      <div
        className="relative h-48 overflow-hidden sm:h-56"
        style={!bandImage ? { backgroundColor: categoryTint(color) } : undefined}
      >
        {bandImage && (
          <>
            <Image src={bandImage} alt="" fill sizes="100vw" className="object-cover" unoptimized={!isOptimizableImage(bandImage)} />
            {/* A photo's own mood varies wildly (dark, busy, unrelated
                colors) and can bury the category color entirely — this
                overlay is deliberately much stronger than the plain-wash
                case (categoryTint's ~18%) so the category's own hue still
                reads as the dominant color regardless of what's in the
                photo underneath. */}
            <div className="absolute inset-0" style={{ backgroundColor: `${color}73` }} />
          </>
        )}
      </div>
      <div className="mx-auto max-w-6xl px-4">{children}</div>
    </div>
  )
}

type BadgeProps = {
  color: string
  children: ReactNode
}

/** The circular badge that overlaps a CategoryBandFrame's bottom edge —
 *  white fill so it stays legible against any photo, with the category's
 *  own color as just the ring around it (a colored fill would read as
 *  another patch of the photo rather than a badge). Pass the icon/glyph as
 *  `children`; sizing (h-16 w-16 text-3xl) is fixed since every caller today
 *  wants the same badge size here. */
export function CategoryBandBadge({ color, children }: BadgeProps) {
  return (
    <div
      className="relative -mt-8 ml-1 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-3xl"
      style={{ boxShadow: `0 0 0 3px white, ${categoryRing(color)}`, color }}
    >
      {children}
    </div>
  )
}
