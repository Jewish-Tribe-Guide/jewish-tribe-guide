import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// "Paste their message, or add a photo": the AI reads a shul's schedule
// for the person to check. Nothing reaches the listing from here.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  row: vi.fn(),
  getResourceById: vi.fn(),
  fetchFestivals: vi.fn(),
  readSchedule: vi.fn(),
  upload: vi.fn(),
  ui: { contributions: { add: true, edit: true, report: true } },
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: () => m.row() }
      return chain
    },
    storage: { from: () => ({ upload: m.upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/site-assets/${p}` } }) }) },
  }),
}))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/uiConfig', () => ({ ui: m.ui }))
vi.mock('@/lib/resourceStore', () => ({ getResourceById: m.getResourceById }))
vi.mock('@/lib/festivals', () => ({ fetchFestivals: m.fetchFestivals }))
vi.mock('@/lib/scheduleReader', () => ({ readSchedule: m.readSchedule }))

const { POST } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const sukkos = { festival: 'Sukkos', name: 'Sukkos 5787', from: '2026-09-26', to: '2026-10-04', days: [] }
const reading = { schedule: { id: 's', name: 'Sukkos 5787', from: '2026-09-26', to: '2026-10-04', mode: 'replace', minyanim: [] }, times: [], missing: null, model: 'm' }
const req = (fields: Record<string, string | Blob>) => {
  const body = new FormData()
  for (const [k, v] of Object.entries({ listingId: ID, festival: 'Sukkos', turnstileToken: 't', company: '', ...fields })) body.set(k, v)
  return new Request('http://x/api/schedule/read', { method: 'POST', body })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  m.ui.contributions.edit = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.row.mockResolvedValue({ data: { community_id: 'philly' } })
  m.getResourceById.mockResolvedValue({ id: ID, name: 'Kesher Israel' })
  m.fetchFestivals.mockResolvedValue([sukkos])
  m.readSchedule.mockResolvedValue(reading)
  m.upload.mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/schedule/read', () => {
  it('reads pasted text against the calendar’s own festival, and keeps nothing', async () => {
    const res = await POST(req({ text: 'Shacharis 9:00, Mincha 6:35' }))
    expect(await res.json()).toEqual({ ok: true, ...reading, sourceUrl: null })
    expect(m.readSchedule).toHaveBeenCalledWith({ text: 'Shacharis 9:00, Mincha 6:35' }, sukkos, 'Kesher Israel', { apiKey: 'test-key' })
    expect(m.upload).not.toHaveBeenCalled()
  })

  it('reads a photo as a photo, and keeps it for the admin', async () => {
    const res = await POST(req({ file: new File([new Uint8Array([1, 2, 3])], 'flyer.jpg', { type: 'image/jpeg' }) }))
    const json = await res.json()
    expect(m.readSchedule.mock.calls[0][0]).toEqual({ image: 'AQID', mime: 'image/jpeg' })
    expect(json.sourceUrl).toMatch(/\/site-assets\/schedule-source\/\d+-[a-z0-9]+\.jpeg$/)
  })

  it('refuses without the bot check, with nothing to read, or for a festival that isn’t coming', async () => {
    m.verifyTurnstile.mockResolvedValue(false)
    expect((await POST(req({ text: 'Shacharis 9:00' }))).status).toBe(403)
    m.verifyTurnstile.mockResolvedValue(true)
    expect((await POST(req({ text: 'hi' }))).status).toBe(400)
    expect((await POST(req({ text: 'Shacharis 9:00', festival: 'Purim' }))).status).toBe(400)
    expect((await POST(req({ file: new File(['x'], 'a.txt', { type: 'text/plain' }) }))).status).toBe(400)
    expect(m.readSchedule).not.toHaveBeenCalled()
  })

  it('says it’s off where there’s no AI key, before anything else', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const res = await POST(req({ text: 'Shacharis 9:00' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('off')
    expect(m.verifyTurnstile).not.toHaveBeenCalled()
  })
})
