'use client'

import { Card, CardSkeleton, TINTS, type CardDef } from './sections'
import { FEATURED_CARD_COUNT } from '@/lib/siteSettings'

// ── The three featured cards, between the search box and the map ──────────────
// Desktop only. Deliberately three-across at every desktop width (the grid
// below the map on the All Categories page goes four-across) so these read as
// a distinct, curated row rather than a truncated grid — and so they stay
// side by side instead of wrapping, which is the whole point of a "three ways
// in" row.
//
// Reuses the grid's own Card so a featured tile and the same tile on the All
// Categories page are visually identical — only the size and position change.

export default function FeaturedCards({
  cards,
  loading,
  onShowAll,
}: {
  cards: CardDef[]
  /** Categories still loading — hold the row's space with skeletons so the
   *  map below doesn't jump up and then back down. */
  loading?: boolean
  /** Opens the All Categories page. */
  onShowAll: () => void
}) {
  if (!loading && cards.length === 0) return null

  return (
    <section className="mt-14">
      {/* "Browse all" sits inline with the heading (a standard section
          "see all" link) rather than centered on its own line below the
          cards, which read as an unrelated, oddly-placed extra button. */}
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Popular right now</h2>
        <button
          onClick={onShowAll}
          className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline cursor-pointer"
        >
          Browse all categories →
        </button>
      </div>
      <div className="grid grid-cols-3 gap-5">
        {loading
          ? Array.from({ length: FEATURED_CARD_COUNT }, (_, i) => <CardSkeleton key={i} />)
          : cards.map((card, i) => (
              <Card key={card.id ?? card.title} card={card} tint={TINTS[i % TINTS.length]} />
            ))}
      </div>
    </section>
  )
}
