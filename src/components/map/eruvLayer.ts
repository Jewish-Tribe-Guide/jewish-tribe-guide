import { labelPoint, shapeOf } from '@/lib/eruvShape'
import type { EruvLineFile } from '@/lib/eruvLine'
import type { EruvTone } from '@/lib/eruv'

// ── The eruvim, drawn on a Google map (Oct 7) ───────────────────────────────
// Shared by the Eruv page's own map (EruvMap) and the guide's Map tab
// (ResourceMap's Eruvim layer), so an eruv looks the same on both: its own
// line in its status's colour, its area faintly filled, and its name inside
// it. Nothing here decides anything: the lines are the eruvim's, as an admin
// approved them, and the colour is their status.

export type MapEruv = { id: string; name: string; tone: EruvTone; line: EruvLineFile }

export const ERUV_COLOR: Record<EruvTone, string> = { green: '#15803d', amber: '#b45309', red: '#b91c1c', grey: '#475569' }

/** "University City" for the University City Eruv: the map is all eruvim. */
export const mapLabel = (name: string) => name.replace(/\s+eruv$/i, '')

export type DrawnEruv = { lines: google.maps.Polyline[]; areas: google.maps.Polygon[]; label: google.maps.marker.AdvancedMarkerElement | null; bounds: google.maps.LatLngBounds }

type Handlers = {
  onSelect: (id: string) => void
  onHover?: (id: string | null) => void
  /** Whether tapping inside an eruv (not on its line or name) opens it.
   *  The Eruv page, yes: the map is only eruvim. The Map tab, no: a tap
   *  there on empty map closes the open place, and drops a pin on a long
   *  press, and most of its places are inside an eruv. */
  areasClickable: boolean
}

/** What to redraw on: an eruv's line or status changing, not a new array
 *  of the same eruvim (the page re-renders on every clock tick and fix). */
export function eruvDrawKey(eruvim: MapEruv[]): string {
  return eruvim.map((e) => `${e.id}:${e.tone}:${e.line.lines.map((l) => `${l.name}/${l.points.length}/${l.points[0]}`).join(',')}`).join('|')
}

export function drawEruvim(map: google.maps.Map, eruvim: MapEruv[], { onSelect, onHover, areasClickable }: Handlers): Map<string, DrawnEruv> {
  const drawn = new Map<string, DrawnEruv>()
  for (const e of eruvim) {
    const color = ERUV_COLOR[e.tone]
    const select = () => onSelect(e.id)
    const enter = () => onHover?.(e.id)
    const leave = () => onHover?.(null)
    const d: DrawnEruv = { lines: [], areas: [], label: null, bounds: new google.maps.LatLngBounds() }
    for (const area of shapeOf(e.line).areas) {
      const poly = new google.maps.Polygon({ map, paths: area.map(([lat, lng]) => ({ lat, lng })), strokeOpacity: 0, fillColor: color, fillOpacity: 0.1, clickable: areasClickable })
      if (areasClickable) {
        poly.addListener('click', select)
        poly.addListener('mouseover', enter)
        poly.addListener('mouseout', leave)
      }
      d.areas.push(poly)
    }
    for (const l of e.line.lines) {
      const path = l.points.map(([lat, lng]) => ({ lat, lng }))
      const line = new google.maps.Polyline({ map, path, strokeColor: color, strokeOpacity: 0.95, strokeWeight: 3, clickable: true })
      line.addListener('click', select)
      line.addListener('mouseover', enter)
      line.addListener('mouseout', leave)
      d.lines.push(line)
      for (const p of path) d.bounds.extend(p)
    }
    const at = labelPoint(e.line)
    if (at) {
      const tag = document.createElement('div')
      tag.textContent = mapLabel(e.name)
      tag.style.cssText = `padding:2px 7px;border-radius:999px;background:#fff;border:1.5px solid ${color};color:#0f172a;font:700 11.5px/1.25 system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.2);transform:translateY(50%);cursor:pointer`
      tag.addEventListener('mouseenter', enter)
      tag.addEventListener('mouseleave', leave)
      // Optional: a name that would overlap a pin or another name hides
      // until the map is zoomed in, as Google's own names do.
      const label = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: at[0], lng: at[1] },
        content: tag,
        title: e.name,
        gmpClickable: true,
        collisionBehavior: 'OPTIONAL_AND_HIDES_LOWER_PRIORITY' as google.maps.CollisionBehavior,
      })
      label.addListener('gmp-click', select)
      d.label = label
    }
    drawn.set(e.id, d)
  }
  return drawn
}

export function clearEruvim(drawn: Map<string, DrawnEruv>): void {
  for (const d of drawn.values()) {
    for (const x of [...d.lines, ...d.areas]) x.setMap(null)
    if (d.label) d.label.map = null
  }
}

/** One eruv picked out ('on'), faded behind another ('off'), or as drawn. */
export function emphasizeEruvim(drawn: Map<string, DrawnEruv>, id: string | null): void {
  for (const [key, d] of drawn) {
    const how = id === key ? 'on' : id != null ? 'off' : 'plain'
    for (const l of d.lines) l.setOptions({ strokeWeight: how === 'on' ? 5 : 3, strokeOpacity: how === 'off' ? 0.35 : 0.95, zIndex: how === 'on' ? 2 : 1 })
    for (const a of d.areas) a.setOptions({ fillOpacity: how === 'on' ? 0.22 : how === 'off' ? 0.04 : 0.1 })
    if (d.label) {
      d.label.zIndex = how === 'on' ? 2 : 1
      ;(d.label.content as HTMLElement).style.opacity = how === 'off' ? '0.45' : '1'
    }
  }
}
