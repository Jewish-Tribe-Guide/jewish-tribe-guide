import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createRequire } from 'node:module'
import type { proxy as ProxyFn } from './proxy'

// listCommunityVisibility is the one piece of proxy.ts that reaches the
// database — mocked here the same way communityStore.ts's own store
// functions are mocked in communityStore.test.ts, so these tests exercise
// the gating logic itself without a real Supabase project.
const mockListCommunityVisibility = vi.hoisted(() => vi.fn())
vi.mock('@/lib/communityStore', () => ({
  listCommunityVisibility: mockListCommunityVisibility,
}))
const mockFriendlyListingPath = vi.hoisted(() => vi.fn())
vi.mock('@/lib/bareListingLink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bareListingLink')>()),
  friendlyListingPath: mockFriendlyListingPath,
}))

function req(url: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(url, 'https://example.com'), cookie ? { headers: { cookie } } : undefined)
}

let proxy: typeof ProxyFn

beforeEach(async () => {
  // proxy.ts caches listCommunityVisibility()'s result in a module-level
  // variable across requests (see VISIBILITY_CACHE_MS) — deliberately, to
  // bound the DB cost this file's own comment explains. That means a fresh
  // module per test is required, or the second test onward would silently
  // read the first test's mocked data instead of its own.
  vi.resetModules()
  ;({ proxy } = await import('./proxy'))
})

afterEach(() => {
  mockListCommunityVisibility.mockReset()
  mockFriendlyListingPath.mockReset()
})

describe('proxy — "/" redirect', () => {
  // Temporary (307), not permanent: where "/" goes depends on the visitor's
  // remembered community, and a browser keeps a permanent redirect, so a
  // visitor who switched kept landing on the old one (Nov 18, item 38 of
  // the public review).
  it('redirects to the config default when no community cookie is set, temporarily', async () => {
    const res = await proxy(req('/'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/philly')
  })

  it('honors a remembered community cookie', async () => {
    const res = await proxy(req('/', 'jpc_community=ues'))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/ues')
  })

  it('never touches the database for "/"', async () => {
    await proxy(req('/'))
    expect(mockListCommunityVisibility).not.toHaveBeenCalled()
  })
})

describe('proxy — hidden-community gating', () => {
  it('lets a visible community through untouched', async () => {
    mockListCommunityVisibility.mockResolvedValue({ philly: { visible: true, previewToken: 'tok' } })
    const res = await proxy(req('/philly'))
    expect(res.status).toBe(200) // NextResponse.next()
    expect(res.cookies.get('jpc_preview_philly')).toBeUndefined()
  })

  it('lets an unknown slug through (the route 404s itself)', async () => {
    mockListCommunityVisibility.mockResolvedValue({})
    const res = await proxy(req('/not-a-real-community'))
    expect(res.status).toBe(200)
  })

  it('404s a hidden community with no access token at all', async () => {
    mockListCommunityVisibility.mockResolvedValue({ blatimore: { visible: false, previewToken: 'secret-token' } })
    const res = await proxy(req('/blatimore'))
    expect(res.status).toBe(404)
  })

  it('404s a hidden community given the wrong token', async () => {
    mockListCommunityVisibility.mockResolvedValue({ blatimore: { visible: false, previewToken: 'secret-token' } })
    const res = await proxy(req('/blatimore?access=wrong'))
    expect(res.status).toBe(404)
  })

  it('lets a hidden community through with the right ?access= token, and sets a cookie for next time', async () => {
    mockListCommunityVisibility.mockResolvedValue({ blatimore: { visible: false, previewToken: 'secret-token' } })
    const res = await proxy(req('/blatimore?access=secret-token'))
    expect(res.status).toBe(200)
    expect(res.cookies.get('jpc_preview_blatimore')?.value).toBe('secret-token')
  })

  it('lets a hidden community through on the cookie alone, without re-setting it', async () => {
    mockListCommunityVisibility.mockResolvedValue({ blatimore: { visible: false, previewToken: 'secret-token' } })
    const res = await proxy(req('/blatimore', 'jpc_preview_blatimore=secret-token'))
    expect(res.status).toBe(200)
    // No Set-Cookie on this response — the cookie's already there.
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('never gates the community admin console, even while hidden and with no token', async () => {
    // The admin console is already behind real auth (adminAuth.ts checking
    // admin_email) — Publish only controls the public site. Without this,
    // an admin couldn't sign in to build a brand-new community out at all.
    mockListCommunityVisibility.mockResolvedValue({ blatimore: { visible: false, previewToken: 'secret-token' } })
    const res = await proxy(req('/blatimore/admin'))
    expect(res.status).toBe(200)
    expect(mockListCommunityVisibility).not.toHaveBeenCalled()
  })

  it('never gates a sub-route under the community admin console either', async () => {
    mockListCommunityVisibility.mockResolvedValue({ blatimore: { visible: false, previewToken: 'secret-token' } })
    const res = await proxy(req('/blatimore/admin/categories'))
    expect(res.status).toBe(200)
  })

  it('fails open (never throws) when listCommunityVisibility rejects', async () => {
    // getAdminClient() throws synchronously on a missing Supabase env var —
    // a real failure mode on a freshly-created preview deployment, and it
    // broke every path on the site (not just a hidden community's) before
    // this was caught. A visible community, a hidden one, and an unknown
    // slug should all still resolve to a normal response.
    mockListCommunityVisibility.mockRejectedValue(new Error('Missing required environment variable'))

    const philly = await proxy(req('/philly'))
    const unknown = await proxy(req('/not-a-real-community'))
    expect(philly.status).toBe(200)
    expect(unknown.status).toBe(200)
  })

  it('keeps a hidden community gated when a later refresh fails (no fail-open on a blip)', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockListCommunityVisibility.mockResolvedValueOnce({ blatimore: { visible: false, previewToken: 'tok' } })
      expect((await proxy(req('/blatimore'))).status).toBe(404)

      // Window expires; the database is now failing.
      vi.advanceTimersByTime(31_000)
      mockListCommunityVisibility.mockRejectedValue(new Error('supabase blip'))

      expect((await proxy(req('/blatimore'))).status).toBe(404)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never blocks /admin or /inbox even if the matcher somehow let them through', async () => {
    // config.matcher is what actually keeps these paths from reaching
    // proxy() in production (Next applies it before invoking the function,
    // which this direct call bypasses) — this only proves the fallback:
    // neither is ever a real community slug, so gateCommunityPath's own
    // "unknown slug, let the route handle it" branch covers them too.
    mockListCommunityVisibility.mockResolvedValue({})
    const admin = await proxy(req('/admin'))
    const inbox = await proxy(req('/inbox'))
    expect(admin.status).toBe(200)
    expect(inbox.status).toBe(200)
  })
})

// The pages were gated and the data wasn't: /api/resources?community=<hidden>
// answered anyone (Nov 20, the health sweep).
describe('proxy — a hidden community through the public API', () => {
  const hidden = { blatimore: { visible: false, previewToken: 'secret-token' }, philly: { visible: true, previewToken: 't' } }

  it('404s a public read of a hidden community without its preview cookie', async () => {
    mockListCommunityVisibility.mockResolvedValue(hidden)
    for (const path of ['/api/resources', '/api/categories', '/api/site-settings', '/api/submissions']) {
      const res = await proxy(req(`${path}?community=blatimore`))
      expect(res.status, path).toBe(404)
    }
    // ?access= opens the pages, not the data: the page sets the cookie.
    expect((await proxy(req('/api/resources?community=blatimore&access=secret-token'))).status).toBe(404)
    expect((await proxy(req('/api/resources?community=blatimore', 'jpc_preview_blatimore=wrong'))).status).toBe(404)
  })

  it('answers with the preview cookie, and for visible, unknown or no community', async () => {
    mockListCommunityVisibility.mockResolvedValue(hidden)
    expect((await proxy(req('/api/resources?community=blatimore', 'jpc_preview_blatimore=secret-token'))).status).toBe(200)
    expect((await proxy(req('/api/resources?community=philly'))).status).toBe(200)
    expect((await proxy(req('/api/resources?community=nowhere'))).status).toBe(200)
    expect((await proxy(req('/api/resources'))).status).toBe(200)
  })

  it('leaves the admin, cron, inbound and inbox routes alone', async () => {
    mockListCommunityVisibility.mockResolvedValue(hidden)
    for (const path of ['/api/admin/listings', '/api/cron/watches', '/api/inbound/email', '/api/inbox']) {
      expect((await proxy(req(`${path}?community=blatimore`))).status, path).toBe(200)
    }
    expect(mockListCommunityVisibility).not.toHaveBeenCalled()
  })

  it('the cookie reaches the API: it is set for the whole site', async () => {
    mockListCommunityVisibility.mockResolvedValue(hidden)
    const res = await proxy(req('/blatimore?access=secret-token'))
    expect(res.headers.get('set-cookie')).toMatch(/jpc_preview_blatimore=secret-token;.*Path=\/(;|$)/i)
  })

  it('the matcher sends the public API through the proxy, and keeps the rest out', async () => {
    const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp') as {
      pathToRegexp: (path: string, keys: unknown[], options: { strict: boolean; sensitive: boolean; delimiter: string }) => RegExp
    }
    const { config } = await import('./proxy')
    const re = pathToRegexp(config.matcher, [], { strict: true, sensitive: false, delimiter: '/' })
    for (const path of ['/api/resources', '/api/zmanim/batch', '/philly', '/blatimore/food']) expect(re.test(path), path).toBe(true)
    for (const path of ['/api/admin/listings', '/api/cron/watches', '/api/inbound/email', '/api/inbox', '/admin', '/inbox', '/_next/static/x.js']) {
      expect(re.test(path), path).toBe(false)
    }
  })
})

// An old link built from a listing's bare id goes to its friendly link from
// here, by one 308 with one Location. From the page, Next's on-demand
// prerender wrote Location twice, and the first visitor's browser followed
// `/a, /a` as one address to a 404 (Nov 18).
describe('proxy — a listing’s bare-id link', () => {
  const ID = 'd3661e08-9941-41b7-be41-9bb36cf34614'

  it('308s to the friendly link, keeping the query string', async () => {
    mockListCommunityVisibility.mockResolvedValue({ philly: { visible: true, previewToken: 'tok' } })
    mockFriendlyListingPath.mockResolvedValue('/philly/cemetery/montefiore-d3661e')
    const res = await proxy(req(`/philly/cemetery/${ID}?minyan=x`))
    expect(res.status).toBe(308)
    const to = new URL(res.headers.get('location')!)
    expect(to.pathname).toBe('/philly/cemetery/montefiore-d3661e')
    expect(to.search).toBe('?minyan=x')
    expect(mockFriendlyListingPath).toHaveBeenCalledWith({ community: 'philly', category: 'cemetery', id: ID })
  })

  it('lets the page answer when there is no such listing, or the lookup fails', async () => {
    mockListCommunityVisibility.mockResolvedValue({ philly: { visible: true, previewToken: 'tok' } })
    mockFriendlyListingPath.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('supabase blip'))
    expect((await proxy(req(`/philly/cemetery/${ID}`))).status).toBe(200)
    expect((await proxy(req(`/philly/cemetery/${ID}`))).status).toBe(200)
  })

  it('looks nothing up for a friendly link or any other path', async () => {
    mockListCommunityVisibility.mockResolvedValue({ philly: { visible: true, previewToken: 'tok' } })
    await proxy(req('/philly/cemetery/montefiore-d3661e'))
    await proxy(req('/philly/cemetery'))
    await proxy(req(`/philly/cemetery/${ID}/more`))
    expect(mockFriendlyListingPath).not.toHaveBeenCalled()
  })

  it('keeps a hidden community’s listings behind its gate', async () => {
    mockListCommunityVisibility.mockResolvedValue({ blatimore: { visible: false, previewToken: 'secret-token' } })
    mockFriendlyListingPath.mockResolvedValue('/blatimore/grocery/x-d3661e')
    expect((await proxy(req(`/blatimore/grocery/${ID}`))).status).toBe(404)
    expect(mockFriendlyListingPath).not.toHaveBeenCalled()
  })
})
