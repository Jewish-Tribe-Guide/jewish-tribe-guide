import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'

// The route's promise to the page: every way it can't read a question is an
// ordinary answer the page falls back from, never an error; a question read
// before costs nothing; a new one is read, tidied and remembered.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  sharedLimit: vi.fn(),
  findReading: vi.fn(),
  saveReading: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, sharedLimit: m.sharedLimit }))
vi.mock('@/lib/questionReadingStore', () => ({ findReading: m.findReading, saveReading: m.saveReading }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/categoryStore', () => ({
  listCategories: async () => [makeCategory({ id: 'restaurant', pluralLabel: 'Food', detailFields: [{ key: 't', label: 'Food Type', type: 'select', filterable: true }] })],
}))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: async () => [makeListing({ id: 'judah', category: 'restaurant', t: ['Meat'] })] }))

const { POST } = await import('./route')
const ask = (question: unknown) => POST(new Request('http://x/api/ask/read?community=philly', { method: 'POST', body: JSON.stringify({ question }) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  vi.stubGlobal('fetch', m.fetch)
  m.enforceRateLimit.mockResolvedValue(null)
  m.sharedLimit.mockResolvedValue({ ok: true })
  m.findReading.mockResolvedValue(null)
  m.saveReading.mockResolvedValue(undefined)
  m.fetch.mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({ categories: [{ id: 'restaurant', select: { t: ['meat'] } }] }) } }] }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/ask/read', () => {
  it('refuses an empty or overlong question', async () => {
    expect((await ask('')).status).toBe(400)
    expect((await ask('x'.repeat(201))).status).toBe(400)
    expect((await ask(42)).status).toBe(400)
  })

  it('is off without a key, or switched off as every test server does, and says so plainly', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(await (await ask('meat near me')).json()).toEqual({ ok: false, reason: 'off' })
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('QUESTION_READER', 'off')
    expect(await (await ask('meat near me')).json()).toEqual({ ok: false, reason: 'off' })
    expect(m.fetch).not.toHaveBeenCalled()
  })

  it('answers a question read before from memory, without calling the AI or spending a limit', async () => {
    m.findReading.mockResolvedValue({ categories: [{ id: 'restaurant' }] })
    expect(await (await ask('Kosher food?')).json()).toEqual({ ok: true, reading: { categories: [{ id: 'restaurant' }] }, remembered: true })
    expect(m.findReading).toHaveBeenCalledWith('philly', 'kosher food')
    expect(m.fetch).not.toHaveBeenCalled()
    expect(m.enforceRateLimit).not.toHaveBeenCalled()
  })

  it('reads a new question, tidies it to the site’s own words, and remembers it', async () => {
    const body = await (await ask('meat places')).json()
    expect(body).toEqual({ ok: true, reading: { categories: [{ id: 'restaurant', select: { t: ['Meat'] } }] }, remembered: false })
    expect(m.saveReading).toHaveBeenCalledWith('philly', 'meat places', 'meat places', { categories: [{ id: 'restaurant', select: { t: ['Meat'] } }] }, 'gpt-6-luna')
  })

  it('a place named comes back with where it is, from the site’s own places, not the AI', async () => {
    m.fetch.mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({ categories: [{ id: 'restaurant' }], near: 'center city' }) } }] }))
    const body = await (await ask('food in center city')).json()
    expect(body.reading.near).toBe('center city')
    expect(body.reading.place).toEqual({ name: 'Center City', label: 'Center City', geo: { lat: 39.9524, lng: -75.1636 }, radius: 1.3 })
  })

  it('is busy, not broken, once this visitor or everyone together has asked enough', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect(await (await ask('meat')).json()).toEqual({ ok: false, reason: 'busy' })
    m.enforceRateLimit.mockResolvedValue(null)
    m.sharedLimit.mockResolvedValue({ ok: false, retryAfter: 100 })
    expect(await (await ask('dairy')).json()).toEqual({ ok: false, reason: 'busy' })
    expect(m.fetch).not.toHaveBeenCalled()
  })

  it('fails quietly when the AI does: the page answers without it', async () => {
    m.fetch.mockResolvedValue(Response.json({ error: { message: 'quota' } }, { status: 429 }))
    const res = await ask('meat')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, reason: 'failed' })
    expect(m.saveReading).not.toHaveBeenCalled()
  })
})
