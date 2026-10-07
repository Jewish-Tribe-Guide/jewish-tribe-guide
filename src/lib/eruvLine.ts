// ── An eruv's line, as it publishes it (Oct 7) ──────────────────────────────
// Three of Philadelphia's five eruvim publish their line as map data:
// Center City as GeoJSON (the file its own address checker reads),
// University City and Lower Merion as Google My Maps, which export KML.
// Both read into the same thing: named lines of [lat, lng] points.

export type LatLng = [number, number]
export type EruvLineFile = { lines: { name: string; points: LatLng[] }[] }

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

function fromGeoJson(json: unknown): EruvLineFile {
  const lines: EruvLineFile['lines'] = []
  const features = (json as { features?: unknown[] })?.features ?? ((json as { type?: string })?.type === 'Feature' ? [json] : [])
  for (const f of features as { properties?: { name?: unknown }; geometry?: { type?: string; coordinates?: unknown } }[]) {
    const name = typeof f.properties?.name === 'string' ? f.properties.name : ''
    const g = f.geometry
    if (!g) continue
    const parts =
      g.type === 'LineString' ? [g.coordinates]
      : g.type === 'MultiLineString' || g.type === 'Polygon' ? (g.coordinates as unknown[])
      : g.type === 'MultiPolygon' ? (g.coordinates as unknown[][]).flat()
      : []
    for (const p of parts) {
      const points = pointsOf(p)
      if (points.length >= 2) lines.push({ name, points })
    }
  }
  return { lines }
}

function fromKml(xml: string): EruvLineFile {
  const lines: EruvLineFile['lines'] = []
  for (const pm of xml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []) {
    const name = (pm.match(/<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/)?.[1] ?? '').trim()
    // A line, or a polygon's rings; a placemark's point is a marker, not
    // part of the line.
    for (const m of pm.matchAll(/<(LineString|LinearRing)>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      const points = m[2]
        .trim()
        .split(/\s+/)
        .map((t) => t.split(',').map(Number))
        .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
        .map((c) => [round(c[1]), round(c[0])] as LatLng)
      if (points.length >= 2) lines.push({ name, points })
    }
  }
  return { lines }
}

/** A line file's lines, from GeoJSON or KML. Throws on anything else, or a
 *  file with no lines in it. */
export function parseLineFile(text: string): EruvLineFile {
  const t = text.trim()
  const file = t.startsWith('{') || t.startsWith('[') ? fromGeoJson(JSON.parse(t)) : t.includes('<kml') || t.includes('<Placemark') ? fromKml(t) : null
  if (!file) throw new Error('Not a GeoJSON or KML file')
  if (file.lines.length === 0) throw new Error('No lines in the file')
  return file
}

/** Whether two reads of a line are the same line. */
export function sameLine(a: EruvLineFile | null, b: EruvLineFile | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The line without the parts an admin left out ("Fall 2025 Reroute
 *  Alert"), by name. */
export function withoutNames(file: EruvLineFile, leftOut: readonly string[]): EruvLineFile {
  const out = new Set(leftOut.map((n) => n.trim().toLowerCase()))
  return { lines: file.lines.filter((l) => !out.has(l.name.trim().toLowerCase())) }
}
