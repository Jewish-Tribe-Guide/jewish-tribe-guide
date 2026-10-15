// ── An eruv's map, as it publishes it (Oct 7; styles Oct 12) ────────────────
// Philadelphia's eruvim publish their maps as map data: Center City as
// GeoJSON (the file its own address checker reads), the others as Google
// My Maps, which export KML. Both read into the same thing: named lines of
// [lat, lng] points in the eruv's own colours and widths (a shaded area is
// a line with a fill), and its markers with their notes. The guide shows
// them as the eruv draws them (Oct 12: the user found our redrawing
// confusing).

export type LatLng = [number, number]
export type EruvLine = {
  name: string
  points: LatLng[]
  /** '#rrggbb', as the eruv drew it; absent in a file that sets none. */
  color?: string
  width?: number
  /** A shaded area (a polygon): its fill, and its holes. */
  fill?: { color: string; opacity: number }
  holes?: LatLng[][]
}
export type EruvMark = {
  name: string
  at: LatLng
  /** The marker's note, as plain text. */
  note?: string
  color?: string
  /** The marker's picture (Google's stock icons), when it isn't a plain pin. */
  icon?: string
}
export type EruvLineFile = { lines: EruvLine[]; marks?: EruvMark[] }

/** Where to fetch a line from. A Google My Maps link (viewer, edit or
 *  embed) becomes its KML export; anything else is fetched as given. */
export function lineFetchUrl(url: string): string {
  const mid = url.match(/google\.[a-z.]+\/maps\/d\/(?:u\/\d+\/)?(?:viewer|edit|embed|kml)\?(?:[^#]*&)?mid=([\w-]+)/i)?.[1]
  return mid ? `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1` : url
}

const round = (n: number) => Math.round(n * 1e6) / 1e6

function pointsOf(coords: unknown): LatLng[] {
  if (!Array.isArray(coords)) return []
  return coords
    .filter((c): c is number[] => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number')
    .map((c) => [round(c[1]), round(c[0])] as LatLng)
}

const HEX = /^#?([0-9a-f]{6})$/i
const hex = (v: unknown): string | undefined => (typeof v === 'string' && HEX.test(v.trim()) ? `#${v.trim().replace('#', '').toLowerCase()}` : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : undefined)

/** GeoJSON's styles, where a file has them, are simplestyle's: stroke,
 *  stroke-width, fill, fill-opacity. */
function fromGeoJson(json: unknown): EruvLineFile {
  const lines: EruvLine[] = []
  const marks: EruvMark[] = []
  const features = (json as { features?: unknown[] })?.features ?? ((json as { type?: string })?.type === 'Feature' ? [json] : [])
  for (const f of features as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }[]) {
    const p = f.properties ?? {}
    const name = typeof p.name === 'string' ? p.name : ''
    const g = f.geometry
    if (!g) continue
    const style = { color: hex(p.stroke), width: num(p['stroke-width']) }
    const fillColor = hex(p.fill)
    const fill = fillColor ? { color: fillColor, opacity: num(p['fill-opacity']) ?? 0.6 } : undefined
    if (g.type === 'Point') {
      const [at] = pointsOf([g.coordinates])
      if (at) marks.push(clean({ name, at, note: typeof p.description === 'string' ? textOf(p.description) : undefined, color: hex(p['marker-color']) }))
      continue
    }
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as unknown[][]
      for (const rings of polys) {
        const [outer, ...holes] = rings.map(pointsOf)
        if (outer?.length >= 2) lines.push(clean({ name, points: outer, ...style, fill, holes: holes.length ? holes : undefined }))
      }
      continue
    }
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? (g.coordinates as unknown[]) : []
    for (const part of parts) {
      const points = pointsOf(part)
      if (points.length >= 2) lines.push(clean({ name, points, ...style }))
    }
  }
  return marks.length ? { lines, marks } : { lines }
}

/** No undefined keys: a read compares by its JSON (sameLine). */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${name}>`))?.[1]?.trim()

/** KML writes a colour as aabbggrr. */
function kmlColor(v: string | undefined): { color: string; opacity: number } | undefined {
  const m = v?.trim().match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? { color: `#${m[4]}${m[3]}${m[2]}`.toLowerCase(), opacity: Math.round((parseInt(m[1], 16) / 255) * 100) / 100 } : undefined
}

/** A note's words, without its markup. */
function textOf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

type KmlStyle = { line?: { color: string; opacity: number }; width?: number; poly?: { color: string; opacity: number }; polyFill: boolean; iconColor?: string; icon?: string }

/** A My Maps file's styles, by id. A StyleMap's id stands for its
 *  "normal" style (the other is the highlight on hover). */
function kmlStyles(xml: string): Map<string, KmlStyle> {
  const styles = new Map<string, KmlStyle>()
  for (const m of xml.matchAll(/<Style id="([^"]+)">([\s\S]*?)<\/Style>/g)) {
    const body = m[2]
    const lineStyle = body.match(/<LineStyle>([\s\S]*?)<\/LineStyle>/)?.[1] ?? ''
    const polyStyle = body.match(/<PolyStyle>([\s\S]*?)<\/PolyStyle>/)?.[1]
    const iconStyle = body.match(/<IconStyle>([\s\S]*?)<\/IconStyle>/)?.[1] ?? ''
    styles.set(m[1], {
      line: kmlColor(tag(lineStyle, 'color')),
      width: num(tag(lineStyle, 'width')),
      poly: polyStyle ? kmlColor(tag(polyStyle, 'color')) : undefined,
      polyFill: polyStyle ? tag(polyStyle, 'fill') !== '0' : false,
      iconColor: kmlColor(tag(iconStyle, 'color'))?.color,
      icon: tag(iconStyle, 'href'),
    })
  }
  for (const m of xml.matchAll(/<StyleMap id="([^"]+)">([\s\S]*?)<\/StyleMap>/g)) {
    const normal = m[2].match(/<key>normal<\/key>\s*<styleUrl>#([^<]+)<\/styleUrl>/)?.[1]
    const s = normal ? styles.get(normal) : undefined
    if (s) styles.set(m[1], s)
  }
  return styles
}

const coordsOf = (s: string): LatLng[] =>
  s
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [round(c[1]), round(c[0])] as LatLng)

function fromKml(xml: string): EruvLineFile {
  const styles = kmlStyles(xml)
  const lines: EruvLine[] = []
  const marks: EruvMark[] = []
  for (const pm of xml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []) {
    const name = tag(pm, 'name') ?? ''
    const s = styles.get(pm.match(/<styleUrl>#?([^<]+)<\/styleUrl>/)?.[1]?.trim() ?? '')
    const style = { color: s?.line?.color, width: s?.width }
    for (const m of pm.matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      const points = coordsOf(m[1])
      if (points.length >= 2) lines.push(clean({ name, points, ...style }))
    }
    for (const poly of pm.match(/<Polygon>[\s\S]*?<\/Polygon>/g) ?? []) {
      const outer = coordsOf(poly.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)?.[1] ?? '')
      const holes = [...poly.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)].map((h) => coordsOf(h[1])).filter((h) => h.length >= 3)
      const fill = s?.polyFill && s.poly ? s.poly : undefined
      if (outer.length >= 2) lines.push(clean({ name, points: outer, ...style, fill, holes: holes.length ? holes : undefined }))
    }
    const point = pm.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)?.[1]
    if (point && !/<(LineString|Polygon)>/.test(pm)) {
      const [at] = coordsOf(point)
      const note = tag(pm, 'description')
      // A plain pin (Google's white one, tinted) is its colour; anything
      // else (a coloured dot, a warning sign) is its picture.
      const plain = !s?.icon || /wht-blank/.test(s.icon)
      if (at) marks.push(clean({ name, at, note: note ? textOf(note) : undefined, color: s?.iconColor, icon: plain ? undefined : s?.icon }))
    }
  }
  return marks.length ? { lines, marks } : { lines }
}

/** A map file's lines and markers, from GeoJSON or KML. Throws on anything
 *  else, or a file with no lines in it. */
export function parseLineFile(text: string): EruvLineFile {
  const t = text.trim()
  const file = t.startsWith('{') || t.startsWith('[') ? fromGeoJson(JSON.parse(t)) : t.includes('<kml') || t.includes('<Placemark') ? fromKml(t) : null
  if (!file) throw new Error('Not a GeoJSON or KML file')
  if (file.lines.length === 0) throw new Error('No lines in the file')
  return file
}

/** Whether two reads of a map are the same map. */
export function sameLine(a: EruvLineFile | null, b: EruvLineFile | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** What the guide shows of an eruv's map: without the parts an admin left
 *  out ("Fall 2025 Reroute Alert"), by name, and without its markers when
 *  the admin hid them. */
export function shownMap(file: EruvLineFile, leftOut: readonly string[], hideMarks = false): EruvLineFile {
  const out = new Set(leftOut.map((n) => n.trim().toLowerCase()))
  const keep = (x: { name: string }) => !out.has(x.name.trim().toLowerCase())
  const marks = hideMarks ? [] : (file.marks ?? []).filter(keep)
  return marks.length ? { lines: file.lines.filter(keep), marks } : { lines: file.lines.filter(keep) }
}

/** A file that sets no colour (Center City's GeoJSON) is drawn in a dark
 *  red, as Center City draws its own. */
export const DEFAULT_LINE_COLOR = '#b7372d'

/** Its lines in the colour an admin chose (Oct 15: Northeast draws its own
 *  in a cyan so pale it barely shows on the map). Only the lines' colour:
 *  where they go, their widths, the shading and the markers stay theirs.
 *  No colour chosen, the file as it is. */
export function withLineColor(file: EruvLineFile, color: string | null | undefined): EruvLineFile {
  return color ? { ...file, lines: file.lines.map((l) => ({ ...l, color })) } : file
}

/** The colour its lines are drawn in, when it's one: the admin's, or the
 *  first the file sets, or the default. For the admin's colour picker. */
export const lineColorOf = (file: EruvLineFile | null, chosen: string | null | undefined): string =>
  chosen ?? file?.lines.find((l) => l.color)?.color ?? DEFAULT_LINE_COLOR

/** The names a map file has, its lines' and its markers'. */
export function partNames(file: EruvLineFile): string[] {
  return [...new Set([...file.lines, ...(file.marks ?? [])].map((x) => x.name).filter(Boolean))]
}

/** Left-out names the file no longer has: the eruv renamed or removed
 *  them, so whatever replaced them is showing. */
export function missingNames(file: EruvLineFile, leftOut: readonly string[]): string[] {
  const has = new Set(partNames(file).map((n) => n.trim().toLowerCase()))
  return leftOut.filter((n) => !has.has(n.trim().toLowerCase()))
}
