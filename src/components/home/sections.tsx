'use client'

import type { CategoryConfig } from '@/lib/categories'
import type { NavigateFn } from '@/types'

export type CardDef = {
  icon: string
  title: string
  description: string
  go: () => void
}

// Soft tile tints, cycled per card within each section.
export const TINTS = ['bg-sky-50', 'bg-amber-50', 'bg-rose-50', 'bg-emerald-50', 'bg-indigo-50']

export function Card({ card, tint }: { card: CardDef; tint: string }) {
  return (
    <button onClick={card.go} className="group w-full text-left cursor-pointer">
      <div
        className={`aspect-[4/3] rounded-2xl ${tint} ring-1 ring-slate-900/5 flex items-center justify-center transition-all duration-200 group-hover:shadow-lg group-hover:shadow-slate-900/10 group-hover:-translate-y-0.5`}
      >
        <span className="text-[44px]" aria-hidden="true">{card.icon}</span>
      </div>
      <p className="mt-3 text-[15px] font-semibold leading-snug text-slate-900 group-hover:text-primary transition-colors">
        {card.title}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-slate-500">{card.description}</p>
    </button>
  )
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[4/3] rounded-2xl bg-slate-100" />
      <div className="mt-3 h-4 w-3/4 rounded bg-slate-100" />
      <div className="mt-2 h-3 w-full rounded bg-slate-100" />
    </div>
  )
}

/** The single-screen card grid. Renders every card, then `loadingCount`
 *  skeletons (for sections still loading, e.g. resource categories). Tints
 *  cycle across the whole grid so colors stay varied. */
export function CardGrid({
  cards,
  loadingCount = 0,
}: {
  cards: CardDef[]
  loadingCount?: number
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7">
      {cards.map((card, i) => (
        <Card key={card.title} card={card} tint={TINTS[i % TINTS.length]} />
      ))}
      {Array.from({ length: loadingCount }, (_, i) => (
        <CardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  )
}

// ── Card definitions ──────────────────────────────────────────────────────────

/** Resource cards: every live category (restaurants, groceries, hotels, …)
 *  plus the hand-curated pages. Returns null while categories are loading
 *  (show skeletons). */
export function resourceCards(
  nav: NavigateFn,
  categories: CategoryConfig[] | null,
  { includeHospital }: { includeHospital: boolean },
): CardDef[] | null {
  if (categories === null) return null

  return [
    ...(includeHospital
      ? [
          {
            icon: '🏥',
            title: 'About Your Hospital',
            description: 'Chaplains, kosher food, prayer space, and Shabbat info.',
            go: () => nav('patient', 'find', { findView: 'about-hospital' }),
          },
        ]
      : []),
    ...categories.map((c) => ({
      icon: c.icon,
      title: c.pluralLabel,
      description: c.description,
      go: () => nav('patient', 'find', { findView: c.id }),
    })),
    {
      icon: '🕯️',
      title: 'Zmanim & Shabbos',
      description: 'Hebrew date, candle lighting, and havdalah times.',
      go: () => nav('patient', 'find', { findView: 'zmanim' }),
    },
    {
      icon: '🗺️',
      title: 'Eruv Information',
      description: 'Eruv status, maps, and contacts for Shabbat.',
      go: () => nav('patient', 'find', { findView: 'eruv' }),
    },
  ]
}
