'use client'
// What sits over the computer's map around its sidebar (split out of
// ResourceMapView Nov 21, no behaviour change): the sidebar's resize handle
// and collapse toggle, the floating search, and the top row of chips with
// Set location and the corner's ✕ or fullscreen toggle. Mounted only on a
// computer.
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import LocationControl, { type LocationControls } from '@/components/home/LocationControl'
import { ChevronLeftIcon, CloseIcon, CollapseIcon, ExpandIcon } from '@/components/icons'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_SEARCH_INSET } from './useMapSidebar'

export default function DesktopMapChrome({
  sidebarVisible,
  sidebarWidth,
  isDraggingSidebar,
  onSidebarHandlePointerDown,
  onSidebarHandlePointerMove,
  onSidebarHandlePointerUp,
  onSidebarHandlePointerCancel,
  onSidebarHandleKeyDown,
  toggleSidebar,
  searchForm,
  categoryChips,
  fullscreen,
  setFullscreen,
  exitFullscreen,
  standalone,
  controls,
}: {
  sidebarVisible: boolean
  sidebarWidth: number
  isDraggingSidebar: boolean
  onSidebarHandlePointerDown: (e: PointerEvent<HTMLDivElement>) => void
  onSidebarHandlePointerMove: (e: PointerEvent<HTMLDivElement>) => void
  onSidebarHandlePointerUp: (e: PointerEvent<HTMLDivElement>) => void
  onSidebarHandlePointerCancel: (e: PointerEvent<HTMLDivElement>) => void
  onSidebarHandleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  toggleSidebar: () => void
  searchForm: ReactNode
  categoryChips: ReactNode
  fullscreen: boolean
  setFullscreen: (on: boolean) => void
  exitFullscreen: () => void
  standalone: boolean | undefined
  controls: LocationControls | undefined
}) {
  return (
    <>
      {/* ── Sidebar resize handle (desktop) — a thin invisible strip
              straddling the sidebar's own right edge, the same
              split-pane drag affordance most desktop apps with a
              resizable panel use (Claude's own sidebar included).
              Only rendered while the sidebar actually has a width worth
              dragging — collapsed (sidebarVisible false, 0px) there's
              nothing to grab, and the collapse toggle below already
              covers "bring it back".
              w-3 centered on the border (not flush against it, the
              collapse toggle's own reasoning above) — a 1px border is
              real but not a real target; centering a few px of
              cursor:col-resize hit-area on it is what makes the edge
              itself grabbable rather than requiring pixel-precision.
              bg-primary/0 hover:bg-primary/20: invisible at rest, a
              quiet highlight on hover/while dragging is the only
              feedback that this edge does something — no visible track
              or handle glyph, since the border itself already reads as
              the sidebar's edge. */}
      {sidebarVisible && (
        <div
          onPointerDown={onSidebarHandlePointerDown}
          onPointerMove={onSidebarHandlePointerMove}
          onPointerUp={onSidebarHandlePointerUp}
          onPointerCancel={onSidebarHandlePointerCancel}
          // Real keyboard equivalent for the drag gesture (ARIA's own
          // separator pattern calls for one), not just a courtesy —
          // dragging with a mouse is the only way to reach this
          // control otherwise. See useMapSidebar's own doc.
          onKeyDown={onSidebarHandleKeyDown}
          tabIndex={0}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={Math.round(sidebarWidth)}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          className={`absolute inset-y-0 z-40 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none desktop:block ${
            isDraggingSidebar ? 'bg-primary/20' : 'bg-primary/0 hover:bg-primary/20'
          }`}
          style={{ left: sidebarWidth }}
        />
      )}

      {/* ── Sidebar collapse toggle (desktop) — sits just outside the
              sidebar's edge, same idea as Google Maps' own panel-collapse
              arrow, so the map can take over the full width without
              losing whatever search/selection the sidebar was showing.
              Fully on the map side (not straddling the border) rather
              than centered on it — centering it on the edge meant, once
              collapsed, half the button sat past x=0 and got clipped by
              this row's own overflow-hidden (unreachable to click), and
              even expanded it sat exactly where the results list's own
              scrollbar renders, fighting with it. Its left offset still
              tracks the sidebar's own current (now draggable) width, 0
              when collapsed, so it slides along with the edge instead
              of jumping.
              Always rendered (not just once something's narrowed) — a
              freshly-loaded map with nothing searched/selected yet
              otherwise has no visible way to browse the directory at
              all beyond the map's own pins. Clicking it here pulls the
              sidebar out to show everything currently on the map (see
              sidebarOpenedManually above). ─────────────────────────── */}
      <button
        onClick={toggleSidebar}
        aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
        aria-pressed={!sidebarVisible}
        style={{ left: (sidebarVisible ? sidebarWidth : 0) + 8 }}
        className={`absolute top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md ${isDraggingSidebar ? '' : 'transition-[left] duration-200 ease-in-out'} hover:bg-slate-50 hover:text-slate-700 cursor-pointer desktop:flex`}
      >
        <ChevronLeftIcon className={`h-4 w-4 transition-transform ${sidebarVisible ? '' : 'rotate-180'}`} />
      </button>

      {/* ── Floating search (desktop) — fixed at left-3/top-3, always,
              stacked above the sidebar in z-order (z-40 vs. the
              sidebar's z-30) so it reads as sitting on top of the
              sidebar's own top edge, the same way Google Maps' own
              search box sits over its results panel. Its WIDTH now
              tracks the sidebar's own (SIDEBAR_SEARCH_INSET narrower on
              each side, so it still reads as sitting flush inside the
              sidebar rather than spanning its full white edge to edge)
              — it used to stay fixed at 336px regardless, which matched
              the sidebar exactly at its minimum width but left a
              growing, disconnected strip of the sidebar's own white
              bare to its right the moment someone dragged the sidebar
              wider, undermining the "sits on top of the sidebar" idea
              the whole floating-search approach is built on. Same
              no-transition-while-dragging reasoning as the sidebar's
              own width below, so it tracks the cursor directly instead
              of visibly lagging a step behind it. Falls back to the
              same 336px when no sidebar is mounted at all (nothing to
              track yet). ────────────────────────────────────────────── */}
      <div
        className="absolute left-3 top-3 z-40 hidden desktop:block"
        style={{
          width: sidebarVisible ? sidebarWidth - SIDEBAR_SEARCH_INSET : SIDEBAR_MIN_WIDTH - SIDEBAR_SEARCH_INSET,
          transition: isDraggingSidebar ? 'none' : 'width 200ms ease-in-out',
        }}
      >
        {searchForm}
      </div>

      {/* ── The map's top row (desktop): the category chips, then Set
              location and the corner's ✕ (or the fullscreen toggle), one
              row (the user, Oct 15: the chips ran to within 12px of the
              ✕, with Set location on a line of its own under it). The
              chips start just clear of the sidebar's own right edge (its
              width + a 16px gap), as tight as Google Maps' row sits
              after its panel, clamped with Math.max so a narrow or
              collapsed sidebar keeps the already-tuned 396px; they take
              what's left and end 16px before Set location, so the ✕
              has room. Centred on the 48px search box: the chips 8px
              down, the buttons in a 48px-tall box. The gap between them
              passes clicks through to the map. ───────────────────────── */}
      <div
        data-testid="map-top-row"
        className="pointer-events-none absolute right-3 top-3 z-20 hidden items-start gap-4 desktop:flex"
        style={{
          left: Math.max(396, (sidebarVisible ? sidebarWidth : 0) + 16),
          transition: isDraggingSidebar ? 'none' : 'left 200ms ease-in-out',
        }}
      >
        <div data-testid="map-top-chips" className="pointer-events-auto min-w-0 flex-1 pt-2">
          {categoryChips}
        </div>
        <div data-testid="map-top-corner" className="pointer-events-auto flex h-12 shrink-0 items-center gap-2">
          {/* Address entry (fullscreen only): the map is
              `desktop:fixed desktop:inset-0 desktop:z-50`, painting
              over the site header and, with it, the only other place
              to type an address. Not in the boxed state: the header is
              `sticky top-0` (SiteHeader.tsx) and stays visible above a
              boxed map, its own LocationControl already reachable. */}
          {fullscreen && controls && (
            <div data-testid="map-location-control">
              <LocationControl controls={controls} />
            </div>
          )}
          {/* Close map (the map page): a bare ✕ in the corner, where
              a full-screen view's close is expected (Oct 15, board
              "A"). It replaced a ‹ Back beside the search, which sat
              on the sidebar and read as "close this panel". Away from
              the sidebar it can only mean leave the map: back where it
              was opened from, or home (exitFullscreen). The ← in the
              search box is the step back within it. */}
          {standalone && fullscreen && (
            <button
              type="button"
              onClick={exitFullscreen}
              aria-label="Close map"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-900/10 hover:bg-slate-50"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          )}
          {/* Fullscreen toggle: a boxed map (the admin's category
              preview) expands to cover the viewport; Escape or this
              again collapses it, or, arriving from a listing's Map
              button, goes straight back to that listing
              (exitFullscreen). Not on the map page, whose way out is
              the ✕. */}
          {!standalone && (
            <button
              onClick={() => (fullscreen ? exitFullscreen() : setFullscreen(true))}
              aria-label={fullscreen ? 'Exit fullscreen' : 'View fullscreen'}
              aria-pressed={fullscreen}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-white text-slate-600 shadow-md ring-1 ring-slate-900/10 hover:bg-slate-50"
            >
              {fullscreen ? <CollapseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
