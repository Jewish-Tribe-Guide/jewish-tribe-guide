// The category page's address: what it carries (a search, the Filters, a
// step), read and written by GenericDirectory and its hooks.

import type { CategoryConfig } from '@/lib/categories'
import { itemName } from '@/lib/itemNames'
import { sameItem } from '@/lib/itemFilter'

/** How a change to the address is recorded. `replace`: in place, no step.
 *  `router`, with it: Next's router is told too (replaceAddress), so a link
 *  back to the address it had is a change the page sees; for a one-off
 *  (closing a form), never for the searches and Filters, which re-render
 *  the page when the router is told.
 *  `step`: a step the browser's Back undoes, named in history.state so the
 *  page's own way back can take that same step (the Minyanim view, Oct 6).
 *  Neither: a navigation of its own. */
export type ParamsOpts = { replace?: boolean; router?: boolean; step?: string }

/** A question the Filters were read from (`read=1`), and what it turned on
 *  there: taken off again when the question is edited or cleared. */
export type Landed = { search: string; openNow: boolean; bool: string[]; select: Record<string, string[]>; has: Record<string, string[]> }

/** The Filters an address carries: `f_<key>=1`, `sel_<key>=a,b`,
 *  `has_<key>=Challah,Wine`. */
export function addressFilters(category: CategoryConfig, params: Record<string, string>) {
  const bools: Record<string, boolean> = {}
  const sels: Record<string, string[]> = {}
  const has: Record<string, string[]> = {}
  for (const f of category.detailFields) {
    if (f.type === 'tags') {
      const raw = params[`has_${f.key}`]
      if (raw) has[f.key] = raw.split(',').map((v) => itemName(v)).filter(Boolean)
    }
    if (f.filterable && f.type === 'boolean' && params[`f_${f.key}`] === '1') bools[f.key] = true
    if (f.filterable && f.type === 'select') {
      const raw = params[`sel_${f.key}`]
      if (raw) sels[f.key] = raw.split(',').filter(Boolean)
    }
  }
  return { bools, sels, has }
}

/** Whether an address carries a search or Filters for this page. */
export function carriesSearch(category: CategoryConfig, params: Record<string, string>) {
  const { bools, sels, has } = addressFilters(category, params)
  return !!params.q?.trim() || params.openNow === '1' || [bools, sels, has].some((x) => Object.keys(x).length > 0)
}

/** `chosen` with `gone` taken out of it, key by key. */
export function withoutChosen(chosen: Record<string, string[]>, gone: Record<string, string[]>): Record<string, string[]> {
  if (Object.keys(gone).length === 0) return chosen
  const out = { ...chosen }
  for (const [key, values] of Object.entries(gone)) out[key] = (out[key] ?? []).filter((v) => !values.some((g) => sameItem(g, v)))
  return out
}

export const MINYANIM_STEP = 'minyanim'
export const LISTING_STEP = 'listing'
