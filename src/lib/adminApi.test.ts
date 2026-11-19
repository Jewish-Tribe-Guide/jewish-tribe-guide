import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from './adminApi'

// What every admin screen's request carries (adminApiCalls.test.ts holds the
// screens to using this): the token always, the community unless the api
// is site-wide, and a body sent the way the route reads it.

const ok = () => new Response(JSON.stringify({ ok: true, n: 1 }), { status: 200 })
afterEach(() => vi.unstubAllGlobals())

function calls() {
  const fetch = vi.fn(async () => ok())
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('adminApi', () => {
  it('adds the community and the token to a read', async () => {
    const fetch = calls()
    expect(await adminApi('tok', 'ues').get('/api/admin/forms?all=1')).toEqual({ ok: true, n: 1 })
    expect(fetch).toHaveBeenCalledWith('/api/admin/forms?all=1&community=ues', { headers: { Authorization: 'Bearer tok' } })
  })

  it('sends a write as JSON', async () => {
    const fetch = calls()
    await adminApi('tok', 'ues').send('PATCH', '/api/admin/x', { a: 1 })
    expect(fetch).toHaveBeenCalledWith('/api/admin/x?community=ues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: '{"a":1}',
    })
  })

  it('sends a FormData upload as it is, leaving its Content-Type to the browser', async () => {
    const fetch = calls()
    const form = new FormData()
    form.append('photo', 'x')
    await adminApi('tok', 'ues').post('/api/admin/main-dishes', form)
    expect(fetch).toHaveBeenCalledWith('/api/admin/main-dishes?community=ues', { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: form })
  })

  it('a site-wide api names no community', async () => {
    const fetch = calls()
    await adminApi('tok', null).post('/api/admin/communities', { slug: 'x' })
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe('/api/admin/communities')
  })

  it('throws the route’s own error, or the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, errors: ['Nope.'] }), { status: 400 })))
    await expect(adminApi('tok', 'ues').post('/api/admin/x', {}, 'Fallback.')).rejects.toThrow('Nope.')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 500 })))
    await expect(adminApi('tok', 'ues').get('/api/admin/x', 'Fallback.')).rejects.toThrow('Fallback.')
  })
})
