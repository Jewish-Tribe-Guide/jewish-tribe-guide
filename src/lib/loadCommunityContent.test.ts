import { afterEach, describe, expect, it, vi } from 'vitest'

// Each store is mocked so a failure can be forced. The point of these tests is
// the one behaviour the UI depends on: a failed read must be *recorded*, not
// thrown and not quietly turned into an empty list. An empty grocery directory
// that really means "the database was unreachable" tells someone standing in a
// hospital that there is no kosher grocery near them.
vi.mock('./categoryStore', () => ({ listCategories: vi.fn() }))
vi.mock('./siteSettingsStore', () => ({ getSiteSettings: vi.fn() }))
vi.mock('./homeSectionStore', () => ({ listHomeSections: vi.fn() }))
vi.mock('./formStore', () => ({ listPublishedForms: vi.fn() }))
vi.mock('./hospitalStore', () => ({ listHospitals: vi.fn() }))

const { listCategories } = await import('./categoryStore')
const { getSiteSettings } = await import('./siteSettingsStore')
const { listHomeSections } = await import('./homeSectionStore')
const { listPublishedForms } = await import('./formStore')
const { listHospitals } = await import('./hospitalStore')
const { loadCommunityContent } = await import('./loadCommunityContent')
const { FALLBACK_CATEGORIES } = await import('./categoryFallback')
const { SITE_SETTINGS_DEFAULTS } = await import('./siteSettings')

/** Every store resolving normally. */
function allSucceed() {
  vi.mocked(listCategories).mockResolvedValue([
    { id: 'grocery', label: 'Grocery', pluralLabel: 'Groceries', icon: '🛒', description: '', detailFields: [], kind: 'listing' },
  ])
  vi.mocked(getSiteSettings).mockResolvedValue({ ...SITE_SETTINGS_DEFAULTS, name: 'Real Name' })
  vi.mocked(listHomeSections).mockResolvedValue([])
  vi.mocked(listPublishedForms).mockResolvedValue([])
  vi.mocked(listHospitals).mockResolvedValue([])
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('loadCommunityContent', () => {
  it('reports nothing failed when every read succeeds', async () => {
    allSucceed()
    const content = await loadCommunityContent('philly')

    expect(content.failed).toEqual([])
    expect(content.categories).toHaveLength(1)
    expect(content.settings.name).toBe('Real Name')
  })

  it('records a failed read instead of throwing', async () => {
    allSucceed()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listCategories).mockRejectedValue(new Error('connection refused'))

    const content = await loadCommunityContent('philly')

    expect(content.failed).toContain('categories')
    // And it still returns something usable rather than nothing.
    expect(content.categories).toEqual(FALLBACK_CATEGORIES)
  })

  it('keeps the other reads when one fails', async () => {
    allSucceed()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listHospitals).mockRejectedValue(new Error('boom'))

    const content = await loadCommunityContent('philly')

    expect(content.failed).toEqual(['hospitals'])
    expect(content.settings.name).toBe('Real Name')
    expect(content.categories).toHaveLength(1)
  })

  it('records every failure when several fail', async () => {
    allSucceed()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listCategories).mockRejectedValue(new Error('boom'))
    vi.mocked(getSiteSettings).mockRejectedValue(new Error('boom'))

    const content = await loadCommunityContent('philly')

    expect(content.failed).toEqual(expect.arrayContaining(['categories', 'settings']))
    expect(content.settings).toEqual(SITE_SETTINGS_DEFAULTS)
  })

  // The distinction the whole design rests on.
  it('reports a genuinely empty result as empty, not as failed', async () => {
    allSucceed()
    vi.mocked(listHospitals).mockResolvedValue([])

    const content = await loadCommunityContent('philly')

    expect(content.hospitals).toEqual([])
    expect(content.failed).not.toContain('hospitals')
  })

  it('never throws, whatever happens', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listCategories).mockRejectedValue(new Error('a'))
    vi.mocked(getSiteSettings).mockRejectedValue(new Error('b'))
    vi.mocked(listHomeSections).mockRejectedValue(new Error('c'))
    vi.mocked(listPublishedForms).mockRejectedValue(new Error('d'))
    vi.mocked(listHospitals).mockRejectedValue(new Error('e'))

    const content = await loadCommunityContent('philly')

    expect(content.failed).toHaveLength(5)
    expect(content.categories.length).toBeGreaterThan(0)
  })
})
