import { afterEach, describe, expect, it, vi } from 'vitest'

// next/cache is mocked because cacheTag/cacheLife need a Next.js request
// context this plain Vitest process doesn't have — same pattern as
// communityStore.test.ts/revalidateContent.test.ts. getAdminClient is a
// minimal chainable Supabase query-builder stand-in, same as
// tagStore.test.ts/submissionStore.test.ts.
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
    order: vi.fn(self),
    insert: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
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

const mockGetDefaultCommunity = vi.hoisted(() => vi.fn())
vi.mock('./communityStore', () => ({
  getDefaultCommunity: mockGetDefaultCommunity,
}))

const {
  listCategoriesUncached,
  getCategoryById,
  slugify,
  createCategory,
  updateCategory,
  deleteCategory,
} = await import('./categoryStore')

afterEach(() => {
  mockFrom.mockReset()
  mockGetDefaultCommunity.mockReset()
  mockGetDefaultCommunity.mockResolvedValue({ slug: 'philly' })
})

const rawRow = {
  id: 'synagogue',
  label: 'Synagogue',
  plural_label: 'Synagogues',
  icon: '🕍',
  description: 'Shuls near the hospital',
  fields: [{ key: 'kosher', label: 'Kosher', type: 'tags' as const }],
  kind: 'listing' as const,
  sort_order: 5,
  upvotes_enabled: true,
  has_address: false,
  has_phone: false,
  capabilities: { add: false },
  external_link_label: 'Website',
  external_link_url: 'https://example.com',
  card_image_url: 'https://example.com/card.png',
  card_text_color: '#fff',
  icon_image_url: null,
}

// ── row → config mapping (toConfig, exercised via the reads) ────────────────

describe('listCategoriesUncached', () => {
  it('maps a full row to CategoryConfig, resolving capabilities and building externalLink', async () => {
    mockFrom.mockReturnValue(chainable({ data: [rawRow], error: null }))

    const [config] = await listCategoriesUncached('philly')

    expect(config).toEqual({
      id: 'synagogue',
      label: 'Synagogue',
      pluralLabel: 'Synagogues',
      icon: '🕍',
      description: 'Shuls near the hospital',
      detailFields: rawRow.fields,
      kind: 'listing',
      sortOrder: 5,
      hasAddress: false,
      hasPhone: false,
      upvotesEnabled: true,
      capabilities: { add: false, edit: true, report: true, directorySearch: true, map: true },
      externalLink: { label: 'Website', url: 'https://example.com' },
      cardImageUrl: 'https://example.com/card.png',
      cardTextColor: '#fff',
      iconImageUrl: null,
    })
  })

  it('defaults hasAddress/hasPhone to true and externalLink to null when their columns are missing/partial', async () => {
    const row = {
      ...rawRow,
      has_address: undefined,
      has_phone: undefined,
      external_link_label: null,
      external_link_url: 'https://example.com', // only one half set — still null
      fields: null,
      capabilities: null,
      upvotes_enabled: false,
    }
    mockFrom.mockReturnValue(chainable({ data: [row], error: null }))

    const [config] = await listCategoriesUncached('philly')

    expect(config.hasAddress).toBe(true)
    expect(config.hasPhone).toBe(true)
    expect(config.externalLink).toBeNull()
    expect(config.detailFields).toEqual([])
    expect(config.capabilities).toEqual({ add: true, edit: true, report: true, directorySearch: true, map: true })
    expect(config.upvotesEnabled).toBe(false)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listCategoriesUncached('philly')).rejects.toThrow('Failed to load categories: boom')
  })
})

describe('getCategoryById', () => {
  it('returns null when no row matches (not found is not an error)', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await getCategoryById('philly', 'missing')).toBeNull()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(getCategoryById('philly', 'synagogue')).rejects.toThrow('Failed to load category: boom')
  })
})

// ── slugify ──────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases, trims, and collapses non-alphanumerics to single hyphens', () => {
    expect(slugify('Car Repair')).toBe('car-repair')
    expect(slugify('  Kosher  Grocery!! Store  ')).toBe('kosher-grocery-store')
  })

  it('strips leading/trailing hyphens produced by punctuation at the edges', () => {
    expect(slugify('-- Hello --')).toBe('hello')
  })
})

// ── createCategory ───────────────────────────────────────────────────────────

describe('createCategory', () => {
  it('rejects a listing category whose slug collides with a reserved route', async () => {
    await expect(createCategory({ label: 'Map' })).rejects.toThrow()
  })

  it('allows a non-listing (singleton) kind to slugify to a reserved word like "zmanim"', async () => {
    mockFrom.mockImplementation(() => chainable({ data: null, error: null }))
    // First call in the uniqueness loop returns no existing row → id stays 'zmanim'.
    const insertBuilder = chainable({ data: { ...rawRow, id: 'zmanim', kind: 'zmanim' }, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? chainable({ data: null, error: null }) : insertBuilder
    })

    const result = await createCategory({ label: 'Zmanim', kind: 'zmanim' })
    expect(result.id).toBe('zmanim')
  })

  it('appends -2, -3, ... until it finds an id with no existing row', async () => {
    let checkCall = 0
    const insertBuilder = chainable({ data: { ...rawRow, id: 'synagogue-3' }, error: null })
    mockFrom.mockImplementation(() => {
      checkCall += 1
      // 'synagogue' and 'synagogue-2' both taken, 'synagogue-3' free.
      if (checkCall === 1) return chainable({ data: { id: 'synagogue' }, error: null })
      if (checkCall === 2) return chainable({ data: { id: 'synagogue-2' }, error: null })
      if (checkCall === 3) return chainable({ data: null, error: null })
      return insertBuilder
    })

    const result = await createCategory({ label: 'Synagogue' })
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'synagogue-3' }))
    expect(result.id).toBe('synagogue-3')
  })

  it('surfaces a friendly message when a singleton kind already exists (unique-constraint violation)', async () => {
    mockFrom.mockImplementation(() =>
      chainable({ data: null, error: null }),
    )
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      if (call === 1) return chainable({ data: null, error: null }) // uniqueness check
      return chainable({ data: null, error: { code: '23505', message: 'duplicate key' } })
    })

    await expect(createCategory({ label: 'Map', kind: 'map' })).rejects.toThrow('A Map category already exists.')
  })

  it('surfaces the raw error for a non-singleton insert failure', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      if (call === 1) return chainable({ data: null, error: null })
      return chainable({ data: null, error: { code: '99999', message: 'db exploded' } })
    })

    await expect(createCategory({ label: 'Some Category' })).rejects.toThrow(
      'Failed to create category: db exploded',
    )
  })

  it('applies defaults: hasAddress/hasPhone true, upvotesEnabled false, icon falls back to the default', async () => {
    let call = 0
    const insertBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? chainable({ data: null, error: null }) : insertBuilder
    })

    await createCategory({ label: 'Synagogue' })

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        has_address: true,
        has_phone: true,
        upvotes_enabled: false,
        icon: '📋',
        sort_order: 100,
      }),
    )
  })
})

// ── updateCategory ───────────────────────────────────────────────────────────

describe('updateCategory', () => {
  it('is a no-op read (getCategoryById) when the patch has no keys set', async () => {
    mockFrom.mockReturnValue(chainable({ data: rawRow, error: null }))

    const result = await updateCategory('synagogue', {})

    expect(result?.id).toBe('synagogue')
    // Only the read path (select/maybeSingle), never .update().
  })

  it('only writes the columns present in the patch', async () => {
    const builder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValue(builder)

    await updateCategory('synagogue', { label: '  New Label  ' })

    expect(builder.update).toHaveBeenCalledWith({ label: 'New Label' })
  })

  it('scopes the update by both community and id', async () => {
    const builder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValue(builder)

    await updateCategory('synagogue', { sortOrder: 3 })

    expect(builder.eq).toHaveBeenCalledWith('community_id', 'philly')
    expect(builder.eq).toHaveBeenCalledWith('id', 'synagogue')
  })

  it('clears externalLink entirely when set to null', async () => {
    const builder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValue(builder)

    await updateCategory('synagogue', { externalLink: null })

    expect(builder.update).toHaveBeenCalledWith({ external_link_label: null, external_link_url: null })
  })

  it('returns null when no row matches the id/community scope', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await updateCategory('missing', { label: 'X' })).toBeNull()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(updateCategory('synagogue', { label: 'X' })).rejects.toThrow(
      'Failed to update category: boom',
    )
  })
})

// ── deleteCategory ───────────────────────────────────────────────────────────

describe('deleteCategory', () => {
  it('deletes the listings before the category (no DB cascade), returning the listing count', async () => {
    const calls: string[] = []
    mockFrom.mockImplementation((table: string) => {
      calls.push(table)
      if (table === 'resource') return chainable({ count: 3, error: null, data: null })
      return chainable({ error: null })
    })

    const result = await deleteCategory('synagogue')

    expect(result).toEqual({ listings: 3 })
    // resource must be touched (count + delete) before category is deleted.
    expect(calls.indexOf('category')).toBeGreaterThan(calls.lastIndexOf('resource'))
  })

  it('defaults to 0 listings when count is null', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'resource' ? chainable({ count: null, error: null, data: null }) : chainable({ error: null }),
    )
    expect(await deleteCategory('synagogue')).toEqual({ listings: 0 })
  })

  it('throws and stops before deleting the category if removing its listings fails', async () => {
    let categoryDeleteCalled = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'resource') {
        const b = chainable({ count: 1, error: { message: 'fk violation' }, data: null })
        return b
      }
      categoryDeleteCalled = true
      return chainable({ error: null })
    })

    await expect(deleteCategory('synagogue')).rejects.toThrow(
      "Failed to delete the category's listings: fk violation",
    )
    expect(categoryDeleteCalled).toBe(false)
  })

  it('throws when deleting the category row itself fails', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'resource'
        ? chainable({ count: 0, error: null, data: null })
        : chainable({ error: { message: 'category fk violation' } }),
    )
    await expect(deleteCategory('synagogue')).rejects.toThrow(
      'Failed to delete category: category fk violation',
    )
  })
})
