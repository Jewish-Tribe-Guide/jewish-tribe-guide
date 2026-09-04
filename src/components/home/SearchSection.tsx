'use client'

import type { ReactNode } from 'react'
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
//
// `results` renders inside this same white box, below the search box, once
// there's a query — typing and having the answer show up somewhere else on
// the page read as disconnected (see Landing.tsx's own doc on why this is a
// real placement move, not a style tweak). It's a plain slot rather than
// this component owning the query/filtering logic itself: Landing already
// computes the same result set mobile's own always-visible grid uses, and
// passing it in means that work — and the CardGrid instances it renders —
// isn't duplicated for a second, desktop-only copy. `isMobile` at the call
// site is what keeps this prop unset (and therefore unmounted) on a phone,
// where the grid already has its own permanent home further down the page.
export default function SearchSection({
  heroTitle,
  query,
  onQueryChange,
  interactive = true,
  mapIcon,
  onViewMap,
  results,
  bare = false,
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
  /** The matching cards/places for the current query — omitted (not just
   *  empty) when there's nothing to show, so this renders no extra space
   *  ahead of the first keystroke. */
  results?: ReactNode
  /** Skip this section's own outer `<section>`/card shell and render just the
   *  heading + box + button + results — for a caller (Landing, merging this
   *  with "Browse everything" into one card) that owns the shared shell and
   *  wants this mounted as a stable sibling inside it, not swapped in and out
   *  as a whole tree (which would remount the input and drop focus mid-type). */
  bare?: boolean
}) {
  if (!ui.search.landing) return null

  const content = (
    <>
      {/* Centered, not left-aligned like Browse everything/the map below —
          those are grids that fill the card's full width on their own;
          this card's only real content is one ~480px input, so left-aligning
          it left most of a full-width card sitting empty to the right.
          Centering the heading and button along with it keeps the whole
          card reading as one composed unit instead of a wide box with a
          small thing floating in its corner. */}
      <h2 className="mb-4 text-center text-lg font-semibold text-slate-900">{heroTitle}</h2>
      <div className="mx-auto max-w-[480px]">
        <SearchBox query={query} onQueryChange={onQueryChange} interactive={interactive} isMobile={false} />
      </div>
      {mapIcon != null && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={onViewMap}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <span aria-hidden="true">{mapIcon}</span>
            View Map
          </button>
        </div>
      )}
      {results && <div className="mt-6 border-t border-slate-100 pt-6">{results}</div>}
    </>
  )

  if (bare) return content

  return (
    <section className="mt-8 hidden desktop:block">
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-900/5">{content}</div>
    </section>
  )
}
