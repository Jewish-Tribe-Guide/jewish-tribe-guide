'use client'

import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { usePinned } from '@/lib/pinnedContext'
import { useShareLink } from '@/lib/useShareLink'
import { useOptionalLocation } from '@/lib/locationContext'
import { ui } from '@/lib/uiConfig'

/** One of the three things a visitor can do to a listing that isn't editing
 *  it. `id` is what a renderer keys its icon off — the hook deliberately
 *  returns no icon of its own, because the same action is drawn as a menu
 *  row in one place, a white glyph on a coloured swipe panel in another, and
 *  a circle in a third, and only the caller knows which. */
export type ListingAction = {
  id: 'pin' | 'share' | 'location'
  /** Already reflects state — "Pin"/"Pinned", "Share"/"Copied!",
   *  "Set as location"/"Location set". That matters beyond cosmetics: these
   *  render as `role="menuitem"`, where `aria-pressed` is not an allowed
   *  attribute (axe flags aria-allowed-attr as critical), so the label is
   *  the only thing carrying the state to a screen reader. */
  label: string
  active: boolean
  onSelect: () => void
}

/** The shared source of truth for a listing's non-edit actions.
 *
 *  Extracted from ListingActionsMenu (the kebab, since deleted), which was the
 *  only thing that knew how to pin/share/anchor a listing, so that the same
 *  three actions can appear wherever they now need to: the collapsed card (a
 *  swipe panel on mobile, a hover-reveal on desktop) and the overflow fan
 *  hanging off every edit bar — under the directory dialog, the mobile card,
 *  and the map's place panel. Its behaviour is tested through that fan
 *  (ListingActionsFan.test.tsx), its main renderer. Duplicating the gating alone would have been a bug
 *  waiting to happen — `ui.map.pins`, `category.hasAddress`, a listing whose
 *  address failed to geocode, and a missing LocationProvider each suppress a
 *  different one of them. */
export function useListingActions(
  item: DirectoryResource,
  category: CategoryConfig,
  /** The listing's own URL — what Share copies. */
  path: string,
): ListingAction[] {
  const { isPinned, toggle } = usePinned()
  const { share, copied } = useShareLink(path, item.name)
  // Optional, not useLocation() — this runs inside the admin's category
  // preview too, which has no LocationProvider on purpose.
  const location = useOptionalLocation()

  // A listing whose address failed to geocode has no geo key, and a category
  // with no physical place (a WhatsApp group, say) has hasAddress === false.
  const canSetLocation = !!location && category.hasAddress !== false && !!item.geo
  const pinned = isPinned(item.id)
  const anchored = canSetLocation && location!.anchorListingId === item.id

  const actions: ListingAction[] = []

  // The same community-wide flag the map's own pin filter chip respects.
  if (ui.map.pins) {
    actions.push({
      id: 'pin',
      label: pinned ? 'Pinned' : 'Pin',
      active: pinned,
      onSelect: () => toggle({ id: item.id, categoryId: category.id }),
    })
  }

  // Share always renders — every listing has a URL.
  actions.push({
    id: 'share',
    label: copied ? 'Copied!' : 'Share',
    active: copied,
    onSelect: share,
  })

  if (canSetLocation) {
    actions.push({
      id: 'location',
      label: anchored ? 'Location set' : 'Set as location',
      active: anchored,
      onSelect: () => {
        if (anchored) location!.unsetListingAnchor()
        else location!.setListingAnchor({ id: item.id, name: item.name, coords: item.geo! })
      },
    })
  }

  return actions
}
