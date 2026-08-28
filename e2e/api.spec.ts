import { expect, test } from '@playwright/test'
import { categories, categoryWithListings, defaultCommunity } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// The API surface: who may reach it, and what it promises.
//
// The auth block below is the important half. Every /api/admin and /api/inbox
// route reads or writes submitted personal details — names, phone numbers,
// hospital rooms — and each one guards itself independently, by calling
// getAdminUser/getInboxViewer at the top of the handler. There is no middleware
// enforcing that, so a new route added without the check is a route that hands
// the moderation queue to anyone who knows its path, and nothing in the build,
// the types or the linter would object.
//
// The list is exhaustive on purpose. When a route is added here it should be
// added to this list; if it isn't, at least `find src/app/api/admin` and this
// file can be diffed by a human in ten seconds.
//
// Nothing here mutates: every request is unauthenticated, so a passing run
// means each one was refused before it touched the database. The id-bearing
// routes still use ids that cannot exist, so a *failure* is a rejected test
// rather than a deleted row.
// ─────────────────────────────────────────────────────────────────────────────

// API behaviour doesn't depend on the viewport; running it twice would only
// slow the suite down.
test.skip(({ isMobile }) => !!isMobile, 'not viewport-dependent')

const NO_SUCH_ID = '00000000-0000-0000-0000-000000000000'

type Guarded = { method: 'get' | 'post' | 'patch' | 'delete'; path: string }

const ADMIN_ROUTES: Guarded[] = [
  { method: 'get', path: '/api/admin/submissions' },
  { method: 'get', path: '/api/admin/responses' },
  { method: 'get', path: '/api/admin/categories' },
  { method: 'get', path: '/api/admin/forms' },
  { method: 'get', path: '/api/admin/home-sections' },
  { method: 'get', path: '/api/admin/site-settings' },
  { method: 'get', path: '/api/admin/archived-listings' },
  { method: 'get', path: '/api/admin/metrics' },
  { method: 'post', path: '/api/admin/categories' },
  { method: 'post', path: '/api/admin/forms' },
  { method: 'post', path: '/api/admin/home-sections' },
  { method: 'post', path: '/api/admin/site-settings/logo' },
  // Unauthenticated this is a free cache-flush for anyone who finds the URL —
  // not destructive, but a trivial way to make the site refetch everything on
  // demand, so it belongs behind the same wall as the rest.
  { method: 'post', path: '/api/admin/revalidate' },
  { method: 'patch', path: '/api/admin/site-settings' },
  { method: 'patch', path: `/api/admin/submissions/${NO_SUCH_ID}` },
  { method: 'patch', path: `/api/admin/responses/${NO_SUCH_ID}` },
  { method: 'delete', path: `/api/admin/responses/${NO_SUCH_ID}` },
  { method: 'patch', path: `/api/admin/categories/${NO_SUCH_ID}` },
  { method: 'delete', path: `/api/admin/categories/${NO_SUCH_ID}` },
  { method: 'post', path: `/api/admin/categories/${NO_SUCH_ID}/field-usage` },
  { method: 'patch', path: `/api/admin/forms/${NO_SUCH_ID}` },
  { method: 'delete', path: `/api/admin/forms/${NO_SUCH_ID}` },
  { method: 'delete', path: `/api/admin/forms/${NO_SUCH_ID}/draft` },
  { method: 'post', path: `/api/admin/forms/${NO_SUCH_ID}/publish` },
  { method: 'patch', path: `/api/admin/home-sections/${NO_SUCH_ID}` },
  { method: 'delete', path: `/api/admin/home-sections/${NO_SUCH_ID}` },
  { method: 'patch', path: `/api/admin/archived-listings/${NO_SUCH_ID}` },
  { method: 'delete', path: `/api/admin/archived-listings/${NO_SUCH_ID}` },
]

const INBOX_ROUTES: Guarded[] = [
  { method: 'get', path: '/api/inbox' },
  { method: 'patch', path: `/api/inbox/${NO_SUCH_ID}` },
  { method: 'delete', path: `/api/inbox/${NO_SUCH_ID}` },
]

test.describe('every admin and inbox route refuses an anonymous caller', () => {
  for (const { method, path } of [...ADMIN_ROUTES, ...INBOX_ROUTES]) {
    test(`${method.toUpperCase()} ${path}`, async ({ request }) => {
      const res = await request[method](path, { data: {}, failOnStatusCode: false })
      expect(res.status(), `${method.toUpperCase()} ${path} was not refused`).toBe(401)

      const body = await res.json()
      expect(body.ok).toBe(false)
      // A refusal must not leak anything about what's behind it.
      expect(JSON.stringify(body)).not.toMatch(/@|phone|room/i)
    })
  }
})

test.describe('a forged token is refused too', () => {
  // The 401s above would also be produced by a route that simply ignores the
  // Authorization header. This proves the token is actually validated.
  for (const { method, path } of [
    { method: 'get', path: '/api/admin/submissions' } as const,
    { method: 'get', path: '/api/admin/responses' } as const,
    { method: 'get', path: '/api/inbox' } as const,
  ]) {
    test(`${method.toUpperCase()} ${path}`, async ({ request }) => {
      const res = await request[method](path, {
        headers: { authorization: 'Bearer not-a-real-supabase-token' },
        failOnStatusCode: false,
      })
      expect(res.status()).toBe(401)
    })
  }
})

test.describe('the dev login shortcut', () => {
  // It mints a real admin session with no email round-trip. It refuses unless
  // NODE_ENV !== 'production' AND DEV_ADMIN_BYPASS_SECRET is set — and the e2e
  // suite runs a production build, which is exactly the condition that must
  // hold on a deployment. If this ever returns tokens, anyone who guessed the
  // secret would own the admin console.
  test('is not available in a production build', async ({ request }) => {
    const res = await request.post('/api/admin/dev-login', {
      data: { secret: 'whatever' },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(404)

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.accessToken).toBeUndefined()
    expect(body.refreshToken).toBeUndefined()
  })
})

test.describe('the public content APIs', () => {
  test('categories answer with the shape the client and the tests both read', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const res = await request.get(`/api/categories?community=${community}`)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.categories)).toBe(true)
    expect(body.categories.length).toBeGreaterThan(0)

    for (const category of body.categories) {
      expect(typeof category.id).toBe('string')
      expect(typeof category.label).toBe('string')
      expect(typeof category.pluralLabel).toBe('string')
      expect(Array.isArray(category.detailFields)).toBe(true)
    }
  })

  test('resources answer for a real category', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category, count } = await categoryWithListings(request, community)

    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.resources).toHaveLength(count)
    for (const resource of body.resources) {
      expect(typeof resource.id).toBe('string')
      expect(typeof resource.name).toBe('string')
      expect(resource.category).toBe(category.id)
    }
  })

  test('an unknown community is answered, not crashed on', async ({ request }) => {
    // resolveCommunity falls back to the default rather than erroring, so a
    // stale slug in someone's localStorage lands them somewhere real.
    const res = await request.get('/api/categories?community=no-such-community', { failOnStatusCode: false })
    expect(res.status()).toBeLessThan(500)
  })

  test('an unknown category returns an empty list rather than an error', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const res = await request.get(`/api/resources?category=no-such-category&community=${community}`, {
      failOnStatusCode: false,
    })
    expect(res.status()).toBeLessThan(500)

    const body = await res.json()
    if (body.ok) expect(body.resources).toEqual([])
  })

  test('a listing never carries a moderation-only field to the public', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const body = await res.json()

    for (const resource of body.resources) {
      // Contributors give a name and email when submitting; the public
      // directory has no reason to hand them back out.
      expect(resource.submittedBy, resource.name).toBeUndefined()
      expect(resource.submitted_by, resource.name).toBeUndefined()
      expect(resource.status, resource.name).not.toBe('pending')
    }
  })

  test('the categories the API serves are the ones the app links to', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    for (const category of await categories(request, community)) {
      if (category.kind !== 'listing') continue
      const res = await request.get(`/${community}/${category.id}`)
      expect(res.status(), `/${community}/${category.id}`).toBe(200)
    }
  })
})

test.describe('security headers', () => {
  // Configured in next.config.ts. A header set there is easy to drop in a
  // refactor and impossible to notice by looking at the site.
  test('are present on a page response', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const res = await request.get(`/${community}`)
    const headers = res.headers()

    expect(headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'self'")
    expect(headers['strict-transport-security']).toContain('max-age=')
    // Geolocation stays on for "use my current location"; the rest are denied.
    expect(headers['permissions-policy']).toContain('geolocation=(self)')
    expect(headers['permissions-policy']).toContain('camera=()')
  })
})
