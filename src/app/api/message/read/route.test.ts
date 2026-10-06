import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { MessageReading } from '@/lib/messageReader'

// The "+ Add" box's reader: what someone pastes or photographs, read into
// proposals for them to see. Nothing but the photos is saved here.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  listApprovedResources: vi.fn(),
  listCategories: vi.fn(),
  readMessage: vi.fn(),
  readShulWeek: vi.fn(),
  findMenu: vi.fn(),
  readMenu: vi.fn(),
  upload: vi.fn(),
  ui: { contributions: { add: true, edit: true, report: true } },
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    storage: { from: () => ({ upload: m.upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/site-assets/${p}` } }) }) },
  }),
}))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/uiConfig', () => ({ ui: m.ui }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: () => 'philly',
  resolveCommunity: async () => ({ slug: 'philly', name: 'Philadelphia' }),
}))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/shulWeekReading', () => ({ readShulWeek: m.readShulWeek }))
vi.mock('@/lib/menuReader', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/menuReader')>()), findMenu: m.findMenu, readMenu: m.readMenu }))
vi.mock('@/lib/messageReader', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/messageReader')>()), readMessage: m.readMessage }))

const { POST } = await import('./route')

const ARCH = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const MARKET = '1b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a22'
const MEKOR = '2b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a23'
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening', type: 'minyanim' }] })
const hidden = makeCategory({ id: 'hidden', label: 'Hidden', active: false })
const food = makeCategory({ id: 'restaurant', label: 'Food', detailFields: [{ key: 'dishes', label: 'Main dishes', type: 'tags', countLabel: 'main dish' }] })
const SAY = '3b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a24'
const listings = [
  makeListing({ id: ARCH, name: 'Trader Joe’s', category: 'grocery', address: '1324 Arch St', m: ['Chicken'] }),
  makeListing({ id: MARKET, name: 'Trader Joe’s', category: 'grocery', address: '2121 Market St', m: [] }),
  makeListing({ id: MEKOR, name: 'Mekor Habracha', category: 'synagogue', address: '1500 Walnut St' }),
  makeListing({ id: SAY, name: 'Say She Ate', category: 'restaurant', address: '1408 South St', dishes: ['Salads'] }),
]

const req = (fields: Record<string, string | Blob | Blob[]>) => {
  const body = new FormData()
  for (const [k, v] of Object.entries({ turnstileToken: 't', company: '', ...fields })) {
    for (const one of Array.isArray(v) ? v : [v]) body.append(k, one)
  }
  return new Request('http://x/api/message/read?community=philly', { method: 'POST', body })
}
const photo = (type = 'image/webp') => new File([new Uint8Array([1, 2, 3])], 'p.webp', { type })
const reads = (r: MessageReading) => m.readMessage.mockResolvedValue({ ...r, model: 'gpt-6-luna', ms: 1, usage: { input: 0, cachedInput: 0, output: 0 } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  m.ui.contributions.add = m.ui.contributions.edit = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.listApprovedResources.mockResolvedValue(listings)
  m.listCategories.mockResolvedValue([grocery, shuls, hidden, food])
  m.upload.mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/message/read — refusals before any reading', () => {
  it.each([
    ['nothing to read', { text: ' hi ' }, 400],
    ['a file that isn’t a photo', { text: 'Acme has challah', file: photo('application/pdf') }, 400],
    ['more than three photos', { file: [photo(), photo(), photo(), photo()] }, 400],
    ['a honeypot hit', { text: 'Acme has challah', company: 'Spam Inc' }, 400],
  ])('refuses %s', async (_name, fields, status) => {
    expect((await POST(req(fields as never))).status).toBe(status)
    expect(m.readMessage).not.toHaveBeenCalled()
  })

  it('refuses a failed bot check, saying a retry can help', async () => {
    m.verifyTurnstile.mockResolvedValue(false)
    const res = await POST(req({ text: 'Acme has challah' }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('turnstile')
    expect(m.readMessage).not.toHaveBeenCalled()
  })

  it('says it’s off where there’s no AI key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect((await POST(req({ text: 'Acme has challah' }))).status).toBe(503)
  })
})

describe('POST /api/message/read — the reading', () => {
  it('reads against the community’s live categories, from the listing it was opened from', async () => {
    reads({ proposals: [{ kind: 'not_update', note: 'A question' }] })
    await POST(req({ text: 'Where can I get marshmallows?', listingId: ARCH }))
    const [source, catalog, opts] = m.readMessage.mock.calls[0]
    expect(source).toEqual({ text: 'Where can I get marshmallows?', images: [] })
    expect(catalog.categories.map((c: { id: string }) => c.id)).toEqual(['grocery', 'synagogue', 'restaurant'])
    expect(opts).toMatchObject({ communityName: 'Philadelphia', about: ARCH })
  })

  it('says what each proposal changes: the store’s lines, and each branch’s when it asks which', async () => {
    const items = [{ name: 'Chicken', availability: 'always' as const, doubt: null }, { name: 'Stew Meat', availability: 'sometimes' as const, doubt: null }]
    reads({
      proposals: [
        { kind: 'items', listingId: ARCH, asWritten: 'TJ on Arch', chain: false, ask: null, items, note: null, quote: 'x', checked: true },
        { kind: 'items', listingId: null, asWritten: 'trader joes', chain: false, ask: { question: 'Which one?', choices: [{ label: 'Arch', listingId: ARCH }, { label: 'Market', listingId: MARKET }] }, items, note: null, quote: 'x', checked: true },
      ],
    })
    const body = await (await POST(req({ text: 'TJ on Arch always has chicken' }))).json()
    expect(body.proposals[0]).toMatchObject({ listing: { id: ARCH, name: 'Trader Joe’s', categoryLabel: 'Grocery' }, lines: ['+ Stew Meat, sometimes'], held: ['Chicken: already listed'] })
    expect(body.proposals[1].ask.choices.map((c: { lines: string[] }) => c.lines)).toEqual([['+ Stew Meat, sometimes'], ['+ Chicken', '+ Stew Meat, sometimes']])
  })

  // Oct 6: "here's say she ate's main dishes … https://saysheate.co/menu/"
  // was read as a new website. A menu is read by the Main dishes tab's own
  // reader, and comes back as the place's dishes, saying where from.
  describe('a food place’s menu', () => {
    const menu = (url: string | null) => reads({ proposals: [{ kind: 'menu', listingId: SAY, asWritten: 'say she ate', ask: null, url, quote: 'x', checked: true }] })
    const dishes = [
      { name: 'Dosas', quote: 'Masala Dosa', checked: true, named: true },
      { name: 'Salads', quote: 'Salads', checked: true, named: true },
    ]

    it('reads the dishes off the menu at the link, shaped as the place’s items, the new ones marked', async () => {
      menu('https://saysheate.co/menu/')
      m.findMenu.mockResolvedValue({ url: 'https://saysheate.co/menu/', text: 'Masala Dosa … Salads', pdf: null })
      m.readMenu.mockResolvedValue({ sourceUrl: 'https://saysheate.co/menu/', dishes, note: null, model: 'm' })
      const body = await (await POST(req({ text: 'here’s say she ate’s main dishes https://saysheate.co/menu/' }))).json()
      expect(m.findMenu).toHaveBeenCalledWith('https://saysheate.co/menu/')
      expect(m.readMenu.mock.calls[0][1]).toBe('Say She Ate')
      expect(body.proposals[0]).toMatchObject({
        kind: 'items',
        listingId: SAY,
        listing: { name: 'Say She Ate', categoryLabel: 'Food' },
        items: [{ name: 'Dosas', availability: 'always' }, { name: 'Salads', availability: 'always' }],
        menu: { url: 'https://saysheate.co/menu/', dishes },
        lines: ['+ Dosas'],
        held: ['Salads: already listed'],
        dishes: true,
      })
    })

    it('reads a menu from the photos when there’s no link', async () => {
      menu(null)
      m.readMenu.mockResolvedValue({ sourceUrl: null, dishes, note: null, model: 'm' })
      const body = await (await POST(req({ file: photo() }))).json()
      expect(m.findMenu).not.toHaveBeenCalled()
      expect(m.readMenu.mock.calls[0][0]).toEqual({ url: null, text: null, pdf: null, images: [{ mime: 'image/webp', b64: 'AQID' }] })
      expect(body.proposals[0]).toMatchObject({ kind: 'items', menu: { url: null } })
    })

    it('never fetches a delivery app’s menu, and says to send a screenshot', async () => {
      menu('https://www.doordash.com/store/say-she-ate-123')
      const body = await (await POST(req({ text: 'say she ate menu https://www.doordash.com/store/say-she-ate-123' }))).json()
      expect(m.findMenu).not.toHaveBeenCalled()
      expect(m.readMenu).not.toHaveBeenCalled()
      expect(body.proposals[0]).toMatchObject({ kind: 'menu', listing: { name: 'Say She Ate' }, failed: expect.stringContaining('Send a screenshot') })
    })

    it('says why when the menu can’t be opened or names no dishes, and reads one menu a message', async () => {
      menu('https://saysheate.co/menu/')
      m.findMenu.mockResolvedValue(null)
      expect((await (await POST(req({ text: 'say she ate menu' }))).json()).proposals[0].failed).toMatch(/Couldn’t open that menu/)
      m.findMenu.mockResolvedValue({ url: 'https://saysheate.co/', text: 'About us', pdf: null })
      m.readMenu.mockResolvedValue({ sourceUrl: 'https://saysheate.co/', dishes: [], note: 'Not a menu.', model: 'm' })
      expect((await (await POST(req({ text: 'say she ate menu' }))).json()).proposals[0]).toMatchObject({ kind: 'menu', failed: 'Not a menu.' })
      const two = { kind: 'menu' as const, listingId: SAY, asWritten: '', ask: null, url: 'https://saysheate.co/menu/', quote: 'x', checked: true }
      reads({ proposals: [two, two] })
      m.readMenu.mockClear()
      const body = await (await POST(req({ text: 'two menus' }))).json()
      expect(m.readMenu).toHaveBeenCalledTimes(1)
      expect(body.proposals[1].failed).toMatch(/One menu at a time/)
    })
  })

  it('reads a shul’s times with the week reader, from the pasted text', async () => {
    reads({ proposals: [{ kind: 'times', listingId: MEKOR, quote: 'Mincha 6:15', checked: true }] })
    m.readShulWeek.mockResolvedValue({ update: { kind: 'week', days: [] }, model: 'm' })
    const body = await (await POST(req({ text: 'Mekor this week: Mincha 6:15' }))).json()
    expect(m.readShulWeek).toHaveBeenCalledWith(expect.objectContaining({ id: MEKOR }), 'minyanim', { text: 'Mekor this week: Mincha 6:15' }, 'test-key')
    expect(body.proposals[0]).toMatchObject({ kind: 'times', listing: { name: 'Mekor Habracha' }, update: { kind: 'week' } })
  })

  it('keeps the photos for the admin, and reads times from a photo when that’s all there is', async () => {
    reads({ proposals: [{ kind: 'times', listingId: MEKOR, quote: 'photo', checked: false }] })
    m.readShulWeek.mockResolvedValue({ update: { kind: 'week', days: [] }, model: 'm' })
    const body = await (await POST(req({ file: photo() }))).json()
    expect(m.readMessage.mock.calls[0][0].images).toEqual([{ mime: 'image/webp', b64: 'AQID' }])
    expect(m.readShulWeek.mock.calls[0][2]).toEqual({ image: 'AQID', mime: 'image/webp' })
    expect(body.photoUrls).toEqual([expect.stringMatching(/site-assets\/message-source\/\d+-\w+\.webp$/)])
  })

  it('502s, saying to try again, when the reader fails', async () => {
    m.readMessage.mockRejectedValue(new Error('timeout'))
    const res = await POST(req({ text: 'Acme has challah' }))
    expect(res.status).toBe(502)
    expect(m.upload).not.toHaveBeenCalled()
  })
})
