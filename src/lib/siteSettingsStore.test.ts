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

const mockResolveCommunity = vi.hoisted(() => vi.fn())
vi.mock('./communityStore', () => ({
  resolveCommunity: mockResolveCommunity,
}))

const { getSiteSettingsUncached, updateSiteSettings } = await import('./siteSettingsStore')

afterEach(() => {
  mockFrom.mockReset()
  mockResolveCommunity.mockReset()
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
  mobile_tabs: [{ id: 'home', label: 'Home', target: '/' }],
}

describe('getSiteSettingsUncached', () => {
  it('falls back to SITE_SETTINGS_DEFAULTS when no row exists yet (fresh deployment)', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    mockResolveCommunity.mockResolvedValue({
      slug: 'philly',
      name: SITE_SETTINGS_DEFAULTS.name,
      tagline: SITE_SETTINGS_DEFAULTS.tagline,
      mission: SITE_SETTINGS_DEFAULTS.mission,
    })
    expect(await getSiteSettingsUncached('philly')).toEqual(SITE_SETTINGS_DEFAULTS)
  })

  // Regression: a second community with no site_settings row yet used to
  // fall back to SITE_SETTINGS_DEFAULTS unconditionally — a module-level
  // constant built once from community.config.ts (the bootstrap/Philly
  // community) — so an un-configured community rendered Philadelphia's own
  // name/tagline/mission rather than its own. Reproduced live: visiting a
  // freshly-seeded second community showed "Philadelphia Jewish Community"
  // in the header before this fell back to the resolved community row instead.
  it("falls back to the resolved community's own name/tagline/mission, not the bootstrap community's", async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    mockResolveCommunity.mockResolvedValue({
      slug: 'ues',
      name: 'Upper East Side Jewish Community',
      tagline: 'Guide for residents and visitors',
      mission: 'A guide to Jewish life on the Upper East Side.',
    })

    const settings = await getSiteSettingsUncached('ues')

    expect(settings.name).toBe('Upper East Side Jewish Community')
    expect(settings.tagline).toBe('Guide for residents and visitors')
    expect(settings.mission).toBe('A guide to Jewish life on the Upper East Side.')
    expect(mockResolveCommunity).toHaveBeenCalledWith('ues')
    // Everything not community-specific still comes from the shared defaults.
    expect(settings.mobileTabs).toEqual(SITE_SETTINGS_DEFAULTS.mobileTabs)
    expect(settings.heroTitle).toBe(SITE_SETTINGS_DEFAULTS.heroTitle)
  })

  it('maps a full row, falling back to defaults for any per-card copy column not yet set', async () => {
    mockFrom.mockReturnValue(chainable({ data: { ...rawRow, desktop_davening_eyebrow: null }, error: null }))
    const settings = await getSiteSettingsUncached('philly')
    expect(settings.desktopDaveningEyebrow).toBe(SITE_SETTINGS_DEFAULTS.desktopDaveningEyebrow)
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

// The Today home's settings (migration 067): read the same whether or not the
// columns exist, and written only when they change, so the rest of the
// settings still save on a database without them.
describe('the Today home settings', () => {
  function saveWith(row: Record<string, unknown>, writeResult: unknown = { data: row, error: null }) {
    const readBuilder = chainable({ data: row, error: null })
    const writeBuilder = chainable(writeResult)
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })
    return writeBuilder
  }

  it('reads as the classic home and the starting items on a row from before 067', async () => {
    mockFrom.mockReturnValue(chainable({ data: rawRow, error: null }))
    const settings = await getSiteSettingsUncached('philly')
    expect(settings.homeStyle).toBe('classic')
    expect(settings.beforeCandleItems).toEqual(['Challah', 'Wine', 'Chicken'])
  })

  it('reads what an admin saved, tidied: no blanks or repeats, at most six', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { ...rawRow, home_style: 'today', before_candle_items: [' Challah', 'challah', '', 'Wine', 'Grape juice', 'Fish', 'Chicken', 'Cake', 'Kugel'] },
        error: null,
      }),
    )
    const settings = await getSiteSettingsUncached('philly')
    expect(settings.homeStyle).toBe('today')
    expect(settings.beforeCandleItems).toEqual(['Challah', 'Wine', 'Grape juice', 'Fish', 'Chicken', 'Cake'])
  })

  it('an unknown style reads as classic', async () => {
    mockFrom.mockReturnValue(chainable({ data: { ...rawRow, home_style: 'fancy' }, error: null }))
    expect((await getSiteSettingsUncached('philly')).homeStyle).toBe('classic')
  })

  it('a save that doesn’t change them leaves both columns out', async () => {
    const write = saveWith(rawRow)
    await updateSiteSettings('philly', { tagline: 'New Tagline', homeStyle: 'classic' })
    const written = (write.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(written).not.toHaveProperty('home_style')
    expect(written).not.toHaveProperty('before_candle_items')
  })

  it('a save that changes them writes them', async () => {
    const write = saveWith(rawRow)
    await updateSiteSettings('philly', { homeStyle: 'today', beforeCandleItems: ['Challah'] })
    expect(write.upsert).toHaveBeenCalledWith(expect.objectContaining({ home_style: 'today', before_candle_items: ['Challah'] }), { onConflict: 'community_id' })
  })

  it('changing them before 067 says what’s missing', async () => {
    saveWith(rawRow, { data: null, error: { message: 'column "home_style" of relation "site_settings" does not exist' } })
    await expect(updateSiteSettings('philly', { homeStyle: 'today' })).rejects.toThrow('migration 067')
  })
})
