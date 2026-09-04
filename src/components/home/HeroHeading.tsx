'use client'

import { useIsMobile } from '@/lib/useIsMobile'
import { ui } from '@/lib/uiConfig'
import type { SiteSettings } from '@/lib/siteSettings'
import SearchBox from './SearchBox'

type Props = {
  settings: Pick<SiteSettings, 'name' | 'heroTitle' | 'mission'>
  query: string
  onQueryChange: (query: string) => void
  /** Admin-preview only: renders the search box inert (nothing to filter in a
   *  preview) instead of driving Landing's card grid. */
  interactive?: boolean
  /** The Map pseudo-category's icon — shows the "View Map" button below the
   *  search box when set. Null/undefined (no Map category configured) hides
   *  it entirely, same as the old card did. Mobile only now — desktop's own
   *  copy of this moved to SearchSection along with the search box it sat
   *  under. */
  mapIcon?: string | null
  /** Preview mode has nothing to navigate to, so it's left undefined there —
   *  the button still renders (for visual fidelity) but doesn't do anything. */
  onViewMap?: () => void
}

// The home screen's heading, mission, and (mobile only) the filter box and
// "View Map" button — its own component so the admin Site preview can render
// the exact same markup the live home screen does, fed by a draft instead of
// the saved settings.
//
// Desktop gets a warm two-column band (name/mission beside a photo panel)
// instead of mobile's plain centered block — mobile has to stay practical in
// a narrow, scroll-cost-sensitive space, so it leads with `heroTitle` (the
// practical "what are you looking for" prompt) the same way it always has,
// with the search box directly under it; the site's actual name is already
// one small line in the sticky header above it, and repeating it large would
// just spend mobile's scarcer vertical space restating something already on
// screen. Desktop can afford the name instead — nowhere else on that layout
// says who this is at any size — but search doesn't belong folded into that
// branding band either: it's a real third thing this app offers, on par with
// the category grid and the map below it, not an accessory bolted onto the
// hero. See SearchSection (rendered by Landing, right after this component)
// for where it lives on desktop now — same headed-card treatment as Browse
// everything, so it reads as a peer section instead of a hero accessory.
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
        {ui.search.landing && (
          <div className="mt-8 max-w-xl mx-auto">
            <SearchBox query={query} onQueryChange={onQueryChange} interactive={interactive} isMobile={isMobile} />
          </div>
        )}
        {viewMapButton}
      </section>

      {/* Desktop — a warm two-column band. Just the name/mission now — see
          the component doc for why search moved out into its own section. */}
      <section className="mt-7 hidden overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-amber-100/60 desktop:grid desktop:grid-cols-[1.15fr_1fr] desktop:items-stretch">
        <div className="flex flex-col justify-center px-12 py-14">
          <h1 className="text-4xl font-semibold leading-[1.1] text-slate-900 text-balance">
            {settings.name}
          </h1>
          <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-slate-600">
            {settings.mission}
          </p>
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
