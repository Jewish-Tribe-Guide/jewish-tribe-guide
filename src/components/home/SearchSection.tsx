'use client'

import { ui } from '@/lib/uiConfig'
import SearchBox from './SearchBox'

// ── Desktop-only search section, right after the hero ─────────────────────
// Search used to live inside HeroHeading's warm band, folded in under the
// hero title — which made it read as an accessory to the branding rather
// than what it actually is: a real third thing this app offers, on par
// with the category grid ("Browse everything") and the map, not something
// bolted onto the hero for lack of anywhere else to put it. Pulling it out
// into its own headed section — same card treatment (rounded-2xl, ring-1)
// as Browse everything and the map below it — gives it that billing without
// costing extra height: it's the same input, just relocated and given a
// heading of its own instead of sharing the hero's.
//
// Desktop only: mobile's search stays exactly where it was, directly under
// heroTitle inside HeroHeading — mobile has no big name/mission competing
// for attention ahead of it (see that component's own doc), so there's no
// "buried in the hero" problem to fix there.
//
// heroTitle ("What are you looking for?" by default) is this section's own
// heading now — the same string that used to sit inside the hero band as a
// small search-box label continues to do that job, just one level up.
export default function SearchSection({
  heroTitle,
  query,
  onQueryChange,
  interactive = true,
  mapIcon,
  onViewMap,
}: {
  heroTitle: string
  query: string
  onQueryChange: (query: string) => void
  /** Admin-preview only: renders the search box inert (nothing to filter in
   *  a preview) instead of driving Landing's card grid. */
  interactive?: boolean
  /** The Map pseudo-category's icon — shows the "View Map" button below the
   *  search box when set. Null/undefined (no Map category configured) hides
   *  it entirely. */
  mapIcon?: string | null
  /** Preview mode has nothing to navigate to, so it's left undefined there —
   *  the button still renders (for visual fidelity) but doesn't do anything. */
  onViewMap?: () => void
}) {
  if (!ui.search.landing) return null

  return (
    <section className="mt-8 hidden desktop:block">
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-900/5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{heroTitle}</h2>
        <div className="max-w-[480px]">
          <SearchBox query={query} onQueryChange={onQueryChange} interactive={interactive} isMobile={false} />
        </div>
        {mapIcon != null && (
          <button
            onClick={onViewMap}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <span aria-hidden="true">{mapIcon}</span>
            View Map
          </button>
        )}
      </div>
    </section>
  )
}
