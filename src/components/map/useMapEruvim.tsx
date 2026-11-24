'use client'
// ResourceMapView's eruv lines (split out Nov 21, no behaviour change): the
// eruvim with a map, the layer's lines and list rows, and opening one.
// Called where the block it came from sat, so the view's effects run in the
// same order.
import { useEffect, useEffectEvent, useMemo, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import MapEruvDetail from './MapEruvDetail'
import type { MapEruv } from './eruvLayer'
import type { NearbyEruv } from './NearbyList'
import type { MobileNearbySheetHandle } from './MobileNearbySheet'
import type { HostedEditor } from '@/components/resources/ListingEditor'
import { useEruvMaps, useEruvStatuses } from '@/lib/useEruvStatuses'
import { eruvView } from '@/lib/eruv'
import { labelPoint } from '@/lib/eruvShape'
import type { useCategories } from '@/lib/useCategories'
import { ERUV_FILTER_ID, ERUV_PREFIX, type SelectablePoint } from './mapViewShared'

export function useMapEruvim({
  categories,
  countCommunity,
  eruvimOn,
  setEruvimOn,
  clock,
  selectedPointId,
  colorById,
  isMobile,
  nearbySheetRef,
  leaveEditThen,
  setDesktopSelected,
  setSidebarCollapsed,
  deselectPlace,
  standalone,
  initialPlaceId,
  effectiveSelected,
  pinnedSelected,
  setPinnedSelected,
  allChipsOn,
  setSelected,
  showAllPlaces,
}: {
  categories: ReturnType<typeof useCategories>
  countCommunity: string | null
  eruvimOn: boolean
  setEruvimOn: (on: boolean) => void
  clock: number | null
  selectedPointId: string | undefined
  colorById: Map<string, string>
  isMobile: boolean
  nearbySheetRef: RefObject<MobileNearbySheetHandle | null>
  leaveEditThen: (then: () => void, to?: string) => void
  setDesktopSelected: (p: SelectablePoint | null) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  deselectPlace: () => void
  standalone: boolean | undefined
  initialPlaceId: string | undefined
  effectiveSelected: Set<string>
  pinnedSelected: boolean
  setPinnedSelected: (on: boolean) => void
  allChipsOn: boolean
  setSelected: Dispatch<SetStateAction<Set<string> | null>>
  showAllPlaces: () => void
}) {
  // ── Eruv lines (agreed Oct 7, canvas page "eruv", board 3) ──────────────
  // Each eruv's own map, as the eruv draws it, under the pins, its name in
  // its status's colour (eruvLayer.ts). Tapping a line or a name opens that
  // eruv's listing where a place opens. Off to begin with; there only when
  // the community has an Eruv page and an eruv with a map. All of them or
  // none (the user, Oct 13), not one by one. A layer, not a place filter, so
  // a round button on the map like Google Maps' Layers rather than a chip
  // (Oct 15): from everything, a tap is the lines alone; with categories
  // picked, the lines go over them. All never draws them.
  const eruvCategory = (categories ?? []).find((c) => c.kind === 'eruv') ?? null
  const eruvStatuses = useEruvStatuses(countCommunity ?? '', !!countCommunity && !!eruvCategory)
  const eruvData = eruvStatuses?.available ? eruvStatuses : null
  const eruvMaps = useEruvMaps(countCommunity ?? '', !!eruvData, eruvData?.mapsVersion)
  const eruvimWithLines = useMemo(
    () => (eruvData && eruvMaps ? eruvData.eruvim.flatMap((e) => (eruvMaps.get(e.id) ? [{ eruv: e, map: eruvMaps.get(e.id)! }] : [])) : []),
    [eruvData, eruvMaps],
  )
  const mapEruvim = useMemo<MapEruv[]>(
    () => (eruvimOn && eruvData && clock !== null ? eruvimWithLines.map(({ eruv: e, map }) => ({ id: e.id, name: e.name, tone: eruvView(e, new Date(clock), eruvData.timezone, eruvData.candles).tone, map })) : []),
    // Each tick makes a new list, but the map redraws only when a line or
    // a status's colour changes (eruvDrawKey).
    [eruvimOn, eruvData, eruvimWithLines, clock],
  )
  // The list's rows when the lines are all the map shows (NearbyList).
  const listedEruvim = useMemo<NearbyEruv[]>(
    () =>
      eruvimOn && eruvData && clock !== null
        ? eruvimWithLines.map(({ eruv: e }) => {
            const v = eruvView(e, new Date(clock), eruvData.timezone, eruvData.candles)
            // Where and when, without how often (the eruv's page says that).
            return { id: e.id, name: e.name, tone: v.tone, label: v.label, checked: v.checked?.split(' · ')[0] ?? null }
          })
        : [],
    [eruvimOn, eruvData, eruvimWithLines, clock],
  )
  const openEruvId = selectedPointId?.startsWith(ERUV_PREFIX) ? selectedPointId.slice(ERUV_PREFIX.length) : null
  const openEruv = (id: string) => {
    const found = eruvimWithLines.find((x) => x.eruv.id === id)
    const at = found ? (labelPoint(found.map) ?? found.map.lines[0]?.points[0]) : null
    if (!found || !at) return
    const e = found.eruv
    const p: SelectablePoint = { id: `${ERUV_PREFIX}${id}`, lat: at[0], lng: at[1], name: e.name, color: colorById.get(eruvCategory?.id ?? '') ?? '#64748b', filterId: ERUV_FILTER_ID }
    // Opened where it's tapped: the map stays where the visitor put it.
    if (isMobile) nearbySheetRef.current?.selectPoint(p, false)
    else
      leaveEditThen(() => {
        setDesktopSelected(p)
        setSidebarCollapsed(false)
      }, id)
  }
  // A link to an open eruv (?place=eruv:center-city) opens it again, with
  // the layer on, once the eruvim have arrived (their fetch outlasts the
  // render a phone takes to know it's a phone; see the restore above).
  const restoredEruv = useRef(false)
  const restoreEruv = useEffectEvent(() => {
    if (!standalone || restoredEruv.current || !initialPlaceId?.startsWith(ERUV_PREFIX) || eruvimWithLines.length === 0) return
    restoredEruv.current = true
    setEruvimOn(true)
    openEruv(initialPlaceId.slice(ERUV_PREFIX.length))
  })
  useEffect(() => restoreEruv(), [eruvimWithLines, standalone, initialPlaceId])
  // Turning the layer off closes the eruv open in it, so mid-edit that
  // asks first too, and a No leaves both the layer and the edit as they were.
  const eruvimOff = (then?: () => void) => {
    if (!openEruvId) {
      setEruvimOn(false)
      return then?.()
    }
    leaveEditThen(() => {
      deselectPlace()
      setEruvimOn(false)
      then?.()
    })
  }
  // Off with nothing else on goes back to everything, as the last category
  // chip off does: the map is never empty.
  const toggleEruvim = () => {
    if (!eruvimOn) return setEruvimOn(true)
    eruvimOff(effectiveSelected.size === 0 && !pinnedSelected ? showAllPlaces : undefined)
  }
  // The map button: from everything, the lines alone. On, it brings up
  // the list, each eruv with its status, as a category's chip brings up
  // its places (the user, Oct 15): the sidebar, or the phone's sheet to
  // half.
  const tapEruvButton = () => {
    if (eruvimOn) return toggleEruvim()
    if (allChipsOn) {
      setSelected(new Set())
      setPinnedSelected(false)
    }
    setEruvimOn(true)
    setSidebarCollapsed(false)
    if (isMobile) nearbySheetRef.current?.raise()
  }
  const eruvDetail = (id: string, onBack?: () => void, onEditor?: (editor: HostedEditor | null) => void) => {
    const e = eruvData?.eruvim.find((x) => x.id === id)
    if (!e || !eruvData || clock === null) return null
    return <MapEruvDetail eruv={e} color={colorById.get(eruvCategory?.id ?? '') ?? '#64748b'} now={new Date(clock)} timezone={eruvData.timezone} candles={eruvData.candles} onBack={onBack} onEditor={onEditor} />
  }

  return { eruvCategory, eruvimWithLines, mapEruvim, listedEruvim, openEruvId, openEruv, tapEruvButton, eruvDetail }
}
