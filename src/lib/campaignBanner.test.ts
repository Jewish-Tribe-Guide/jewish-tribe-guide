import { describe, expect, it } from 'vitest'
import { activeCampaignBanner, type CampaignBanner } from './campaignBanner'

const NY = 'America/New_York'

function banner(overrides: Partial<CampaignBanner> = {}): CampaignBanner {
  return {
    id: 'sukkah-map',
    categoryId: 'sukkahs',
    title: 'Sukkah Map',
    subtitle: '',
    startDate: '2026-09-25',
    endDate: '2026-10-05',
    ...overrides,
  }
}

describe('activeCampaignBanner', () => {
  it('returns the banner when today falls inside its range', () => {
    const b = banner()
    expect(activeCampaignBanner([b], new Date('2026-09-30T12:00:00Z').getTime(), NY)).toEqual(b)
  })

  it('is inclusive of both the start and end date', () => {
    const b = banner()
    expect(activeCampaignBanner([b], new Date('2026-09-25T12:00:00Z').getTime(), NY)).toEqual(b)
    expect(activeCampaignBanner([b], new Date('2026-10-05T12:00:00Z').getTime(), NY)).toEqual(b)
  })

  it('returns null the day before start and the day after end', () => {
    const b = banner()
    expect(activeCampaignBanner([b], new Date('2026-09-24T12:00:00Z').getTime(), NY)).toBeNull()
    expect(activeCampaignBanner([b], new Date('2026-10-06T12:00:00Z').getTime(), NY)).toBeNull()
  })

  it('returns null with no banners at all', () => {
    expect(activeCampaignBanner([], Date.now(), NY)).toBeNull()
  })

  // The boundary is the community's own local calendar date, not the
  // server's UTC date — a banner ending 2026-10-05 should still be live
  // late in the evening Eastern time even though UTC has already rolled
  // over to the 6th.
  it('compares the community-local date, not raw UTC', () => {
    const b = banner({ endDate: '2026-10-05' })
    // 2026-10-05 23:00 Eastern (EDT, UTC-4) is 2026-10-06 03:00 UTC.
    const lateEastern = new Date('2026-10-06T03:00:00Z').getTime()
    expect(activeCampaignBanner([b], lateEastern, NY)).toEqual(b)
  })

  it('picks the latest-starting banner when two windows overlap', () => {
    const earlier = banner({ id: 'a', startDate: '2026-09-20', endDate: '2026-10-10' })
    const later = banner({ id: 'b', startDate: '2026-09-28', endDate: '2026-10-02' })
    const result = activeCampaignBanner([earlier, later], new Date('2026-09-30T12:00:00Z').getTime(), NY)
    expect(result?.id).toBe('b')
  })
})
