import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftHomeSection, HomeSection } from './homeSections'
import { saveHomeSections } from './homeSectionsDraft'

function section(overrides: Partial<HomeSection> = {}): HomeSection {
  return { id: 'featured', title: 'Featured', sortOrder: 100, cardIds: ['a'], ...overrides }
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saveHomeSections', () => {
  it('deletes sections dropped from the draft, leaving an unchanged survivor untouched', async () => {
    const original = [section({ id: 'a', title: 'A', cardIds: ['x'] }), section({ id: 'b' })]
    const draft: DraftHomeSection[] = [{ id: 'a', title: 'A', cardIds: ['x'] }]

    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchSpy)

    await saveHomeSections('token', original, draft)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/home-sections/b',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('creates a brand-new section and uses its real id going forward (e.g. for sortOrder reconciliation)', async () => {
    const original: HomeSection[] = []
    const draft: DraftHomeSection[] = [{ id: 'new:123', title: 'New Section', cardIds: ['x'] }]

    const fetchSpy = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (opts.method === 'POST') {
        return Promise.resolve(
          jsonResponse({ ok: true, section: section({ id: 'new-section', sortOrder: 100 }) }),
        )
      }
      throw new Error(`unexpected call: ${url} ${opts.method}`)
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await saveHomeSections('token', original, draft)

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/home-sections',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'New Section', cardIds: ['x'] }),
      }),
    )
    expect(result[0].id).toBe('new-section')
  })

  it('patches a section whose title or cardIds changed', async () => {
    const original = [section({ id: 'a', title: 'Old Title', cardIds: ['x'] })]
    const draft: DraftHomeSection[] = [{ id: 'a', title: 'New Title', cardIds: ['x'] }]

    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, section: section({ id: 'a', title: 'New Title', sortOrder: 100 }) }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await saveHomeSections('token', original, draft)

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/home-sections/a',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'New Title', cardIds: ['x'] }),
      }),
    )
  })

  it('leaves an unchanged section alone (no PATCH for title/cardIds) when order is also unchanged', async () => {
    const original = [section({ id: 'a', title: 'Same', cardIds: ['x'], sortOrder: 100 })]
    const draft: DraftHomeSection[] = [{ id: 'a', title: 'Same', cardIds: ['x'] }]

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await saveHomeSections('token', original, draft)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual(original)
  })

  it('reconciles sortOrder to the draft order only for sections whose position actually changed', async () => {
    // Reordered: b now comes first, so a needs sortOrder 200, b needs 100 (was 200).
    const original = [section({ id: 'a', sortOrder: 100 }), section({ id: 'b', sortOrder: 200 })]
    const draft: DraftHomeSection[] = [
      { id: 'b', title: 'Featured', cardIds: ['a'] },
      { id: 'a', title: 'Featured', cardIds: ['a'] },
    ]

    const patchCalls: string[] = []
    const fetchSpy = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      patchCalls.push(url)
      const id = url.split('/').pop()!
      const sortOrder = JSON.parse(opts.body as string).sortOrder
      return Promise.resolve(jsonResponse({ ok: true, section: section({ id, sortOrder }) }))
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await saveHomeSections('token', original, draft)

    expect(patchCalls).toEqual(['/api/admin/home-sections/b', '/api/admin/home-sections/a'])
    expect(result.map((s) => [s.id, s.sortOrder])).toEqual([
      ['b', 100],
      ['a', 200],
    ])
  })

  it('throws the server-provided error message when a save fails', async () => {
    const original = [section({ id: 'a' })]
    const draft: DraftHomeSection[] = [{ id: 'a', title: 'Renamed', cardIds: ['a'] }]

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, errors: ['Not authorized.'] }, false)))

    await expect(saveHomeSections('token', original, draft)).rejects.toThrow('Not authorized.')
  })

  it('falls back to a generic message when the server gives no errors array', async () => {
    const original = [section({ id: 'a' })]
    const draft: DraftHomeSection[] = [{ id: 'a', title: 'Renamed', cardIds: ['a'] }]

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false }, false)))

    await expect(saveHomeSections('token', original, draft)).rejects.toThrow('Could not save a section.')
  })
})
