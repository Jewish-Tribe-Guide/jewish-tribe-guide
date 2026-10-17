// Saved searches (Oct 14, canvas page "you"): a visitor's searches, kept on
// this phone like saved places (pinned.ts), and listed on You with what each
// would find now. Saved from a home line while typing, or from a category
// page's box; either way a search is the address it opens, so the two meet:
// "challah" saved from home is the same search the Grocery page shows with
// "challah" in its box, and its bookmark there is filled.
//
// Pure, like pinned.ts, so the storage shape and its edge cases are testable
// without a DOM. See savedSearchesContext.tsx for the state around it.

/** What kind of page a search opens, as the home's lines name them. */
export type SavedSearchKind = 'category' | 'minyanim' | 'times'

export type SavedSearch = {
  /** The address, canonical (see searchKey): what makes two the same. */
  key: string
  /** What You shows in quotes, and asks again to say what it finds now:
   *  the words in the page's box ("challah"), or what was typed for a
   *  minyan or a time. */
  words: string
  kind: SavedSearchKind
  categoryId: string
  /** Where it goes. A category page's Filters beyond the words ride in it. */
  href: string
  /** It carries Filters the words don't say (chosen on the page, or read by
   *  the AI reader): You then counts from them, not from asking the words
   *  again. */
  filtered: boolean
}

const STORAGE_KEY = 'jpc:saved-searches'
const MAX_SAVED = 100

/** The parts of an address that make it a different search. `day` isn't
 *  one: "next mincha" opens on whichever day is next, so it's worked out
 *  again each time. */
const VOLATILE = new Set(['day'])

/** An address made comparable: parameters sorted, the words folded (case,
 *  spaces), a comma list's values sorted and folded. "/philly/grocery?q=
 *  Challah" and "/philly/grocery?q=challah" are one search. */
export function searchKey(href: string): string {
  const [path, query = ''] = href.split('?')
  const params = [...new URLSearchParams(query)]
    .filter(([k]) => !VOLATILE.has(k))
    .map(([k, v]) => {
      const folded = v.toLowerCase().replace(/\s+/g, ' ').trim()
      return [k, k === 'q' ? folded : folded.split(',').map((x) => x.trim()).sort().join(',')] as const
    })
    .filter(([, v]) => v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  const qs = new URLSearchParams(params as [string, string][]).toString()
  return qs ? `${path}?${qs}` : path
}

/** Whether an address carries Filters beyond its words. */
export function hrefFiltered(href: string): boolean {
  const params = new URLSearchParams(href.split('?')[1] ?? '')
  return [...params.keys()].some((k) => k === 'openNow' || k === 'read' || /^(f|sel|has)_/.test(k))
}

export function makeSavedSearch(s: { words: string; kind: SavedSearchKind; categoryId: string; href: string }): SavedSearch {
  return { ...s, words: s.words.trim(), key: searchKey(s.href), filtered: s.kind === 'category' && hrefFiltered(s.href) }
}

function isSavedSearch(value: unknown): value is SavedSearch {
  const v = value as SavedSearch
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.key === 'string' &&
    typeof v.words === 'string' &&
    typeof v.href === 'string' &&
    typeof v.categoryId === 'string' &&
    (v.kind === 'category' || v.kind === 'minyanim' || v.kind === 'times')
  )
}

export function parseSavedSearches(raw: string | null): SavedSearch[] {
  try {
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSavedSearch).map((s) => ({ ...s, filtered: !!s.filtered }))
  } catch {
    return []
  }
}

export function loadSavedSearches(): SavedSearch[] {
  return parseSavedSearches(localStorage.getItem(STORAGE_KEY))
}

export function storeSavedSearches(searches: SavedSearch[]): void {
  try {
    if (searches.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(searches))
  } catch {
    // Best-effort, as everywhere this app touches localStorage.
  }
}

export function isSearchSaved(searches: readonly SavedSearch[], key: string): boolean {
  return searches.some((s) => s.key === key)
}

/** Adds or removes one, never mutating. Past MAX_SAVED the oldest goes. */
export function toggleSavedSearch(searches: SavedSearch[], search: SavedSearch): SavedSearch[] {
  if (isSearchSaved(searches, search.key)) return searches.filter((s) => s.key !== search.key)
  const withRoom = searches.length >= MAX_SAVED ? searches.slice(1) : searches
  return [...withRoom, search]
}

/** Undo of a remove: back where it was, so You's order doesn't change. */
export function restoreSavedSearch(searches: SavedSearch[], search: SavedSearch, index: number): SavedSearch[] {
  if (isSearchSaved(searches, search.key)) return searches
  const at = Math.max(0, Math.min(index, searches.length))
  return [...searches.slice(0, at), search, ...searches.slice(at)]
}

/** The search a home line saves (its bookmark, while typing): a kind of
 *  place, Minyanim by time, or a time. A place's line saves the place
 *  instead, and the rest (the eruv, About, + Add, a card) save nothing. */
export function lineSearch(line: { kind: string; href: string | null; categoryId?: string }, typed: string): SavedSearch | null {
  if (!line.href || !line.categoryId) return null
  if (line.kind !== 'category' && line.kind !== 'minyanim' && line.kind !== 'times') return null
  const boxed = new URLSearchParams(line.href.split('?')[1] ?? '').get('q')
  return makeSavedSearch({ words: line.kind === 'category' && boxed ? boxed : typed, kind: line.kind, categoryId: line.categoryId, href: line.href })
}
