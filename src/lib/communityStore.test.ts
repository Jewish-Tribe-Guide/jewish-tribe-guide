import { afterEach, describe, expect, it, vi } from 'vitest'

// next/cache is mocked because cacheTag/cacheLife need a Next.js request
// context this plain Vitest process doesn't have — same pattern as
// revalidateContent.test.ts. getAdminClient is mocked with a minimal
// chainable Supabase query-builder stand-in, same as tagStore.test.ts/
// voteStore.test.ts.
vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}))

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    order: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { listCommunities, getDefaultCommunity, resolveCommunity, communitySlugFromRequest, CONFIG_COMMUNITY_SLUG } =
  await import('./communityStore')

afterEach(() => {
  mockFrom.mockReset()
})

const philly = {
  slug: 'philly',
  name: 'Philadelphia Jewish Community',
  short_name: 'PJC',
  tagline: 'Tagline',
  mission: 'Mission',
  manifest_description: 'Manifest',
  region: 'Philadelphia',
  timezone: 'America/New_York',
  map_center: { lat: 39.95, lng: -75.16 },
  theme_color: '#1d4ed8',
  background_color: '#f8fafc',
  features: { volunteer: true },
  ui: { search: { directory: true } },
  sort_order: 0,
  is_default: true,
}

const baltimore = { ...philly, slug: 'baltimore', name: 'Baltimore', is_default: false, sort_order: 1 }

describe('listCommunities', () => {
  it('maps real rows into Community shape (snake_case -> camelCase)', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))

    const result = await listCommunities()

    expect(result).toEqual([
      {
        slug: 'philly',
        name: 'Philadelphia Jewish Community',
        shortName: 'PJC',
        tagline: 'Tagline',
        mission: 'Mission',
        manifestDescription: 'Manifest',
        region: 'Philadelphia',
        timezone: 'America/New_York',
        mapCenter: { lat: 39.95, lng: -75.16 },
        themeColor: '#1d4ed8',
        backgroundColor: '#f8fafc',
        features: { volunteer: true },
        ui: { search: { directory: true } },
        sortOrder: 0,
        isDefault: true,
      },
    ])
  })

  it('falls back to the config community when the table is empty', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }))
    const result = await listCommunities()
    expect(result).toEqual([expect.objectContaining({ slug: CONFIG_COMMUNITY_SLUG, isDefault: true })])
  })

  it('falls back to the config community on a Supabase error', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'down' } }))
    const result = await listCommunities()
    expect(result).toEqual([expect.objectContaining({ slug: CONFIG_COMMUNITY_SLUG, isDefault: true })])
  })

  it('falls back to the config community if the query throws outright', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('connection refused')
    })
    const result = await listCommunities()
    expect(result).toEqual([expect.objectContaining({ slug: CONFIG_COMMUNITY_SLUG, isDefault: true })])
  })
})

describe('getDefaultCommunity', () => {
  it('returns the row flagged is_default, even if it is not first', async () => {
    mockFrom.mockReturnValue(chainable({ data: [baltimore, philly], error: null }))
    const result = await getDefaultCommunity()
    expect(result.slug).toBe('philly')
  })

  it('falls back to the first community when none is flagged default', async () => {
    const noDefault = { ...philly, is_default: false }
    mockFrom.mockReturnValue(chainable({ data: [noDefault, baltimore], error: null }))
    const result = await getDefaultCommunity()
    expect(result.slug).toBe('philly')
  })
})

describe('resolveCommunity', () => {
  it('returns the community matching the requested slug', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly, baltimore], error: null }))
    const result = await resolveCommunity('baltimore')
    expect(result.slug).toBe('baltimore')
  })

  it('falls back to the default community for an unknown slug', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly, baltimore], error: null }))
    const result = await resolveCommunity('nonexistent')
    expect(result.slug).toBe('philly')
  })

  it('falls back to the default community when no slug is given', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly, baltimore], error: null }))
    const result = await resolveCommunity(null)
    expect(result.slug).toBe('philly')
  })
})

describe('communitySlugFromRequest', () => {
  it('reads the community query param', () => {
    const request = new Request('https://example.com/api/categories?community=baltimore')
    expect(communitySlugFromRequest(request)).toBe('baltimore')
  })

  it('returns null when the param is absent', () => {
    const request = new Request('https://example.com/api/categories')
    expect(communitySlugFromRequest(request)).toBeNull()
  })
})
