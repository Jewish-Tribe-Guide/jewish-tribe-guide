'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import { useShareLink } from '@/lib/useShareLink'
import { useOptionalLocation } from '@/lib/locationContext'
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
//
// Dismissing it also used to need each CALLER's own cooperation: an outside
// tap that closes the menu almost always lands on something with its own
// click behavior underneath — the SAME card's row (re-expanding it), a
// DIFFERENT card's row now that the popup is portaled (toggling THAT one
// instead), the map's own background-tap-to-collapse, the directory's Add
// button. Every one of those needed its own bespoke suppression flag
// (GenericListingCard's suppressNextRowClickRef, a shared cross-card module,
// MobileNearbySheet's suppressNextCollapseRef + kebabOpenRef for the map),
// and new ones kept surfacing (desktop's own map click had no flag at all).
//
// Replaced all of it with one full-viewport, invisible backdrop rendered
// alongside the popup (below). It isn't a suppression CONVENTION other code
// has to opt into — it's a real DOM element sitting on top of the entire
// page while the menu is open, so an "outside" tap hits IT, by the browser's
// own hit-testing, and never reaches whatever is visually underneath at
// all. Nothing left to suppress, anywhere, including callers that don't
// exist yet. A capture-phase `stopPropagation` was tried for this once
// before (see git history) and abandoned — it worked in this codebase's own
// synthetic-event tests but failed consistently on real iPhones in both
// Safari and Chrome, genuinely unclear why. This isn't that: the backdrop
// wins by being the actual topmost element at that screen position, a
// property of normal DOM stacking every browser agrees on, not by racing an
// event through JS-level interception.

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
}: {
  item: DirectoryResource
  category: CategoryConfig
  path: string
  /** Extra classes on the kebab's own wrapper — e.g. a small trailing
   *  margin (`mr-1`/`mr-2`) so it doesn't sit flush against a container's
   *  true edge (see MapPlaceDetail, matching Spotify's own overflow-menu
   *  spacing rather than butting right up against the edge). */
  className?: string
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

  // Escape and scroll-dismiss stay document-level listeners — neither is a
  // "where did this click land" question the backdrop below can answer for
  // us, since neither one IS a click. The backdrop (see the popup's own
  // JSX) is what handles every pointer-based outside dismissal now, so
  // there's no mousedown listener here any more, and nothing left to notify
  // a caller about — see this component's own top-of-file doc.
  useEffect(() => {
    if (!open) return
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
    const onScroll = () => setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

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
        // -m-2 p-2: same tap-target-growing trick as the chevron button
        // right next to this — the icon is well under the 24px
        // WCAG-recommended tap target (shrunk from -m-2.5/p-2.5 to match
        // the icon's own bump from h-4 to h-5 below, keeping the same ~36px
        // effective tap target rather than growing it further). text-slate-900
        // matches the card's own name (see GenericListingCard's name `<p>`)
        // rather than the quieter slate-400/600 this used to be — a kebab
        // that opens a real action menu (Pin/Share/Set location) reads as
        // more than a decoration, and disappearing at a glance next to bold
        // black text undersold that. hover:text-primary matches every other
        // interactive icon-button on this card (UpvoteButton, Edit).
        className="-m-2 flex cursor-pointer items-center justify-center rounded-full p-2 text-slate-900 hover:text-primary"
      >
        <DotsIcon className="h-5 w-5" />
      </button>

      {open && popupPos && createPortal(
        <>
          {/* The dismiss mechanism — see this file's own top-of-file doc.
              Covers the entire viewport (not just "everywhere but the
              popup" — the popup itself sits in front of this in z-order, so
              clicks on it still reach it first) and sits BELOW the popup
              (z-[55] vs the popup's z-[56]) so the popup keeps receiving its
              own clicks normally. Nothing renders here — it's purely a
              hit-test target — so `aria-hidden` and no visible styling at
              all.
              z-[55], not z-40/z-50: the map screen's own top-level container
              is `position: fixed` at z-50 (confirmed live — a backdrop at
              z-40 lost to it outright, and the popup itself, ALSO z-50 back
              then, only appeared to win by DOM-order luck in a same-value
              tie, which is exactly the kind of thing that stops being true
              the next time something reorders). Comfortably below the
              app's actual blocking modals (LiveLocationPrompt,
              DroppedPinEditor — z-[70]), which this doesn't need to, and
              shouldn't, outrank. */}
          <div
            data-testid="listing-actions-backdrop"
            className="fixed inset-0 z-[55]"
            aria-hidden="true"
            // stopPropagation matters here even though this is portaled to
            // document.body: React bubbles a portaled element's events
            // through its LOGICAL component tree, not the DOM tree it's
            // actually mounted in — so without this, clicking the backdrop
            // would still reach the card's own row onClick (GenericListingCard
            // renders this menu inside that row), the exact same-card
            // re-expand this whole mechanism exists to prevent. This is a
            // plain React synthetic-event stopPropagation on an element this
            // component owns, not the capture-phase document-level
            // interception that was tried and abandoned before (see this
            // file's own top-of-file doc) — those are different things, and
            // this one doesn't share that history of failing on real iPhones.
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            // Which corner popupPos actually anchored to (computed once in
            // openMenu, not re-derived here) is what transform-origin should
            // match, so the popup eases open from the kebab itself rather
            // than from a fixed corner that's sometimes wrong.
            style={{
              position: 'fixed',
              top: popupPos.top,
              bottom: popupPos.bottom,
              left: popupPos.left,
              transformOrigin: `${popupPos.top !== undefined ? 'top' : 'bottom'} ${popupPos.anchorRight ? 'right' : 'left'}`,
            }}
            className="z-[56] w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg animate-[menuIn_140ms_ease-out]"
          >
            {/* ui.map.pins is the same flag the map's own pin filter chip
                and (formerly) PinButton respected — the original build of
                this menu missed it and showed Pin unconditionally even with
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
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
