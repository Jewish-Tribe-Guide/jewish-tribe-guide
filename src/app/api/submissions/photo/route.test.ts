import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  createBucket: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    storage: { createBucket: m.createBucket, from: () => ({ upload: m.upload, getPublicUrl: m.getPublicUrl }) },
  }),
}))

const { POST } = await import('./route')

function upload(file?: File | string) {
  const form = new FormData()
  if (file !== undefined) form.set('file', file)
  return POST(new Request('http://x/api/submissions/photo', { method: 'POST', body: form }))
}
const png = (bytes = 10) => new File([new Uint8Array(bytes)], 'p.png', { type: 'image/png' })

beforeEach(() => {
  vi.resetAllMocks()
  m.enforceRateLimit.mockResolvedValue(null)
  m.createBucket.mockResolvedValue({ error: null })
  m.upload.mockResolvedValue({ error: null })
  m.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } })
})

describe('POST /api/submissions/photo', () => {
  it('returns the rate limiter’s response and stores nothing', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await upload(png())).status).toBe(429)
    expect(m.upload).not.toHaveBeenCalled()
  })

  it('400s a body that is not multipart form data', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: 'plain', headers: { 'content-type': 'text/plain' } }))
    expect(res.status).toBe(400)
  })

  it.each([
    ['no file field', undefined],
    ['a text field where a file belongs', 'hello'],
  ])('400s %s', async (_n, value) => {
    expect((await upload(value)).status).toBe(400)
    expect(m.upload).not.toHaveBeenCalled()
  })

  it.each(['image/svg+xml', 'application/pdf', 'text/html', 'application/octet-stream'])('refuses %s', async (type) => {
    const res = await upload(new File(['x'], 'f', { type }))
    expect(res.status).toBe(400)
    expect(m.upload).not.toHaveBeenCalled()
  })

  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('accepts %s', async (type) => {
    expect((await upload(new File(['x'], 'f', { type }))).status).toBe(200)
  })

  it('refuses a file over 5MB and accepts one exactly at the limit', async () => {
    expect((await upload(png(5 * 1024 * 1024 + 1))).status).toBe(400)
    expect(m.upload).not.toHaveBeenCalled()
    expect((await upload(png(5 * 1024 * 1024))).status).toBe(200)
  })

  it('uploads under listing-photo/ with a generated name and the right content type, and returns the public URL', async () => {
    const res = await upload(png())
    expect(await res.json()).toEqual({ ok: true, url: 'https://cdn/x.png' })
    const [path, , opts] = m.upload.mock.calls[0]
    expect(path).toMatch(/^listing-photo\/\d+-[a-z0-9]+\.png$/)
    expect(opts).toEqual({ contentType: 'image/png', upsert: false })
  })

  it('never uses the visitor’s own filename in the stored path', async () => {
    await upload(new File(['x'], '../../etc/passwd.png', { type: 'image/png' }))
    expect(m.upload.mock.calls[0][0]).not.toMatch(/passwd|\.\./)
  })

  it('tolerates a bucket that already exists but fails on any other bucket error', async () => {
    m.createBucket.mockResolvedValue({ error: { message: 'The resource already exists' } })
    expect((await upload(png())).status).toBe(200)
    m.createBucket.mockResolvedValue({ error: { message: 'permission denied' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await upload(png())).status).toBe(502)
  })

  it('502s when the upload itself fails', async () => {
    m.upload.mockResolvedValue({ error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await upload(png())).status).toBe(502)
  })
})
