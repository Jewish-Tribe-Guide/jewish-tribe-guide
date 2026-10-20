import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { Watch } from '@/lib/watches'
import { NEWSLETTER_IGNORED_CREATOR, NEWSLETTER_WATCH_CREATOR } from '@/lib/newsletter'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  listCategories: vi.fn(),
  listApprovedResources: vi.fn(),
  listWatches: vi.fn(),
  getWatch: vi.fn(),
  addWatch: vi.fn(),
  updateWatch: vi.fn(),
  removeWatch: vi.fn(),
  runAndRecord: vi.fn(),
  enforceRateLimit: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/watchStore', () => ({
  listWatches: m.listWatches,
  getWatch: m.getWatch,
  addWatch: m.addWatch,
  updateWatch: m.updateWatch,
  removeWatch: m.removeWatch,
}))
vi.mock('@/lib/watchRunner', () => ({ runAndRecord: m.runAndRecord }))

const { GET, POST } = await import('./route')
const SHUL = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const WATCH = '7d1f3c2a-9b8e-4c6d-a5f4-3e2d1c0b9a87'
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/admin/watches?community=philly', { method, body: body === undefined ? undefined : JSON.stringify(body) })

const added = { id: WATCH, communityId: 'philly', kind: 'website', url: 'https://lowermerionsynagogue.org/' } as Watch

beforeEach(() => {
  vi.clearAllMocks()
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listCategories.mockResolvedValue([makeCategory({ id: 'synagogue', label: 'Synagogue' })])
  m.listApprovedResources.mockResolvedValue([makeListing({ id: SHUL, category: 'synagogue', name: 'Lower Merion Synagogue' })])
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.addWatch.mockResolvedValue(added)
  m.runAndRecord.mockImplementation(async (w: Watch) => ({ watch: { ...w, lastRunAt: 'now' } }))
  m.enforceRateLimit.mockResolvedValue(null)
})

describe('/api/admin/watches', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect((await POST(req('POST', { action: 'add', url: 'x.org' }))).status).toBe(401)
    expect(m.addWatch).not.toHaveBeenCalled()
  })

  it('lists the watches and the listings a page can keep current', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body).toMatchObject({ ok: true, available: true, watches: [] })
    expect(body.listings).toEqual([{ id: SHUL, name: 'Lower Merion Synagogue', categoryLabel: 'Synagogue', reads: null }])
  })

  // Oct 19: "Add a watch" offers a place by what its own page can keep
  // current, so each listing says.
  it('says what each listing’s own page can keep current', async () => {
    m.listCategories.mockResolvedValue([
      makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] }),
    ])
    const body = await (await GET(req('GET'))).json()
    expect(body.listings[0].reads).toBe('times')
  })

  it('adds a page typed without https, tied to a listing, and checks it at once', async () => {
    const res = await POST(req('POST', { action: 'add', url: ' lowermerionsynagogue.org ', resourceId: SHUL, label: 'Weekly times' }))
    expect(res.status).toBe(200)
    expect(m.addWatch).toHaveBeenCalledWith('philly', {
      kind: 'website',
      url: 'https://lowermerionsynagogue.org/',
      resourceId: SHUL,
      label: 'Weekly times',
      createdBy: 'me@x.co',
    })
    expect(m.runAndRecord).toHaveBeenCalledWith(added, undefined, undefined, { full: true })
    expect((await res.json()).watch.lastRunAt).toBe('now')
  })

  it('reads Keystone-K’s list as a list, from its address', async () => {
    await POST(req('POST', { action: 'add', url: 'https://www.keystone-k.org/establishments' }))
    expect(m.addWatch.mock.calls[0][1].kind).toBe('keystone_list')
  })

  it('refuses what isn’t a web address, a listing from elsewhere, and a page already watched', async () => {
    expect((await POST(req('POST', { action: 'add', url: 'mailto:a@b.org' }))).status).toBe(400)
    expect((await POST(req('POST', { action: 'add', url: 'x.org', resourceId: WATCH }))).status).toBe(400)
    m.addWatch.mockResolvedValue(null)
    expect((await POST(req('POST', { action: 'add', url: 'x.org' }))).status).toBe(409)
  })

  // Oct 17: Refuah's pages build themselves in the browser. A hospital's own
  // page is read from its data and compared with the hospital it's tied to;
  // a search, or a page tied to nothing, could only ever fail.
  it('takes a Refuah hospital page only tied to a listing, and never a Refuah search', async () => {
    const search = await POST(req('POST', { action: 'add', url: 'https://refuah.com/?q=Hospital+of+the+University+of+Pennsylvania', resourceId: SHUL }))
    expect(search.status).toBe(400)
    expect((await search.json()).errors[0]).toContain('hospital’s own page')
    const loose = await POST(req('POST', { action: 'add', url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5' }))
    expect(loose.status).toBe(400)
    expect((await loose.json()).errors[0]).toContain('Pick the hospital')
    expect(m.addWatch).not.toHaveBeenCalled()
    expect((await POST(req('POST', { action: 'add', url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5', resourceId: SHUL }))).status).toBe(200)
    expect(m.addWatch.mock.calls[0][1]).toMatchObject({ kind: 'website', resourceId: SHUL })
  })

  // Oct 19: a shul's or mikvah's own page, read by the AI for its times or
  // hours when it changes (listingPageWatch.ts). Tied to the listing it
  // keeps current, as a Refuah page is to its hospital.
  it('adds a listing’s own page only tied to a listing with times or hours, as the run’s kind of watch', async () => {
    m.listCategories.mockResolvedValue([
      makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] }),
      makeCategory({ id: 'school', label: 'School', detailFields: [] }),
    ])
    const SCHOOL = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
    m.listApprovedResources.mockResolvedValue([
      makeListing({ id: SHUL, category: 'synagogue', name: 'Lower Merion Synagogue' }),
      makeListing({ id: SCHOOL, category: 'school', name: 'A School' }),
    ])
    const loose = await POST(req('POST', { action: 'add', url: 'lms.org/davening', forListing: true }))
    expect(loose.status).toBe(400)
    expect((await loose.json()).errors[0]).toContain('Pick the shul or mikvah')
    const school = await POST(req('POST', { action: 'add', url: 'school.org', resourceId: SCHOOL, forListing: true }))
    expect(school.status).toBe(400)
    expect((await school.json()).errors[0]).toContain('no davening times or hours')
    expect(m.addWatch).not.toHaveBeenCalled()

    expect((await POST(req('POST', { action: 'add', url: 'lms.org/davening', resourceId: SHUL, forListing: true }))).status).toBe(200)
    expect(m.addWatch).toHaveBeenCalledWith('philly', {
      kind: 'website',
      url: 'https://lms.org/davening',
      resourceId: SHUL,
      label: 'Lower Merion Synagogue · davening times on their website',
      createdBy: 'listing pages',
    })
    expect(m.runAndRecord).toHaveBeenCalledWith(added, undefined, undefined, { full: true })
  })

  // Oct 19: the admin says what a watch is for, and the source has to suit
  // it: a shul's times from its page or its newsletter's address (one
  // choice since Oct 20), hours from a listing's own page, and an eruv's
  // status is set on the eruv.
  describe('by what it keeps current', () => {
    beforeEach(() => {
      m.listCategories.mockResolvedValue([
        makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] }),
      ])
    })

    it('refuses a source that doesn’t suit it, and what isn’t added here', async () => {
      const hoursEmail = await POST(req('POST', { action: 'add', purpose: 'hours', url: 'office@lms.org', resourceId: SHUL }))
      expect(hoursEmail.status).toBe(400)
      expect((await hoursEmail.json()).errors[0]).toContain('web address of the page')
      expect((await POST(req('POST', { action: 'add', purpose: 'weekly', url: 'office@lms.org', resourceId: SHUL }))).status).toBe(400)
      expect((await POST(req('POST', { action: 'add', purpose: 'eruv', url: 'eruv.org' }))).status).toBe(400)
      expect((await POST(req('POST', { action: 'add', purpose: 'menu', url: 'menu.org', resourceId: SHUL }))).status).toBe(400)
      expect((await POST(req('POST', { action: 'add', purpose: 'whatever', url: 'x.org' }))).status).toBe(400)
      expect((await POST(req('POST', { action: 'add', purpose: 'hospital', url: 'https://refuah.com/?q=x', resourceId: SHUL }))).status).toBe(400)
      expect(m.addWatch).not.toHaveBeenCalled()
    })

    it('reads a shul’s page for its times, and won’t take a shul’s page for hours', async () => {
      const hours = await POST(req('POST', { action: 'add', purpose: 'hours', url: 'lms.org/davening', resourceId: SHUL }))
      expect(hours.status).toBe(400)
      expect((await hours.json()).errors[0]).toBe('Lower Merion Synagogue has no hours to keep current.')
      expect((await POST(req('POST', { action: 'add', purpose: 'times', url: 'lms.org/davening', resourceId: SHUL }))).status).toBe(200)
      expect(m.addWatch.mock.calls[0][1]).toMatchObject({ resourceId: SHUL, createdBy: 'listing pages', label: 'Lower Merion Synagogue · davening times on their website' })
    })

    it('takes a shul’s times by the address its newsletter comes from too', async () => {
      expect((await POST(req('POST', { action: 'add', purpose: 'times', url: 'Info@Mekor.org', resourceId: SHUL }))).status).toBe(200)
      expect(m.addWatch.mock.calls[0][1]).toMatchObject({ url: 'mailto:info@mekor.org', createdBy: NEWSLETTER_WATCH_CREATOR })
    })

    it('keeps any other page as a plain watch', async () => {
      expect((await POST(req('POST', { action: 'add', purpose: 'other', url: 'bzbi.org/worship' }))).status).toBe(200)
      expect(m.addWatch.mock.calls[0][1]).toMatchObject({ url: 'https://bzbi.org/worship', resourceId: null, createdBy: 'me@x.co' })
    })
  })

  it('checks, pauses and removes only this community’s watches', async () => {
    m.getWatch.mockResolvedValue(null)
    expect((await POST(req('POST', { action: 'remove', id: WATCH }))).status).toBe(404)
    expect(m.removeWatch).not.toHaveBeenCalled()

    m.getWatch.mockResolvedValue(added)
    await POST(req('POST', { action: 'pause', id: WATCH }))
    expect(m.updateWatch).toHaveBeenCalledWith('philly', WATCH, { active: false })
    await POST(req('POST', { action: 'check', id: WATCH }))
    expect(m.runAndRecord).toHaveBeenCalledWith(added, undefined, undefined, { full: true })
    await POST(req('POST', { action: 'remove', id: WATCH }))
    expect(m.removeWatch).toHaveBeenCalledWith('philly', WATCH)
  })

  // The user, Oct 20: "Check now" is the full check, the AI reading the page
  // changed or not, and the row shows what it read. Each can cost an AI
  // read, so there's a ceiling on how often.
  it('checks in full, hands back what it read, and is rate-limited', async () => {
    const lastCheck = { at: 'now', what: 'times', from: 'page', result: 'agrees', read: ['Shacharis Mon–Fri 7:00 AM'], differences: [], queue: null }
    m.getWatch.mockResolvedValue(added)
    m.runAndRecord.mockImplementation(async (w: Watch) => ({ watch: { ...w, lastCheck } }))
    const res = await POST(req('POST', { action: 'check', id: WATCH }))
    expect((await res.json()).watch.lastCheck).toEqual(lastCheck)
    expect(m.runAndRecord).toHaveBeenCalledWith(added, undefined, undefined, { full: true })
    expect(m.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), 'admin-watch-check', expect.objectContaining({ limit: expect.any(Number) }))

    m.runAndRecord.mockClear()
    m.enforceRateLimit.mockResolvedValue(Response.json({ ok: false }, { status: 429 }))
    expect((await POST(req('POST', { action: 'check', id: WATCH }))).status).toBe(429)
    expect((await POST(req('POST', { action: 'add', url: 'x.org' }))).status).toBe(429)
    expect(m.runAndRecord).not.toHaveBeenCalled()
    expect(m.addWatch).not.toHaveBeenCalled()
    // Pausing costs nothing, and isn't held back.
    expect((await POST(req('POST', { action: 'pause', id: WATCH }))).status).toBe(200)
  })

  // Shul newsletters (newsletter.ts): a sender is watched by its address.
  describe('newsletters', () => {
    const sender = { ...added, url: 'mailto:info@mekor.org', resourceId: null, active: false, createdBy: NEWSLETTER_WATCH_CREATOR } as Watch

    it('adds a newsletter by its address, only with the shul it’s from, and doesn’t try to fetch it', async () => {
      expect((await POST(req('POST', { action: 'add', url: 'Info@Mekor.org' }))).status).toBe(400)
      expect(m.addWatch).not.toHaveBeenCalled()
      const res = await POST(req('POST', { action: 'add', url: 'Info@Mekor.org', resourceId: SHUL }))
      expect(res.status).toBe(200)
      expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: 'mailto:info@mekor.org', resourceId: SHUL, label: 'info@mekor.org', createdBy: NEWSLETTER_WATCH_CREATOR })
      expect(m.runAndRecord).not.toHaveBeenCalled()
    })

    it('links a sender to its shul and turns it on', async () => {
      m.getWatch.mockResolvedValue(sender)
      expect((await POST(req('POST', { action: 'link', id: WATCH, resourceId: '5a1f0c2e-7b3d-4e8a-9c6f-1d2e3f4a5b6c' }))).status).toBe(400)
      expect(m.updateWatch).not.toHaveBeenCalled()
      const res = await POST(req('POST', { action: 'link', id: WATCH, resourceId: SHUL }))
      expect((await res.json()).watch).toMatchObject({ resourceId: SHUL, active: true })
      expect(m.updateWatch).toHaveBeenCalledWith('philly', WATCH, { resourceId: SHUL, active: true })
    })

    it('skips a sender that isn’t a shul', async () => {
      m.getWatch.mockResolvedValue(sender)
      await POST(req('POST', { action: 'ignore', id: WATCH }))
      expect(m.updateWatch).toHaveBeenCalledWith('philly', WATCH, { createdBy: NEWSLETTER_IGNORED_CREATOR, resourceId: null, active: false })
    })

    it('links and skips only newsletters, never a page', async () => {
      m.getWatch.mockResolvedValue(added)
      expect((await POST(req('POST', { action: 'link', id: WATCH, resourceId: SHUL }))).status).toBe(400)
      expect((await POST(req('POST', { action: 'ignore', id: WATCH }))).status).toBe(400)
      expect(m.updateWatch).not.toHaveBeenCalled()
    })
  })
})
