import { useRef, useState } from 'react'

// ── The desktop results sidebar's own width/collapse/drag mechanics —
// extracted out of ResourceMapView.tsx, which stayed one of the largest
// files in the app after a 2026-08-17 refactor survey judged its CORE
// (points/filters/search/selection — a genuine, tightly-coupled pipeline for
// one screen) not worth splitting. This piece is different: it never reads
// `allPoints`/categories/filters/search at all — re-surveyed 2026-09-22,
// after the file had grown to 2335 lines.
//
// Deliberately does NOT own `sidebarVisible`/`toggleSidebar` — those need
// `desktopNarrowed` (whether a search/category/selection currently gives the
// sidebar something to show), which isn't computable until deep into
// ResourceMapView's own render (it depends on `filterChips`, itself derived
// from several other pieces of that screen's state). But `setSidebarCollapsed`
// is needed much earlier — `selectPlace`, defined near the top of that
// component, already calls it. Baking the `desktopNarrowed`-dependent
// derivation into this hook would force the whole hook call itself down to
// where `desktopNarrowed` lives, which is AFTER `selectPlace` needs
// `setSidebarCollapsed` — a real ordering constraint, not a style choice.
// So this hook owns only what never depends on the rest of the screen
// (width, collapsed, opened-manually, dragging, the handlers, persistence);
// ResourceMapView derives `sidebarVisible`/`toggleSidebar` itself, right
// next to `desktopNarrowed`, from this hook's `sidebarCollapsed`/
// `sidebarOpenedManually`/setters.
//
// Desktop sidebar's default/min/max px width — draggable from its own right
// edge (see the resize handle in ResourceMapView), same pattern most
// split-pane apps use (Claude's own sidebar included). Max leaves the map
// itself a usable amount of room even on a laptop-width screen rather than
// letting the sidebar eat the whole view. Min is set by what the floating
// search box (see ResourceMapView's own doc — its width TRACKS the
// sidebar's, inset by SIDEBAR_SEARCH_INSET on each side) can shrink to
// before it stops looking like a real search box, not by the sidebar's own
// content wrapping.
export const SIDEBAR_DEFAULT_WIDTH = 380
export const SIDEBAR_MIN_WIDTH = 360
export const SIDEBAR_MAX_WIDTH = 640
// How much narrower the floating search box is than the sidebar it sits on
// top of, split evenly left/right — it reads as flush inside the sidebar's
// own white edge (Google Maps' own search box, by contrast, leaves a much
// bigger margin on both sides) rather than spanning it edge to edge. Kept
// here (not ResourceMapView) since it's derived directly from
// SIDEBAR_MIN_WIDTH above, not an independent constant.
export const SIDEBAR_SEARCH_INSET = 24
// Persists the chosen width across visits, the same way Claude's own
// sidebar remembers a dragged width — otherwise every fresh page load (or
// every time the sidebar cycles hidden→shown, which unmounts it) would
// silently forget it and snap back to the default.
const SIDEBAR_WIDTH_STORAGE_KEY = 'jpc:map-sidebar-width'
// A real keyboard equivalent for the drag gesture (ARIA's own separator
// pattern calls for one), not just a courtesy — dragging with a mouse is
// the only way to reach this control otherwise. Same step both directions.
const ARROW_STEP = 16

export function clampSidebarWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, px))
}

function loadStoredSidebarWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
  const parsed = raw === null ? NaN : Number(raw)
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH
}

/** The desktop sidebar's width/collapse/opened-manually/drag state — see
 *  this file's own top comment for why `sidebarVisible`/`toggleSidebar`
 *  stay in ResourceMapView instead of living here. */
export function useMapSidebar() {
  // Desktop-only — collapses the results sidebar down to just its edge
  // toggle, same as Google Maps' own panel-collapse arrow, so a visitor who
  // wants to see more of the map without losing their search/selection can
  // tuck the panel away without clearing it. Reset to false at the points
  // in ResourceMapView where the panel would otherwise reopen with new
  // content anyway (a fresh search, a newly toggled category, a newly
  // selected place) — collapsing should hide what's already there, not
  // swallow the next thing the visitor explicitly asks to see.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Lets the sidebar be opened even before anything's narrowed — without
  // this, first-time visitors land on a bare map with no visible way to
  // browse the (already-loaded) directory at all, since the sidebar
  // otherwise only appears once a search/category narrows things down.
  // Independent of sidebarCollapsed (which hides a sidebar that DOES have a
  // narrowing reason to show); see sidebarVisible/toggleSidebar below for
  // how the two combine.
  const [sidebarOpenedManually, setSidebarOpenedManually] = useState(false)

  // Draggable sidebar width. Lazy-initialized from localStorage (SSR-safe:
  // reads window only in the initializer, which never runs on the server)
  // so a returning visitor's chosen width is there on first paint, not
  // snapped to the default for one frame then corrected.
  const [sidebarWidth, setSidebarWidth] = useState(loadStoredSidebarWidth)
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false)
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  function onSidebarHandlePointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    setIsDraggingSidebar(true)
  }

  function onSidebarHandlePointerMove(e: React.PointerEvent) {
    const drag = sidebarDragRef.current
    if (!drag) return
    setSidebarWidth(clampSidebarWidth(drag.startWidth + (e.clientX - drag.startX)))
  }

  // Persisted on release, not on every pointermove — dragging is the only
  // time this changes, so writing localStorage a few dozen times over one
  // drag (instead of once at the end) would be pure waste.
  function onSidebarHandlePointerUp() {
    if (!sidebarDragRef.current) return
    sidebarDragRef.current = null
    setIsDraggingSidebar(false)
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }

  // Same reasoning as MobileSheet's own onHandlePointerCancel: the browser
  // took the touch over mid-gesture (most commonly an edge swipe recognized
  // as back-navigation) — snap back to the width the drag actually started
  // from rather than leaving it wherever the interrupted gesture reached,
  // since a cancelled gesture is one that never completed.
  function onSidebarHandlePointerCancel() {
    const drag = sidebarDragRef.current
    sidebarDragRef.current = null
    setIsDraggingSidebar(false)
    if (drag) setSidebarWidth(drag.startWidth)
  }

  function onSidebarHandleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = clampSidebarWidth(sidebarWidth + (e.key === 'ArrowRight' ? ARROW_STEP : -ARROW_STEP))
    setSidebarWidth(next)
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next))
  }

  return {
    sidebarWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarOpenedManually,
    setSidebarOpenedManually,
    isDraggingSidebar,
    onSidebarHandlePointerDown,
    onSidebarHandlePointerMove,
    onSidebarHandlePointerUp,
    onSidebarHandlePointerCancel,
    onSidebarHandleKeyDown,
  }
}
