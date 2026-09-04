'use client'

import { useIsMobile } from '@/lib/useIsMobile'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'

type Props = {
  settings: Pick<SiteSettings, 'name' | 'heroTitle' | 'mission'>
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
//
// Desktop gets a warm two-column band (name/mission/search beside a photo
// panel) instead of mobile's plain centered block — mobile has to stay
// practical in a narrow, scroll-cost-sensitive space, so it leads with
// `heroTitle` (the practical "what are you looking for" prompt) the same
// way it always has; the site's actual name is already one small line in
// the sticky header above it, and repeating it large would just spend
// mobile's scarcer vertical space restating something already on screen.
// Desktop can afford both: it leads with `settings.name` — nowhere else on
// the page says who this is at any size — with `heroTitle` demoted to a
// small label heading its own search section below, rather than doubling
// as the page's main heading the way it does on mobile.
//
// Expressed as two parallel layouts behind `desktop:`/`hidden` classes
// rather than an isMobile branch: isMobile starts false on every render
// (SSR-safe), so branching here would flash the desktop layout on a phone
// for one frame — the same reasoning as Landing's own inlineGridClass.
//
// The photo panel is a CSS pattern, not a real photo — swapping in actual
// community photography here is still the single biggest warmth lever this
// app hasn't spent (flagged back when this app's desktop redesign first
// started, still true).
export default function HeroHeading({ settings, query, onQueryChange, interactive = true, mapIcon, onViewMap }: Props) {
  const isMobile = useIsMobile()

  const searchBox = (
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
  )

  const viewMapButton = mapIcon != null && (
    <button
      onClick={onViewMap}
      className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
    >
      <span aria-hidden="true">{mapIcon}</span>
      View Map
    </button>
  )

  return (
    <>
      {/* Mobile — unchanged plain centered block. */}
      <section className="pt-12 sm:pt-16 text-center desktop:hidden">
        <h1 className="text-3xl sm:text-[40px] font-bold tracking-tight text-slate-900 leading-tight">
          {settings.heroTitle}
        </h1>
        <p className="mt-3 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-500">
          {settings.mission}
        </p>
        {ui.search.landing && <div className="mt-8 max-w-xl mx-auto">{searchBox}</div>}
        {viewMapButton}
      </section>

      {/* Desktop — a warm two-column band. */}
      <section className="mt-7 hidden overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-amber-100/60 desktop:grid desktop:grid-cols-[1.15fr_1fr] desktop:items-stretch">
        <div className="flex flex-col justify-center px-12 py-14">
          <h1 className="text-4xl font-semibold leading-[1.1] text-slate-900 text-balance">
            {settings.name}
          </h1>
          <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-slate-600">
            {settings.mission}
          </p>
          {ui.search.landing && (
            <div className="mt-8 max-w-[480px]">
              <h2 className="mb-2.5 text-sm font-semibold text-slate-700">{settings.heroTitle}</h2>
              {searchBox}
            </div>
          )}
          {viewMapButton}
        </div>
        {/* A CSS pattern stand-in, not a real photo — see the component doc.
            aria-hidden, not role="img": there's no real image content here
            to describe (a real photo, once one replaces this, should carry
            a genuine alt/aria-label instead) — role="img" with no name is
            exactly the axe violation ("role=img elements must have
            alternative text") that shipped here once already. */}
        <div
          aria-hidden="true"
          className="relative min-h-[280px] bg-gradient-to-br from-amber-200/60 via-amber-300/40 to-amber-700/40"
        >
          <div className="absolute inset-0 flex items-center justify-center opacity-15">
            <svg width="130" height="130" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="50,6 61,35 92,35 67,54 77,84 50,65 23,84 33,54 8,35 39,35" />
            </svg>
          </div>
        </div>
      </section>
    </>
  )
}
