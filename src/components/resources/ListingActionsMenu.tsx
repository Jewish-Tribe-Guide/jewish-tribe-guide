'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import { useShareLink } from '@/lib/useShareLink'
import { useOptionalLocation } from '@/lib/locationContext'
import { markRowClickSuppressed } from '@/lib/suppressRowClick'
import { ui } from '@/lib/uiConfig'
import { DotsIcon, PinIcon, ExternalIcon, CrosshairIcon, CheckIcon } from '@/components/icons'

// ── The kebab menu on a listing — Pin, Share, and "Set location" all
// reachable without expanding the card first. Rendered by GenericListingCard
// (the directory card's collapsed corner, both mobile and desktop) and
// MapPlaceDetail (the map's own place-detail panel, next to the name) — the
// only two places a listing is shown in full; every other inline Pin/Share/
// SetLocationButton usage was removed once this covered them all.
//
// Not a reuse of the old PinButton/ShareButton/SetLocationButton components
// (deleted) — those were styled as inline pills, not menu rows — but their
// underlying hooks (usePinned/useShareLink/useOptionalLocation) are exactly
// what this needs, so this calls them directly and builds its own menu-row
// markup. Dropdown pattern (open state, outside-click + Escape dismissal,
// role="menu") mirrors CommunitySwitcher.tsx's own desktop dropdown.
//
// The popup itself is portaled to document.body (position: fixed, computed
// from the kebab button's own getBoundingClientRect — see openMenu), same
// pattern as CheckboxDropdown right next to this in the same toolbar. An
// in-place `absolute` popup (what this used to be) only ever wins a z-index
// fight against whatever ELSE happens to share its nearest real ancestor
// stacking context — a directory card sits inside a grid, inside this
// screen's own sticky filter bar's sibling tree, and nothing in that chain
// is isolated, so raising this popup's own z-index (tried: isolate, then
// isolate+z-40) kept meeting a new sibling it still lost to instead of
// actually fixing it (the sticky sort toggle, then a neighboring card's own
// upvote icon). A portaled, viewport-fixed popup has no such ancestor to
// lose to at all — it paints in the root stacking context, same as any
// browser-native menu would.

// w-40 below, in px — needed as a number to compare against actual measured
// space at open time.
const MENU_WIDTH = 160
// A little slack past the bare minimum so the menu never sits flush against
// the very edge of the screen even when it JUST fits.
const EDGE_MARGIN = 8

export default function ListingActionsMenu({
  item,
  category,
  path,
  className,
  onOutsideDismiss,
  onOpenChange,
}: {
  item: DirectoryResource
  category: CategoryConfig
  path: string
  /** Extra classes on the kebab's own wrapper — e.g. a small trailing
   *  margin (`mr-1`/`mr-2`) so it doesn't sit flush against a container's
   *  true edge (see MapPlaceDetail, matching Spotify's own overflow-menu
   *  spacing rather than butting right up against the edge). */
  className?: string
  /** Fired when the menu closes specifically because of an outside click
   *  (not Escape, not picking a menu item — those already know they closed
   *  it). An outside click almost always lands on the CARD itself (it's
   *  most of the visible surface, or in the map sheet, its background),
   *  which has its own onClick/tap-to-collapse of its own — without a way
   *  to tell that handler "this exact tap was already spent dismissing the
   *  menu," it would also silently act on it in the same motion.
   *
   *  This only reaches THIS instance's own caller — fine for the map sheet
   *  (one place detail panel on screen at a time), but a directory grid has
   *  one ListingActionsMenu per card, and the tap dismissing one can land on
   *  a completely different card's row (the popup is portaled to
   *  document.body — see openMenu's own doc — so "outside" really can mean
   *  anywhere on the page now). GenericListingCard doesn't wire this prop at
   *  all any more; see suppressRowClick's own module doc for the shared,
   *  cross-card mechanism this component drives directly instead, on every
   *  outside dismiss regardless of whether a caller passed this prop.
   *
   *  Kept only for MapPlaceDetail's own use (a distinct concern — dismissing
   *  the whole sheet's own background-tap-to-collapse, not a listing row),
   *  which owns its OWN suppression the same way GenericListingCard's used
   *  to (see MobileNearbySheet's suppressNextCollapseRef) rather than this
   *  component trying to stop the click from reaching it via DOM
   *  propagation tricks — an earlier version did
   *  that (mousedown flags a ref, a capture-phase click listener stops
   *  propagation) and it worked in this codebase's own synthetic-event
   *  tests, but failed consistently on real iPhones in both Safari and
   *  Chrome — genuinely blocked from confirming exactly why (this repo's
   *  browser tooling can't deliver real clicks on this route, and script-
   *  dispatched touch/mouse events don't reproduce WebKit's own touch-to-
   *  mouse synthesis closely enough to trust). Letting the click fire
   *  completely normally and having each caller's OWN handler self-check a
   *  plain ref first depends on nothing but mousedown-before-click
   *  ordering, which every browser guarantees — not on capture-phase
   *  interception behaving the same way this codebase's own tests suggested
   *  it would.
   *
   *  onOutsideDismiss alone turned out not to be enough for the map sheet
   *  specifically (see MobileNearbySheet's own use of both together): the
   *  map's own "tap the background to collapse" isn't a real DOM click at
   *  all — it's Google Maps' own internal 'click' event (ResourceMap.tsx),
   *  which may recognize a tap through its own touch handling on its own
   *  schedule, not necessarily downstream of the same native
   *  mousedown-then-click pair onOutsideDismiss depends on. If Maps' own
   *  handler runs BEFORE this component's outside-mousedown-detection does,
   *  onOutsideDismiss fires too late to help. onOpenChange sidesteps the
   *  ordering question entirely: instead of a one-shot "did this specific
   *  tap already close it" flag, a caller can just check "is it open RIGHT
   *  NOW" at the moment its own handler runs, which is true regardless of
   *  which side's event happened to fire first. */
  onOutsideDismiss?: () => void
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  // Fixed-position coordinates for the portaled popup — measured fresh every
  // time it opens (not a fixed per-caller prop) so it's right regardless of
  // where this particular card happens to sit: a kebab flush against the
  // edge of a narrow mobile sheet (MapPlaceDetail) needs the opposite
  // direction from one with open space to its right (a desktop grid card),
  // and a hardcoded per-component choice can't account for a phone vs. a
  // wide monitor, or a card that ends up in the last column of a grid.
  // `top`/`bottom` mirror CheckboxDropdown's own "only one is ever set" —
  // opens downward from the kebab unless there isn't room below it.
  const [popupPos, setPopupPos] = useState<{ top?: number; bottom?: number; left: number; anchorRight: boolean } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // The popup itself is portaled to document.body (see below), so it's no
  // longer a DOM descendant of `wrapRef` — needs its own ref for the
  // outside-click check, or clicking a menu item would read as "outside"
  // and close it before the item's own onClick even runs.
  const popupRef = useRef<HTMLDivElement>(null)
  const { isPinned, toggle } = usePinned()
  const { share, copied } = useShareLink(path, item.name)
  // Optional, not useLocation() — this renders inside the admin's category
  // preview too, which has no LocationProvider on purpose (see
  // SetLocationButton's own note).
  const location = useOptionalLocation()
  // Computed here (not down by `active`, which also needs it) so openMenu's
  // own row-count estimate below can use it without forward-referencing a
  // `const` declared later in the function. Same gate the old
  // SetLocationButton used — a listing whose address failed to geocode has
  // no geo key, and a category with no physical place (e.g. a WhatsApp
  // group) has hasAddress === false.
  const canSetLocation = !!location && category.hasAddress !== false && !!item.geo

  function openMenu() {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      // A rough estimate of the popup's height — good enough to decide
      // whether it fits below the button without waiting a render to
      // measure the real thing (same reasoning as CheckboxDropdown's own
      // ESTIMATED_ROW_PX). ~36px per row, +8px for the popup's own vertical
      // padding/border.
      const itemCount = (ui.map.pins ? 1 : 0) + 1 /* Share always renders */ + (canSetLocation ? 1 : 0)
      const estimatedHeight = itemCount * 36 + 8
      const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - EDGE_MARGIN)
      // Clamped inward from the kebab's own left edge means the popup is
      // effectively right-aligned against the viewport edge — used below to
      // pick a matching transform-origin, without re-reading wrapRef during
      // render (see the popup's own style comment).
      const anchorRight = left < rect.left
      const fitsBelow = rect.bottom + 4 + estimatedHeight <= window.innerHeight
      setPopupPos(
        fitsBelow
          ? { top: rect.bottom + 4, left, anchorRight }
          : { bottom: window.innerHeight - rect.top + 4, left, anchorRight },
      )
    }
    setOpen(true)
  }

  // Ref-mirrored, same pattern MobileNearbySheet's own onSelectionChangeRef
  // uses — onOpenChange is usually a fresh inline arrow function every
  // render; putting it directly in the effect below's dependency array
  // would re-fire this on every unrelated re-render, not just when `open`
  // itself actually changes.
  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => { onOpenChangeRef.current = onOpenChange }, [onOpenChange])
  // See onOpenChange's own doc — a plain, always-current mirror of `open`
  // for callers that need to check it synchronously from their OWN handler,
  // not react to it via a render.
  useEffect(() => {
    onOpenChangeRef.current?.(open)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // Both refs: the popup itself is portaled to document.body (see
      // openMenu's own doc), so it's no longer a descendant of wrapRef.
      if (!wrapRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false)
        // See onOutsideDismiss's own doc — this is the one thing that
        // tells whatever's underneath this tap (almost always the card
        // itself) not to also act on the very same tap.
        onOutsideDismiss?.()
        // onOutsideDismiss only reaches THIS instance's own caller — fine
        // when there's only one listing on screen (the map sheet), but a
        // directory grid has one ListingActionsMenu per card, and the tap
        // that dismisses THIS one can land on a completely different card's
        // row (the popup is portaled — see openMenu's own doc — so "outside"
        // now really can mean "anywhere on the page"). Without this, that
        // tap would ALSO toggle the OTHER card open/closed in the same
        // motion: dismiss one thing, and something unrelated reacts too.
        markRowClickSuppressed()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Standard behavior for any floating menu (native iOS action sheets,
    // Material menus, Twitter's own) — a scroll means the visitor has
    // moved on, the same as a tap elsewhere; leaving the menu open while
    // the page moves under it reads as stuck rather than dismissed.
    // `{ capture: true }`: 'scroll' doesn't bubble, so a listener here
    // only sees it for something that scrolls document/window directly —
    // capture still fires on the way down to whatever ACTUALLY scrolled
    // (a category page's own list, the map sheet's own scroll region),
    // which is what most scrolling in this app actually is. `{ passive:
    // true }`: this never calls preventDefault, so the browser doesn't
    // need to wait for it before it can start scrolling.
    const onScroll = () => {
      setOpen(false)
      onOutsideDismiss?.()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, onOutsideDismiss])

  const pinned = isPinned(item.id)
  const active = canSetLocation && location!.anchorListingId === item.id

  const menuItemClass =
    'flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer'

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else openMenu()
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${item.name}`}
        // -m-2.5 p-2.5: same tap-target-growing trick as the chevron button
        // right next to this — the icon is well under the 24px
        // WCAG-recommended tap target.
        className="-m-2.5 flex cursor-pointer items-center justify-center rounded-full p-2.5 text-slate-400 hover:text-slate-600"
      >
        <DotsIcon className="h-4 w-4" />
      </button>

      {open && popupPos && createPortal(
        <div
          ref={popupRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          // Which corner popupPos actually anchored to (computed once in
          // openMenu, not re-derived here) is what transform-origin should
          // match, so the popup eases open from the kebab itself rather than
          // from a fixed corner that's sometimes wrong.
          style={{
            position: 'fixed',
            top: popupPos.top,
            bottom: popupPos.bottom,
            left: popupPos.left,
            transformOrigin: `${popupPos.top !== undefined ? 'top' : 'bottom'} ${popupPos.anchorRight ? 'right' : 'left'}`,
          }}
          className="z-50 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg animate-[menuIn_140ms_ease-out]"
        >
          {/* ui.map.pins is the same flag the map's own pin filter chip and
              (formerly) PinButton respected — the original build of this
              menu missed it and showed Pin unconditionally even with
              pinning turned off community-wide. */}
          {ui.map.pins && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                toggle({ id: item.id, categoryId: category.id })
                setOpen(false)
              }}
              aria-pressed={pinned}
              className={menuItemClass}
            >
              <PinIcon filled={pinned} className="h-3.5 w-3.5 shrink-0" />
              {pinned ? 'Pinned' : 'Pin'}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={share}
            className={menuItemClass}
          >
            <ExternalIcon className="h-3.5 w-3.5 shrink-0" />
            {copied ? 'Copied!' : 'Share'}
          </button>
          {canSetLocation && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                if (active) location!.unsetListingAnchor()
                else location!.setListingAnchor({ id: item.id, name: item.name, coords: item.geo! })
                setOpen(false)
              }}
              aria-pressed={active}
              className={menuItemClass}
            >
              {active ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <CrosshairIcon className="h-3.5 w-3.5 shrink-0" />}
              {active ? 'Location set' : 'Set location'}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
