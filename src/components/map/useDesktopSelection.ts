'use client'
// The place open in the computer's sidebar, and its editor (split out of
// ResourceMapView Nov 21, no behaviour change). Called where its block sat,
// so the view's effects run in the same order.
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { HostedEditor } from '@/components/resources/ListingEditor'
import type { SelectablePoint } from './mapViewShared'

export function useDesktopSelection({
  isMobile,
  standalone,
  setSelectedPointId,
}: {
  isMobile: boolean
  standalone: boolean | undefined
  setSelectedPointId: (id: string | undefined) => void
}) {
  // Desktop's equivalent of MobileNearbySheet's own `selected` state — the
  // place currently shown in the sidebar's detail panel (MapPlaceDetail)
  // instead of its results list. Mobile keeps its own copy of this inside
  // MobileNearbySheet; desktop has no such child component (the sidebar is
  // built directly in this file) so it's tracked here instead.
  const [desktopSelected, setDesktopSelectedRaw] = useState<SelectablePoint | null>(null)
  // Also keeps selectedPointId (the marker-highlight id ResourceMap reads,
  // shared with mobile's own selection) in sync — set together, right where
  // the selection itself changes, rather than via a separate effect.
  // The sidebar's place (or eruv) open in its editor: how to step back, what
  // that step is called, and whether anything typed would be lost. Its ‹ is
  // the ← in the search box (Oct 15). Keyed on the place's id so it can't
  // outlive the place it was set for. Mirrored in a ref so leaveEditThen,
  // reached through several handlers in one click, asks only once.
  const [editor, setEditor] = useState<(HostedEditor & { id: string }) | null>(null)
  const editorRef = useRef(editor)
  useLayoutEffect(() => {
    editorRef.current = editor
  })
  const desktopSelectedId = desktopSelected?.id ?? null
  const onPlaceEditor = useCallback(
    (next: HostedEditor | null) => setEditor(next && desktopSelectedId ? { ...next, id: desktopSelectedId } : null),
    [desktopSelectedId],
  )
  // A place opened on the computer's map is an entry in the history, as on
  // a phone (MobileNearbySheet): Back closes it rather than leaving the map
  // and its search (Nov 18). Not when the address names it already (a
  // link, a reload). Closed on the screen, it takes that entry back, and
  // the popstate listener below clears it.
  const setDesktopSelected = (p: SelectablePoint | null) => {
    const stepped = (window.history.state as { mapPlaceOpen?: boolean } | null)?.mapPlaceOpen
    if (!p && stepped && standalone) {
      window.history.back()
      return
    }
    if (p && !desktopSelected && !stepped && standalone && new URLSearchParams(window.location.search).get('place') !== p.id) {
      window.history.pushState({ ...(window.history.state ?? {}), mapPlaceOpen: true }, '')
    }
    setDesktopSelectedRaw(p)
    setSelectedPointId(p?.id)
  }
  const onPlacePop = useEffectEvent((e: PopStateEvent) => {
    if (isMobile || !desktopSelected || (e.state as { mapPlaceOpen?: boolean } | null)?.mapPlaceOpen) return
    setDesktopSelectedRaw(null)
    setSelectedPointId(undefined)
  })
  useEffect(() => {
    if (!standalone) return
    const listener = (e: PopStateEvent) => onPlacePop(e)
    window.addEventListener('popstate', listener)
    return () => window.removeEventListener('popstate', listener)
  }, [standalone])

  return { desktopSelected, setDesktopSelected, editor, setEditor, editorRef, onPlaceEditor }
}
