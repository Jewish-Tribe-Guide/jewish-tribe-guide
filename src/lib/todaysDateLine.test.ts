import { describe, expect, it } from 'vitest'
import { isDateStamp, withoutTodaysDate } from './todaysDateLine'

const TODAY = '2026-11-24'

describe('a line that only says what day it is', () => {
  it('ShulCloud’s footer, and the ways other sites write the day', () => {
    for (const line of ['Tue, November 24, 2026 14 Kislev 5787', 'Tuesday, Nov. 24 2026', '24 November 2026', '11/24/2026', 'Today is 11/24/26', '2026-11-24', 'Wed, November 25, 2026 15 Kislev 5787']) {
      expect(isDateStamp(line, ['2026-11-23', TODAY, '2026-11-25']), line).toBe(true)
    }
  })

  it('a line with anything else on it stays: a time, an event, another day', () => {
    for (const line of ['Tue, November 24, 2026: Shacharis 6:45am', 'November 24, 2026 Kiddush sponsored by the Cohens', 'Thanksgiving, November 26, 2026', 'Tue, November 17, 2026 7 Kislev 5787', '1/24/2026']) {
      expect(isDateStamp(line, ['2026-11-23', TODAY, '2026-11-25']), line).toBe(false)
    }
  })

  it('takes the stamp out and leaves the page otherwise as it was', () => {
    const page = 'Sundays: 7:00am & 8:00am\nTue, November 24, 2026 14 Kislev 5787\nCongregation Sons of Israel'
    expect(withoutTodaysDate(page, TODAY)).toBe('Sundays: 7:00am & 8:00am\nCongregation Sons of Israel')
    expect(withoutTodaysDate('Sundays: 7:00am & 8:00am', TODAY)).toBe('Sundays: 7:00am & 8:00am')
  })
})
