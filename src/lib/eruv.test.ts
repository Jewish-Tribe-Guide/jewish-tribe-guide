import { describe, expect, it } from 'vitest'
import { dialable, eruvView, firstDate, inCheckingHours, isStale, pageText, readStatus, shortDay, staleAfterMs, weekStart, type Eruv } from './eruv'

// The three status pages, as their words read on Oct 7 2026.
const CENTER_CITY =
  'Check an address Get email updates Current Eruv Status Up The Center City Eruv is currently up. Please continue to check the status before Shabbos and Yom Tov. Last updated: Friday, August 28, 2026, 5:47 PM EDT. Next update: As needed.'
const UNIVERSITY_CITY = 'Eruv Jewish Life Penn Hillel University City Eruv The Eruv is Up! Project Overview University City is a neighborhood in West Philadelphia'
const LOWER_MERION = 'Report Eruv Issue Eruv Status The Eruv is UP! Eruv Info 21st of Tishrei 5787 Oct 2nd 2026 The LOWER MERION Eruv is UP! Shabbat Shalom'

const TZ = 'America/New_York'
// Fri Oct 9 2026; candle lighting 6:12 PM.
const CANDLES = 18 * 60 + 12
const at = (iso: string) => new Date(iso)

function eruv(over: Partial<Eruv> = {}): Eruv {
  return {
    id: 'center-city',
    name: 'Center City Eruv',
    covers: null,
    website: null,
    hotline: null,
    alertsUrl: null,
    statusUrl: 'https://www.centercityeruv.com/',
    statusDated: false,
    status: 'up',
    statusWords: 'The Center City Eruv is currently up.',
    statusPostedOn: null,
    statusCheckedAt: '2026-10-09T18:55:00Z',
    statusErrorAt: null,
    statusError: null,
    line: null,
    ...over,
  }
}

describe('readStatus', () => {
  it('reads each eruv’s own wording', () => {
    expect(readStatus(CENTER_CITY)).toEqual({ status: 'up', words: 'The Center City Eruv is currently up.', postedOn: '2026-08-28' })
    expect(readStatus(UNIVERSITY_CITY)).toEqual({ status: 'up', words: 'The Eruv is Up!', postedOn: null })
    expect(readStatus(LOWER_MERION)).toMatchObject({ status: 'up', postedOn: '2026-10-02' })
  })

  it('reads down', () => {
    expect(readStatus('Eruv Status: The Eruv is DOWN this Shabbos.').status).toBe('down')
  })

  it('is unknown when sentences disagree, or there are none', () => {
    expect(readStatus('The North Eruv is up. The South Eruv is down.').status).toBe('unknown')
    expect(readStatus('Welcome to our community. Check back Friday.').status).toBe('unknown')
  })
})

describe('pageText and firstDate', () => {
  it('drops scripts and tags', () => {
    expect(pageText('<p>The Eruv is <b>Up!</b></p><script>var eruv="is down"</script>')).toBe('The Eruv is Up!')
  })
  it('reads dates as people write them', () => {
    expect(firstDate('Oct 2nd 2026')).toBe('2026-10-02')
    expect(firstDate('Friday, August 28, 2026, 5:47 PM')).toBe('2026-08-28')
    expect(firstDate('21st of Tishrei 5787')).toBeNull()
  })
})

describe('when to read again', () => {
  it('every 15 minutes from noon to candle lighting on a day with candles', () => {
    expect(inCheckingHours(at('2026-10-09T15:59:00Z'), TZ, CANDLES)).toBe(false) // 11:59 AM
    expect(inCheckingHours(at('2026-10-09T16:01:00Z'), TZ, CANDLES)).toBe(true)
    expect(inCheckingHours(at('2026-10-09T22:13:00Z'), TZ, CANDLES)).toBe(false) // 6:13 PM
    expect(inCheckingHours(at('2026-10-07T18:00:00Z'), TZ, null)).toBe(false)
    expect(staleAfterMs(at('2026-10-09T19:00:00Z'), TZ, CANDLES)).toBe(15 * 60_000)
    expect(staleAfterMs(at('2026-10-07T19:00:00Z'), TZ, null)).toBe(180 * 60_000)
  })

  it('a page is read again once its last read, good or failed, is that old', () => {
    const now = at('2026-10-09T19:00:00Z')
    expect(isStale(eruv({ statusCheckedAt: '2026-10-09T18:50:00Z' }), now, TZ, CANDLES)).toBe(false)
    expect(isStale(eruv({ statusCheckedAt: '2026-10-09T18:40:00Z' }), now, TZ, CANDLES)).toBe(true)
    expect(isStale(eruv({ statusCheckedAt: '2026-10-09T18:40:00Z', statusErrorAt: '2026-10-09T18:55:00Z' }), now, TZ, CANDLES)).toBe(false)
    expect(isStale(eruv({ statusUrl: null, statusCheckedAt: null }), now, TZ, CANDLES)).toBe(false)
  })
})

describe('eruvView', () => {
  const friday3pm = at('2026-10-09T19:00:00Z')

  it('up, with when it was checked', () => {
    expect(eruvView(eruv(), friday3pm, TZ, CANDLES)).toEqual({ tone: 'green', label: 'Up for this Shabbos', checked: 'Checked 2:55 PM · every 15 minutes until candle lighting' })
  })

  it('an undated up is up; a weekday says “Up” and when it was checked', () => {
    const wed = at('2026-10-07T13:30:00Z')
    expect(eruvView(eruv({ statusCheckedAt: '2026-10-07T13:02:00Z' }), wed, TZ, null)).toEqual({ tone: 'green', label: 'Up', checked: 'Checked 9:02 AM · every 15 minutes on Fridays until candle lighting' })
  })

  it('an eruv that dates its posts: last week’s up is not this week’s', () => {
    const lm = eruv({ statusDated: true, statusPostedOn: '2026-10-02' })
    expect(eruvView(lm, friday3pm, TZ, CANDLES)).toMatchObject({ tone: 'amber', label: 'Not posted yet this week' })
    expect(eruvView({ ...lm, statusPostedOn: '2026-10-09' }, friday3pm, TZ, CANDLES)).toMatchObject({ tone: 'green', label: 'Up for this Shabbos' })
    // Center City's "last updated" date is not a weekly post: it isn't dated.
    expect(eruvView(eruv({ statusPostedOn: '2026-08-28' }), friday3pm, TZ, CANDLES).tone).toBe('green')
  })

  it('down is always down', () => {
    expect(eruvView(eruv({ status: 'down', statusDated: true, statusPostedOn: '2026-09-01' }), friday3pm, TZ, CANDLES)).toMatchObject({ tone: 'red', label: 'Down this Shabbos' })
  })

  it('never up when the page couldn’t be read, or said nothing clear', () => {
    expect(eruvView(eruv({ statusErrorAt: '2026-10-09T18:58:00Z', statusError: 'timeout' }), friday3pm, TZ, CANDLES)).toMatchObject({ tone: 'amber', label: 'Couldn’t read their status' })
    expect(eruvView(eruv({ status: 'unknown' }), friday3pm, TZ, CANDLES)).toMatchObject({ tone: 'amber' })
    expect(eruvView(eruv({ statusCheckedAt: null, status: null }), friday3pm, TZ, CANDLES)).toMatchObject({ tone: 'amber' })
  })

  it('no status page: no status', () => {
    expect(eruvView(eruv({ statusUrl: null }), friday3pm, TZ, CANDLES)).toEqual({ tone: 'grey', label: 'No status online', checked: null })
  })

  it('a check from another day says the day', () => {
    expect(eruvView(eruv({ statusCheckedAt: '2026-10-08T13:00:00Z' }), friday3pm, TZ, CANDLES).checked).toBe('Checked Thu 9:00 AM · every 15 minutes until candle lighting')
  })
})

describe('weekStart and dialable', () => {
  it('the Sunday before', () => {
    expect(weekStart('2026-10-09', 5)).toBe('2026-10-04')
    expect(weekStart('2026-10-04', 0)).toBe('2026-10-04')
  })
  it('dials letters and drops the option', () => {
    expect(dialable('(215) 333-ERUV')).toBe('2153333788')
    expect(dialable('(610) 664-5626, option 3')).toBe('6106645626')
  })
})

describe('shortDay', () => {
  it('a post’s date is that day wherever it’s read', () => {
    expect(shortDay('2026-08-28', TZ)).toBe('Aug 28')
    expect(shortDay('2026-10-02', 'America/Los_Angeles')).toBe('Oct 2')
  })
  it('a moment is the day it was where the community is', () => {
    expect(shortDay('2026-10-08T02:00:00Z', TZ)).toBe('Oct 7')
  })
})
