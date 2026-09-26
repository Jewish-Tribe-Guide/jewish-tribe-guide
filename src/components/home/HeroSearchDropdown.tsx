'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import CategoryIcon from '@/components/CategoryIcon'
import type { CardDef, ListingHit } from './sections'
import type { Answer } from '@/lib/askAnswer'
import AskAnswer from './AskAnswer'

// How many of each to show before "See all" — matches the mockup this was
// built from. Categories and listings are capped independently: a broad
// query that matches a dozen categories shouldn't crowd out the listings
// underneath, and vice versa.
const MAX_CATEGORIES = 4
const MAX_LISTINGS = 4

// ── The hero search box's live results panel ────────────────────────────────
// Desktop mockup match — replaces "type, then scroll down to see anything
// happened" with results opening right under the box.
//
// "See all" expands this SAME panel to every match, in place — it used to
// scroll to a full results section elsewhere on the page instead, which the
// user explicitly didn't want on two counts: that section (the "Browse
// everything" card) went back to always being the plain category index, not
// a second view that changes out from under a search; and even if it hadn't,
// a results panel that answers by jumping the page somewhere else defeats
// the entire reason this exists — the panel is supposed to grow and spill
// out over the hero photo/content below it (the hero section itself is only
// overflow-x-hidden, not overflow-hidden, specifically so this can), not
// send the visitor's eye somewhere new. `expanded` is local, not lifted: it
// only ever needs to reset when HeroHeading unmounts this whole panel
// (closing it), which happens for free on remount.
export default function HeroSearchDropdown({
  query,
  cards,
  placeHits,
  categories,
  onCardClick,
  onOpenPlace,
  answer = null,
  onOpenShul,
}: {
  /** The trimmed, non-empty query this panel is showing results for. */
  query: string
  /** Matching categories — Landing's own `filtered`. */
  cards: CardDef[]
  placeHits: ListingHit[]
  categories: CategoryConfig[] | null
  onCardClick: (card: CardDef) => void
  onOpenPlace: (hit: ListingHit) => void
  /** The answer to the query, above everything else (see askAnswer.ts). */
  answer?: Answer | null
  onOpenShul?: (shulId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const totalCount = cards.length + placeHits.length
  const hasMore = cards.length > MAX_CATEGORIES || placeHits.length > MAX_LISTINGS
  const visibleCards = expanded ? cards : cards.slice(0, MAX_CATEGORIES)
  const visiblePlaces = expanded ? placeHits : placeHits.slice(0, MAX_LISTINGS)

  const panelClassName =
    'absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_10px_rgba(15,23,42,0.06),0_20px_40px_rgba(15,23,42,0.12)]'

  const answerNode = answer && <AskAnswer answer={answer} onOpenShul={onOpenShul} className="mx-2 mt-2" />

  if (totalCount === 0) {
    return (
      <div className={panelClassName}>
        {answerNode ? (
          <div className="pb-2">{answerNode}</div>
        ) : (
          <p className="px-4 py-4 text-center text-sm text-slate-500">
            Nothing matches &ldquo;{query}&rdquo;. Try a different word.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={panelClassName}>
      {answerNode}
      <div className="py-1.5">
        {visibleCards.length > 0 && (
          <div>
            <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Categories</p>
            {visibleCards.map((card) => (
              <Link
                key={card.id ?? card.title}
                href={card.href}
                onClick={() => onCardClick(card)}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-slate-50"
              >
                {card.icon && (
                  <CategoryIcon
                    icon={card.icon}
                    categoryId={card.id}
                    color={getCategoryColor(categories, card.id ?? '')}
                    className="h-8 w-8 shrink-0 text-sm"
                    sizePx={32}
                  />
                )}
                <span className="truncate text-[13.5px] font-semibold text-ink">{card.title}</span>
                {card.count && (
                  <span className="ml-auto shrink-0 text-[12.5px] text-slate-500">{card.count} →</span>
                )}
              </Link>
            ))}
          </div>
        )}

        {visibleCards.length > 0 && visiblePlaces.length > 0 && <div className="mx-4 my-1.5 h-px bg-slate-100" />}

        {visiblePlaces.length > 0 && (
          <div>
            <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Listings</p>
            {visiblePlaces.map((hit) => (
              <button
                key={hit.item.id}
                type="button"
                onClick={() => onOpenPlace(hit)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <CategoryIcon
                  icon={hit.category.icon}
                  categoryId={hit.category.id}
                  color={getCategoryColor(categories, hit.category.id)}
                  className="h-8 w-8 shrink-0 text-sm"
                  sizePx={32}
                />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{hit.item.name}</p>
                  {/* Why it's here, before where it is: a list of stores for
                      "wine" used to say nothing about wine until one was
                      opened. The item it matched, marked when it's only
                      sometimes in stock, and for "open now" which of its
                      hours are open, or that it has none listed. */}
                  <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-slate-500">
                    {hit.hours && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 font-semibold ${hit.hours.known ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {hit.hours.text}
                      </span>
                    )}
                    {hit.matched.slice(0, 2).map((m) => (
                      <span
                        key={m.tag}
                        className={`shrink-0 rounded-full px-1.5 font-semibold ${m.sometimes ? 'bg-caution/10 text-caution' : 'bg-slate-100 text-slate-700'}`}
                      >
                        {m.tag}
                        {m.sometimes ? ' · sometimes' : ''}
                      </span>
                    ))}
                    <span className="truncate">
                      {hit.categoryLabel}
                      {hit.item.address ? ` · ${hit.item.address}` : ''}
                    </span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {hasMore && (
        <>
          <div className="mx-4 h-px bg-slate-100" />
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-[13px] font-semibold text-brand-teal transition-colors hover:text-brand-teal-dark"
          >
            {expanded ? (
              <span>Show fewer results</span>
            ) : (
              <span>
                See all {totalCount} result{totalCount === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
              </span>
            )}
            <span aria-hidden="true">{expanded ? '▴' : '→'}</span>
          </button>
        </>
      )}
    </div>
  )
}
