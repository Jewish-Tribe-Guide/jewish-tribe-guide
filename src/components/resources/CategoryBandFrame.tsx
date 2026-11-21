'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import { photoProps } from '@/lib/imageHosts'
import { categoryTint } from '@/lib/categoryColor'
import { useIsMobile } from '@/lib/useIsMobile'

type FrameProps = {
  /** The band's color — a category's own pin color (getCategoryColor), or a
   *  fixed color for a pseudo-category with no CategoryConfig row. */
  color: string
  /** A photo to show muted under the color, e.g. CategoryConfig.cardImageUrl.
   *  Omit (or null) for the plain wash — most categories, and every caller
   *  with nowhere to store a photo (Hospitals has no CategoryConfig row). */
  imageUrl?: string | null
  /** Board H4 (Nov 11): the band grows to a photo (240px, 262 since Nov 15) under a dark
   *  gradient, carrying this (the count, the title, where distances are
   *  measured from) in white. The home's own tile picture is the photo. */
  hero?: ReactNode
  /** With `hero`: the first thing in `children` (the search) rides up onto
   *  the bottom of the photo. Off while nothing would ride up there (no
   *  search, or a phone), or what follows would start inside the photo. */
  heroOverlap?: boolean
  children: ReactNode
}

/** The photo under the search: as much as above the count (pt-11), so the
 *  search sits in the photo rather than on its bottom edge (the user, Nov
 *  15: "a little more space underneath the search bar"; it was 22px). */
export const HERO_PHOTO_UNDER_SEARCH_PX = 44
/** How far the search rides up onto the hero photo: its 52px box plus the
 *  photo under it (board H4). */
export const HERO_OVERLAP_PX = 52 + HERO_PHOTO_UNDER_SEARCH_PX + 1
/** The photo's height: where the search starts (165px down, under the
 *  count, title and distance line), then the search and the photo under it. */
export const HERO_PHOTO_PX = 165 + HERO_OVERLAP_PX
/** With nothing riding up onto it (the Eruv and Zmanim pages have no
 *  search): the title and the line under it, then as much photo again as
 *  under a search, not an empty strip where the search would be. */
export const HERO_TITLE_PHOTO_PX = 165 + HERO_PHOTO_UNDER_SEARCH_PX

/** The words on the photo (board H4): a small count over the title, and
 *  one line under it. The category pages draw their own (GenericDirectory,
 *  whose line has a button); the Eruv and Zmanim pages use this, so they
 *  look like the category pages around them (the user, Nov 15). */
export function HeroTitle({ eyebrow, title, line }: { eyebrow?: string | null; title: string; line?: ReactNode }) {
  return (
    <>
      {/* Held open while it loads, so the title doesn't move down. */}
      <p className="min-h-[19.5px] text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-white/85" data-testid="category-hero-count">
        {eyebrow}
      </p>
      <h1 className="mt-1.5 text-[2.75rem] font-extrabold leading-[1.05]">{title}</h1>
      {line && <p className="mt-2 flex items-center gap-1.5 text-[0.9375rem] text-white/90">{line}</p>}
    </>
  )
}

/** The full-bleed photo/color band, plus the thin frame that continues
 *  around everything the caller wraps in it (header, filters, listing
 *  content) — one continuous piece rather than a banner floating above
 *  ungrouped text. Desktop only: on mobile this renders `children` with no
 *  wrapping at all, since mobile's own home->category slide (navTransitions)
 *  already communicates hierarchy on its own.
 *
 *  The frame breaks out to the full viewport width the same way
 *  ResourceMapView's mobile map band does (relative left-1/2 w-page
 *  -translate-x-1/2 — safe against horizontal scroll because the element is
 *  exactly the page's width, same reasoning as globals.css's html{overflow-x:hidden});
 *  the photo fills it edge to edge, while a nested max-w-6xl/px-4 column
 *  keeps `children` aligned with the rest of the page.
 *
 *  The `border-x` only wraps `children`, not the photo band above it — it
 *  used to run the full height, which put a 1px slate-200 hairline down
 *  both edges of the photo itself. Structurally that's the frame doing
 *  exactly what its own doc says (one continuous piece), but against a
 *  photo a 1px line at the true edge reads as the photo falling a pixel
 *  short of "full-bleed," not as a border — confirmed against a live
 *  deployment. The photo now runs completely clean to both edges; the
 *  frame still continues around the header/filters/listing content below
 *  it, just starting after the photo instead of through it.
 *
 *  `-mt-12` cancels SlugScreen's `<main>` `pt-8` (32px) plus the 16px of
 *  margin the TurnstileWidget placeholder (`my-2`, rendered ahead of every
 *  directory screen whether or not the widget itself is visible) adds above
 *  it — 48px total — so the frame starts flush under SiteHeader instead of
 *  floating below a gap. */
export function CategoryBandFrame({ color, imageUrl, hero, heroOverlap = false, children }: FrameProps) {
  const isMobile = useIsMobile()
  if (isMobile) return <>{children}</>

  const bandImage = imageUrl?.trim() || null

  if (hero) {
    return (
      // -mt-8, not the -mt-12 below: measured, the gap under the header on
      // a category page is <main>'s 32px alone (no Turnstile placeholder
      // above it now), so -mt-12 tucked the photo's top 16px under the
      // header.
      // desktop:-mt-8 and `hidden desktop:block` on the photo, not plain:
      // a phone's first paint, before it has been measured, draws this
      // branch too, and there it should look like the phone page (which
      // has its own short picture, GenericDirectory) rather than flash a
      // computer's photo.
      <div className="relative desktop:-mt-8 bleed-x" data-testid="category-hero">
        <div className="relative hidden desktop:block" style={{ height: heroOverlap ? HERO_PHOTO_PX : HERO_TITLE_PHOTO_PX, marginBottom: heroOverlap ? -HERO_OVERLAP_PX : undefined }}>
          <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: color }}>
            {bandImage && (
              <Image src={bandImage} alt="" fill sizes="100vw" className="object-cover object-[center_55%]" {...photoProps(bandImage)} />
            )}
          </div>
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.78)_0%,rgba(15,23,42,0.55)_45%,rgba(15,23,42,0.15)_80%)]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-11 text-white">{hero}</div>
        </div>
        {/* relative: painted after the photo, so the search riding up onto
            it sits on top. No z-index, which would make a stacking context
            and trap the listing dialog (fixed) under the site header. */}
        <div className="relative">
          <div className="mx-auto max-w-6xl px-4">{children}</div>
        </div>
      </div>
    )
  }

  return (
    // Full-bleed breakout via margins (`bleed-x`), not
    // left-1/2 + -translate-x-1/2 (what this used to do, and what
    // ResourceMapView's mobile band still does): a `translate` is a CSS
    // transform, and a transform on an ancestor creates a new containing
    // block for any `position: fixed` descendant instead of the viewport.
    // `children` here is the whole category screen, listing grid included,
    // and the computer's listing dialog then (ListingDetailModal, gone
    // since Nov 19; any `fixed` overlay drawn in place now) was
    // `fixed inset-0` — so with the transform in place that dialog was
    // positioned relative to THIS div's own box, which moves as the page
    // scrolls, instead of staying centered in the viewport. Confirmed live:
    // the dialog's on-screen position tracked scroll offset exactly.
    // Margins achieve the identical full-bleed layout without ever setting
    // a transform, so nothing downstream loses the viewport as its
    // containing block.
    <div className="relative -mt-12 bleed-x border-t border-slate-200">
      <div
        // 132px, down from 224: short enough that the list and the map
        // beside it start above the fold on a 1440x900 screen.
        className="relative h-[132px] overflow-hidden"
        style={!bandImage ? { backgroundColor: categoryTint(color) } : undefined}
      >
        {bandImage && (
          <Image src={bandImage} alt="" fill sizes="100vw" className="object-cover" {...photoProps(bandImage)} />
        )}
      </div>
      <div className="border-x border-slate-200">
        <div className="mx-auto max-w-6xl px-4">{children}</div>
      </div>
    </div>
  )
}
