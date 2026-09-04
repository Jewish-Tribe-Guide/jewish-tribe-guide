'use client'

import { Card, CardSkeleton, TINTS, type CardDef } from './sections'
import { FEATURED_CARD_COUNT } from '@/lib/siteSettings'

// ── The three featured cards, between the search box and the map ──────────────
// Desktop only. Deliberately three-across at every desktop width so these
// read as a distinct, curated row rather than a truncated grid — and so they
// stay side by side instead of wrapping, which is the whole point of a
// "three ways in" row.
//
// Reuses the grid's own Card, so a featured tile and the same category's row
// in "Browse everything" (directly above this, on every render — see
// Landing.tsx) are visually related. No "Browse all categories" link any
// more: that used to open the standalone All Categories page, which is gone
// — Browse everything already shows every category, right above wherever
// this section renders, so a second link to the same thing had nothing left
// to point at.

export default function FeaturedCards({
  title,
  cards,
  loading,
}: {
  /** The section heading — admin-editable (default "Popular right now"), see
   *  DesktopTopicsManager. */
  title: string
  cards: CardDef[]
  /** Categories still loading — hold the row's space with skeletons so the
   *  map below doesn't jump up and then back down. */
  loading?: boolean
}) {
  if (!loading && cards.length === 0) return null

  return (
    <section className="mt-14">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="grid grid-cols-3 gap-5">
        {loading
          ? Array.from({ length: FEATURED_CARD_COUNT }, (_, i) => <CardSkeleton key={i} />)
          : cards.map((card, i) => (
              <Card
                key={card.id ?? card.title}
                card={card}
                tint={TINTS[i % TINTS.length]}
                // These three are the largest thing above the fold on desktop,
                // so one of them is almost always the largest contentful paint.
                // Lazy-loading them would defer the exact image the page's
                // loading speed is measured by.
                priority
              />
            ))}
      </div>
    </section>
  )
}
