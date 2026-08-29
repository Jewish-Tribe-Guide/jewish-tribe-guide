import { describe, expect, it } from 'vitest'
import { currentSeason, isOutOfSeason } from './season'

const NY = 'America/New_York'

describe('currentSeason', () => {
  it('reads daylight saving as summer and standard time as winter', () => {
    expect(currentSeason(new Date('2026-07-15T12:00:00Z').getTime(), NY)).toBe('summer')
    expect(currentSeason(new Date('2026-01-15T12:00:00Z').getTime(), NY)).toBe('winter')
  })

  it('turns over at the clock change, not at a fixed date', () => {
    // US DST in 2026: 8 March to 1 November.
    expect(currentSeason(new Date('2026-03-07T12:00:00Z').getTime(), NY)).toBe('winter')
    expect(currentSeason(new Date('2026-03-10T12:00:00Z').getTime(), NY)).toBe('summer')
    expect(currentSeason(new Date('2026-10-30T12:00:00Z').getTime(), NY)).toBe('summer')
    expect(currentSeason(new Date('2026-11-05T12:00:00Z').getTime(), NY)).toBe('winter')
  })

  // Sampling both January and July rather than assuming which is standard is
  // what makes this work below the equator, where the two are swapped.
  it('is not fooled by the southern hemisphere', () => {
    expect(currentSeason(new Date('2026-01-15T12:00:00Z').getTime(), 'Australia/Sydney')).toBe('summer')
    expect(currentSeason(new Date('2026-07-15T12:00:00Z').getTime(), 'Australia/Sydney')).toBe('winter')
  })

  it('returns null for a zone with no clock change to derive from', () => {
    expect(currentSeason(new Date('2026-07-15T12:00:00Z').getTime(), 'America/Phoenix')).toBeNull()
    expect(currentSeason(new Date('2026-01-15T12:00:00Z').getTime(), 'Asia/Jerusalem')).not.toBeNull()
  })
})

describe('isOutOfSeason', () => {
  it('only dims a tagged minyan in the other season', () => {
    expect(isOutOfSeason('winter', 'summer')).toBe(true)
    expect(isOutOfSeason('winter', 'winter')).toBe(false)
    expect(isOutOfSeason(undefined, 'summer')).toBe(false)
  })

  // Never narrow on missing data: an unknown season dims nothing.
  it('dims nothing when the season is unknown', () => {
    expect(isOutOfSeason('winter', null)).toBe(false)
    expect(isOutOfSeason('summer', null)).toBe(false)
  })
})
