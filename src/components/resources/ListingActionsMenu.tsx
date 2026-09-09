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
  // Set for exactly one tick after an outside click closes the menu — see
  // the capture-phase click listener below for what it's actually for.
  const justClosedRef = useRef(false)
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

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        // The mousedown that just closed this doesn't stop its own click
        // from still reaching whatever it landed on — they're separate
        // events, and closing the menu here doesn't touch the second one.
        // Tapping "away" almost always means tapping the listing CARD
        // itself (it's most of the screen), which has its own onClick to
        // expand/collapse — so without this, the same tap that dismissed
        // the menu also silently expanded the card underneath it. Flagged
        // here, consumed by the always-on capture-phase listener below —
        // NOT one declared in this same effect. `setOpen(false)` here
        // flips `open`, which re-runs THIS effect on the next render and
        // tears down whatever it registered before the paired click has
        // even fired; a listener declared in this block would already be
        // gone by the time that click arrives. The one that actually
        // consumes it has to outlive this open/closed transition, so it's
        // mounted once for the component's whole lifetime instead.
        justClosedRef.current = true
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Mounted once, independent of `open` — see justClosedRef's own setter
  // above for why this can't live in the effect that sets the flag: this
  // needs to survive the exact render where `open` flips to false, which
  // tears down that effect's own listeners as part of the same update.
  // Capture phase specifically: stopping propagation here is what keeps
  // the click from ever reaching the card's own bubble-phase onClick at
  // all, not just from reaching further ancestors past it. One-shot —
  // clears itself immediately, so only the click paired with the
  // dismissing mousedown is swallowed; every tap after that behaves
  // normally.
  useEffect(() => {
    const onClickCapture = (e: MouseEvent) => {
      if (!justClosedRef.current) return
      justClosedRef.current = false
      e.stopPropagation()
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

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
