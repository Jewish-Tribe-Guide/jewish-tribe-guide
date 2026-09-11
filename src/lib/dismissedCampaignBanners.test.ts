import { describe, expect, it } from 'vitest'
import { parseDismissedCampaignBanners } from './dismissedCampaignBanners'

describe('parseDismissedCampaignBanners', () => {
  it('parses a valid saved list', () => {
    expect(parseDismissedCampaignBanners(JSON.stringify(['sukkah-map']))).toEqual(['sukkah-map'])
  })

  it('returns an empty list for null (nothing dismissed yet)', () => {
    expect(parseDismissedCampaignBanners(null)).toEqual([])
  })

  it('returns an empty list for garbage JSON rather than throwing', () => {
    expect(parseDismissedCampaignBanners('not json')).toEqual([])
  })

  it('returns an empty list for valid JSON that is not an array', () => {
    expect(parseDismissedCampaignBanners(JSON.stringify({ id: 'sukkah-map' }))).toEqual([])
  })

  it('drops non-string entries instead of failing the whole list', () => {
    const raw = JSON.stringify(['sukkah-map', 42, null, { id: 'x' }, 'menorah-drive'])
    expect(parseDismissedCampaignBanners(raw)).toEqual(['sukkah-map', 'menorah-drive'])
  })
})
