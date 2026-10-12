import { labelPoint } from '@/lib/eruvShape'
import type { EruvLineFile } from '@/lib/eruvLine'
import type { EruvTone } from '@/lib/eruv'

// ── The eruvim, drawn on a Google map (Oct 7; their own way Oct 12) ─────────
// Shared by the Eruv page's own map (EruvMap) and the guide's Map tab
// (ResourceMap's Eruvim layer). Each eruv is drawn as it draws its own
// map: its lines in its colours and widths, its shading, its markers with
// their notes (eruvLine.ts reads them). The guide adds only the eruv's
// name, in a tag the colour of its status. Nothing here decides anything.

export type MapEruv = { id: string; name: string; tone: EruvTone; map: EruvLineFile }

export const ERUV_COLOR: Record<EruvTone, string> = { green: '#15803d', amber: '#b45309', red: '#b91c1c', grey: '#475569' }

/** A file that sets no colour (Center City's GeoJSON) is drawn in a dark
 *  red, as Center City draws its own. */
const DEFAULT_LINE = '#b7372d'

/** "University City" for the University City Eruv: the map is all eruvim. */
export const mapLabel = (name: string) => name.replace(/\s+eruv$/i, '')

/** Their widths are for their own map (University City's is 11); ours
 *  carries pins over them. */
const lineWidth = (w: number | undefined) => Math.max(2, Math.min(5, (w ?? 4) * 0.7))

export type DrawnEruv = {
  lines: { line: google.maps.Polyline; opacity: number }[]
  areas: { area: google.maps.Polygon; opacity: number }[]
  marks: google.maps.marker.AdvancedMarkerElement[]
  label: google.maps.marker.AdvancedMarkerElement | null
  bounds: google.maps.LatLngBounds
}

type Handlers = {
  onSelect: (id: string) => void
  onHover?: (id: string | null) => void
  /** Whether tapping a shaded area opens it. The Eruv page, yes: the map is
   *  only eruvim. The Map tab, no: a tap there on empty map closes the open
   *  place, and drops a pin on a long press, and most places are in one. */
  areasClickable: boolean
}

/** What to redraw on: an eruv's map or status changing, not a new array of
 *  the same eruvim (the page re-renders on every clock tick and fix). */
export function eruvDrawKey(eruvim: MapEruv[]): string {
  return eruvim
    .map((e) => `${e.id}:${e.tone}:${e.map.lines.map((l) => `${l.name}/${l.points.length}/${l.points[0]}/${l.color}`).join(',')}:${(e.map.marks ?? []).map((m) => `${m.name}/${m.at}`).join(',')}`)
    .join('|')
}

/** A marker as their map shows it: their picture, or a pin in their colour. */
function markContent(m: NonNullable<EruvLineFile['marks']>[number]): HTMLElement {
  if (m.icon) {
    const img = document.createElement('img')
    img.src = m.icon
    img.alt = ''
    img.width = 24
    img.height = 24
    img.style.cssText = 'display:block;cursor:pointer'
    return img
  }
  return new google.maps.marker.PinElement({ background: m.color ?? '#0288d1', borderColor: '#ffffff', glyphColor: '#ffffff', scale: 0.85 }).element
}

/** A marker's note, opened where it is, as on their map. Built as text,
 *  never as markup: it's the eruv's words. */
function noteContent(m: NonNullable<EruvLineFile['marks']>[number]): HTMLElement {
  const box = document.createElement('div')
  box.style.cssText = 'max-width:260px;font:14px/1.4 system-ui,sans-serif;color:#0f172a'
  const title = document.createElement('div')
  title.textContent = m.name
  title.style.fontWeight = '700'
  box.appendChild(title)
  if (m.note) {
    const note = document.createElement('div')
    note.textContent = m.note
    note.style.cssText = 'margin-top:4px;white-space:pre-line;color:#334155'
    box.appendChild(note)
  }
  return box
}

let notes: google.maps.InfoWindow | null = null

export function drawEruvim(map: google.maps.Map, eruvim: MapEruv[], { onSelect, onHover, areasClickable }: Handlers): Map<string, DrawnEruv> {
  const drawn = new Map<string, DrawnEruv>()
  for (const e of eruvim) {
    const select = () => onSelect(e.id)
    const enter = () => onHover?.(e.id)
    const leave = () => onHover?.(null)
    const d: DrawnEruv = { lines: [], areas: [], marks: [], label: null, bounds: new google.maps.LatLngBounds() }
    for (const l of e.map.lines) {
      const path = l.points.map(([lat, lng]) => ({ lat, lng }))
      const color = l.color ?? DEFAULT_LINE
      if (l.fill) {
        const area = new google.maps.Polygon({
          map,
          paths: [path, ...(l.holes ?? []).map((h) => h.map(([lat, lng]) => ({ lat, lng })))],
          strokeOpacity: 0,
          fillColor: l.fill.color,
          fillOpacity: l.fill.opacity,
          clickable: areasClickable,
        })
        if (areasClickable) {
          area.addListener('click', select)
          area.addListener('mouseover', enter)
          area.addListener('mouseout', leave)
        }
        d.areas.push({ area, opacity: l.fill.opacity })
      }
      const line = new google.maps.Polyline({ map, path, strokeColor: color, strokeOpacity: 0.95, strokeWeight: lineWidth(l.width), clickable: true })
      line.addListener('click', select)
      line.addListener('mouseover', enter)
      line.addListener('mouseout', leave)
      d.lines.push({ line, opacity: 0.95 })
      for (const p of path) d.bounds.extend(p)
    }
    for (const m of e.map.marks ?? []) {
      const mark = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: m.at[0], lng: m.at[1] }, content: markContent(m), title: m.name, gmpClickable: true })
      mark.addListener('gmp-click', () => {
        notes ??= new google.maps.InfoWindow()
        notes.setContent(noteContent(m))
        notes.open({ map, anchor: mark })
      })
      d.marks.push(mark)
    }
    const at = labelPoint(e.map) ?? (d.bounds.isEmpty() ? null : ([d.bounds.getCenter().lat(), d.bounds.getCenter().lng()] as [number, number]))
    if (at) {
      const color = ERUV_COLOR[e.tone]
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
  notes?.close()
  for (const d of drawn.values()) {
    for (const { line } of d.lines) line.setMap(null)
    for (const { area } of d.areas) area.setMap(null)
    for (const m of d.marks) m.map = null
    if (d.label) d.label.map = null
  }
}

/** One eruv picked out ('on'), faded behind another ('off'), or as drawn. */
export function emphasizeEruvim(drawn: Map<string, DrawnEruv>, id: string | null): void {
  for (const [key, d] of drawn) {
    const how = id === key ? 'on' : id != null ? 'off' : 'plain'
    for (const { line, opacity } of d.lines) line.setOptions({ strokeOpacity: how === 'off' ? 0.3 : opacity, zIndex: how === 'on' ? 2 : 1 })
    for (const { area, opacity } of d.areas) area.setOptions({ fillOpacity: how === 'off' ? opacity * 0.3 : opacity })
    for (const m of [...d.marks, ...(d.label ? [d.label] : [])]) {
      m.zIndex = how === 'on' ? 2 : 1
      ;(m.content as HTMLElement).style.opacity = how === 'off' ? '0.45' : '1'
    }
  }
}
