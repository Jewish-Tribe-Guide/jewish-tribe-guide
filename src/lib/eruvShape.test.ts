import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LINE_COLOR, lineColorOf, lineFetchUrl, missingNames, parseLineFile, partNames, sameLine, shownMap, withLineColor, type EruvLineFile } from './eruvLine'
import { labelPoint, metresFrom } from './eruvShape'

// The eruvim's own map files, as published Oct 7 2026: Center City's
// map-data.geojson, and the others' Google My Maps.
const fixture = (f: string) => parseLineFile(readFileSync(join(__dirname, '__fixtures__/eruv', f), 'utf8'))
const CC = fixture('center-city.geojson')
const UC = fixture('university-city.kml')
const LM = fixture('lower-merion.kml')
const NE = fixture('northeast.kml')
const EP = fixture('elkins-park.kml')
const EP_ROUTE = 'Directions from Elkins Park House to Young Israel of Elkins Park'
// The ten pieces of Center City's file its own site doesn't draw (its
// page's `boundarySegments` uses the other 21), migration 076.
const CC_LEFT_OUT = ['Washington Border', 'Front St Border', "Grey's Ferry Border", 'South Street Bridge', 'Line 25', 'Line 26', 'Line 27', 'Line 28', 'Line 29', 'Line 30']

describe('parseLineFile', () => {
  it('reads GeoJSON and KML into named lines of [lat, lng]', () => {
    expect(CC.lines).toHaveLength(31)
    expect(CC.lines[0]).toMatchObject({ name: 'Washington Border' })
    expect(CC.lines[0].points[0]).toEqual([39.940146, -75.184937])
    expect(UC.lines.map((l) => l.name)).toEqual(['Main Eruv Boundary', 'Penn Park Boundary'])
    expect(LM.lines.filter((l) => l.name === 'Lower Merion Eruv Boundary')).toHaveLength(8)
  })
  it('a page that isn’t a map file is an error', () => {
    expect(() => parseLineFile('<html><body>Eruv map</body></html>')).toThrow('Not a GeoJSON or KML file')
    expect(() => parseLineFile('{"type":"FeatureCollection","features":[]}')).toThrow('No lines in the file')
  })
  it('Google My Maps links fetch their KML', () => {
    expect(lineFetchUrl('https://www.google.com/maps/d/viewer?mid=1PfS1qLpjM4WYW7eQITxRA8vlrs2LdROs')).toBe('https://www.google.com/maps/d/kml?mid=1PfS1qLpjM4WYW7eQITxRA8vlrs2LdROs&forcekml=1')
    expect(lineFetchUrl('https://www.google.com/maps/d/embed?mid=1SaMJDaGuBq1fHZun3FyKUHFYsu0aYms&ehbc=2E312F')).toBe('https://www.google.com/maps/d/kml?mid=1SaMJDaGuBq1fHZun3FyKUHFYsu0aYms&forcekml=1')
    expect(lineFetchUrl('https://www.centercityeruv.com/map-data.geojson')).toBe('https://www.centercityeruv.com/map-data.geojson')
  })
})

describe('each map as the eruv draws it (Oct 12)', () => {
  it('its lines in its own colours and widths: University City’s blue eruv and pink Penn Park', () => {
    expect(UC.lines.map((l) => [l.name, l.color, l.width])).toEqual([
      ['Main Eruv Boundary', '#01579b', 11.269],
      ['Penn Park Boundary', '#c2185b', 8.75],
    ])
  })
  it('Lower Merion’s red, the Main Line’s blue, the Lankenau route’s green', () => {
    const colour = (name: string) => [...new Set(LM.lines.filter((l) => l.name === name).map((l) => l.color))]
    expect(colour('Lower Merion Eruv Boundary')).toEqual(['#ff0000'])
    expect(colour('Main Line Eruv Boundary')).toEqual(['#0000ff'])
    expect(colour('Lankenau Hospital Route')).toEqual(['#009900'])
  })
  it('a shaded area keeps its shading: the Northeast', () => {
    expect(NE.lines).toHaveLength(1)
    expect(NE.lines[0].fill).toEqual({ color: '#ccffff', opacity: 0.47 })
  })
  it('its markers, with their notes: a plain pin is its colour, anything else its picture', () => {
    const crossing = LM.marks!.find((m) => m.name === 'Crossing A')!
    expect(crossing.note).toBe('The crossing tunnel under the rail line at the Merion Station')
    expect(crossing.icon).toMatch(/22-blue-dot\.png$/)
    const entry = UC.marks!.find((m) => m.name === 'Entry to Penn Park')!
    expect(entry).toMatchObject({ color: '#c2185b' })
    expect(entry.icon).toBeUndefined()
    expect(LM.marks!.filter((m) => /Reroute Alert/.test(m.name)).length).toBeGreaterThan(0)
  })
  it('a file that sets no colours (Center City’s) leaves them to the map', () => {
    expect(CC.lines.every((l) => l.color === undefined)).toBe(true)
  })
})

describe('what the guide shows of a map', () => {
  it('without the parts an admin left out: Center City as its own site draws it', () => {
    const shown = shownMap(CC, CC_LEFT_OUT)
    expect(shown.lines).toHaveLength(21)
    expect(partNames(shown)).not.toContain('Washington Border')
  })
  it('without its markers when they’re hidden (the Northeast’s shuls), and with them otherwise', () => {
    expect(NE.marks!.length).toBeGreaterThan(0)
    expect(shownMap(NE, [], true).marks).toBeUndefined()
    expect(shownMap(LM, []).marks).toEqual(LM.marks)
  })
  it('a left-out name the map no longer has is missing', () => {
    expect(missingNames(CC, CC_LEFT_OUT)).toEqual([])
    expect(missingNames(CC, ['Washington Border', 'Line 99'])).toEqual(['Line 99'])
    expect(missingNames(EP, [EP_ROUTE])).toEqual([])
  })
  it('its lines in a colour an admin chose (Oct 15: the Northeast’s pale cyan), no shading, and nothing else of it changed', () => {
    expect(NE.lines[0].color).toBe('#ccffff')
    const ours = withLineColor(NE, '#1d4ed8')
    expect(ours.lines.map((l) => l.color)).toEqual(['#1d4ed8'])
    // Its pale shading went on showing under the new line: gone, but the
    // area stays (unseen), so tapping inside the eruv still picks it.
    expect(NE.lines[0].fill).toEqual({ color: '#ccffff', opacity: 0.47 })
    expect(ours.lines[0].fill).toEqual({ color: '#1d4ed8', opacity: 0 })
    // Where it goes, its width and its markers are still theirs.
    const unstyled = (f: typeof NE) => f.lines.map((l) => ({ ...l, color: undefined, fill: undefined }))
    expect(unstyled(ours)).toEqual(unstyled(NE))
    expect(ours.marks).toEqual(NE.marks)
    // Every line, Lower Merion's three colours too.
    expect(new Set(withLineColor(LM, '#000000').lines.map((l) => l.color))).toEqual(new Set(['#000000']))
    // A line with no shading isn't given any.
    expect(withLineColor(LM, '#000000').lines.filter((l) => l.fill).length).toBe(LM.lines.filter((l) => l.fill).length)
    // The file itself isn't touched: it's what's kept, and compared.
    expect(NE.lines[0].color).toBe('#ccffff')
    expect(NE.lines[0].fill).toEqual({ color: '#ccffff', opacity: 0.47 })
  })
  it('no colour chosen, its own', () => {
    expect(withLineColor(NE, null)).toBe(NE)
    expect(withLineColor(CC, undefined)).toBe(CC)
  })
  it('the colour its lines are drawn in, for the picker', () => {
    expect(lineColorOf(NE, null)).toBe('#ccffff')
    expect(lineColorOf(NE, '#1d4ed8')).toBe('#1d4ed8')
    expect(lineColorOf(CC, null)).toBe(DEFAULT_LINE_COLOR)
    expect(lineColorOf(null, null)).toBe(DEFAULT_LINE_COLOR)
  })
  it('a read compares as a whole', () => {
    expect(sameLine(UC, JSON.parse(JSON.stringify(UC)))).toBe(true)
    expect(sameLine(UC, shownMap(UC, ['Penn Park Boundary']))).toBe(false)
  })
})

// A point in a ring, to check where a name lands.
const inRing = ([lat, lng]: [number, number], ring: [number, number][]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

describe('labelPoint: where an eruv’s name is written', () => {
  it('well inside it', () => {
    expect(inRing(labelPoint(NE)!, NE.lines[0].points)).toBe(true)
    const ep = shownMap(EP, [EP_ROUTE])
    expect(inRing(labelPoint(ep)!, ep.lines[0].points)).toBe(true)
    // Center City's, in Center City or South Philadelphia, east of the
    // Schuylkill.
    const [lat, lng] = labelPoint(shownMap(CC, CC_LEFT_OUT))!
    expect(lat).toBeGreaterThan(39.91)
    expect(lat).toBeLessThan(39.97)
    expect(lng).toBeGreaterThan(-75.185)
  })
  it('inside an L, where the middle of its box is outside', () => {
    const ring: [number, number][] = [[40, -75], [40, -74.98], [40.005, -74.98], [40.005, -74.995], [40.02, -74.995], [40.02, -75], [40, -75]]
    const p = labelPoint({ lines: [{ name: 'L', points: ring }] })!
    expect(inRing(p, ring)).toBe(true)
  })
  it('nothing without an enclosed area', () => {
    expect(labelPoint({ lines: [{ name: 'x', points: [[40, -75], [40.01, -75]] }] })).toBeNull()
  })
})

describe('metresFrom: the eruv nearest someone', () => {
  it('how far from its nearest line', () => {
    const line: EruvLineFile = { lines: [{ name: 'x', points: [[40, -75], [40, -74.99]] }] }
    expect(metresFrom(line, [40, -74.995])).toBeLessThan(1)
    expect(metresFrom(line, [40.009, -74.995])).toBeGreaterThan(990)
    expect(metresFrom(line, [40.009, -74.995])).toBeLessThan(1010)
  })
  it('Rittenhouse Square is nearer Center City’s line than University City’s', () => {
    const at: [number, number] = [39.9496, -75.1718]
    expect(metresFrom(shownMap(CC, CC_LEFT_OUT), at)).toBeLessThan(metresFrom(UC, at))
  })
  it('a map with no lines is nowhere', () => {
    expect(metresFrom({ lines: [] }, [40, -75])).toBe(Infinity)
  })
})
