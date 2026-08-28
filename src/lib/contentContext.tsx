'use client'

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'
import type { CommunityContent, ContentKey } from './loadCommunityContent'
import { draftSectionsAsHomeSections, readPreviewDraft, type PreviewDraft } from './previewDraft'
import { withIconOverrides } from './categoryFallback'
import type { CategoryConfig } from './categories'

// ─────────────────────────────────────────────────────────────────────────────
// Server-loaded community content, handed to the client tree.
//
// The five content hooks (useCategories, useSiteSettings, useHomeSections,
// useForms, useHospitals) used to each fetch their own endpoint after
// hydration. They read from here instead — the data arrives with the HTML, so
// there is no request, no loading state, and no skeleton on first paint.
//
// Deliberately a context rather than props: those hooks are called from about
// twenty components, several of them deep inside the map and the directory.
// Threading five values through all of them would have been a much larger and
// riskier change than swapping out where the hooks read from, and would have
// left every one of those components needing its own props for data it only
// ever displays.
// ─────────────────────────────────────────────────────────────────────────────

const ContentContext = createContext<CommunityContent | null>(null)

export function ContentProvider({
  content,
  children,
}: {
  content: CommunityContent
  children: React.ReactNode
}) {
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>
}

function useContent(): CommunityContent {
  const ctx = useContext(ContentContext)
  if (!ctx) throw new Error('Content hooks must be used inside a ContentProvider')
  return ctx
}

/** True when this content failed to load and what's showing is a fallback.
 *  Lets a screen say "we couldn't load this" instead of rendering an empty
 *  state that reads as "there are none". */
export function useContentFailed(key: ContentKey): boolean {
  return useContent().failed.includes(key)
}

/** Every content read that failed, for the site-wide notice. */
export function useContentFailures(): ContentKey[] {
  return useContent().failed
}

export function useCategories() {
  // Memoized on the source array's reference (stable for the client tree's
  // whole lifetime — see ContentProvider), not recomputed fresh on every call.
  // withIconOverrides used to build a new array/objects every render, which
  // broke referential equality for anything downstream that depended on it
  // (e.g. the map's filterChips/raise-sheet effect, which re-fired on every
  // unrelated render instead of only on a real category/filter change).
  const categories = useContent().categories
  return useMemo(() => withIconOverrides(categories), [categories])
}

// Cached after the first read so useSyncExternalStore's getSnapshot returns a
// stable reference — the draft is a one-time snapshot (written once by the
// admin before the frame opens, see previewDraft.ts), never updated again for
// the life of this tab, so there's nothing to actually re-read.
let cachedPreviewDraft: PreviewDraft | null | undefined
function getPreviewDraftSnapshot(): PreviewDraft | null {
  if (cachedPreviewDraft === undefined) cachedPreviewDraft = readPreviewDraft()
  return cachedPreviewDraft
}
function getPreviewDraftServerSnapshot(): PreviewDraft | null {
  return null
}
function subscribeToPreviewDraft() {
  return () => {}
}

/** The admin preview's unsaved draft, or null.
 *
 *  Read after mount rather than during render, for two reasons: it lives in
 *  sessionStorage, which the server can't see, so reading it inline would make
 *  the first client render disagree with the server's HTML and trip a
 *  hydration mismatch. And this is the same timing the old code had — the
 *  draft used to short-circuit a fetch, which also resolved after mount. */
function usePreviewDraft() {
  return useSyncExternalStore(subscribeToPreviewDraft, getPreviewDraftSnapshot, getPreviewDraftServerSnapshot)
}

export function useSiteSettings() {
  // The admin preview frame renders the real site against unsaved edits, so a
  // draft wins over what the server loaded.
  const content = useContent()
  const draft = usePreviewDraft()
  return draft ? draft.settings : content.settings
}

export function useHomeSections() {
  const content = useContent()
  const draft = usePreviewDraft()
  return draft ? draftSectionsAsHomeSections(draft.sections) : content.homeSections
}

export function useForms() {
  return useContent().forms
}

/** One published form by id, or null when there's no such form. */
export function useForm(id: string) {
  return useForms().find((f) => f.id === id) ?? null
}

export function useHospitals() {
  return useContent().hospitals
}

/** The admin category editor's unsaved draft, spliced into the category list
 *  the wrapped subtree reads.
 *
 *  CategoryPreview renders the real screens in-process (not the iframe the
 *  home-screen preview uses, so `previewDraft` doesn't apply), and hands the
 *  draft down as a `category` prop. But colour isn't read from that prop
 *  anywhere it matters: the map pins and the listing-card avatars both call
 *  `getCategoryColor(useCategories(), id)`, which resolved to the SAVED row
 *  and so showed the old colour while the editor showed the new one. Same
 *  for anything else those components read off the shared list — icon,
 *  labels — and for the map's own category chips.
 *
 *  Replaced in place rather than appended so the positional colour fallback
 *  ("no colour chosen") lands on the same index the saved category has; a
 *  brand-new, never-saved category isn't in the list at all and goes on the
 *  end, which is where it will be once saved anyway. */
export function PreviewCategoryProvider({
  category,
  children,
}: {
  category: CategoryConfig
  children: React.ReactNode
}) {
  const content = useContent()
  // Keyed on the draft's contents, not its identity: the editor rebuilds the
  // CategoryConfig on every render, and a fresh categories array each time
  // would break the referential equality the map's effects depend on (see
  // useCategories above).
  const key = JSON.stringify(category)
  const merged = useMemo(() => {
    const draft = JSON.parse(key) as CategoryConfig
    const found = content.categories.some((c) => c.id === draft.id)
    return {
      ...content,
      categories: found
        ? content.categories.map((c) => (c.id === draft.id ? draft : c))
        : [...content.categories, draft],
    }
  }, [content, key])
  return <ContentContext.Provider value={merged}>{children}</ContentContext.Provider>
}
