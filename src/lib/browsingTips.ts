import { conceptCategories, type Concept } from './ask'
import type { CategoryConfig } from './categories'
import type { DirectoryResource } from '@/types'

// ── "Tip: you can just ask" ──────────────────────────────────────────────────
// Someone browsing Food → one listing at a time may never learn the home
// search answers questions. So a category page shows one quiet line under its
// own search box: "Tip: you can just ask. Try “Where can I get challah?”",
// which opens that question answered (see shareAnswer.ts). The example is
// built from the category's own listings and only offered if it answers well,
// the same test the questions under the home search box pass.
//
// Shown on at most MAX_SEEN category visits, and never again once the
// visitor taps it, dismisses it, or asks the home search anything: by then
// they know, and a tip that keeps coming back is noise.

/** Questions worth offering on this category's page, best first. `all` is
 *  every category, for knowing what kind of place this one is. */
export function tipCandidates(
  category: CategoryConfig,
  items: readonly DirectoryResource[],
  all: readonly CategoryConfig[] = [category],
): string[] {
  const out: string[] = []
  // A shul page: the question people actually have. Offered whenever the
  // shuls have times: the answer is the next one, today or tomorrow.
  const minyanKeys = category.detailFields.filter((f) => f.type === 'minyanim').map((f) => f.key)
  if (items.some((i) => minyanKeys.some((k) => Array.isArray(i[k]) && (i[k] as unknown[]).length > 0))) out.push('Next minyan')
  const item = commonItem(category, items)
  if (item) out.push(`Where can I get ${item.toLowerCase()}?`)
  // "Open now" only where it's a question people ask: somewhere to eat or
  // shop, a mikvah. Not a school or a hospital.
  const walkIn = OPEN_NOW_KINDS.some((k) => conceptCategories(k, all).includes(category.id))
  if (walkIn && category.detailFields.some((f) => f.type === 'hours')) {
    const plural = category.pluralLabel.toLowerCase()
    const one = category.label.toLowerCase()
    out.push(`${cap(plural)} open now`, `${cap(one)} open now`, `${cap(plural)} open today`, `${cap(one)} open today`)
  }
  return [...new Set(out)]
}

const OPEN_NOW_KINDS: Concept[] = ['food', 'grocery', 'mikvah']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The item most of this category's places carry ("Challah"), when at least
 *  two do: a question about it has more than one answer to show. Short
 *  names only — "Prepared Shabbos food from the deli counter" isn't how
 *  anyone would ask. */
function commonItem(category: CategoryConfig, items: readonly DirectoryResource[]): string | null {
  const keys = category.detailFields.filter((f) => f.type === 'tags').map((f) => f.key)
  if (keys.length === 0) return null
  const counts = new Map<string, { label: string; n: number }>()
  for (const item of items) {
    const seen = new Set<string>()
    for (const k of keys) {
      const v = item[k]
      if (!Array.isArray(v)) continue
      for (const tag of v) {
        if (typeof tag !== 'string') continue
        const label = tag.trim()
        const key = label.toLowerCase()
        if (!label || seen.has(key) || label.split(/\s+/).length > 3) continue
        seen.add(key)
        const c = counts.get(key)
        if (c) c.n++
        else counts.set(key, { label, n: 1 })
      }
    }
  }
  const best = [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))[0]
  return best?.label ?? null
}

// ── How often it's been shown ────────────────────────────────────────────────

export const MAX_SEEN = 2
const STORAGE_KEY = 'jpc:ask-tip'

export type TipState = { seen: number; done: boolean }

export function parseTipState(raw: string | null): TipState {
  try {
    const v = raw ? JSON.parse(raw) : null
    if (v && typeof v.seen === 'number' && typeof v.done === 'boolean') return { seen: v.seen, done: v.done }
  } catch {
    // A garbled value is the same as none.
  }
  return { seen: 0, done: false }
}

export function shouldShowTip(state: TipState): boolean {
  return !state.done && state.seen < MAX_SEEN
}

// Storage can be missing or throw (private mode, blocked site data); the tip
// then simply doesn't show, rather than showing forever.
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Whether this visitor might still see the tip, without counting a visit.
 *  False on the server, where there's no storage to ask. */
export function tipStillOffered(): boolean {
  const s = storage()
  if (!s) return false
  try {
    return shouldShowTip(parseTipState(s.getItem(STORAGE_KEY)))
  } catch {
    return false
  }
}

/** Whether to show the tip on this visit; counts the visit when it does. */
export function takeTipVisit(): boolean {
  const s = storage()
  if (!s) return false
  try {
    const state = parseTipState(s.getItem(STORAGE_KEY))
    if (!shouldShowTip(state)) return false
    s.setItem(STORAGE_KEY, JSON.stringify({ ...state, seen: state.seen + 1 }))
    return true
  } catch {
    return false
  }
}

/** The visitor has it: they tapped the tip, dismissed it, or asked the home
 *  search something themselves. */
export function markTipDone(): void {
  const s = storage()
  if (!s) return
  try {
    const state = parseTipState(s.getItem(STORAGE_KEY))
    if (!state.done) s.setItem(STORAGE_KEY, JSON.stringify({ ...state, done: true }))
  } catch {
    // Nothing to do: it'll show once or twice more at most.
  }
}
