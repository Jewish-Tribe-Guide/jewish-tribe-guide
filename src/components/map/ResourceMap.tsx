'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, MAPS_API_KEY, mapsAuthFailed, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { directionsUrl, type LatLng } from '@/lib/googleMapsLinks'
import { community } from '@/community.config'
import { useIsMobile } from '@/lib/useIsMobile'
import type { DirectoryResource } from '@/types'

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
  /** The underlying listing, when this point has one (absent for hospitals) —
   *  carried through so a marker tap can show full details without a second
   *  lookup. See MapPlaceDetail. */
  raw?: DirectoryResource
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
  /** When provided, tapping a marker calls this instead of opening the small
   *  Google info-window bubble — the mobile map uses it to bring up the
   *  bottom sheet's place detail instead, Google-Maps-app-style. Desktop
   *  leaves this unset and keeps the info-window behavior. */
  onSelectPoint?: (point: MapPoint) => void
  /** Tapping empty map (not a marker) — mobile uses this to drop the bottom
   *  sheet back to peek height, keeping any selected place so dragging back
   *  up returns to it instead of losing it in favor of the nearby list. */
  onBackgroundClick?: () => void
  /** True while a search query or filter chip is narrowing `points` — overrides
   *  the "don't reframe if a user location is set" rule below, so searching
   *  actually takes you to the result(s), same as the Google Maps app. */
  searchActive?: boolean
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
export default function ResourceMap({ points, userLocation, follow = true, onResumeFollow, fallbackCenter = DEFAULT_CENTER, onViewListing, onSelectPoint, onBackgroundClick, searchActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const [ready, setReady] = useState(false)
  const [authFailed, setAuthFailed] = useState(mapsAuthFailed())
  const isMobile = useIsMobile()

  // Read these inside the marker effect via refs so it does NOT rebuild markers
  // when the live GPS position ticks or the callback identity changes — only
  // when the actual points change. Rebuilding on every GPS tick was destroying
  // the marker an open info window was anchored to, closing it mid-tap.
  const onViewListingRef = useRef(onViewListing)
  const onSelectPointRef = useRef(onSelectPoint)
  const onBackgroundClickRef = useRef(onBackgroundClick)
  const userLocationRef = useRef(userLocation)
  const searchActiveRef = useRef(searchActive)
  useEffect(() => { onViewListingRef.current = onViewListing }, [onViewListing])
  useEffect(() => { onSelectPointRef.current = onSelectPoint }, [onSelectPoint])
  useEffect(() => { onBackgroundClickRef.current = onBackgroundClick }, [onBackgroundClick])
  useEffect(() => { userLocationRef.current = userLocation }, [userLocation])
  useEffect(() => { searchActiveRef.current = searchActive }, [searchActive])
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
        // and collapses the mobile sheet (marker taps fire 'gmp-click' and
        // don't bubble here, so they still open/select instead).
        mapRef.current.addListener('click', () => {
          infoWindowRef.current?.close()
          onBackgroundClickRef.current?.()
        })
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

  // ── One-finger pan/zoom on mobile ──────────────────────────────────────────
  // Google's default ('auto'/'cooperative') asks for two fingers to pan
  // whenever it thinks the map sits inside a scrollable page — showing a
  // "Use two fingers to move the map" overlay on the first touch instead of
  // just panning. That's the right call for a map embedded among other
  // scrollable content (desktop's boxed map), but this mobile screen IS the
  // map — nothing behind it needs to scroll — so 'greedy' lets one finger
  // pan/zoom immediately, like the native Google Maps app.
  useEffect(() => {
    mapRef.current?.setOptions({ gestureHandling: isMobile ? 'greedy' : 'auto' })
  }, [isMobile, ready])

  // ── Keep the map's tile layer in sync with its container's actual size ────
  // Google Maps snapshots its container's dimensions at init and never
  // re-checks them — markers still reposition correctly on a resize (their
  // placement is computed from lat/lng, not pixels), but the tile layer
  // itself stays painted for the old size, leaving mostly-blank gray outside
  // it. Anything that changes the container after mount (this full-bleed
  // mobile layout swapping in, a tab switch, orientation change) needs an
  // explicit nudge — the documented fix is triggering 'resize' and
  // re-applying the center so Maps re-fetches tiles for the new viewport.
  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!ready || !map || !container) return

    const ro = new ResizeObserver(() => {
      const center = map.getCenter()
      google.maps.event.trigger(map, 'resize')
      if (center) map.setCenter(center)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [ready])

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
        if (onSelectPointRef.current) {
          onSelectPointRef.current(p)
          return
        }
        const iw = infoWindowRef.current
        if (!iw) return
        iw.setContent(buildInfoContent(p, onViewListingRef.current))
        iw.open({ map, anchor: marker })
      })
      markersRef.current.push(marker)
      bounds.extend({ lat: p.lat, lng: p.lng })
    }

    // Don't auto-reframe to the points if the visitor has a location set —
    // keeping "where am I" in view matters more than framing every pin —
    // unless a search is actively narrowing them, in which case showing the
    // result(s) takes priority, same as the Google Maps app. When a location
    // IS set during a search, fit both it and the result(s) in view together
    // instead of just the result(s) — so searching for something across town
    // doesn't leave you looking at a result with no idea how far it is from
    // where you are.
    if (userLocationRef.current && searchActiveRef.current) {
      bounds.extend(userLocationRef.current)
      map.fitBounds(bounds, 64)
      return
    }
    if (userLocationRef.current) return
    if (points.length === 1) {
      map.setCenter(bounds.getCenter())
      map.setZoom(15)
    } else if (points.length > 1) {
      map.fitBounds(bounds, 64)
    }
    // Rebuild only when the points themselves change — GPS ticks and callback
    // identity are read via refs so an open info window survives them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, ready])

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
      map.panTo(userLocation)
      if ((map.getZoom() ?? 0) < 13) map.setZoom(14)
    }
  }, [userLocation, follow, ready])

  const centerOnMe = () => {
    const map = mapRef.current
    if (!map || !userLocation) return
    map.panTo(userLocation)
    map.setZoom(15)
    onResumeFollow?.()
  }

  if (!MAPS_API_KEY || authFailed) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center rounded-2xl bg-slate-100 p-6 text-center text-sm text-slate-500">
        The map couldn’t load. Check that the Google Maps API key is configured and the
        Maps JavaScript API is enabled.
      </div>
    )
  }

  return (
    // flex-1/min-h-0 (not a plain h-full percentage) all the way down to the
    // actual map div: a percentage height only resolves against an ancestor
    // with an explicit height, and a flex-grow-resolved height (like this
    // component's own parent uses on the mobile full-bleed map) doesn't
    // count — each level needs to keep passing size down via flex, or
    // everything below silently collapses to 0 height.
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div ref={containerRef} className="w-full min-h-0 flex-1 rounded-2xl" />
      {ready && userLocation && (
        <button
          onClick={centerOnMe}
          // bottom-[4.75rem] on mobile clears MobileNearbySheet's peek height
          // (64px) plus a little margin; desktop has no sheet, so bottom-3.
          className={`absolute bottom-[4.75rem] right-3 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold shadow-md ring-1 ring-slate-900/10 cursor-pointer transition-colors sm:bottom-3 ${
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
