import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MOBILE_TABS, SITE_SETTINGS_DEFAULTS } from './siteSettings'

vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}))

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    upsert: vi.fn(self),
    single: vi.fn(self),
    maybeSingle: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { getSiteSettingsUncached, updateSiteSettings } = await import('./siteSettingsStore')

afterEach(() => {
  mockFrom.mockReset()
})

const rawRow = {
  id: 'default',
  name: 'My Community',
  tagline: 'Tagline',
  hero_title: 'Hero',
  mission: 'Mission',
  logo_url: 'https://example.com/logo.png',
  feedback_enabled: true,
  feedback_button_label: 'Feedback',
  feedback_heading: 'Tell us',
  feedback_success_message: 'Thanks!',
  featured_card_ids: ['a', 'b'],
  mobile_tabs: [{ id: 'home', label: 'Home', target: '/' }],
}

describe('getSiteSettingsUncached', () => {
  it('falls back to SITE_SETTINGS_DEFAULTS when no row exists yet (fresh deployment)', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await getSiteSettingsUncached('philly')).toEqual(SITE_SETTINGS_DEFAULTS)
  })

  it('maps a full row, normalizing null featured_card_ids to an empty array', async () => {
    mockFrom.mockReturnValue(chainable({ data: { ...rawRow, featured_card_ids: null }, error: null }))
    const settings = await getSiteSettingsUncached('philly')
    expect(settings.featuredCardIds).toEqual([])
    expect(settings.name).toBe('My Community')
    expect(settings.mobileTabs).toEqual([{ id: 'home', label: 'Home', target: '/' }])
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(getSiteSettingsUncached('philly')).rejects.toThrow('Failed to load site settings: boom')
  })

  describe('mobile tabs validation (toMobileTabs)', () => {
    it('falls back to the default trio when mobile_tabs is not an array', async () => {
      mockFrom.mockReturnValue(chainable({ data: { ...rawRow, mobile_tabs: 'not-an-array' }, error: null }))
      const settings = await getSiteSettingsUncached('philly')
      expect(settings.mobileTabs).toEqual(DEFAULT_MOBILE_TABS)
    })

    it('drops malformed entries (missing/blank id, label, or target)', async () => {
      mockFrom.mockReturnValue(
        chainable({
          data: {
            ...rawRow,
            mobile_tabs: [
              { id: 'home', label: 'Home', target: '/' },
              { id: '', label: 'Blank id', target: '/x' },
              { id: 'y', label: '  ', target: '/y' }, // blank label
              { id: 'z', label: 'Z', target: 123 }, // wrong type
              null,
              'not-an-object',
            ],
          },
          error: null,
        }),
      )
      const settings = await getSiteSettingsUncached('philly')
      expect(settings.mobileTabs).toEqual([{ id: 'home', label: 'Home', target: '/' }])
    })

    it('falls back to the default trio when every entry is malformed (not a half-broken bar)', async () => {
      mockFrom.mockReturnValue(chainable({ data: { ...rawRow, mobile_tabs: [{}] }, error: null }))
      const settings = await getSiteSettingsUncached('philly')
      expect(settings.mobileTabs).toEqual(DEFAULT_MOBILE_TABS)
    })

    it('caps the tab list at MAX_MOBILE_TABS', async () => {
      const many = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}`, target: `/${i}` }))
      mockFrom.mockReturnValue(chainable({ data: { ...rawRow, mobile_tabs: many }, error: null }))
      const settings = await getSiteSettingsUncached('philly')
      expect(settings.mobileTabs.length).toBeLessThan(many.length)
    })
  })
})

describe('updateSiteSettings', () => {
  it('merges the patch onto the current settings before upserting, only changing given keys', async () => {
    const readBuilder = chainable({ data: rawRow, error: null })
    const writeBuilder = chainable({ data: { ...rawRow, tagline: 'New Tagline' }, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await updateSiteSettings('philly', { tagline: 'New Tagline' })

    expect(writeBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'default',
        community_id: 'philly',
        name: 'My Community', // unchanged field carried through from current
        tagline: 'New Tagline', // patched field
      }),
      { onConflict: 'community_id' },
    )
  })

  it('throws with the Supabase error message on failure', async () => {
    const readBuilder = chainable({ data: rawRow, error: null })
    const writeBuilder = chainable({ data: null, error: { message: 'boom' } })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await expect(updateSiteSettings('philly', { tagline: 'X' })).rejects.toThrow(
      'Failed to update site settings: boom',
    )
  })
})
