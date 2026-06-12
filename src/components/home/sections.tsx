'use client'

import type { CategoryConfig } from '@/lib/categories'
import type { NavigateFn } from '@/types'

export type CardDef = {
  title: string
  go: () => void
  /** Hidden search terms — the words people type that should surface this card
   *  (e.g. "shul" for Synagogues, "supermarket" for Grocery Stores). */
  keywords?: string[]
  /** Renders as the dashed "suggest a category" affordance instead of a tile. */
  dashed?: boolean
}

// Soft tile tints, cycled per card across the grid.
export const TINTS = ['bg-sky-50', 'bg-amber-50', 'bg-rose-50', 'bg-emerald-50', 'bg-indigo-50']

export function Card({ card, tint }: { card: CardDef; tint: string }) {
  if (card.dashed) {
    return (
      <button onClick={card.go} className="group w-full cursor-pointer">
        <div className="aspect-[4/3] rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-1.5 p-4 text-center transition-all duration-200 group-hover:border-primary group-hover:bg-primary/10">
          <span className="text-2xl leading-none text-primary" aria-hidden="true">＋</span>
          <span className="text-[15px] font-semibold leading-snug text-primary">{card.title}</span>
        </div>
      </button>
    )
  }
  return (
    <button onClick={card.go} className="group w-full cursor-pointer">
      <div
        className={`aspect-[4/3] rounded-2xl ${tint} ring-1 ring-slate-900/5 flex items-center justify-center p-4 text-center transition-all duration-200 group-hover:shadow-lg group-hover:shadow-slate-900/10 group-hover:-translate-y-0.5`}
      >
        <span className="text-[17px] font-semibold leading-snug text-slate-900 group-hover:text-primary transition-colors">
          {card.title}
        </span>
      </div>
    </button>
  )
}

export function CardSkeleton() {
  return <div className="aspect-[4/3] rounded-2xl bg-slate-100 animate-pulse" />
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-5">
      {cards.map((card, i) => (
        <Card key={card.title} card={card} tint={TINTS[i % TINTS.length]} />
      ))}
      {Array.from({ length: loadingCount }, (_, i) => (
        <CardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  )
}

/** Does a card match the typed query? Every word must appear in the title or a
 *  hidden keyword (AND across words). */
export function cardMatches(card: CardDef, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const hay = [card.title, ...(card.keywords ?? [])].join(' ').toLowerCase()
  return tokens.every((t) => hay.includes(t))
}

// ── Card definitions ──────────────────────────────────────────────────────────

// Hidden synonyms for the well-known categories — the words people type that
// won't appear in a category's label or description. Keyed by category id.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  synagogue: ['shul', 'shuls', 'minyan', 'minyanim', 'davening', 'shtiebel', 'beis medrash'],
  mikvah: ['mikveh', 'mikvaos', 'immersion'],
  grocery: ['groceries', 'supermarket', 'market', 'food shopping'],
  restaurant: ['restaurants', 'dining', 'eat out', 'takeout'],
  hotel: ['hotels', 'motel', 'lodging', 'place to stay'],
  whatsapp: ['whatsapp', 'group chat', 'community group', 'chat'],
}

// Words pulled from a category's own label + description, so newly added
// categories are searchable without touching this file.
function labelWords(c: CategoryConfig): string[] {
  return `${c.pluralLabel} ${c.description}`
    .toLowerCase()
    .split(/[^a-z'’]+/)
    .filter((w) => w.length >= 3)
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
            title: 'Hospitals',
            keywords: [
              'hospital', 'hospitals', 'about your hospital', 'chaplain', 'rabbi', 'prayer room',
              'prayer space', 'shabbat elevator', 'shabbos elevator', 'kosher cafeteria',
              'jewish doctor', 'medical staff', 'bikur cholim room', 'shabbos accommodations',
              'hup', 'penn', 'university of pennsylvania', 'jefferson', 'chop', 'childrens hospital',
              'temple', 'einstein',
            ],
            go: () => nav('patient', 'find', { findView: 'hospitals' }),
          },
        ]
      : []),
    ...categories.map((c) => ({
      title: c.pluralLabel,
      keywords: [...new Set([...labelWords(c), ...(CATEGORY_KEYWORDS[c.id] ?? []), c.id.replaceAll('-', ' ')])],
      go: () => nav('patient', 'find', { findView: c.id }),
    })),
    {
      title: 'Zmanim & Shabbos',
      keywords: [
        'zmanim', 'zman', 'candle lighting', 'candles', 'havdalah', 'shabbat times', 'shabbos',
        'shabbat', 'sunset', 'sunrise', 'shkia', 'netz', 'hebrew date', 'davening times', 'shema',
        'mincha', 'maariv', 'shacharis', 'parsha', 'molad',
      ],
      go: () => nav('patient', 'find', { findView: 'zmanim' }),
    },
    {
      title: 'Eruv Information',
      keywords: [
        'eruv', 'carry', 'carrying', 'eruv map', 'eruv status', 'eruv hotline', 'shabbat boundary',
        'techum', 'stroller on shabbos',
      ],
      go: () => nav('patient', 'find', { findView: 'eruv' }),
    },
  ]
}
