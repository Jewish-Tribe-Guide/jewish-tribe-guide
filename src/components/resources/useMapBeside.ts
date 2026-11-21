import { useRef, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { mapQueryString, routes } from '@/lib/routes'
import { useSharedPreference } from '@/lib/useSharedPreference'
import { createHighlight, useWide } from './CategoryMap'
import { useRowLook } from './RowLookSwitch'
import { useListMapSplit } from './useListMapSplit'
import type { WalkShown } from './walkOnMap'

// A category page's map beside its list, and the list's look (moved out of
// GenericDirectory whole).
export function useMapBeside({
  caps,
  category,
  activeCommunity,
  search,
  openNow,
  boolFilters,
  selectFilters,
  setRevealedId,
  scrollItemIntoViewWhenSettled,
}: {
  caps: { map: boolean }
  category: CategoryConfig
  activeCommunity: { slug: string }
  search: string
  openNow: boolean
  boolFilters: Record<string, boolean>
  selectFilters: Record<string, string[]>
  setRevealedId: (id: string | null) => void
  scrollItemIntoViewWhenSettled: (id: string, behavior: ScrollBehavior) => void
}) {
  // ── The map beside the list (see CategoryMap) ──
  // Where the category has a map (an address and the Map capability). Below
  // lg it's simply not there; "Hide map" gives the list the whole width,
  // and this browser remembers it.
  const hasMapColumn = caps.map && category.hasAddress !== false
  // The same on every category page, including ones kept open for Back.
  const [mapHidden, storeMapHidden] = useSharedPreference('jpc:map-hidden', (raw) => raw === '1')
  const setMapHidden = (hidden: boolean) => storeMapHidden(hidden ? '1' : null)
  // How the width is shared between them: draggable, and dragged far
  // enough the map's way, hidden (useListMapSplit).
  const { gridRef: splitRef, gridStyle: splitStyle, handleProps: splitHandle } = useListMapSplit({ onHideMap: () => setMapHidden(true) })
  const mapBeside = hasMapColumn && !mapHidden
  // Cards or one flat list (RowLookSwitch): being tried on the preview.
  const [rowLook, setRowLook] = useRowLook()
  const flat = rowLook === 'list'
  const [highlight] = useState(createHighlight)
  // An open listing's "Within a walk" list, opened, on the map beside it
  // (walkOnMap.ts), where that map is on screen.
  const [walkShown, setWalkShown] = useState<WalkShown | null>(null)
  const wide = useWide()
  const mapOnScreen = mapBeside && wide
  const walkOnMap = mapOnScreen ? { show: setWalkShown, highlight } : null
  // A pin's row, found: opened to (its group too), scrolled to, and
  // outlined for a moment so the eye lands on it.
  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimer = useRef(0)
  const findRow = (id: string) => {
    setRevealedId(id)
    setFlashId(id)
    scrollItemIntoViewWhenSettled(id, 'smooth')
    // A second click restarts the outline's time rather than ending it early.
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 2500)
  }
  // The full Map page on the same places: this category, the search and
  // the filters.
  const fullMapHref = `${routes.map(activeCommunity.slug)}${mapQueryString({
    categories: [category.id],
    query: search.trim() || null,
    openNow,
    bool: Object.keys(boolFilters).filter((k) => boolFilters[k]),
    select: Object.fromEntries(Object.entries(selectFilters).filter(([, v]) => v.length > 0)),
    from: category.id,
  })}`
  // The phone's Map button, first in the list's row (board G1, Nov 16):
  // the Map tab on these places, with a ‹ back here. Where the category
  // has a map at all; a computer has it beside the list.
  const phoneMapHref = hasMapColumn ? fullMapHref : undefined
  return {
    hasMapColumn,
    mapHidden,
    setMapHidden,
    splitRef,
    splitStyle,
    splitHandle,
    mapBeside,
    rowLook,
    setRowLook,
    flat,
    highlight,
    walkShown,
    mapOnScreen,
    walkOnMap,
    flashId,
    findRow,
    fullMapHref,
    phoneMapHref,
  }
}
