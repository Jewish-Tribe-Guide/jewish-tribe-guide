'use client'

import Link from 'next/link'
import { useIsMobile } from '@/lib/useIsMobile'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'

type Props = {
  settings: Pick<SiteSettings, 'heroTitle' | 'mission' | 'contributionNote'>
  /** How many listings the directory currently holds — shown in the
   *  contribution line as evidence that the "community-maintained" claim is
   *  real. Null while listings are still loading, which drops the count and
   *  keeps the rest of the sentence rather than flashing "0 listings". */
  listingCount?: number | null
  query: string
  onQueryChange: (query: string) => void
  /** Admin-preview only: renders the search box inert (nothing to filter in a
   *  preview) instead of driving Landing's card grid. */
  interactive?: boolean
  /** The Map pseudo-category's icon — shows the "View Map" button below the
   *  search box when set. Null/undefined (no Map category configured) hides
   *  it entirely, same as the old card did. */
  mapIcon?: string | null
  /** Preview mode has nothing to navigate to, so it's left undefined there —
   *  the button still renders (for visual fidelity) but doesn't do anything. */
  onViewMap?: () => void
}

// The home screen's heading, mission, filter box, and "View Map" button — its
// own component so the admin Site preview can render the exact same markup
// the live home screen does, fed by a draft instead of the saved settings.
export default function HeroHeading({ settings, query, onQueryChange, interactive = true, mapIcon, onViewMap, listingCount }: Props) {
  const isMobile = useIsMobile()
  const note = settings.contributionNote?.trim()

  return (
    <section className="pt-12 sm:pt-16 text-center">
      <h1 className="text-3xl sm:text-[40px] font-bold tracking-tight text-slate-900 leading-tight">
        {settings.heroTitle}
      </h1>
      <p className="mt-3 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-500">
        {settings.mission}
      </p>
      {ui.search.landing && (
        <div className="mt-8 max-w-xl mx-auto">
          <div className="flex items-center rounded-full border border-slate-200 bg-white pl-5 pr-2 py-2 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)]">
            <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => interactive && onQueryChange(e.target.value)}
              readOnly={!interactive}
              placeholder={isMobile ? 'Filter — food, rides, housing…' : 'Filter — kosher food, rides, housing, synagogues…'}
              aria-label="Filter resources"
              className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {query && interactive && (
              <button
                onClick={() => onQueryChange('')}
                aria-label="Clear filter"
                className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
      {/* The "this is yours to correct" line. Every listing already carries
          Add / Edit / Report, but only once it's been expanded, in the
          quietest text on the card — so without this a visitor can use the
          whole site and never find out. Placed directly under the search box
          because that's the one element every visitor looks at, and because
          the message has to land before someone drills into a category, not
          after. Quiet by design: it's an invitation, not a call to action
          competing with the search box above it. */}
      {note && (
        <p className="mt-4 text-[13px] text-slate-500">
          {listingCount != null && listingCount > 0 && (
            <span className="font-medium text-slate-600">{listingCount.toLocaleString()} listings</span>
          )}
          {listingCount != null && listingCount > 0 && ' · '}
          {note}{' '}
          {/* A real <Link>, not a button: /about is a top-level page outside
              the community segment, and this is the route by which anyone
              actually reaches it now that the footer explaining all of this
              is no longer the only signpost. */}
          <Link href="/about" className="whitespace-nowrap font-medium text-primary underline underline-offset-2 hover:no-underline">
            How this works →
          </Link>
        </p>
      )}

      {mapIcon != null && (
        <button
          onClick={onViewMap}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
        >
          <span aria-hidden="true">{mapIcon}</span>
          View Map
        </button>
      )}
    </section>
  )
}
