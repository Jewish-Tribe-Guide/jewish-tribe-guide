'use client'

import { useIsMobile } from '@/lib/useIsMobile'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'

type Props = {
  settings: Pick<SiteSettings, 'heroTitle'>
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
  /** Rendered between the mission text and the search box — e.g. Landing's
   *  desktop-only "Get Connected" quick-links row. Desktop only (`hidden
   *  sm:block`) regardless of what's passed, so a caller doesn't need its
   *  own breakpoint gating. */
  quickLinks?: React.ReactNode
}

// The home screen's heading, mission, filter box, and "View Map" button — its
// own component so the admin Site preview can render the exact same markup
// the live home screen does, fed by a draft instead of the saved settings.
export default function HeroHeading({ settings, query, onQueryChange, interactive = true, mapIcon, onViewMap, quickLinks }: Props) {
  const isMobile = useIsMobile()

  return (
    // Full-bleed color band (the standard `w-screen` + `margin-left: calc(50% -
    // 50vw)` breakout — reaches the browser's edges regardless of `Landing`'s
    // own `max-w-6xl` column) instead of a bordered card — areas are told
    // apart by the color change itself now, not a frame around each one. No
    // top margin — touches the sage banner band directly above it in
    // Landing.tsx, matching every other band-to-band boundary on the page.
    <section className="pt-12 text-center sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#393535] sm:px-6 sm:pt-16 sm:pb-10">
      <h1 className="text-3xl sm:text-[40px] font-bold tracking-tight text-slate-900 sm:text-[#fefefe] leading-tight">
        {settings.heroTitle}
      </h1>
      {quickLinks && <div className="hidden sm:block sm:mt-6">{quickLinks}</div>}
      {ui.search.landing && (
        <div className="mt-8 max-w-xl mx-auto">
          <div className="flex items-center rounded-full border border-slate-200 bg-white pl-5 pr-2 py-2 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)] sm:border-2 sm:border-[#700F0F]">
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
      {mapIcon != null && (
        <button
          onClick={onViewMap}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer sm:border-2 sm:border-[#ffc145] sm:hover:bg-[#ffc145]/10"
        >
          <span aria-hidden="true">{mapIcon}</span>
          View Map
        </button>
      )}
    </section>
  )
}
