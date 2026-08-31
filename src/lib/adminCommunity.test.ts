import { afterEach, describe, expect, it, vi } from 'vitest'

// resolveCommunity itself is covered by communityStore.test.ts (real fallback
// logic against Supabase rows) — mocked here so these tests are only about
// "did the right slug reach resolveCommunity", not the DB lookup behind it.
const mockResolveCommunity = vi.hoisted(() => vi.fn(async (slug: string | null) => ({ slug: slug ?? 'philly' })))
vi.mock('./communityStore', () => ({ resolveCommunity: mockResolveCommunity }))

const mockCookiesGet = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mockCookiesGet }),
}))

const { adminCommunityFromCookies, adminCommunityFromRequest, adminCommunitySlugFromRequest, ADMIN_COMMUNITY_COOKIE } =
  await import('./adminCommunity')

afterEach(() => {
  mockResolveCommunity.mockClear()
  mockCookiesGet.mockReset()
})

describe('ADMIN_COMMUNITY_COOKIE', () => {
  it('is distinct from the public COMMUNITY_COOKIE', async () => {
    const { COMMUNITY_COOKIE } = await import('./configCommunity')
    expect(ADMIN_COMMUNITY_COOKIE).not.toBe(COMMUNITY_COOKIE)
  })
})

describe('adminCommunitySlugFromRequest', () => {
  it('parses the cookie out of a Cookie header among others', () => {
    const request = new Request('https://example.com', {
      headers: { cookie: `jpc_community=philly; ${ADMIN_COMMUNITY_COOKIE}=ues; other=1` },
    })
    expect(adminCommunitySlugFromRequest(request)).toBe('ues')
  })

  it('returns null when the cookie is absent', () => {
    const request = new Request('https://example.com', { headers: { cookie: 'jpc_community=philly' } })
    expect(adminCommunitySlugFromRequest(request)).toBeNull()
  })

  it('returns null when there is no Cookie header at all', () => {
    const request = new Request('https://example.com')
    expect(adminCommunitySlugFromRequest(request)).toBeNull()
  })

  it('decodes a URL-encoded value', () => {
    const request = new Request('https://example.com', {
      headers: { cookie: `${ADMIN_COMMUNITY_COOKIE}=upper%20east%20side` },
    })
    expect(adminCommunitySlugFromRequest(request)).toBe('upper east side')
  })
})

describe('adminCommunityFromRequest', () => {
  it('resolves the slug parsed from the request cookie', async () => {
    const request = new Request('https://example.com', { headers: { cookie: `${ADMIN_COMMUNITY_COOKIE}=ues` } })
    const result = await adminCommunityFromRequest(request)
    expect(mockResolveCommunity).toHaveBeenCalledWith('ues')
    expect(result.slug).toBe('ues')
  })

  it('resolves null (falls back to default) when no cookie is set', async () => {
    const request = new Request('https://example.com')
    await adminCommunityFromRequest(request)
    expect(mockResolveCommunity).toHaveBeenCalledWith(null)
  })
})

describe('adminCommunityFromCookies', () => {
  it('resolves the slug read from next/headers cookies()', async () => {
    mockCookiesGet.mockReturnValue({ value: 'ues' })
    const result = await adminCommunityFromCookies()
    expect(mockResolveCommunity).toHaveBeenCalledWith('ues')
    expect(result.slug).toBe('ues')
  })

  it('resolves null when the cookie store has no entry', async () => {
    mockCookiesGet.mockReturnValue(undefined)
    await adminCommunityFromCookies()
    expect(mockResolveCommunity).toHaveBeenCalledWith(null)
  })
})
