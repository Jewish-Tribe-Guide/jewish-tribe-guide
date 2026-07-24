'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { loadGoogleMaps, MAPS_API_KEY, mapsAuthFailed, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { directionsUrl, type LatLng } from '@/lib/googleMapsLinks'
import { community } from '@/community.config'
import { useIsMobile } from '@/lib/useIsMobile'

// Width the floating "Browse by Category" sidebar panel actually occludes
// from the map's right edge at lg+ (w-80 = 320px, plus its right-4 = 16px
// gap — see ResourceMapView.tsx). Centering math below uses this so a
// "centered" pin lands in the middle of the visible map area (between the
// map's own left edge and the sidebar's left edge), not the middle of the
// full map container, half of which sits behind the sidebar.
const SIDEBAR_OCCLUSION_PX = 336

// Google Maps animates `panTo` smoothly on its own, but `setZoom` always
// jumps straight to the target level — so a click that both re-centers AND
// changes zoom (e.g. focusing a single listing) reads as a pan-then-snap
// instead of one continuous motion. Steps the zoom one level at a time,
// waiting for the map to settle (`idle`) between steps, so the zoom change
// reads as a smooth "flowy" glide alongside the pan instead of an abrupt jump.
function smoothZoomTo(map: google.maps.Map, targetZoom: number, currentZoom: number) {
  if (currentZoom === targetZoom) return
  const next = currentZoom + (targetZoom > currentZoom ? 1 : -1)
  map.setZoom(next)
  google.maps.event.addListenerOnce(map, 'idle', () => smoothZoomTo(map, targetZoom, next))
}

/** One plottable place on the map. */
export type MapPoint = {
  id: string
  lat: number
  lng: number
  name: string
  address?: string
  phone?: string
  /** Emoji/glyph shown inside the pin (e.g. a category icon). */
  glyph?: string
  /** Pin background color (hex). */
  color: string
  /** Subtitle shown in the info window (e.g. the category label). */
  categoryLabel?: string
  /** Category id used to deep-link into the directory. Absent for hospitals. */
  filterId?: string
}

const HOSPITALS_FILTER_ID = '__hospitals__'

type Props = {
  points: MapPoint[]
  /** The visitor's live or set location. Rendered as a pulsing blue dot. */
  userLocation?: LatLng | null
  /** When true the map pans to keep the user centered as their position updates.
   *  When false the marker moves silently without interrupting browsing. */
  follow?: boolean
  /** Called when the user manually taps "Re-center" so the parent can flip
   *  follow back on. */
  onResumeFollow?: () => void
  /** Fallback center when there are no points to fit (e.g. Center City Philly). */
  fallbackCenter?: { lat: number; lng: number }
  /** Called when the user taps "View listing" in an info window. */
  onViewListing?: (categoryId: string, listingId: string) => void
  /** Called whenever a marker itself is tapped (before the info window even
   *  opens) — lets the parent isolate + expand this point's card in a
   *  `sidebar` list when that point's category is already the one showing
   *  there, so the info surfaces in the list too, not just the info window. */
  onMarkerClick?: (point: MapPoint) => void
  /** Forces the map to frame exactly these points — a close zoom centered on
   *  a single one, or a bounds-fit enveloping several (e.g. a facility or a
   *  whole category isolated in a list beside the map) — regardless of the
   *  usual "keep the user centered" behavior, since isolating something is a
   *  deliberate, one-off request. */
  focusPoints?: { lat: number; lng: number }[] | null
  /** Square off this component's own corners (the "Maps couldn't load"
   *  fallback) instead of the default rounded ones — set when the parent
   *  map card itself has square corners (the home page's embedded map), so
   *  a rounded box doesn't peek out from inside a square-cornered clip. */
  square?: boolean
  /** True when a `sidebar` list is passed to the parent `ResourceMapView` —
   *  i.e. a floating category-list panel MIGHT be overlaying this map's
   *  right edge (only actually does at lg+, checked live below). When it
   *  is, centering/fitting math compensates so points land centered in the
   *  visible map area rather than the full container. */
  hasSidebar?: boolean
}

const DEFAULT_CENTER = community.mapCenter

// Builds the info-window content as a real DOM node so we can attach event
// listeners (e.g. "View listing") without putting callbacks on window.
function buildInfoContent(
  p: MapPoint,
  onViewListing?: (categoryId: string, listingId: string) => void,
): HTMLElement {
  const s = (el: HTMLElement, css: string) => { el.style.cssText = css; return el }
  const div = (css = '') => s(document.createElement('div'), css)
  const a = (href: string, text: string, css = '') => {
    const el = s(document.createElement('a'), css) as HTMLAnchorElement
    el.href = href; el.textContent = text
    return el
  }

  const wrap = div('max-width:240px;font-family:inherit;line-height:1.35')

  const canView = !!onViewListing && !!p.filterId && p.filterId !== HOSPITALS_FILTER_ID
  if (canView) {
    const btn = s(document.createElement('button'), 'font-weight:600;color:#2563eb;font-size:14px;background:none;border:none;padding:0;cursor:pointer;text-align:left')
    btn.textContent = p.name
    btn.addEventListener('click', () => onViewListing!(p.filterId!, p.id))
    wrap.appendChild(btn)
  } else {
    const name = div('font-weight:600;color:#0f172a;font-size:14px')
    name.textContent = p.name
    wrap.appendChild(name)
  }

  if (p.categoryLabel) {
    const cat = div('color:#64748b;font-size:12px;margin-top:1px')
    cat.textContent = p.categoryLabel
    wrap.appendChild(cat)
  }

  if (p.address) {
    const addr = div('color:#334155;font-size:12px;margin-top:6px')
    addr.textContent = p.address
    wrap.appendChild(addr)
  }

  if (p.phone) {
    const phoneRow = div('margin-top:4px;font-size:12px')
    phoneRow.appendChild(a(`tel:${p.phone}`, p.phone, 'color:#2563eb'))
    wrap.appendChild(phoneRow)
  }

  const dirRow = div('margin-top:6px;font-size:12px')
  const dirLink = a(directionsUrl(p.address || { lat: p.lat, lng: p.lng }), 'Directions ↗', 'color:#2563eb')
  dirLink.target = '_blank'; dirLink.rel = 'noopener'
  dirRow.appendChild(dirLink)
  wrap.appendChild(dirRow)

  return wrap
}

// The "you are here" dot: a solid blue marker with a white ring and an
// expanding pulse so it's unmistakable against the category pins. Keyframes are
// injected once, app-wide.
function buildUserDot(): HTMLElement {
  if (!document.getElementById('jpc-userdot-style')) {
    const style = document.createElement('style')
    style.id = 'jpc-userdot-style'
    style.textContent =
      '@keyframes jpcPulse{0%{transform:scale(.5);opacity:.6}70%{transform:scale(2.4);opacity:0}100%{opacity:0}}'
    document.head.appendChild(style)
  }
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:relative;width:22px;height:22px'
  const pulse = document.createElement('div')
  pulse.style.cssText =
    'position:absolute;inset:0;border-radius:9999px;background:#2563eb;animation:jpcPulse 1.8s ease-out infinite'
  const dot = document.createElement('div')
  dot.style.cssText =
    'position:absolute;inset:5px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)'
  wrap.append(pulse, dot)
  return wrap
}

/** The interactive Google map: one advanced marker per point, a distinct "you
 *  are here" marker for the visitor, an info window on click, and a viewport
 *  auto-fit to whatever points are currently shown. */
export default function ResourceMap({ points, userLocation, follow = true, onResumeFollow, fallbackCenter = DEFAULT_CENTER, onViewListing, onMarkerClick, focusPoints, square, hasSidebar }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const [ready, setReady] = useState(false)
  const [authFailed, setAuthFailed] = useState(mapsAuthFailed())

  // The sidebar panel only actually overlays the map at lg+ (1024px) — below
  // that it's a normal block underneath instead (see ResourceMapView.tsx),
  // so the centering compensation below must only kick in when both this
  // prop AND the live viewport agree it's actually overlaying right now.
  // `useIsMobile` is called unconditionally (Rules of Hooks) even when
  // `hasSidebar` is false; the `&&` combine happens after.
  const isWideViewport = useIsMobile('(min-width: 1024px)')
  const sidebarOverlaying = !!hasSidebar && isWideViewport
  const sidebarOverlayingRef = useRef(sidebarOverlaying)
  useEffect(() => { sidebarOverlayingRef.current = sidebarOverlaying }, [sidebarOverlaying])

  // Read these inside the marker effect via refs so it does NOT rebuild markers
  // when the live GPS position ticks or the callback identity changes — only
  // when the actual points change. Rebuilding on every GPS tick was destroying
  // the marker an open info window was anchored to, closing it mid-tap.
  const onViewListingRef = useRef(onViewListing)
  const onMarkerClickRef = useRef(onMarkerClick)
  const userLocationRef = useRef(userLocation)
  useEffect(() => { onViewListingRef.current = onViewListing }, [onViewListing])
  useEffect(() => { onMarkerClickRef.current = onMarkerClick }, [onMarkerClick])
  useEffect(() => { userLocationRef.current = userLocation }, [userLocation])
  // ── Initialize the map once ──────────────────────────────────────────────
  useEffect(() => {
    if (!MAPS_API_KEY || mapsAuthFailed()) return
    let cancelled = false
    const unsubscribe = onMapsAuthFailure(() => setAuthFailed(true))

    loadGoogleMaps()
      .then(() => Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')]))
      .then(() => {
        if (cancelled || !containerRef.current) return
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: fallbackCenter,
          zoom: 12,
          mapId: 'resource_map',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
        infoWindowRef.current = new google.maps.InfoWindow()
        // Click-away to dismiss: tapping empty map closes the open info window
        // (marker taps fire 'gmp-click' and don't bubble here, so they still open).
        mapRef.current.addListener('click', () => infoWindowRef.current?.close())
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setAuthFailed(true)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync category/hospital markers whenever the visible points change ─────
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return

    markersRef.current.forEach((m) => (m.map = null))
    markersRef.current = []

    const bounds = new google.maps.LatLngBounds()
    for (const p of points) {
      const pin = new google.maps.marker.PinElement({
        background: p.color,
        borderColor: '#ffffff',
        glyph: p.glyph ?? null,
        glyphColor: '#ffffff',
        scale: 1,
      })
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        content: pin.element,
      })
      marker.addListener('gmp-click', () => {
        onMarkerClickRef.current?.(p)
        const iw = infoWindowRef.current
        if (!iw) return
        iw.setContent(buildInfoContent(p, onViewListingRef.current))
        iw.open({ map, anchor: marker })
      })
      markersRef.current.push(marker)
      bounds.extend({ lat: p.lat, lng: p.lng })
    }

    // Don't auto-reframe to the points if the visitor has a location set —
    // keeping "where am I" in view matters more than framing every pin.
    if (userLocationRef.current) return
    if (points.length === 1) {
      const startZoom = map.getZoom() ?? 15
      map.panTo(bounds.getCenter())
      smoothZoomTo(map, 15, startZoom)
      // Shift the true center right by half the sidebar's occluded width, so
      // the pin (which stays put) renders centered within the visible area
      // instead of the full container's middle (half of which is covered).
      if (sidebarOverlayingRef.current) map.panBy(SIDEBAR_OCCLUSION_PX / 2, 0)
    } else if (points.length > 1) {
      const padding = sidebarOverlayingRef.current ? { top: 64, right: 64 + SIDEBAR_OCCLUSION_PX, bottom: 64, left: 64 } : 64
      // Same "measure via a synchronous fitBounds, revert, then glide there"
      // trick as the focus-points effect below — see its comment for why
      // this doesn't flash the intermediate state.
      const startCenter = map.getCenter()
      const startZoom = map.getZoom()
      map.fitBounds(bounds, padding)
      const targetCenter = map.getCenter()
      const targetZoom = map.getZoom()
      if (startCenter) map.setCenter(startCenter)
      if (startZoom != null) map.setZoom(startZoom)
      if (targetCenter) map.panTo(targetCenter)
      if (targetZoom != null && startZoom != null) smoothZoomTo(map, targetZoom, startZoom)
    }
    // Rebuild only when the points themselves change — GPS ticks and callback
    // identity (incl. sidebarOverlaying, read via ref) are read via refs so
    // an open info window survives them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, ready])

  // ── Force-frame isolated points (a facility or a whole category, tapped in
  //    a list beside the map) ────────────────────────────────────────────────
  // Runs after the effect above, so this wins when both fire together (e.g.
  // isolating changes `points` too). A stable string key (not the array
  // reference, which is new every render) is the real dependency, so this
  // only refires when the actual coordinates change.
  const focusKey = useMemo(
    () => (focusPoints && focusPoints.length ? focusPoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|') : ''),
    [focusPoints],
  )
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !focusPoints || focusPoints.length === 0) return
    if (focusPoints.length === 1) {
      const startZoom = map.getZoom() ?? 16
      map.panTo(focusPoints[0])
      smoothZoomTo(map, 16, startZoom)
      // Same sidebar-occlusion compensation as the effect above.
      if (sidebarOverlayingRef.current) map.panBy(SIDEBAR_OCCLUSION_PX / 2, 0)
    } else {
      const bounds = new google.maps.LatLngBounds()
      focusPoints.forEach((p) => bounds.extend(p))
      const padding = sidebarOverlayingRef.current ? { top: 64, right: 64 + SIDEBAR_OCCLUSION_PX, bottom: 64, left: 64 } : 64
      // `fitBounds` computes its target center/zoom synchronously (the map
      // already knows its own pixel size), so calling it and then instantly
      // reading the result back — before the browser paints anything — lets
      // us capture where it WOULD land, revert to where we started, and then
      // glide there ourselves via panTo/smoothZoomTo instead of snapping.
      const startCenter = map.getCenter()
      const startZoom = map.getZoom()
      map.fitBounds(bounds, padding)
      const targetCenter = map.getCenter()
      const targetZoom = map.getZoom()
      if (startCenter) map.setCenter(startCenter)
      if (startZoom != null) map.setZoom(startZoom)
      if (targetCenter) map.panTo(targetCenter)
      if (targetZoom != null && startZoom != null) smoothZoomTo(map, targetZoom, startZoom)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready])

  // ── The visitor's "you are here" marker, centered on when set ─────────────
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return

    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.map = null
        userMarkerRef.current = null
      }
      return
    }

    if (!userMarkerRef.current) {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: userLocation,
        title: 'You are here',
        content: buildUserDot(),
        zIndex: 9999,
      })
      marker.addListener('gmp-click', () => {
        const iw = infoWindowRef.current
        if (!iw) return
        iw.setContent('<div style="font-weight:600;color:#2563eb;font-size:13px">📍 You are here</div>')
        iw.open({ map, anchor: marker })
      })
      userMarkerRef.current = marker
    } else {
      userMarkerRef.current.position = userLocation
    }

    // Only pan/zoom when follow mode is on so the user can browse freely while
    // their dot still moves in the background.
    if (follow) {
      const startZoom = map.getZoom() ?? 14
      map.panTo(userLocation)
      if (startZoom < 13) smoothZoomTo(map, 14, startZoom)
    }
  }, [userLocation, follow, ready])

  const centerOnMe = () => {
    const map = mapRef.current
    if (!map || !userLocation) return
    const startZoom = map.getZoom() ?? 15
    map.panTo(userLocation)
    smoothZoomTo(map, 15, startZoom)
    onResumeFollow?.()
  }

  if (!MAPS_API_KEY || authFailed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-slate-100 p-6 text-center text-sm text-slate-500 ${square ? '' : 'rounded-2xl'}`}>
        The map couldn’t load. Check that the Google Maps API key is configured and the
        Maps JavaScript API is enabled.
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* No rounded-2xl here — this div paints nothing of its own (Google
          Maps fills it with tiles), so any rounding was already inert; the
          real corner shape comes entirely from the parent card's own
          overflow-hidden clip (see ResourceMapView.tsx). */}
      <div ref={containerRef} className="h-full w-full" />
      {ready && userLocation && (
        <button
          onClick={centerOnMe}
          className={`absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold shadow-md ring-1 ring-slate-900/10 cursor-pointer transition-colors ${
            follow
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-blue-600 hover:bg-blue-50'
          }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${follow ? 'bg-white ring-blue-400' : 'bg-blue-600 ring-white'}`}
            aria-hidden="true"
          />
          {follow ? 'Following' : 'Re-center'}
        </button>
      )}
    </div>
  )
}
