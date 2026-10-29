import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  updateSiteSettings: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: vi.fn() }))
vi.mock('@/lib/siteSettingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/siteSettingsStore')>()),
  updateSiteSettings: m.updateSiteSettings,
}))

const { PATCH } = await import('./route')
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
  // their own headings, and there is no Map card), yet blanking one refused
  // the whole save, and the editor sends every field on every save.
  it.each(['desktopBrowseEyebrow', 'desktopBrowseHeading', 'desktopDaveningEyebrow', 'desktopDaveningHeading', 'desktopMapEyebrow', 'desktopMapHeading'])(
    'a blank %s, which the site never shows, does not block the save',
    async (key) => {
      const res = await patch({ ...SITE_SETTINGS_DEFAULTS, [key]: '' })
      expect(res.status).toBe(200)
      expect(m.updateSiteSettings).toHaveBeenCalled()
    },
  )

  it.each(['desktopListingsHeading', 'desktopSubscribeHeading', 'desktopJewishTimesHeading'])(
    'a blank %s, which the site shows, is still refused',
    async (key) => {
      const res = await patch({ ...SITE_SETTINGS_DEFAULTS, [key]: '' })
      expect(res.status).toBe(400)
      expect(m.updateSiteSettings).not.toHaveBeenCalled()
    },
  )
})
