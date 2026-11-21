'use client'
// The computer's sidebar and its scroll region (split out of ResourceMapView
// Nov 21, no behaviour change). The view decides when it mounts and what it
// shows: the results list, a place, or an eruv.
import type { ReactNode, UIEvent } from 'react'

// desktop:absolute (not a flex sibling that consumes row width
// anymore): this used to sit inline in the flex row, so opening
// it shrank the map div next to it — which resizes the map's
// real container, and ResourceMap's own ResizeObserver reacts to
// any container resize by re-centering the map on its (now
// off-center) geo center to refresh the tile layer (see that
// comment). The net effect was the whole map visibly shifting
// whenever the sidebar opened or closed, not just around a
// selection — Google Maps' own results panel floats over the
// map instead for exactly this reason. Overlaying it here (with
// its own elevation) means the map's box never changes size, so
// that ResizeObserver never fires and nothing under it moves.
export function DesktopSidebar({
  sidebarVisible,
  sidebarWidth,
  isDraggingSidebar,
  children,
}: {
  sidebarVisible: boolean
  sidebarWidth: number
  isDraggingSidebar: boolean
  children: ReactNode
}) {
  return (
    <aside
      className={`hidden flex-col overflow-hidden bg-white desktop:absolute desktop:inset-y-0 desktop:left-0 desktop:z-30 desktop:flex desktop:min-h-0 desktop:shadow-xl ${
        sidebarVisible ? 'desktop:border-r desktop:border-slate-200' : ''
      }`}
      // Width lives here, not in a `desktop:w-[...]` class, now that
      // it's draggable (see sidebarWidth/the resize handle below) —
      // `hidden`/`desktop:flex` above still fully suppress this on an
      // actual mobile viewport via CSS regardless, so nothing here
      // needs its own `desktop:` gate. Transition off entirely while
      // actively dragging: same reasoning as MobileSheet's own
      // dragHeight — a CSS transition retargeting on every single
      // pointermove frame reads as laggy/rubber-banding rather than
      // tracking the cursor.
      style={{
        width: sidebarVisible ? sidebarWidth : 0,
        transition: isDraggingSidebar ? 'none' : 'width 200ms ease-in-out',
      }}
    >
      {/* No search/chips header here anymore — the floating bar
          (rendered once, below, positioned relative to the whole
          row) sits on top of this panel instead, so it never has to
          resize or relocate when this panel appears. This spacer is
          a real layout sibling (not just padding on the scroll area
          below) so it reserves that space permanently — padding
          alone would only clear it on first paint; once scrolled,
          list rows would slide up underneath the floating bar since
          padding is part of the same scrolling content. ────────── */}
      <div className="h-[72px] shrink-0" />
      {children}
    </aside>
  )
}

// The sidebar's scroll region. One definition for the list and the place
// detail, so neither can lose the overscroll settings below. Keyed on what
// it's showing, so each starts at the top: shared, the list's scroll
// offset carried into a place picked from deep in it. The list's offset
// is kept meanwhile, and put back on the way back (Oct 16).
//
// overscroll-contain: without it, a trackpad swipe closing a
// NearbyList row's pin action can still bleed into the
// browser's own swipe-to-go-back gesture once it reaches
// this scroll boundary, even though the row's own wheel
// handler already calls preventDefault (see NearbyList).
//
// This WAS removed once, on the theory that the row-level
// handler's own `< 2` noise-floor threshold (see NearbyList's
// own comment) already closed that gap on its own — tested
// live and it didn't: without this, the row's own swipe
// itself started misbehaving (the back-gesture recognizer
// competing with it mid-drag), which is worse than losing
// back-swipe over this panel. Put back; a bare Google Maps
// embed has this same "no back-swipe over the interactive
// surface" limitation everywhere, so this screen having it
// too, specifically here, is a smaller cost than a broken
// row swipe.
//
// Sideways, none rather than contain (Oct 16): contain still let the
// list itself rubber-band sideways, and a scroll's sideways drift
// reaches it, so a row's swipe pulled "a little more of the sheet"
// than the row. Nothing here scrolls sideways, so there's nothing to
// give.
export function SidebarScroll({
  kept,
  children,
}: {
  /** The list's: where it was scrolled to is kept while a place is open. */
  kept?: { ref: (el: HTMLDivElement | null) => void; onScroll: (e: UIEvent<HTMLDivElement>) => void }
  children: ReactNode
}) {
  return (
    <div ref={kept?.ref} onScroll={kept?.onScroll} data-testid="sidebar-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain overscroll-x-none px-3 pb-3">
      {children}
    </div>
  )
}
