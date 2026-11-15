import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  updateSiteSettings: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: vi.fn() }))
vi.mock('@/lib/siteSettingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/siteSettingsStore')>()),
  updateSiteSettings: m.updateSiteSettings,
}))

const { PATCH } = await import('./route')
const { MissingMapPhotoColumnError, MissingRightNowColumnError } = await import('@/lib/siteSettingsStore')
const patch = (body: unknown) =>
  PATCH(new Request('http://x/api/admin/site-settings?community=philly', { method: 'PATCH', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.updateSiteSettings.mockImplementation(async (_c: string, body: object) => ({ ...SITE_SETTINGS_DEFAULTS, ...body }))
})

describe('PATCH /api/admin/site-settings', () => {
  // Regression: these card texts show nowhere on the site (the cards hard-code
  // their own headings, the map card's words included), yet blanking one refused
  // the whole save, and the editor sends every field on every save.
  it.each(['desktopBrowseEyebrow', 'desktopBrowseHeading', 'desktopDaveningEyebrow', 'desktopDaveningHeading', 'desktopMapEyebrow', 'desktopMapHeading'])(
    'a blank %s, which the site never shows, does not block the save',
    async (key) => {
      const res = await patch({ ...SITE_SETTINGS_DEFAULTS, [key]: '' })
      expect(res.status).toBe(200)
      expect(m.updateSiteSettings).toHaveBeenCalled()
    },
  )

  it('choosing a map card photo before migration 095 says what’s missing, not a bare failure', async () => {
    m.updateSiteSettings.mockRejectedValue(new MissingMapPhotoColumnError())
    const res = await patch({ desktopMapImage: { url: 'https://example.com/a.jpg', alt: '' } })
    expect(res.status).toBe(409)
    expect((await res.json()).errors).toEqual(['The map card’s photo isn’t set up on this site yet.'])
  })

  it('Right now’s choice: a list of categories, at most two, tidied; anything else refused', async () => {
    expect((await patch({ rightNowCategories: ['shuls', 'shuls', 'eruv'] })).status).toBe(200)
    expect(m.updateSiteSettings).toHaveBeenLastCalledWith('philly', expect.objectContaining({ rightNowCategories: ['shuls', 'eruv'] }))
    expect((await patch({ rightNowCategories: ['a', 'b', 'c'] })).status).toBe(400)
    expect((await patch({ rightNowCategories: 'shuls' })).status).toBe(400)
    expect((await patch({ rightNowCategories: null })).status).toBe(200)
    m.updateSiteSettings.mockRejectedValue(new MissingRightNowColumnError())
    const res = await patch({ rightNowCategories: ['shuls'] })
    expect(res.status).toBe(409)
    expect((await res.json()).errors).toEqual(['Choosing what Right now shows isn’t set up on this site yet.'])
  })

  it.each(['desktopSubscribeEyebrow', 'desktopSubscribeHeading'])(
    'a blank %s, which the site shows, is still refused',
    async (key) => {
      const res = await patch({ ...SITE_SETTINGS_DEFAULTS, [key]: '' })
      expect(res.status).toBe(400)
      expect(m.updateSiteSettings).not.toHaveBeenCalled()
    },
  )

  // Tabs (lib/navTabs.ts): all links or all headings, headings hold links,
  // nothing deeper; an empty tab saves, since it's just not shown yet.
  const link = (id: string) => ({ id, label: id, kind: 'link', target: 'about' })
  const heading = (id: string, items: unknown[] = [link(`${id}-l`)]) => ({ id, label: id, kind: 'heading', items })
  const tab = (items: unknown[]) => ({ id: 't', label: 'Tab', kind: 'more-menu', items })
  it.each([
    ['an empty tab', tab([])],
    ['a tab of links', tab([link('a'), link('b')])],
    ['a tab of headings', tab([heading('h1'), heading('h2', [])])],
  ])('saves %s', async (_name, item) => {
    expect((await patch({ desktopNavItems: [item] })).status).toBe(200)
  })

  it.each([
    ['links and headings mixed', tab([link('a'), heading('h')])],
    ['a heading in a heading', tab([heading('h', [heading('deeper')])])],
    ['a heading outside a tab', heading('h')],
    ['a tab in a tab', tab([tab([])])],
  ])('refuses %s', async (_name, item) => {
    expect((await patch({ desktopNavItems: [item] })).status).toBe(400)
    expect(m.updateSiteSettings).not.toHaveBeenCalled()
  })
  // A phone tab emptied by its × (Nov 4) saves, like an empty tab on a computer.
  const phone = (target: string, id = target || 'blank') => ({ id, label: id, target })
  // What changed answers only while a tab or link has it (changesLinked), so
  // a save can flip its page between the page and a 404. The shared tags are
  // stale-while-revalidate: without its own path expired, the admin's next
  // load after adding the tab was the old 404 (the user, Nov 15).
  it("expires What changed's page at once, so a new tab to it works on the next load", async () => {
    m.revalidatePath.mockClear()
    const res = await patch({ mobileTabs: [{ id: 't1', label: 'Home', target: 'home' }, { id: 't2', label: 'Activity', target: 'changes' }] })
    expect(res.status).toBe(200)
    expect(m.revalidatePath).toHaveBeenCalledWith('/philly/changes')
  })

  it('saves a phone tab with nothing in it yet', async () => {
    expect((await patch({ mobileTabs: [phone('map'), phone('')] })).status).toBe(200)
  })

  it('refuses a phone bar where no tab opens anything', async () => {
    expect((await patch({ mobileTabs: [phone(''), phone('', 'b')] })).status).toBe(400)
    expect(m.updateSiteSettings).not.toHaveBeenCalled()
  })
})
