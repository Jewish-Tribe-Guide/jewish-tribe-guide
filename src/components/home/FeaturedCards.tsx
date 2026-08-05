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
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Popular right now</h2>
      <div className="grid grid-cols-3 gap-5">
        {loading
          ? Array.from({ length: FEATURED_CARD_COUNT }, (_, i) => <CardSkeleton key={i} />)
          : cards.map((card, i) => (
              <Card key={card.id ?? card.title} card={card} tint={TINTS[i % TINTS.length]} />
            ))}
      </div>
      <div className="mt-5 text-center">
        <button
          onClick={onShowAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
        >
          Browse all categories
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
