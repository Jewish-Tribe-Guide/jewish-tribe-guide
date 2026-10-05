import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'

// The "+ Add" box's Send: what the person saw, filed as ordinary
// suggestions labelled "Read by AI", each change worked out again here from
// the listing as it is now.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  listApprovedResources: vi.fn(),
  listCategories: vi.fn(),
  submitListingUpdate: vi.fn(),
  submitListingCreate: vi.fn(),
  sendSubmissionNotification: vi.fn(),
  after: [] as Array<() => unknown>,
  ui: { contributions: { add: true, edit: true, report: true } },
}))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void m.after.push(fn) }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/uiConfig', () => ({ ui: m.ui }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly', name: 'Philadelphia' }) }))
vi.mock('@/lib/resourceStore', async (original) => ({ ...(await original<object>()), listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate, submitListingCreate: m.submitListingCreate }))
vi.mock('@/lib/email', () => ({ sendSubmissionNotification: m.sendSubmissionNotification }))

const { POST } = await import('./route')

const ARCH = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const SUPABASE = 'https://x.supabase.co'
const photo = `${SUPABASE}/storage/v1/object/public/site-assets/message-source/1-abc.webp`
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
const arch = makeListing({ id: ARCH, name: 'Trader Joe’s', category: 'grocery', address: '1324 Arch St', m: ['Chicken'] })
const post = (body: Record<string, unknown>) =>
  POST(new Request('http://x/api/message/send?community=philly', { method: 'POST', body: JSON.stringify({ turnstileToken: 't', company: '', ...body }) }))
const items = [{ name: 'ground beef', availability: 'always', doubt: null }, { name: 'Chicken', availability: 'always', doubt: null }]

beforeEach(() => {
  vi.resetAllMocks()
  m.after.length = 0
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
  m.ui.contributions.add = m.ui.contributions.edit = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.listApprovedResources.mockResolvedValue([arch])
  m.listCategories.mockResolvedValue([grocery])
  m.submitListingUpdate.mockImplementation(async () => ({ id: 's1' }))
  m.submitListingCreate.mockImplementation(async () => ({ id: 's2' }))
  m.sendSubmissionNotification.mockResolvedValue(undefined)
})

describe('POST /api/message/send', () => {
  it('files a store’s change, worked out from the listing as it is, labelled with what it came from', async () => {
    const res = await post({ text: 'TJ on Arch always has kosher ground beef', photoUrls: [photo], stores: [{ listingId: ARCH, items }], email: ' Me@X.co ' })
    expect(await res.json()).toEqual({ ok: true, filed: 1 })
    const [community, id, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, id, by]).toEqual(['philly', ARCH, { email: 'me@x.co' }])
    expect(payload.details.m).toEqual(['Chicken', 'Hamburger Meat'])
    expect(payload.source).toEqual({ readBy: 'ai', from: 'a message', original: 'TJ on Arch always has kosher ground beef', photoUrl: photo })
    expect(note).toContain('+ Hamburger Meat')
    expect(note).toContain('Chicken: already listed')
  })

  it('files a change to other fields, worked out again here, with what the guide can’t hold as a note', async () => {
    const food = makeCategory({ id: 'restaurant', label: 'Food', detailFields: [{ key: 'kosherCert', label: 'Kosher Certification', type: 'select', options: [{ value: 'IKC', label: 'IKC' }, { value: 'Keystone-K', label: 'Keystone-K' }] }] })
    const SAY = '1b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
    m.listCategories.mockResolvedValue([grocery, food])
    m.listApprovedResources.mockResolvedValue([arch, makeListing({ id: SAY, name: 'Say She Ate', category: 'restaurant', kosherCert: 'IKC' })])
    const res = await post({
      text: 'change the kosher certification for say she ate to keystone k',
      edits: [{ listingId: SAY, values: { kosherCert: 'keystone k', googleSyncedAt: 'x' }, notes: ['Hours, Friday, one day only: closes 2:00 PM.'] }],
    })
    expect(await res.json()).toEqual({ ok: true, filed: 1 })
    const [, id, payload, note] = m.submitListingUpdate.mock.calls[0]
    expect(id).toBe(SAY)
    expect(payload.details).toEqual({ kosherCert: 'Keystone-K' })
    expect(payload.source).toMatchObject({ readBy: 'ai', from: 'a message' })
    expect(note).toContain('Kosher Certification: IKC → Keystone-K')
    expect(note).toContain('For the admin:\nHours, Friday, one day only')
  })

  it('files a note alone when nothing else changes, and nothing at all when there’s neither', async () => {
    await post({ text: 'x', edits: [{ listingId: ARCH, values: {}, notes: ['Hours: closes 4:00 PM, but which days isn’t said'] }, { listingId: ARCH, values: { name: 'Trader Joe’s' }, notes: [] }] })
    expect(m.submitListingUpdate).toHaveBeenCalledTimes(1)
    expect(m.submitListingUpdate.mock.calls[0][3]).toContain('which days isn’t said')
  })

  // A new place filled in with the add form: checked as the public route
  // checks one, filed labelled with what it was read from.
  it('files a new place from the add form, labelled with what it was read from, and refuses an invalid one', async () => {
    const form = { category: 'grocery', name: 'South Square Market', address: '2201 South St', phone: '', anchorId: 'all', distance: null, geo: null, details: { m: ['Challah'] }, source: { readBy: 'person', from: 'faked' } }
    expect(await (await post({ text: 'South Square Market has challah', forms: [{ submission: form }], email: 'me@x.co' })).json()).toEqual({ ok: true, filed: 1 })
    const [, payload] = m.submitListingCreate.mock.calls[0]
    expect(payload).toMatchObject({ name: 'South Square Market', submittedBy: { email: 'me@x.co' }, source: { readBy: 'ai', from: 'a message', original: 'South Square Market has challah' } })
    const res = await post({ text: 'x', forms: [{ submission: { ...form, name: '' } }] })
    expect(res.status).toBe(400)
    expect((await res.json()).errors.length).toBeGreaterThan(0)
    expect(m.submitListingCreate).toHaveBeenCalledTimes(1)
  })

  it('files a new place in its category, with what it carries', async () => {
    await post({ text: 'South Square Market on 22nd has challah', places: [{ category: 'grocery', place: { name: 'South Square Market', address: '22nd & South' }, items: [{ name: 'Challah', availability: 'always', doubt: null }] }] })
    const [, payload, note] = m.submitListingCreate.mock.calls[0]
    expect(payload).toMatchObject({ category: 'grocery', name: 'South Square Market', address: '22nd & South', details: { m: ['Challah'], m_sometimes: [] }, source: { readBy: 'ai' } })
    expect(note).toContain('A new place')
  })

  // The browser only says which listing and which items; it can't hand
  // the server a listing, a category it can't add to, or another site's
  // photo.
  it('files nothing for a listing from elsewhere, a store with nothing new, or a category that takes no additions', async () => {
    m.listCategories.mockResolvedValue([{ ...grocery, capabilities: { add: false, edit: true } }])
    const res = await post({
      text: 'x',
      stores: [{ listingId: 'ffffffff-2f55-4a8e-9d57-3b7f0d6f4a21', items }, { listingId: ARCH, items: [{ name: 'Chicken', availability: 'always', doubt: null }] }],
      places: [{ category: 'grocery', place: { name: 'Somewhere' }, items: [] }, { category: 'spa', place: { name: 'Elsewhere' }, items: [] }],
    })
    expect(await res.json()).toEqual({ ok: true, filed: 0 })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.submitListingCreate).not.toHaveBeenCalled()
  })

  it('keeps only photos the reader kept', async () => {
    await post({ text: '', photoUrls: ['https://evil.example/x.png', `${photo}/../../x`, photo], stores: [{ listingId: ARCH, items }] })
    expect(m.submitListingUpdate.mock.calls[0][2].source).toEqual({ readBy: 'ai', from: 'a photo', photoUrl: photo })
  })

  it('tells the admins after answering, and a failed email fails nothing', async () => {
    m.sendSubmissionNotification.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post({ text: 'x', stores: [{ listingId: ARCH, items }] })).status).toBe(200)
    expect(m.sendSubmissionNotification).not.toHaveBeenCalled()
    for (const fn of m.after) await fn()
    expect(m.sendSubmissionNotification).toHaveBeenCalledWith({ id: 's1' })
  })

  it('refuses a failed bot check and an empty send, filing nothing', async () => {
    m.verifyTurnstile.mockResolvedValue(false)
    expect((await post({ stores: [{ listingId: ARCH, items }] })).status).toBe(403)
    m.verifyTurnstile.mockResolvedValue(true)
    expect((await post({ stores: [], places: [] })).status).toBe(400)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })
})
