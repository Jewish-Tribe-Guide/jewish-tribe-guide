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

export function Section({
  title,
  subtitle,
  seeAllLabel,
  onSeeAll,
  children,
}: {
  title: string
  subtitle: string
  seeAllLabel: string
  onSeeAll: () => void
  children: React.ReactNode
}) {
  return (
    <section className="mt-14">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <button
          onClick={onSeeAll}
          className="shrink-0 text-sm font-medium text-primary hover:underline cursor-pointer"
        >
          {seeAllLabel} →
        </button>
      </div>
      {/* One card tall — extra cards scroll horizontally, Airbnb-row style. */}
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  )
}

/** Renders a card row with skeletons while `cards` is null (categories loading).
 *  Each card gets a fixed width so the row stays one card tall and scrolls. */
export function CardRow({ cards, tintOffset = 0 }: { cards: CardDef[] | null; tintOffset?: number }) {
  if (cards === null) {
    return Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="w-[180px] sm:w-[210px] shrink-0 snap-start">
        <CardSkeleton />
      </div>
    ))
  }
  return cards.map((card, i) => (
    <div key={card.title} className="w-[180px] sm:w-[210px] shrink-0 snap-start">
      <Card card={card} tint={TINTS[(i + tintOffset) % TINTS.length]} />
    </div>
  ))
}

// ── Card definitions, shared by the landing page and the audience pages ───────

/** The four service cards open their request form as a modal over the current
 *  page (no intermediate "pick a service" screen — these cards ARE the picker).
 *  The fifth card is the full direct-support intake form. */
export function directSupportCards(openService: (service: string) => void, nav: NavigateFn): CardDef[] {
  return [
    {
      icon: '🍽️',
      title: 'Kosher Meals',
      description: 'Home-cooked kosher meals delivered to you or your family.',
      go: () => openService('Meals'),
    },
    {
      icon: '🚗',
      title: 'Transportation',
      description: 'Rides to and from the hospital, arranged by neighbors.',
      go: () => openService('Transportation'),
    },
    {
      icon: '🏠',
      title: 'Family Housing',
      description: 'A nearby place to stay while your loved one is in care.',
      go: () => openService('Family Housing'),
    },
    {
      icon: '🤝',
      title: 'Visitors',
      description: 'A friendly face at the bedside for you or your loved one.',
      go: () => openService('Request Visitors'),
    },
    {
      icon: '✨',
      title: 'Direct Support',
      description: 'Anything else — a community representative will reach out.',
      go: () => nav('patient', 'assist'),
    },
  ]
}

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
    {
      icon: '📚',
      title: 'All Resources',
      description: 'The full directory — search it or suggest a new category.',
      go: () => nav('patient', 'find'),
    },
  ]
}

export function volunteerCards(nav: NavigateFn): CardDef[] {
  return [
    {
      icon: '🫂',
      title: 'Visit Patients',
      description: 'Bring warmth and company to someone in the hospital.',
      go: () => nav('community', 'give'),
    },
    {
      icon: '🍲',
      title: 'Cook a Meal',
      description: 'Prepare a kosher meal for a family in need.',
      go: () => nav('community', 'give'),
    },
    {
      icon: '🚙',
      title: 'Give Rides',
      description: 'Drive a patient or family member where they need to go.',
      go: () => nav('community', 'give'),
    },
    {
      icon: '🛏️',
      title: 'Host a Family',
      description: 'Offer a spare room to out-of-town family members.',
      go: () => nav('community', 'give'),
    },
    {
      icon: '❤️',
      title: 'Sign Up',
      description: 'Tell us how you’d like to help. We’ll match you up.',
      go: () => nav('community', 'give'),
    },
  ]
}
