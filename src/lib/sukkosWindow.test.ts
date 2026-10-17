import { describe, expect, it } from 'vitest'
import { aroundSukkos, inSeason } from './sukkosWindow'

// A hospital's sukkah, shown from Rosh Hashanah (1 Tishrei) to the end of
// Sukkos (Simchas Torah, 23 Tishrei outside Israel). 5787: Rosh Hashanah is
// Sat Sep 12, 2026; Simchas Torah Sun Oct 4.
const NY = 'America/New_York'
const at = (iso: string) => new Date(`${iso}T12:00:00-04:00`)

describe('aroundSukkos', () => {
  it('from Rosh Hashanah to Simchas Torah, and not a day either side', () => {
    expect(aroundSukkos(at('2026-09-11'), NY)).toBe(false)
    expect(aroundSukkos(at('2026-09-12'), NY)).toBe(true)
    expect(aroundSukkos(at('2026-09-30'), NY)).toBe(true)
    expect(aroundSukkos(at('2026-10-04'), NY)).toBe(true)
    expect(aroundSukkos(at('2026-10-05'), NY)).toBe(false)
  })
  it('in the community’s timezone: late on Simchas Torah in Philadelphia is still Sukkos', () => {
    expect(aroundSukkos(new Date('2026-10-05T03:30:00Z'), NY)).toBe(true) // 11:30 PM Oct 4 in Philadelphia
  })
  it('next year too, with no dates written down', () => {
    // 5788: Rosh Hashanah Sat Oct 2, 2027; Simchas Torah Sun Oct 24.
    expect(aroundSukkos(at('2027-10-01'), NY)).toBe(false)
    expect(aroundSukkos(at('2027-10-02'), NY)).toBe(true)
    expect(aroundSukkos(at('2027-10-24'), NY)).toBe(true)
    expect(aroundSukkos(at('2027-10-25'), NY)).toBe(false)
  })
})

describe('inSeason', () => {
  it('a field with no season always; a Sukkos one only then, and never before the time is known', () => {
    expect(inSeason({}, null, NY)).toBe(true)
    expect(inSeason({ shownAround: 'sukkos' }, null, NY)).toBe(false)
    expect(inSeason({ shownAround: 'sukkos' }, at('2026-09-30'), NY)).toBe(true)
    expect(inSeason({ shownAround: 'sukkos' }, at('2026-10-06'), NY)).toBe(false)
  })
})
