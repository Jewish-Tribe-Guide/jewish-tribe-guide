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
export default function ListingActionsMenu({
  item,
  category,
  path,
  align = 'start',
}: {
  item: DirectoryResource
  category: CategoryConfig
  path: string
  /** Which edge of the kebab the dropdown's own edge lines up with —
   *  'start' (the default) anchors the menu's left edge to the kebab's
   *  left, extending rightward toward open space; 'end' anchors the menu's
   *  right edge instead, extending leftward. Callers with room to their
   *  right (GenericListingCard's card, ListingDetailModal's dialog) use the
   *  default; MapPlaceDetail's kebab sits flush against the edge of a
   *  narrow, edge-to-edge mobile sheet, where 'start' would push a 160px
   *  menu straight off the right side of the screen — 'end' keeps it over
   *  the open space between the name and the kebab instead. */
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { isPinned, toggle } = usePinned()
  const { share, copied } = useShareLink(path, item.name)
  // Optional, not useLocation() — this renders inside the admin's category
  // preview too, which has no LocationProvider on purpose (see
  // SetLocationButton's own note).
  const location = useOptionalLocation()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
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

  const pinned = isPinned(item.id)
  // Same gate the old SetLocationButton used — a listing whose address
  // failed to geocode has no geo key, and a category with no physical place
  // (e.g. a WhatsApp group) has hasAddress === false.
  const canSetLocation = !!location && category.hasAddress !== false && !!item.geo
  const active = canSetLocation && location!.anchorListingId === item.id

  const menuItemClass =
    'flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer'

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
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
          // See `align`'s own doc above for why this isn't hardcoded to one
          // direction — it depends on which side of the kebab actually has
          // room.
          className={`absolute top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${align === 'end' ? 'right-0' : 'left-0'}`}
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
