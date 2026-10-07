import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lineFetchUrl, parseLineFile, sameLine, withoutNames, type EruvLineFile } from './eruvLine'
import { locator, shapeOf } from './eruvShape'

// The eruvim's own line files, as published Oct 7 2026: Center City's
// map-data.geojson, University City's and Lower Merion's Google My Maps.
const fixture = (f: string) => parseLineFile(readFileSync(join(__dirname, '__fixtures__/eruv', f), 'utf8'))
const CC = fixture('center-city.geojson')
const UC = fixture('university-city.kml')
const LM = fixture('lower-merion.kml')

describe('parseLineFile', () => {
  it('reads GeoJSON and KML into named lines of [lat, lng]', () => {
    expect(CC.lines).toHaveLength(31)
    expect(CC.lines[0]).toMatchObject({ name: 'Washington Border' })
    expect(CC.lines[0].points[0]).toEqual([39.940146, -75.184937])
    expect(UC.lines.map((l) => l.name)).toEqual(['Main Eruv Boundary', 'Penn Park Boundary'])
    expect(LM.lines.filter((l) => l.name === 'Lower Merion Eruv Boundary')).toHaveLength(8)
  })
  it('a marker isn’t a line; a page that isn’t a line file is an error', () => {
    expect(UC.lines.some((l) => l.name === 'Entry to Penn Park')).toBe(false)
    expect(() => parseLineFile('<html><body>Eruv map</body></html>')).toThrow('Not a GeoJSON or KML file')
    expect(() => parseLineFile('{"type":"FeatureCollection","features":[]}')).toThrow('No lines in the file')
  })
  it('Google My Maps links fetch their KML', () => {
    expect(lineFetchUrl('https://www.google.com/maps/d/viewer?mid=1PfS1qLpjM4WYW7eQITxRA8vlrs2LdROs')).toBe('https://www.google.com/maps/d/kml?mid=1PfS1qLpjM4WYW7eQITxRA8vlrs2LdROs&forcekml=1')
    expect(lineFetchUrl('https://www.google.com/maps/d/embed?mid=1SaMJDaGuBq1fHZun3FyKUHFYsu0aYms&ehbc=2E312F')).toBe('https://www.google.com/maps/d/kml?mid=1SaMJDaGuBq1fHZun3FyKUHFYsu0aYms&forcekml=1')
    expect(lineFetchUrl('https://www.centercityeruv.com/map-data.geojson')).toBe('https://www.centercityeruv.com/map-data.geojson')
  })
  it('a line an admin leaves out, by name', () => {
    const file: EruvLineFile = { lines: [{ name: 'Boundary', points: [[1, 1], [2, 2]] }, { name: 'Fall 2025 Reroute Alert', points: [[3, 3], [4, 4]] }] }
    expect(withoutNames(file, ['fall 2025 reroute alert']).lines.map((l) => l.name)).toEqual(['Boundary'])
    expect(sameLine(file, JSON.parse(JSON.stringify(file)))).toBe(true)
  })
})

describe('the areas each line encloses', () => {
  it('Center City: Center City and South Philadelphia, its gaps joined for an admin to see', () => {
    const s = shapeOf(CC)
    expect(s.areas.length).toBeGreaterThanOrEqual(2)
    expect(s.joins.length).toBe(4)
  })

  const cc = locator(CC)
  it('inside, outside, at the edge', () => {
    expect(cc([39.9496, -75.1718], 20)).toBe('inside') // Rittenhouse Square
    expect(cc([39.925, -75.17], 20)).toBe('inside') // South Philadelphia
    expect(cc([39.935, -75.195], 20)).toBe('inside') // the Grays Ferry piece, closed by a join
    expect(cc([39.945, -75.12], 20)).toBe('outside') // Camden
    expect(cc([39.9522, -75.1932], 20)).toBe('outside') // Penn, across the river
    expect(cc([39.954408, -75.141721], 20)).toBe('edge') // on the line by the Delaware
  })
  it('a line between two of its areas isn’t an edge: Washington Avenue', () => {
    expect(cc([39.93782, -75.1667], 20)).toBe('inside')
  })
  it('a phone that isn’t sure where it is is at the edge sooner', () => {
    // 120 m in from the line by the Delaware.
    expect(cc([39.954408, -75.1431], 20)).toBe('inside')
    expect(cc([39.954408, -75.1431], 150)).toBe('edge')
    expect(cc([39.9496, -75.1718], 2000)).toBe('edge')
  })

  it('University City and Lower Merion', () => {
    const uc = locator(UC)
    expect(uc([39.9522, -75.1932], 20)).toBe('inside') // Penn
    expect(uc([39.9496, -75.1718], 20)).toBe('outside')
    const lm = locator(LM)
    expect(lm([40.0085, -75.2602], 20)).toBe('inside') // Narberth
    expect(lm([40.0076, -75.2341], 20)).toBe('inside') // Bala Cynwyd
    expect(lm([39.9496, -75.1718], 20)).toBe('outside')
  })
})
