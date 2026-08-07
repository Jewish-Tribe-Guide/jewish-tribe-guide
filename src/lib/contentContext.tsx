'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { CommunityContent, ContentKey } from './loadCommunityContent'
import { draftSectionsAsHomeSections, readPreviewDraft } from './previewDraft'
import { withIconOverrides } from './categoryFallback'

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
  return withIconOverrides(useContent().categories)
}

/** The admin preview's unsaved draft, or null.
 *
 *  Read after mount rather than during render, for two reasons: it lives in
 *  sessionStorage, which the server can't see, so reading it inline would make
 *  the first client render disagree with the server's HTML and trip a
 *  hydration mismatch. And this is the same timing the old code had — the
 *  draft used to short-circuit a fetch, which also resolved after mount. */
function usePreviewDraft() {
  const [draft, setDraft] = useState<ReturnType<typeof readPreviewDraft>>(null)
  useEffect(() => {
    setDraft(readPreviewDraft())
  }, [])
  return draft
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
