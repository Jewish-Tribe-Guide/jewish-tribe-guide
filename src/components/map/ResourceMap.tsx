'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { loadGoogleMaps, MAPS_API_KEY, mapsAuthFailed, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { directionsUrl, type LatLng } from '@/lib/googleMapsLinks'
import { community } from '@/community.config'
import { needsDarkText } from '@/components/Collapsible'
import {
  TOY_ICON_PATHS,
  TOY_ICON_CIRCLES,
  BED_ICON_PATHS,
  STAR_ICON_PATHS,
  FORK_ICON_PATHS,
  CART_ICON_PATHS,
  CART_ICON_CIRCLES,
  DROP_ICON_PATHS,
} from '@/components/icons'

// Google Maps animates `panTo` smoothly on its own, but `setZoom` always
// jumps straight to the target level — so a click that both re-centers AND
// changes zoom (e.g. focusing a single listing) reads as a pan-then-snap
// instead of one continuous motion. Steps the zoom one level at a time,
// waiting for the map to settle (`idle`) between steps, so the zoom change
// reads as a smooth "flowy" glide alongside the pan instead of an abrupt jump.
function smoothZoomTo(map: google.maps.Map, targetZoom: number, currentZoom: number, onDone?: () => void) {
  if (currentZoom === targetZoom) {
    onDone?.()
    return
  }
  const next = currentZoom + (targetZoom > currentZoom ? 1 : -1)
  map.setZoom(next)
  google.maps.event.addListenerOnce(map, 'idle', () => smoothZoomTo(map, targetZoom, next, onDone))
}

// Category glyphs are admin-configured emoji (🍽️, 🏨, 🕍, …), which render as
// full-color OS emoji glyphs — `PinElement.glyphColor` has no effect on those
// (it only tints monochrome vector glyphs, not color emoji). To get a flat
// monochrome icon look without maintaining a separate emoji→SVG-icon
// mapping, the emoji is wrapped in a DOM element (PinElement's `glyph`
// accepts one) with a CSS filter that crushes it to a solid silhouette:
// `brightness(0)` turns every non-transparent pixel pure black regardless
// of its original color, then an optional `invert(1)` flips that black to
// white — the glyph's own alpha shape survives, just recolored flat
// black-or-white. `dark` picks which: some pin colors (see `getCategoryColor`
// in ResourceMapView) are too light for a white glyph to read against, so
// callers pass `needsDarkText(pin color)` through to decide.
function monoGlyphElement(glyph: string, dark: boolean): HTMLElement {
  const span = document.createElement('span')
  span.textContent = glyph
  span.style.fontSize = '15px'
  span.style.lineHeight = '1'
  span.style.filter = dark ? 'brightness(0)' : 'brightness(0) invert(1)'
  return span
}

// Plain-text pin glyph (currently just hospitals' "H") rendered at an exact
// color instead of `monoGlyphElement`'s black/white filter crush — that
// crush exists only to flatten full-color emoji, which ignore CSS `color`;
// a literal text character has no such problem, so it can just take the
// contrast-aware hue tint directly (see `glyphTintFor` below) the way
// `lineIconElement`'s stroke does.
function coloredTextGlyphElement(text: string, color: string): HTMLElement {
  const span = document.createElement('span')
  span.textContent = text
  span.style.fontSize = '13px'
  span.style.lineHeight = '1'
  span.style.fontWeight = '700'
  span.style.color = color
  return span
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

function hueOf([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let hue = 0
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return hue
}

function hslToHex(hue: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let [rr, gg, bb] = [0, 0, 0]
  if (hue < 60) [rr, gg, bb] = [c, x, 0]
  else if (hue < 120) [rr, gg, bb] = [x, c, 0]
  else if (hue < 180) [rr, gg, bb] = [0, c, x]
  else if (hue < 240) [rr, gg, bb] = [0, x, c]
  else if (hue < 300) [rr, gg, bb] = [x, 0, c]
  else [rr, gg, bb] = [c, 0, x]
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`
}

// Every line-icon pin gets its glyph tinted a version of its own hue that
// actually contrasts against ITS OWN pin color — not just always darker.
// Originally always darkened to a fixed S55/L30 (fine against the old pale
// pastel palette, where every pin was light), but the map's pin colors can
// now span a full light-to-dark gradient (see `gradientColorMap` in
// ResourceMapView.tsx) — darkening an already-dark pin (e.g. deep navy) to
// ANOTHER dark tone left the glyph nearly invisible against it, on request.
// This computes BOTH a dark (S55/L28) and a light (S45/L88) candidate at the
// pin's own hue, measures each one's actual WCAG contrast ratio against the
// pin's real background color, and returns whichever one wins — so a pale
// pin still gets a deep-hue glyph (as before) and a dark pin gets a
// pale-hue one instead, automatically, for any color the gradient produces.
function glyphTintFor(hex: string): string {
  const rgb = hexToRgb(hex)
  const hue = hueOf(rgb)
  const bgLum = relativeLuminance(rgb)
  const dark = hslToHex(hue, 0.55, 0.28)
  const light = hslToHex(hue, 0.45, 0.88)
  const darkContrast = contrastRatio(bgLum, relativeLuminance(hexToRgb(dark)))
  const lightContrast = contrastRatio(bgLum, relativeLuminance(hexToRgb(light)))
  return darkContrast >= lightContrast ? dark : light
}

// Line-art alternatives to every category's emoji glyph (✡ synagogue, 🍴
// restaurant, 🛒 grocery, 🧸 childcare, 🛏️ hotel, 💧 mikvah) — those read as
// chunky, overwhelming solid blobs once crushed to a silhouette at pin size,
// and a crushed emoji can only ever go pure black or white, never the
// contrast-aware hue tint the glyph now needs (see `glyphTintFor`). Drawn as
// open hollow-stroke shapes from the start, so there's nothing to crush —
// just a direct stroke color from `glyphTintFor`. Geometry shared with
// `icons.tsx`'s matching React components (used for the map key's own
// category buttons) via the same path/circle exports, so the pins and
// buttons can never draw different shapes.
type LineIconKey = 'toy' | 'bed' | 'star' | 'fork' | 'cart' | 'drop'
const LINE_ICON_PATHS: Record<LineIconKey, string[]> = {
  toy: TOY_ICON_PATHS,
  bed: BED_ICON_PATHS,
  star: STAR_ICON_PATHS,
  fork: FORK_ICON_PATHS,
  cart: CART_ICON_PATHS,
  drop: DROP_ICON_PATHS,
}
const LINE_ICON_CIRCLES: Partial<Record<LineIconKey, { cx: number; cy: number; r: number }[]>> = {
  toy: TOY_ICON_CIRCLES,
  cart: CART_ICON_CIRCLES,
}
function lineIconElement(icon: LineIconKey, color: string): Element {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', color)
  svg.setAttribute('stroke-width', '2.2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const d of LINE_ICON_PATHS[icon]) {
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  for (const c of LINE_ICON_CIRCLES[icon] ?? []) {
    const circle = document.createElementNS(NS, 'circle')
    circle.setAttribute('cx', String(c.cx))
    circle.setAttribute('cy', String(c.cy))
    circle.setAttribute('r', String(c.r))
    svg.appendChild(circle)
  }
  return svg
}

/** One plottable place on the map. */
export type MapPoint = {
  id: string
  lat: number
  lng: number
  name: string
  address?: string
  phone?: string
  /** Emoji/glyph shown inside the pin (e.g. a category icon) — fallback path
   *  for any category outside the fixed line-icon set below (e.g. a future
   *  admin-added category). Ignored when `lineIcon` or `textGlyph` is set. */
  glyph?: string
  /** Plain-text pin glyph (currently just hospitals' "H") rendered at an
   *  exact color via `coloredTextGlyphElement`, not crushed to black/white
   *  like `glyph` — see that function's doc comment. Takes priority over
   *  `glyph`, ignored when `lineIcon` is set. */
  textGlyph?: string
  /** Line-art override — every fixed category now draws its glyph this way
   *  instead of an emoji (see `LINE_ICON_PATHS` above); `glyph` only remains
   *  as a fallback for categories outside this set. */
  lineIcon?: LineIconKey
  /** Pin background color (hex). */
  color: string
  /** Subtitle shown in the info window (e.g. the category label). */
  categoryLabel?: string
  /** Category id used to deep-link into the directory. Absent for hospitals. */
  filterId?: string
  /** Marks this pin as a search match (see ResourceMapView's
   *  `highlightedListingIds`) — rendered bigger with a gold border instead
   *  of the plain white one every other pin gets, so it stands out among
   *  same-colored neighbors rather than just blending in. */
  highlighted?: boolean
}

const HOSPITALS_FILTER_ID = '__hospitals__'

type Props = {
  points: MapPoint[]
  /** The visitor's live or set location. Rendered as a pulsing blue dot. The
   *  map centers on it once, right when it first appears (tracking just
   *  started) — every update after that just moves the dot silently; only
   *  the "Re-center" button (see below) pans the map again after that. */
  userLocation?: LatLng | null
  /** Fallback center when there are no points to fit (e.g. Center City Philly). */
  fallbackCenter?: { lat: number; lng: number }
  /** Called when the user taps "View listing" in an info window. */
  onViewListing?: (categoryId: string, listingId: string) => void
  /** Called whenever a marker itself is tapped (before the info window even
   *  opens) — lets the parent isolate + expand this point's card in a
   *  `sidebar` list when that point's category is already the one showing
   *  there, so the info surfaces in the list too, not just the info window. */
  onMarkerClick?: (point: MapPoint) => void
  /** Called when the map itself (empty space, not a marker) is clicked —
   *  lets the parent clear whatever listing/category is currently expanded
   *  beside the map, same "click away to dismiss" idea as the info window
   *  closing on this same click below. */
  onMapClick?: () => void
  /** Forces the map to frame exactly these points — a close zoom centered on
   *  a single one, or a bounds-fit enveloping several (e.g. a facility or a
   *  whole category isolated in a list beside the map) — regardless of the
   *  usual "keep the user centered" behavior, since isolating something is a
   *  deliberate, one-off request. */
  focusPoints?: { lat: number; lng: number }[] | null
  /** Skips the "zoom out to fit every visible pin" behavior that otherwise
   *  runs whenever `points` changes with no user location set — used by the
   *  home page's embedded map, which wants to open at a fixed neighborhood
   *  zoom (see `initialZoom` below) instead of zooming out to frame
   *  the whole region's pins the moment they load. `focusPoints` still
   *  reframes deliberately (e.g. isolating a category) regardless of this. */
  skipAutoFit?: boolean
  /** Starting zoom level, before any auto-fit/user-location reframing
   *  takes over. Defaults to 14 (neighborhood-level). The home page's
   *  embedded map passes 13 — one step out, so a bit more of the
   *  surrounding area is visible in the same on-screen frame. */
  initialZoom?: number
  /** Pixel width of whatever's currently floated over the map's own LEFT
   *  edge (the map key's dropdown/detail panels) — when framing a single
   *  focused point or a bounds-fit (see `focusPoints`), the map centers it
   *  in the space actually still visible to the right of that overlay
   *  instead of dead-center under it. 0/omitted centers normally. */
  leftInsetPx?: number
  /** Whether the fullscreen toggle button (bottom-right) should show as
   *  "currently fullscreen" — the fullscreen state itself is owned by
   *  ResourceMapView, not this component: fullscreening THIS component's
   *  own root would only show the map canvas + its own Re-center button,
   *  hiding every other control (search bar, category key row, Select/
   *  Unselect all, live tracking) that ResourceMapView layers on top as
   *  this component's siblings, not its children. */
  isFullscreen?: boolean
  /** Toggles fullscreen on ResourceMapView's own map-area container (see
   *  `isFullscreen` above) — this component only renders the button. */
  onToggleFullscreen?: () => void
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
export default function ResourceMap({ points, userLocation, fallbackCenter = DEFAULT_CENTER, onViewListing, onMarkerClick, onMapClick, focusPoints, skipAutoFit, leftInsetPx, initialZoom = 14, isFullscreen = false, onToggleFullscreen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const [ready, setReady] = useState(false)
  const [authFailed, setAuthFailed] = useState(mapsAuthFailed())

  // Read these inside the marker effect via refs so it does NOT rebuild markers
  // when the live GPS position ticks or the callback identity changes — only
  // when the actual points change. Rebuilding on every GPS tick was destroying
  // the marker an open info window was anchored to, closing it mid-tap.
  const onViewListingRef = useRef(onViewListing)
  const onMarkerClickRef = useRef(onMarkerClick)
  const onMapClickRef = useRef(onMapClick)
  const userLocationRef = useRef(userLocation)
  const leftInsetPxRef = useRef(leftInsetPx)
  useEffect(() => { onViewListingRef.current = onViewListing }, [onViewListing])
  useEffect(() => { onMarkerClickRef.current = onMarkerClick }, [onMarkerClick])
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { userLocationRef.current = userLocation }, [userLocation])
  useEffect(() => { leftInsetPxRef.current = leftInsetPx }, [leftInsetPx])
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
          // Neighborhood-level default instead of the whole metro area —
          // matches the zoom the map already settles at once a visitor's
          // location loads (see the "you are here" effect below), just
          // applied as the starting view too instead of only after that.
          zoom: initialZoom,
          mapId: 'resource_map',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // The vector rendering `mapId` enables also turns on Google's own
          // camera control by default — a pan/tilt/rotate arrows cluster in
          // the bottom-right that clutters/competes with our own "Re-center"
          // button in that same corner. `rotateControl` is the OLDER,
          // raster-map version of this same idea; `cameraControl` is what
          // vector maps actually show, so both need to be off. This map
          // only ever needs straight-down, north-up navigation.
          rotateControl: false,
          cameraControl: false,
          // Explicit zoom +/- buttons, on request — `RIGHT_TOP` so they
          // land clear of the "Re-center"/fullscreen buttons already
          // anchored bottom-right and the map key's own panels along the
          // left edge.
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
          clickableIcons: false,
          // `'greedy'` (was unset, i.e. Google's own default `'auto'`) — on
          // request, map navigation read as choppy/unresponsive. `'auto'`
          // treats this as an embedded-in-a-scrollable-page map: a single
          // mouse-wheel tick over it scrolls the PAGE instead of zooming
          // the map (it shows a "use ctrl+scroll to zoom" overlay and eats
          // the first gesture instead of acting on it), and single-finger
          // touch-drag pans the page too. `'greedy'` makes the map claim
          // every scroll/drag gesture over it immediately, no modifier key
          // or hint overlay first — panning/zooming responds right away
          // instead of feeling like it's fighting the page.
          gestureHandling: 'greedy',
        })
        infoWindowRef.current = new google.maps.InfoWindow()
        // Click-away to dismiss: tapping empty map closes the open info window
        // (marker taps fire 'gmp-click' and don't bubble here, so they still open).
        mapRef.current.addListener('click', () => {
          infoWindowRef.current?.close()
          onMapClickRef.current?.()
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
        // Always white now — was a gold `#ffc145` ring for search-matched
        // pins, on request ("remove that yellow highlight"). `scale` alone
        // still marks a match (bigger pin), no border color change.
        borderColor: '#ffffff',
        glyph: p.lineIcon
          ? lineIconElement(p.lineIcon, glyphTintFor(p.color))
          : p.textGlyph
            ? coloredTextGlyphElement(p.textGlyph, glyphTintFor(p.color))
            : p.glyph
              ? monoGlyphElement(p.glyph, needsDarkText(p.color))
              : null,
        scale: p.highlighted ? 1.3 : 1,
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
    // keeping "where am I" in view matters more than framing every pin. Same
    // for `skipAutoFit` — the embedded home map wants to stay at its fixed
    // initial zoom/center instead of zooming out to fit everything the
    // moment pins load (deliberate reframes still happen via `focusPoints`).
    if (userLocationRef.current || skipAutoFit) return
    if (points.length === 1) {
      const startZoom = map.getZoom() ?? 15
      map.panTo(bounds.getCenter())
      smoothZoomTo(map, 15, startZoom)
    } else if (points.length > 1) {
      // Same "measure via a synchronous fitBounds, revert, then glide there"
      // trick as the focus-points effect below — see its comment for why
      // this doesn't flash the intermediate state.
      const startCenter = map.getCenter()
      const startZoom = map.getZoom()
      map.fitBounds(bounds, 64)
      const targetCenter = map.getCenter()
      const targetZoom = map.getZoom()
      if (startCenter) map.setCenter(startCenter)
      if (startZoom != null) map.setZoom(startZoom)
      if (targetCenter) map.panTo(targetCenter)
      if (targetZoom != null && startZoom != null) smoothZoomTo(map, targetZoom, startZoom)
    }
    // Rebuild only when the points themselves change — GPS ticks and callback
    // identity are read via refs so an open info window survives them.
  }, [points, ready, skipAutoFit])

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
    // Shifts the pin right by half of whatever's currently covering the
    // map's left edge (the map key's dropdown/detail panels), landing it
    // centered in the space actually still visible instead of dead-center
    // under the overlay. Only applied once the target zoom is fully
    // reached (see `smoothZoomTo`'s `onDone`) — a pixel offset applied
    // mid-zoom would drift as the pixels-per-degree ratio keeps changing
    // underneath it.
    const compensate = () => {
      const inset = leftInsetPxRef.current
      if (inset) map.panBy(-inset / 2, 0)
    }
    if (focusPoints.length === 1) {
      const startZoom = map.getZoom() ?? 16
      map.panTo(focusPoints[0])
      smoothZoomTo(map, 16, startZoom, compensate)
    } else {
      const bounds = new google.maps.LatLngBounds()
      focusPoints.forEach((p) => bounds.extend(p))
      // `fitBounds` computes its target center/zoom synchronously (the map
      // already knows its own pixel size), so calling it and then instantly
      // reading the result back — before the browser paints anything — lets
      // us capture where it WOULD land, revert to where we started, and then
      // glide there ourselves via panTo/smoothZoomTo instead of snapping.
      const startCenter = map.getCenter()
      const startZoom = map.getZoom()
      map.fitBounds(bounds, 64)
      const targetCenter = map.getCenter()
      const targetZoom = map.getZoom()
      if (startCenter) map.setCenter(startCenter)
      if (startZoom != null) map.setZoom(startZoom)
      if (targetCenter) map.panTo(targetCenter)
      if (targetZoom != null && startZoom != null) smoothZoomTo(map, targetZoom, startZoom, compensate)
      else compensate()
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
      // Center once, right when tracking starts and the marker first
      // appears — the direct, expected result of tapping "Start live
      // tracking". Every position update AFTER that just moves the dot
      // silently in the background; the map itself never auto-pans again
      // on its own. Re-centering on a later position is only ever the
      // "Re-center" button's job (see `centerOnMe`), not automatic.
      const startZoom = map.getZoom() ?? 14
      map.panTo(userLocation)
      if (startZoom < 13) smoothZoomTo(map, 14, startZoom)
    } else {
      userMarkerRef.current.position = userLocation
    }
  }, [userLocation, ready])

  const centerOnMe = () => {
    const map = mapRef.current
    if (!map || !userLocation) return
    const startZoom = map.getZoom() ?? 15
    map.panTo(userLocation)
    // Same left-edge-occlusion compensation as the focus-points effect
    // above — lands the dot centered in the space actually still visible
    // to the right of whatever dropdown/detail panel is currently open,
    // instead of dead-center under it. Only applied once the target zoom
    // is fully reached — see that effect's own comment for why.
    smoothZoomTo(map, 15, startZoom, () => {
      const inset = leftInsetPxRef.current
      if (inset) map.panBy(-inset / 2, 0)
    })
  }

  // `isFullscreen` is owned by ResourceMapView (see its own doc comment on
  // `mapAreaRef`) — this just reacts to it changing to fix up the map
  // itself, which doesn't detect its container's size changing on its own.
  // Without this it stays rendered at its old (windowed) pixel size and
  // just shows blank space around it once fullscreened. `resize` alone
  // re-measures the container but leaves the visible center wherever it
  // drifted to as the box grew/shrank around a fixed top-left corner, so
  // the center is explicitly restored right after.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const center = map.getCenter()
    google.maps.event.trigger(map, 'resize')
    if (center) map.setCenter(center)
  }, [isFullscreen])

  // Same "trigger resize, restore center" fix as the `isFullscreen` effect
  // above, but general — watches this map's own container for ANY size
  // change (a `ResizeObserver`, not tied to one specific cause) instead of
  // just fullscreen toggling. On request: dragging the title column's width
  // on the desktop home page (Landing.tsx) grows/shrinks this map's own
  // container in real time, and without this the map stayed rendered at
  // its stale pixel size while the search bar above it (a plain block
  // element, not a Google Maps canvas) resized instantly — the two visibly
  // fell out of sync during the drag. `requestAnimationFrame`-coalesced so
  // a rapid drag (many resize notifications per second) only ever triggers
  // one Google Maps resize per animation frame, not one per pixel moved.
  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!ready || !map || !container) return
    let raf = 0
    const observer = new ResizeObserver(() => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const center = map.getCenter()
        google.maps.event.trigger(map, 'resize')
        if (center) map.setCenter(center)
      })
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ready])

  if (!MAPS_API_KEY || authFailed) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-100 p-6 text-center text-sm text-slate-500">
        The map couldn’t load. Check that the Google Maps API key is configured and the
        Maps JavaScript API is enabled.
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-white">
      {/* No rounded-2xl here — this div paints nothing of its own (Google
          Maps fills it with tiles), so any rounding was already inert; the
          real corner shape comes entirely from the parent card's own
          overflow-hidden clip (see ResourceMapView.tsx). */}
      <div ref={containerRef} className="h-full w-full" />
      {/* Only an option to recenter on an ALREADY-live location — shown
          once live tracking is on (`userLocation` set); not a way to turn
          tracking on in the first place (that's "Start live tracking"
          elsewhere), and never triggered automatically — the map only ever
          pans on its own once, right when tracking first starts (see the
          "you are here" effect above); every tap here after that is a
          deliberate, explicit re-center. `right-14` — beside the fullscreen
          toggle now (was stacked above it at `bottom-16`), on request, so
          the two share one row along the bottom edge instead of stacking.
          `#3E6E6E` fill (was `bg-blue-600`) — on request, to match
          "Start live tracking"'s own teal (`FILTER_PILL_ACTIVE` in
          ResourceMapView.tsx) instead of blue, so the two read as the same
          visual family. */}
      {ready && userLocation && (
        <button
          onClick={centerOnMe}
          className="absolute bottom-3 right-14 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-white shadow-md cursor-pointer transition-colors hover:brightness-110"
          style={{ backgroundColor: '#3E6E6E' }}
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-white ring-2 ring-white/40" aria-hidden="true" />
          Re-center
        </button>
      )}
      {/* Fullscreen toggle — bottom-right corner, always available (not
          gated on `userLocation` like Re-center above it can be). Fires
          `onToggleFullscreen`, owned by ResourceMapView (see its
          `mapAreaRef` doc comment for why fullscreen isn't handled
          locally here) rather than the whole page, so everything outside
          the map area stays exactly as it was once you exit again. */}
      {ready && onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit full screen' : 'View full screen'}
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#2D3636] shadow-md ring-1 ring-slate-900/10 cursor-pointer transition-colors hover:bg-slate-50"
        >
          {isFullscreen ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4m7-5l5 5m0 0v-4m0 4h-4" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
