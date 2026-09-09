'use client'

import { useEffect, useRef, useState } from 'react'
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
   *  Callers own the actual suppression themselves (see GenericListingCard's
   *  own use of this) rather than this component trying to stop the click
   *  from reaching them via DOM propagation tricks — an earlier version did
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
  // Which side the menu actually opens toward — measured fresh every time
  // it opens (not a fixed per-caller prop) so it's right regardless of
  // where this particular card happens to sit: a kebab flush against the
  // edge of a narrow mobile sheet (MapPlaceDetail) needs the opposite
  // direction from one with open space to its right (a desktop grid card),
  // and a hardcoded per-component choice can't account for a phone vs. a
  // wide monitor, or a card that ends up in the last column of a grid.
  // Defaults to 'start' (opens rightward) so the very first paint — before
  // any measurement has run — matches the common case.
  const [align, setAlign] = useState<'start' | 'end'>('start')
  const wrapRef = useRef<HTMLDivElement>(null)
  const { isPinned, toggle } = usePinned()
  const { share, copied } = useShareLink(path, item.name)
  // Optional, not useLocation() — this renders inside the admin's category
  // preview too, which has no LocationProvider on purpose (see
  // SetLocationButton's own note).
  const location = useOptionalLocation()

  function openMenu() {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceRight = window.innerWidth - rect.left
      setAlign(spaceRight < MENU_WIDTH + EDGE_MARGIN ? 'end' : 'start')
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
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        // See onOutsideDismiss's own doc — this is the one thing that
        // tells whatever's underneath this tap (almost always the card
        // itself) not to also act on the very same tap.
        onOutsideDismiss?.()
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
  // Same gate the old SetLocationButton used — a listing whose address
  // failed to geocode has no geo key, and a category with no physical place
  // (e.g. a WhatsApp group) has hasAddress === false.
  const canSetLocation = !!location && category.hasAddress !== false && !!item.geo
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

      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          // align is measured fresh on every open — see openMenu's own doc
          // on why this isn't a fixed per-caller choice. transform-origin
          // (for the animation below) matches whichever corner the menu is
          // actually anchored to, so it eases open from the kebab itself
          // rather than from a fixed corner that's sometimes wrong.
          style={{ transformOrigin: align === 'end' ? 'top right' : 'top left' }}
          className={`absolute top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg animate-[menuIn_140ms_ease-out] ${align === 'end' ? 'right-0' : 'left-0'}`}
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
        </div>
      )}
    </div>
  )
}
