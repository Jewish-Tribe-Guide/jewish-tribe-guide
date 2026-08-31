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
    eq: vi.fn(self),
    insert: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
    single: vi.fn(self),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const {
  listCommunities,
  getDefaultCommunity,
  resolveCommunity,
  communitySlugFromRequest,
  createCommunity,
  deleteCommunity,
  getCommunityAdminEmail,
  listCommunityAdminEmails,
  setCommunityVisibility,
  listCommunityVisibility,
  listCommunityPreviewTokens,
  CONFIG_COMMUNITY_SLUG,
} = await import('./communityStore')

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

describe('createCommunity', () => {
  const validInput = {
    slug: 'baltimore',
    name: 'Baltimore Jewish Community',
    tagline: 'Guide for residents & visitors',
    mission: 'A guide to Jewish Baltimore.',
    region: 'Baltimore',
    timezone: 'America/New_York',
    mapCenter: { lat: 39.369, lng: -76.715 },
    themeColor: '#1d4ed8',
    backgroundColor: '#f8fafc',
  }

  it('rejects a slug that collides with a reserved route', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, slug: 'admin' })).rejects.toThrow()
  })

  it('rejects a slug already used by another community', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, slug: 'philly' })).rejects.toThrow(
      '"philly" is already in use by another community.',
    )
  })

  it('rejects an invalid brand color', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, themeColor: 'blue' })).rejects.toThrow(
      'Brand color must be a hex value',
    )
  })

  it('rejects an invalid background color', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, backgroundColor: 'not-a-color' })).rejects.toThrow(
      'Background color must be a hex value',
    )
  })

  it('rejects an invalid timezone', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, timezone: 'Mars/Olympus_Mons' })).rejects.toThrow(
      'is not a valid timezone',
    )
  })

  it('rejects an out-of-range latitude', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, mapCenter: { lat: 200, lng: 0 } })).rejects.toThrow(
      'latitude must be between -90 and 90',
    )
  })

  it('rejects an out-of-range longitude', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, mapCenter: { lat: 0, lng: 200 } })).rejects.toThrow(
      'longitude must be between -180 and 180',
    )
  })

  it('rejects a blank name', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly], error: null }))
    await expect(createCommunity({ ...validInput, name: '   ' })).rejects.toThrow('Community name is required.')
  })

  it('inserts with sortOrder one past the current max, is_default and visible false, and maps the returned row', async () => {
    const insertedRow = {
      slug: 'baltimore',
      name: 'Baltimore Jewish Community',
      short_name: 'Baltimore Jewish Community',
      tagline: 'Guide for residents & visitors',
      mission: 'A guide to Jewish Baltimore.',
      manifest_description: 'A guide to Jewish Baltimore.',
      region: 'Baltimore',
      timezone: 'America/New_York',
      map_center: { lat: 39.369, lng: -76.715 },
      theme_color: '#1d4ed8',
      background_color: '#f8fafc',
      features: {},
      ui: {},
      sort_order: 10,
      is_default: false,
      visible: false,
    }
    const listBuilder = chainable({ data: [philly], error: null })
    const insertBuilder = chainable({ data: insertedRow, error: null })
    mockFrom.mockReturnValueOnce(listBuilder).mockReturnValueOnce(insertBuilder)

    const result = await createCommunity(validInput)

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'baltimore', sort_order: 10, is_default: false, visible: false }),
    )
    expect(result.slug).toBe('baltimore')
    expect(result.sortOrder).toBe(10)
    expect(result.isDefault).toBe(false)
    expect(result.visible).toBe(false)
  })

  it('throws with the Supabase error message on insert failure', async () => {
    const listBuilder = chainable({ data: [philly], error: null })
    const insertBuilder = chainable({ data: null, error: { message: 'other failure', code: '23514' } })
    mockFrom.mockReturnValueOnce(listBuilder).mockReturnValueOnce(insertBuilder)

    await expect(createCommunity(validInput)).rejects.toThrow('Failed to create community: other failure')
  })

  // The uniqueness check above reads the cached listCommunities() — proven
  // stale by the clone-dropdown bug this same staleness caused elsewhere —
  // so two creations for the same slug can both pass it and race to the
  // insert. The DB's own primary-key constraint (code 23505) still stops
  // the duplicate row; this just re-maps that into the same friendly
  // message a normal "already taken" rejection gets, instead of leaking
  // Postgres's constraint-violation text.
  it('re-maps a Postgres unique-violation on insert to the friendly "already in use" message', async () => {
    const listBuilder = chainable({ data: [philly], error: null })
    const insertBuilder = chainable({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "community_pkey"', code: '23505' },
    })
    mockFrom.mockReturnValueOnce(listBuilder).mockReturnValueOnce(insertBuilder)

    await expect(createCommunity(validInput)).rejects.toThrow('"baltimore" is already in use by another community.')
  })
})

describe('deleteCommunity', () => {
  it('refuses to delete the default community', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly, baltimore], error: null }))
    await expect(deleteCommunity('philly')).rejects.toThrow('The default community cannot be deleted.')
    // Never got past the list-and-check — no delete call was made at all.
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('refuses to delete the only remaining community, even if not default', async () => {
    const soleNonDefault = { ...baltimore, is_default: false }
    mockFrom.mockReturnValue(chainable({ data: [soleNonDefault], error: null }))
    await expect(deleteCommunity('baltimore')).rejects.toThrow('Cannot delete the only remaining community.')
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('rejects a slug that is not a real community', async () => {
    mockFrom.mockReturnValue(chainable({ data: [philly, baltimore], error: null }))
    await expect(deleteCommunity('nonexistent')).rejects.toThrow('"nonexistent" is not a real community.')
  })

  it('deletes every community-scoped table, then the community row itself', async () => {
    const calls: string[] = []
    mockFrom.mockImplementation((table: string) => {
      calls.push(table)
      return table === 'community' && calls.length === 1
        ? chainable({ data: [philly, baltimore], error: null }) // the initial listCommunities()
        : chainable({ error: null })
    })

    await deleteCommunity('baltimore')

    // listCommunities() first, then every community-scoped table, then the
    // community row itself last — order matters here only in that the
    // community row must go last (deleting it first would leave nothing to
    // scope the content deletes against, were a real FK ever added later).
    expect(calls[0]).toBe('community')
    expect(calls.slice(1)).toEqual([
      'resource',
      'category',
      'form',
      'home_section',
      'site_settings',
      'submission',
      'form_response',
      'hospital',
      'tag',
      'community',
    ])
  })

  it('scopes every table delete to the given community, and the final delete by slug', async () => {
    const builders: ReturnType<typeof chainable>[] = []
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      const builder = call === 1 ? chainable({ data: [philly, baltimore], error: null }) : chainable({ error: null })
      builders.push(builder)
      return builder
    })

    await deleteCommunity('baltimore')

    // builders[1..9] are the 9 community-scoped table deletes, builders[10] is the community row itself.
    for (const builder of builders.slice(1, 10)) {
      expect(builder.eq).toHaveBeenCalledWith('community_id', 'baltimore')
    }
    expect(builders[10]!.eq).toHaveBeenCalledWith('slug', 'baltimore')
  })

  it('throws with the Supabase error message when a content table fails to delete', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      if (call === 1) return chainable({ data: [philly, baltimore], error: null })
      if (call === 2) return chainable({ error: { message: 'boom' } }) // first scoped table: 'resource'
      return chainable({ error: null })
    })

    await expect(deleteCommunity('baltimore')).rejects.toThrow('Failed to delete resource rows: boom')
  })

  it('throws with the Supabase error message when deleting the community row itself fails', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      if (call === 1) return chainable({ data: [philly, baltimore], error: null })
      if (call === 11) return chainable({ error: { message: 'boom' } }) // the final community-row delete
      return chainable({ error: null })
    })

    await expect(deleteCommunity('baltimore')).rejects.toThrow('Failed to delete community: boom')
  })
})

describe('getCommunityAdminEmail', () => {
  it('returns the configured admin_email for the given slug', async () => {
    mockFrom.mockReturnValue(chainable({ data: { admin_email: 'philly-admin@example.com' }, error: null }))
    expect(await getCommunityAdminEmail('philly')).toBe('philly-admin@example.com')
  })

  it('returns null when the community has no admin_email set (both do today)', async () => {
    mockFrom.mockReturnValue(chainable({ data: { admin_email: null }, error: null }))
    expect(await getCommunityAdminEmail('philly')).toBeNull()
  })

  it('returns null when the community does not exist', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await getCommunityAdminEmail('nonexistent')).toBeNull()
  })
})

describe('listCommunityAdminEmails', () => {
  it('keys admin_email by slug for every community', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { slug: 'philly', admin_email: 'phillyjewishguide@gmail.com' },
          { slug: 'ues', admin_email: null },
        ],
        error: null,
      }),
    )
    expect(await listCommunityAdminEmails()).toEqual({
      philly: 'phillyjewishguide@gmail.com',
      ues: null,
    })
  })

  it('returns an empty object when the table read fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    expect(await listCommunityAdminEmails()).toEqual({})
  })
})

describe('setCommunityVisibility', () => {
  it('publishing sets visible=true and leaves the token alone', async () => {
    const updateBuilder = chainable({
      data: { ...baltimore, visible: true, preview_token: 'unchanged-token' },
      error: null,
    })
    mockFrom.mockReturnValue(updateBuilder)

    const { community, previewToken } = await setCommunityVisibility('baltimore', true)

    expect(updateBuilder.update).toHaveBeenCalledWith({ visible: true })
    expect(updateBuilder.eq).toHaveBeenCalledWith('slug', 'baltimore')
    expect(community.visible).toBe(true)
    expect(previewToken).toBe('unchanged-token')
  })

  it('unpublishing rotates the preview token', async () => {
    const updateBuilder = chainable({
      data: { ...baltimore, visible: false, preview_token: 'freshly-rotated-token' },
      error: null,
    })
    mockFrom.mockReturnValue(updateBuilder)

    const { community, previewToken } = await setCommunityVisibility('baltimore', false)

    expect(updateBuilder.update).toHaveBeenCalledWith({ visible: false, preview_token: expect.any(String) })
    expect(community.visible).toBe(false)
    expect(previewToken).toBe('freshly-rotated-token')
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(setCommunityVisibility('baltimore', false)).rejects.toThrow(
      'Failed to update "baltimore"\'s visibility: boom',
    )
  })
})

describe('listCommunityVisibility', () => {
  it('keys visible + previewToken by slug for every community', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { slug: 'philly', visible: true, preview_token: 'philly-token' },
          { slug: 'blatimore', visible: false, preview_token: 'blatimore-token' },
        ],
        error: null,
      }),
    )
    expect(await listCommunityVisibility()).toEqual({
      philly: { visible: true, previewToken: 'philly-token' },
      blatimore: { visible: false, previewToken: 'blatimore-token' },
    })
  })

  it('returns an empty object when the table read fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    expect(await listCommunityVisibility()).toEqual({})
  })
})

describe('listCommunityPreviewTokens', () => {
  it('keys preview_token by slug for every community', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { slug: 'philly', preview_token: 'philly-token' },
          { slug: 'blatimore', preview_token: 'blatimore-token' },
        ],
        error: null,
      }),
    )
    expect(await listCommunityPreviewTokens()).toEqual({
      philly: 'philly-token',
      blatimore: 'blatimore-token',
    })
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
