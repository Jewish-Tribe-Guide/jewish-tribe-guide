'use client'

import Link from 'next/link'
import { useCategories } from '@/lib/useCategories'
import { useOptionalCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import AskTheGroup from '@/components/home/AskTheGroup'
import { categoryQuestion } from '@/lib/shareAnswer'
import type { CategoryConfig } from '@/lib/categories'
import type { ReactNode } from 'react'

// ── A category page's search: asking comes first ─────────────────────────────
// The one search box on the page, limited to this category and saying so
// ("in Food ×"). No heading and no example searches: the magnifier, "in
// Food" and the placeholder already say what it is, and the page reads
// cleaner without them (the user, Oct 10).
//
// Nothing answers under it any more (Oct 13, "search takes you to the
// page"): the list is the answer, and what the words meant is ticked in the
// list's own Filters, with the count on its button. The sentence that used
// to sit here, its "Share this answer" and the reader's "Read as" chips
// went; the address carries the search, so the browser's own share sends
// the page as it is. Only when nothing at all is found does it say so,
// with where to ask (AskTheGroup).
//
// Arranging the list (Filters, Sort) lives in the list's own heading, not
// here: above the list is for asking.

type Props = {
  category: CategoryConfig
  search: string
  onSearch: (text: string) => void
  /** "minyanim" on the Synagogues page's Minyanim tab (the user's notes 4
   *  and 6, agreed Oct 2): the box says "in Minyanim". What's typed narrows
   *  the minyanim below (MinyanimView). */
  scope?: 'minyanim'
  /** The question is being read (see GenericDirectory's reader). */
  reading?: boolean
  /** Enter. */
  onSubmit?: () => void
  /** The search found nothing here: where to ask instead. */
  foundNothing?: boolean
  /** The bookmark that saves this search (SaveButton), beside the ✕ while
   *  something is typed. */
  save?: ReactNode
}

export default function CategoryAsk({ category, search, onSearch, scope, reading = false, onSubmit, foundNothing = false, save }: Props) {
  const communitySlug = useOptionalCommunitySlug()
  const categories = useCategories() ?? [category]
  const q = search.trim()
  const onMinyanim = scope === 'minyanim'
  // Shared, the link's question names this category when it doesn't
  // already, so it opens answering the same thing (agreed Oct 1).
  const sharedQ = q ? categoryQuestion(q, category, categories) : ''
  const askGroup = foundNothing && q && communitySlug ? { nothingClose: true, sharePath: routes.ask(communitySlug, sharedQ) } : null
  const plural = category.pluralLabel.toLowerCase()
  const scopeLabel = onMinyanim ? 'Minyanim' : category.pluralLabel
  const placeholder = onMinyanim
    ? 'Ask: mincha tonight'
    : category.detailFields.some((f) => f.type === 'minyanim')
    ? `Ask about ${plural} or minyanim`
    : category.detailFields.some((f) => f.type === 'tags')
      ? 'Ask for any item or store'
      : `Ask anything about ${plural}`

  return (
    <div className="space-y-3">
      <label className="flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-primary bg-white pl-3 pr-1.5 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5 shrink-0 text-primary">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        {/* The search is this category's, and says so. Its ✕ asks the whole
            guide instead, with whatever has been typed. */}
        <span className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary/10 pl-2.5 pr-1 text-[13px] font-semibold text-primary">
          in {scopeLabel}
          <Link
            href={q && communitySlug ? routes.ask(communitySlug, q) : routes.home(communitySlug ?? '')}
            aria-label={`Search everything, not just ${category.pluralLabel}`}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-primary/15"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Link>
        </span>
        <input
          type="search"
          aria-label={`Search ${scopeLabel}`}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit?.()
          }}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15.5px] text-ink placeholder:text-slate-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {search && save && (
          <>
            {save}
            <span aria-hidden="true" className="h-5 w-px shrink-0 bg-slate-200" />
          </>
        )}
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            aria-label="Clear search"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 active:text-slate-800"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </label>

      {q && reading && (
        <p className="text-[13.5px] font-medium text-slate-500" role="status">
          Reading your question…
        </p>
      )}
      {askGroup && <AskTheGroup query={q} {...askGroup} />}
    </div>
  )
}
