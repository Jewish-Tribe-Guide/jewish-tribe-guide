'use client'

import { useIsMobile } from '@/lib/useIsMobile'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'

type Props = {
  settings: Pick<SiteSettings, 'heroTitle' | 'mission'>
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
export default function HeroHeading({ settings, query, onQueryChange, interactive = true, mapIcon, onViewMap }: Props) {
  const isMobile = useIsMobile()

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
              // "Search", not "Filter": on desktop the grid isn't on screen
              // when this is empty, so there is nothing visible to be
              // filtering — typing reveals results. "Filter" describes the
              // implementation; "Search" describes what the visitor is doing.
              //
              // The examples name categories this community actually has.
              // They used to read "rides, housing", which the guide no longer
              // offers — a placeholder promising things that aren't there is
              // worse than a generic one. "shuls" is deliberate: it isn't a
              // category label, it's one of the hidden keywords that resolves
              // to Synagogues, so the example doubles as a hint that everyday
              // words work.
              placeholder={isMobile ? 'Search — food, mikvah, shuls…' : 'Search — kosher food, mikvah, shuls, schools…'}
              aria-label="Search resources"
              className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {query && interactive && (
              <button
                onClick={() => onQueryChange('')}
                aria-label="Clear search"
                className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
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
