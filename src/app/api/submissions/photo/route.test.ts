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
const SIGNATURES: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/gif': [...new TextEncoder().encode('GIF89a')],
  'image/webp': [...new TextEncoder().encode('RIFF\0\0\0\0WEBP')],
}
/** A file that really is the kind it says, `size` bytes long. */
const image = (type: string, size = 16, name = 'f') => {
  const bytes = new Uint8Array(size)
  bytes.set(SIGNATURES[type])
  return new File([bytes], name, { type })
}
const png = (bytes = 16) => image('image/png', bytes, 'p.png')

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
    expect((await upload(image(type))).status).toBe(200)
  })

  // The type on a file is whatever the sender wrote (Nov 18 review, item 26).
  it('refuses a file whose bytes are not the image its label says', async () => {
    const res = await upload(new File(['<html><script>alert(1)</script>'], 'p.png', { type: 'image/png' }))
    expect(res.status).toBe(400)
    expect(m.upload).not.toHaveBeenCalled()
  })

  it('stores a file with the type its bytes show, not its label', async () => {
    const jpeg = image('image/jpeg')
    await upload(new File([await jpeg.arrayBuffer()], 'p.png', { type: 'image/png' }))
    const [path, , opts] = m.upload.mock.calls[0]
    expect(path).toMatch(/\.jpeg$/)
    expect(opts).toEqual({ contentType: 'image/jpeg', upsert: false })
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
    await upload(new File([await png().arrayBuffer()], '../../etc/passwd.png', { type: 'image/png' }))
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
