'use client'

import { useEffect, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import { rightNowChosen, rightNowPicks, type RightNowAnswer, type RightNowPick } from '@/lib/phoneHome'
import { MAX_BEFORE_CANDLE_ITEMS, MAX_RIGHT_NOW } from '@/lib/siteSettings'
import { withCommunity } from '@/lib/useCommunityData'
import { adminInputClass } from './AdminUI'

// ── Right now, its own screen (boards V4/V4b, the user, Nov 15) ─────────────
// The card list is names only; Right now's choices live here, behind its
// row's chevron, so the list doesn't fill up with them ("I'm worried about
// that admin cage getting cluttered"). Two things: which categories it
// answers from Saturday night to Thursday, two at most, from the ones that
// can say something about now (rightNowPicks); and what Shabbos shopping
// looks for on Friday. Board W1 (Nov 15) spells out each part of the week,
// so it's plain the picks are for the weekdays only: Friday until candles
// is the candles card and Shabbos shopping, candles to havdalah the card
// alone (shabbosMoment in todayHome.ts; Erev Yom Tov and Yom Tov the same).

const ANSWER_WORDS: Record<RightNowAnswer, string> = { open: 'Open now', minyan: 'Next minyan', eruv: 'Up or down' }

export type RightNowData = { categories: CategoryConfig[]; listings: DirectoryResource[] }

/** The public categories and places, which say what can answer. Null
 *  while loading, or when they couldn't be had. */
export function useRightNowData(community: string): RightNowData | null {
  const [data, setData] = useState<RightNowData | null>(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(withCommunity('/api/categories', community)).then((r) => r.json()),
      fetch(withCommunity('/api/resources', community)).then((r) => r.json()),
    ])
      .then(([c, r]) => {
        if (!cancelled && Array.isArray(c?.categories) && Array.isArray(r?.resources)) setData({ categories: c.categories, listings: r.resources })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [community])
  return data
}

/** The categories in the home's order, as the site reads Right now's
 *  ready-made two (Landing's orderedCategories): the order the home's
 *  sections list them, then the rest as they come. */
export function inHomeOrder(data: RightNowData, sections: readonly { cardIds: readonly string[] }[]): RightNowData {
  const order = sections.flatMap((s) => s.cardIds)
  const rank = (id: string) => (order.indexOf(id) === -1 ? order.length : order.indexOf(id))
  return { ...data, categories: [...data.categories].sort((a, b) => rank(a.id) - rank(b.id)) }
}

/** What it shows now, in order: the admin's choice, or the ready-made two. */
export function rightNowShown(data: RightNowData, chosen: readonly string[] | null): RightNowPick[] {
  return rightNowChosen(data.categories, data.listings, chosen)
}

/** "Food, Grocery": the row's summary in the card list. */
export function rightNowSummary(data: RightNowData | null, chosen: readonly string[] | null): string | undefined {
  if (!data) return undefined
  const shown = rightNowShown(data, chosen)
  return shown.length ? shown.map((p) => p.category.pluralLabel).join(', ') : 'Nothing chosen'
}

export function ScreenHeader({ title, onBack, onRemove }: { title: string; onBack: () => void; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-2">
      <button type="button" onClick={onBack} aria-label="Back to the cards" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-primary hover:bg-slate-50">
        <svg width="10" height="17" viewBox="0 0 9 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.5 1.5l-6 6 6 6" />
        </svg>
      </button>
      <h2 className="m-0 flex-1 text-[17px] font-bold text-slate-900">{title}</h2>
      {onRemove && (
        <button type="button" onClick={onRemove} className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
          Take off the page
        </button>
      )}
    </div>
  )
}

export default function RightNowScreen({
  data,
  chosen,
  onChoose,
  items,
  onItems,
  onBack,
  onRemove,
}: {
  data: RightNowData | null
  chosen: string[] | null
  onChoose: (ids: string[]) => void
  items: string[]
  onItems: (items: string[]) => void
  onBack: () => void
  /** Taking the card off the computer home; none on the phone's, which
   *  always has Right now. */
  onRemove?: () => void
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const shown = data ? rightNowShown(data, chosen).map((p) => p.category.id) : []
  const picks = data ? rightNowPicks(data.categories, data.listings) : []
  // The chosen ones first, in their order, then the rest in the admin's.
  const ordered = [...shown.flatMap((id) => picks.filter((p) => p.category.id === id)), ...picks.filter((p) => !shown.includes(p.category.id))]
  const full = shown.length >= MAX_RIGHT_NOW

  function addItem() {
    const t = adding?.trim()
    if (t && !items.some((i) => i.toLowerCase() === t.toLowerCase())) onItems([...items, t].slice(0, MAX_BEFORE_CANDLE_ITEMS))
    setAdding(null)
  }

  return (
    <section data-testid="right-now-screen" aria-label="Right Now" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <ScreenHeader title="Right Now" onBack={onBack} onRemove={onRemove} />
      <div className="px-5 pt-4 pb-2">
        <h3 className="m-0 text-[15px] font-bold text-slate-900">Saturday night to Thursday</h3>
        <p className="m-0 mb-1.5 text-[13.5px] text-muted">Two at most</p>
        {!data ? (
          <div aria-hidden="true" className="my-2 h-40 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <ul className="m-0 list-none p-0">
            {ordered.map(({ category, answer }) => {
              const on = shown.includes(category.id)
              return (
                <li key={category.id} className="border-t border-slate-100">
                  <label className={`flex min-h-11 items-center gap-3 px-1 py-2 ${!on && full ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && full}
                      onChange={() => onChoose(on ? shown.filter((id) => id !== category.id) : [...shown, category.id])}
                      className="h-5 w-5 accent-primary"
                    />
                    <span className={`text-[15.5px] text-slate-900 ${on ? 'font-bold' : 'font-medium'}`}>{category.pluralLabel}</span>
                    <span className="text-[14px] text-muted">{ANSWER_WORDS[answer]}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-slate-200 px-5 pt-4 pb-5">
        <h3 className="m-0 text-[15px] font-bold text-slate-900">Friday, until candles</h3>
        <p className="m-0 mb-1.5 text-[13.5px] text-muted">Erev Yom Tov the same</p>
        <Shows>Candle lighting, with the eruv</Shows>
        {/* The one part of Friday with something to set: a blue dot, its
            items under it (board W1). */}
        <Shows dot="bg-primary">Shabbos shopping, which looks for</Shows>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-4">
          {items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-[14.5px] font-semibold text-slate-900">
              {item}
              <button
                type="button"
                aria-label={`Take ${item} off`}
                onClick={() => onItems(items.filter((i) => i !== item))}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
              >
                ×
              </button>
            </span>
          ))}
          {adding !== null ? (
            <input
              autoFocus
              aria-label="Add an item"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addItem()
                if (e.key === 'Escape') setAdding(null)
              }}
              onBlur={addItem}
              className={`${adminInputClass} w-40`}
            />
          ) : (
            items.length < MAX_BEFORE_CANDLE_ITEMS && (
              <button type="button" onClick={() => setAdding('')} className="cursor-pointer rounded-full border border-dashed border-slate-400 px-3 py-1.5 text-[14.5px] font-semibold text-primary hover:bg-slate-50">
                + Add
              </button>
            )
          )}
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-5 pt-4 pb-5">
        <h3 className="m-0 text-[15px] font-bold text-slate-900">Candles to havdalah</h3>
        <p className="m-0 mb-1.5 text-[13.5px] text-muted">Yom Tov the same</p>
        <Shows>Candle lighting, with the eruv</Shows>
        <Shows quiet>Nothing open, nothing to buy</Shows>
      </div>
    </section>
  )
}

/** One thing the site shows then, which has nothing to set. */
function Shows({ children, quiet = false, dot = 'bg-slate-400' }: { children: React.ReactNode; quiet?: boolean; dot?: string }) {
  return (
    <p className={`m-0 flex items-center gap-2.5 py-1.5 text-[15px] ${quiet ? 'text-muted' : 'text-slate-900'}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </p>
  )
}
