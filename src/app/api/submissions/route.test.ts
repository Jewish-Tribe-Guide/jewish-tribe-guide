import { beforeEach, describe, expect, it, vi } from 'vitest'

// Everything the route reaches outside itself is mocked; the pure helpers it
// leans on (honeypot, size limits, URL normalisation, capabilities) are real,
// so these tests describe the route's actual decisions rather than a mock's.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  resolveCommunity: vi.fn(),
  getResourceById: vi.fn(),
  getCategoryById: vi.fn(),
  validateSubmission: vi.fn(),
  hasListingChanged: vi.fn(),
  submitListingCreate: vi.fn(),
  submitListingUpdate: vi.fn(),
  submitListingDelete: vi.fn(),
  sendSubmissionNotification: vi.fn(),
  sendSubmissionConfirmation: vi.fn(),
  after: vi.fn(),
  contributions: { add: true, edit: true, report: true },
}))

vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/communityStore', () => ({
  resolveCommunity: m.resolveCommunity,
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
}))
vi.mock('@/lib/resourceStore', () => ({ getResourceById: m.getResourceById, validateSubmission: m.validateSubmission }))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: m.getCategoryById }))
vi.mock('@/lib/listingDiff', () => ({ hasListingChanged: m.hasListingChanged }))
vi.mock('@/lib/submissionStore', () => ({
  submitListingCreate: m.submitListingCreate,
  submitListingUpdate: m.submitListingUpdate,
  submitListingDelete: m.submitListingDelete,
}))
vi.mock('@/lib/email', () => ({ sendSubmissionNotification: m.sendSubmissionNotification }))
vi.mock('@/lib/confirmationEmail', () => ({ sendSubmissionConfirmation: m.sendSubmissionConfirmation }))
vi.mock('next/server', () => ({ after: m.after }))
vi.mock('@/lib/uiConfig', () => ({ ui: { contributions: m.contributions } }))

const { POST } = await import('./route')

const post = (body: unknown, query = '') =>
  POST(new Request(`http://x/api/submissions${query}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))

const listing = { name: 'Shul', category: 'synagogue', address: '1 Main St' }

beforeEach(() => {
  vi.resetAllMocks()
  m.contributions.add = m.contributions.edit = m.contributions.report = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getResourceById.mockResolvedValue({ id: 'r1', category: 'synagogue' })
  m.getCategoryById.mockResolvedValue({ id: 'synagogue', detailFields: [], capabilities: undefined })
  m.validateSubmission.mockReturnValue([])
  m.hasListingChanged.mockReturnValue(true)
  m.submitListingCreate.mockResolvedValue({ id: 's1' })
  m.submitListingUpdate.mockResolvedValue({ id: 's2' })
  m.submitListingDelete.mockResolvedValue({ id: 's3' })
  m.sendSubmissionNotification.mockResolvedValue(undefined)
  m.sendSubmissionConfirmation.mockResolvedValue(undefined)
})

const nothingStored = () => {
  expect(m.submitListingCreate).not.toHaveBeenCalled()
  expect(m.submitListingUpdate).not.toHaveBeenCalled()
  expect(m.submitListingDelete).not.toHaveBeenCalled()
}

describe('POST /api/submissions — refusals before anything is stored', () => {
  it('returns the rate limiter’s response untouched', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await post({ operation: 'create', payload: listing })).status).toBe(429)
    expect(m.verifyTurnstile).not.toHaveBeenCalled()
    nothingStored()
  })

  it('400s on a body that is not JSON', async () => {
    expect((await post('{nope')).status).toBe(400)
    nothingStored()
  })

  it('413s on an oversized body', async () => {
    const res = await post({ operation: 'create', payload: { ...listing, name: 'x'.repeat(100_000) } })
    expect(res.status).toBe(413)
    nothingStored()
  })

  it('pretends to accept a honeypot hit but stores and verifies nothing', async () => {
    const res = await post({ operation: 'create', payload: listing, company: 'spam inc' })
    expect(await res.json()).toEqual({ ok: true, id: 'ok' })
    expect(m.verifyTurnstile).not.toHaveBeenCalled()
    nothingStored()
  })

  it('403s with code "turnstile" when verification fails, so the client knows a retry can help', async () => {
    m.verifyTurnstile.mockResolvedValue(false)
    const res = await post({ operation: 'create', payload: listing })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('turnstile')
    nothingStored()
  })

  it('refuses category suggestions outright', async () => {
    const res = await post({ operation: 'create', targetType: 'category', payload: listing })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBeUndefined()
    nothingStored()
  })

  it.each([
    ['create', 'add'],
    ['update', 'edit'],
    ['delete', 'report'],
  ] as const)('403s a %s when the community has turned %s off', async (operation, flag) => {
    m.contributions[flag] = false
    const res = await post({ operation, targetId: 'r1', payload: listing })
    expect(res.status).toBe(403)
    nothingStored()
  })

  it('400s on an unknown operation', async () => {
    expect((await post({ operation: 'nuke', payload: listing })).status).toBe(400)
    nothingStored()
  })

  it.each(['update', 'delete'])('400s a %s with no target id', async (operation) => {
    expect((await post({ operation, payload: listing })).status).toBe(400)
    nothingStored()
  })

  it.each(['create', 'update'])('400s a %s with no listing details', async (operation) => {
    expect((await post({ operation, targetId: 'r1' })).status).toBe(400)
    nothingStored()
  })

  it('404s an edit aimed at a listing that is not in this community', async () => {
    m.resolveCommunity.mockResolvedValue({ slug: 'ues' })
    m.getResourceById.mockResolvedValue(null)
    const res = await post({ operation: 'update', targetId: 'other-community-id', payload: listing }, '?community=ues')
    expect(res.status).toBe(404)
    // The lookup is scoped to the community the request was made for.
    expect(m.getResourceById).toHaveBeenCalledWith('other-community-id', 'ues')
    expect(m.resolveCommunity).toHaveBeenCalledWith('ues')
    nothingStored()
  })

  it('403s when the target category has that action switched off', async () => {
    m.getCategoryById.mockResolvedValue({ id: 'synagogue', detailFields: [], capabilities: { add: false } })
    const res = await post({ operation: 'create', payload: listing })
    expect(res.status).toBe(403)
    nothingStored()
  })

  it('400s with the validator’s messages', async () => {
    m.validateSubmission.mockReturnValue(['Name is required.'])
    const res = await post({ operation: 'create', payload: listing })
    expect(res.status).toBe(400)
    expect((await res.json()).errors).toEqual(['Name is required.'])
    nothingStored()
  })

  it('400s an edit that changes nothing', async () => {
    m.hasListingChanged.mockReturnValue(false)
    const res = await post({ operation: 'update', targetId: 'r1', payload: listing })
    expect(res.status).toBe(400)
    expect((await res.json()).errors[0]).toMatch(/No changes/)
    nothingStored()
  })
})

describe('POST /api/submissions — accepted submissions', () => {
  it('files a create against the request’s community and returns its id', async () => {
    const res = await post({ operation: 'create', payload: listing, submittedBy: { name: 'A', email: 'a@b.co' } })
    expect(await res.json()).toEqual({ ok: true, id: 's1' })
    expect(m.submitListingCreate).toHaveBeenCalledWith('philly', { ...listing, submittedBy: { name: 'A', email: 'a@b.co' } })
  })

  it('files an update with its note and submitter', async () => {
    const res = await post({ operation: 'update', targetId: 'r1', payload: listing, note: 'moved', submittedBy: { name: 'A' } })
    expect(await res.json()).toEqual({ ok: true, id: 's2' })
    expect(m.submitListingUpdate).toHaveBeenCalledWith('philly', 'r1', listing, 'moved', { name: 'A' })
  })

  it('files a report (delete) with a null note when none is given', async () => {
    const res = await post({ operation: 'delete', targetId: 'r1' })
    expect(await res.json()).toEqual({ ok: true, id: 's3' })
    expect(m.submitListingDelete).toHaveBeenCalledWith('philly', 'r1', null, null)
  })

  it('adds the scheme to a bare website in a url detail field before validating and saving', async () => {
    m.getCategoryById.mockResolvedValue({ id: 'synagogue', detailFields: [{ key: 'site', type: 'url' }, { key: 'note', type: 'text' }] })
    await post({ operation: 'create', payload: { ...listing, details: { site: 'example.com', note: 'example.com' } } })
    const saved = m.submitListingCreate.mock.calls[0][1]
    expect(saved.details.site).toMatch(/^https:\/\/example\.com/)
    expect(saved.details.note).toBe('example.com')
    expect(m.validateSubmission.mock.calls[0][0].details.site).toMatch(/^https:/)
  })

  it('sends both emails after the response, and a failed email never fails the request', async () => {
    m.sendSubmissionNotification.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ operation: 'create', payload: listing })
    expect(res.status).toBe(200)
    expect(m.after).toHaveBeenCalledTimes(1)
    await m.after.mock.calls[0][0]()
    expect(m.sendSubmissionNotification).toHaveBeenCalled()
    expect(m.sendSubmissionConfirmation).toHaveBeenCalled()
  })

  it('502s, and sends no email, when saving fails', async () => {
    m.submitListingCreate.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ operation: 'create', payload: listing })
    expect(res.status).toBe(502)
    expect(m.after).not.toHaveBeenCalled()
  })
})
