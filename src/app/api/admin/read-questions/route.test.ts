import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  listCategories: vi.fn(),
  listReadings: vi.fn(),
  setReadingApproved: vi.fn(),
  forgetReading: vi.fn(),
  listApprovedResources: vi.fn(),
  listTaughtWords: vi.fn(),
  teachWord: vi.fn(),
  unteachWord: vi.fn(),
  revalidatePublicContent: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/questionReadingStore', () => ({ listReadings: m.listReadings, setReadingApproved: m.setReadingApproved, forgetReading: m.forgetReading }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/askWordStore', () => ({ listTaughtWords: m.listTaughtWords, teachWord: m.teachWord, unteachWord: m.unteachWord }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))

const { GET, POST } = await import('./route')
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/admin/read-questions?community=philly', { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })

const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  pluralLabel: 'Food',
  detailFields: [
    { key: 't', label: 'Food Type', type: 'select', filterable: true },
    { key: 'kosherCert', label: 'Kosher Cert', type: 'select', filterable: true },
    { key: 'notes', label: 'Notes', type: 'text' },
  ],
})
const place = (name: string, details: Record<string, unknown>) => ({ id: name, category: 'restaurant', name, anchorId: 'community', distance: 0, address: '', ...details })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listCategories.mockResolvedValue([food])
  m.listApprovedResources.mockResolvedValue([place('Holy Cow', { kosherCert: 'IKC', t: ['Dairy'] }), place('Milk Bar', { t: ['Dairy'], notes: 'IKC' })])
  m.listTaughtWords.mockResolvedValue({ available: true, words: [] })
  m.listReadings.mockResolvedValue({
    available: true,
    readings: [
      {
        key: 'ikc dairy',
        question: 'IKC dairy?',
        reading: { categories: [{ id: 'restaurant', select: { t: ['Dairy'], kosherCert: ['IKC'] } }] },
        model: 'gpt-6-luna',
        hits: 4,
        createdAt: '2026-09-30T10:00:00Z',
        lastUsedAt: '2026-09-30T12:00:00Z',
        approvedAt: null,
        approvedBy: null,
      },
    ],
  })
})

describe('/api/admin/read-questions', () => {
  it('admins only, both ways', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect((await POST(req('POST', { key: 'ikc dairy', action: 'approve' }))).status).toBe(401)
    expect((await POST(req('POST', { action: 'teach', word: { word: 'ikc', categoryId: 'restaurant' } }))).status).toBe(401)
    expect(m.teachWord).not.toHaveBeenCalled()
    expect(m.setReadingApproved).not.toHaveBeenCalled()
  })

  it('lists each reading in words, never who asked', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body.ok).toBe(true)
    expect(body.readings[0]).toEqual({
      key: 'ikc dairy',
      question: 'IKC dairy?',
      labels: ['Food', 'Dairy', 'IKC'],
      proposals: [
        { word: 'ikc', categoryId: 'restaurant', field: 'kosherCert', value: 'IKC', label: 'Food · Kosher Cert: IKC' },
        { word: 'dairy', categoryId: 'restaurant', field: 't', value: 'Dairy', label: 'Food · Food Type: Dairy' },
      ],
      hits: 4,
      model: 'gpt-6-luna',
      lastUsedAt: '2026-09-30T12:00:00Z',
      approvedAt: null,
      approvedBy: null,
    })
  })

  it('proposes only what our own search still leaves over, and lists what’s taught', async () => {
    m.listTaughtWords.mockResolvedValue({
      available: true,
      words: [{ word: 'ikc', categoryId: 'restaurant', field: 'kosherCert', value: 'IKC', fromQuestion: 'IKC dairy?', taughtBy: 'me@x.co', taughtAt: '2026-09-30T12:00:00Z' }],
    })
    const body = await (await GET(req('GET'))).json()
    expect(body.readings[0].proposals.map((p: { word: string }) => p.word)).toEqual(['dairy'])
    expect(body.words).toEqual([expect.objectContaining({ word: 'ikc', label: 'Food · Kosher Cert: IKC', taughtBy: 'me@x.co' })])
    expect(body.wordsAvailable).toBe(true)
  })

  it('teaches a word, by whom and from which question, and the site sees it', async () => {
    const res = await POST(req('POST', { action: 'teach', word: { word: 'IKC', categoryId: 'restaurant', field: 'kosherCert', value: 'IKC' }, question: 'IKC dairy?' }))
    expect(res.status).toBe(200)
    expect(m.teachWord).toHaveBeenCalledWith('philly', { word: 'ikc', categoryId: 'restaurant', field: 'kosherCert', value: 'IKC' }, 'me@x.co', 'IKC dairy?')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
    await POST(req('POST', { action: 'unteach', word: 'ikc' }))
    expect(m.unteachWord).toHaveBeenCalledWith('philly', 'ikc')
  })

  it('teaches only what the guide has: a real category, and a filter its page offers', async () => {
    for (const word of [
      { word: 'x', categoryId: 'nope' },
      { word: 'x', categoryId: 'restaurant', field: 'notes', value: 'y' },
      { word: 'x', categoryId: 'restaurant', field: 't' },
      { word: '', categoryId: 'restaurant' },
      { word: 'a b c d', categoryId: 'restaurant' },
      'ikc',
    ]) {
      expect((await POST(req('POST', { action: 'teach', word }))).status, JSON.stringify(word)).toBe(400)
    }
    expect(m.teachWord).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('approve records who; unapprove takes it back; forget deletes', async () => {
    expect((await POST(req('POST', { key: 'ikc dairy', action: 'approve' }))).status).toBe(200)
    expect(m.setReadingApproved).toHaveBeenLastCalledWith('philly', 'ikc dairy', 'me@x.co')
    await POST(req('POST', { key: 'ikc dairy', action: 'unapprove' }))
    expect(m.setReadingApproved).toHaveBeenLastCalledWith('philly', 'ikc dairy', null)
    await POST(req('POST', { key: 'ikc dairy', action: 'forget' }))
    expect(m.forgetReading).toHaveBeenCalledWith('philly', 'ikc dairy')
  })

  it('refuses anything else', async () => {
    for (const body of ['not json', { key: '', action: 'approve' }, { key: 'x', action: 'delete-all' }, { key: 'x'.repeat(201), action: 'forget' }]) {
      expect((await POST(req('POST', body))).status, JSON.stringify(body)).toBe(400)
    }
    expect(m.forgetReading).not.toHaveBeenCalled()
  })

  it('says why, when the table isn’t there yet', async () => {
    m.setReadingApproved.mockRejectedValue(new Error('relation does not exist'))
    const res = await POST(req('POST', { key: 'ikc dairy', action: 'approve' }))
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/migration 062/)
  })
})
