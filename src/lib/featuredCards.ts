import type { CardDef } from '@/components/home/sections'
import type { DirectoryResource } from '@/types'
import { FEATURED_CARD_COUNT } from './siteSettings'

// ── Which three cards the desktop home screen features above the map ──────────
// Admin-picked in the Site tab (SiteSettings.featuredCardIds). The interesting
// part is the fallback, below.

/** The featured trio, in order. Ids that no longer resolve to a real card (a
 *  category that was deleted or renamed since it was picked) are skipped
 *  rather than rendered as holes, and the list is topped up from the fallback
 *  so the row is never short.
 *
 *  With nothing configured this falls back to the categories with the most
 *  listings — a real popularity signal that's already in the data and needs
 *  no tracking, no configuration, and no cold-start period. For a typical
 *  community that surfaces exactly what you'd pick by hand (food, groceries,
 *  shuls). Cards with no listings behind them (forms, curated pages like
 *  Eruv/Zmanim) sort last, since "0 listings" is no evidence of interest. */
export function pickFeaturedCards(
  allCards: CardDef[],
  listings: DirectoryResource[] | null,
  featuredCardIds: string[],
): CardDef[] {
  const byId = new Map(allCards.filter((c) => c.id).map((c) => [c.id as string, c]))

  const chosen = featuredCardIds
    .map((id) => byId.get(id))
    .filter((c): c is CardDef => !!c)

  if (chosen.length >= FEATURED_CARD_COUNT) return chosen.slice(0, FEATURED_CARD_COUNT)

  // ── Fallback: most listings first ──
  const counts = new Map<string, number>()
  for (const item of listings ?? []) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
  }
  const alreadyChosen = new Set(chosen.map((c) => c.id))
  const byPopularity = allCards
    .filter((c) => c.id && !alreadyChosen.has(c.id))
    .sort((a, b) => (counts.get(b.id!) ?? 0) - (counts.get(a.id!) ?? 0))

  return [...chosen, ...byPopularity].slice(0, FEATURED_CARD_COUNT)
}
