import { afterEach, describe, expect, it, vi } from 'vitest'

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

const { getPageUncached, listPagesUncached, updatePage } = await import('./pagesStore')

afterEach(() => {
  mockFrom.mockReset()
})

const rawRow = {
  slug: 'about',
  title: 'About',
  body: 'Hello World',
  updated_at: '2026-08-26T00:00:00.000Z',
}

describe('getPageUncached', () => {
  it('returns null when no row exists (unknown slug)', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await getPageUncached('about')).toBeNull()
  })

  it('maps a row to a StaticPage', async () => {
    mockFrom.mockReturnValue(chainable({ data: rawRow, error: null }))
    const page = await getPageUncached('about')
    expect(page).toEqual({ slug: 'about', title: 'About', body: 'Hello World', updatedAt: rawRow.updated_at })
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(getPageUncached('about')).rejects.toThrow('Failed to load page "about": boom')
  })
})

describe('listPagesUncached', () => {
  it('maps every row', async () => {
    mockFrom.mockReturnValue(chainable({ data: [rawRow, { ...rawRow, slug: 'privacy', title: 'Privacy Policy' }], error: null }))
    const pages = await listPagesUncached()
    expect(pages.map((p) => p.slug)).toEqual(['about', 'privacy'])
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listPagesUncached()).rejects.toThrow('Failed to load pages: boom')
  })
})

describe('updatePage', () => {
  it('merges the patch onto the current page before upserting, only changing given keys', async () => {
    const readBuilder = chainable({ data: rawRow, error: null })
    const writeBuilder = chainable({ data: { ...rawRow, body: 'New body' }, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await updatePage('about', { body: 'New body' })

    expect(writeBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'about',
        title: 'About', // unchanged field carried through from current
        body: 'New body', // patched field
      }),
      { onConflict: 'slug' },
    )
  })

  it('falls back to the slug as the title when creating a page with no current row', async () => {
    const readBuilder = chainable({ data: null, error: null })
    const writeBuilder = chainable({ data: rawRow, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1 ? readBuilder : writeBuilder
    })

    await updatePage('about', { body: 'First save' })

    expect(writeBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'about', title: 'about', body: 'First save' }),
      { onConflict: 'slug' },
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

    await expect(updatePage('about', { body: 'X' })).rejects.toThrow('Failed to update page "about": boom')
  })
})
