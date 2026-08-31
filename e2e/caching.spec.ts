import { expect, test } from '@playwright/test'
import { categories, categoryWithListings, defaultCommunity } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// Cache Components, from the outside.
//
// The content reads are cached with `cacheLife('days')` and thrown away by tag
// when an admin saves (src/lib/cacheTags.ts, src/lib/revalidateContent.ts —
// both unit-tested). What those unit tests can't show is whether any of it is
// actually reaching the visitor: `use cache` that silently stops applying looks
// exactly like `use cache` that works, only with a Supabase query per request.
// It shows up as a bill, or as latency, months later.
//
// So this asserts on the response headers Next sets, which are the only
// externally visible evidence that a page was served from the cache rather than
// rendered again.
//
// The Set-Cookie check is the one that isn't about performance: a cached
// response carrying a per-visitor header would hand one person's cookie to
// everybody who loads the page next.
// ─────────────────────────────────────────────────────────────────────────────

test.skip(({ isMobile }) => !!isMobile, 'caching is not viewport-dependent')

test.describe('the content screens are served from the cache', () => {
  test('the home screen is prerendered, not rendered per visitor', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const res = await request.get(`/${community}`)

    expect(res.status()).toBe(200)
    expect(res.headers()['x-nextjs-cache']).toBe('HIT')
    expect(res.headers()['x-nextjs-prerender']).toBeTruthy()
  })

  test('every category directory is prerendered', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    for (const category of await categories(request, community)) {
      if (category.kind !== 'listing') continue
      const res = await request.get(`/${community}/${category.id}`)
      expect(res.headers()['x-nextjs-cache'], `/${community}/${category.id}`).toBe('HIT')
    }
  })

  test('the map and the full category list are cached too', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    for (const path of [`/${community}/map`, `/${community}/all`]) {
      const res = await request.get(path)
      expect(res.headers()['x-nextjs-cache'], path).toBe('HIT')
    }
  })

  test('a repeat visit gets byte-identical content, so nothing is being re-rendered', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const path = `/${community}/${category.id}`

    const first = await request.get(path)
    const second = await request.get(path)

    expect(first.headers()['etag']).toBeTruthy()
    expect(second.headers()['etag']).toBe(first.headers()['etag'])
    expect(await second.text()).toBe(await first.text())
  })

  test('the cached response carries a real cache lifetime', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const res = await request.get(`/${community}`)

    // s-maxage keeps the CDN from asking again on every request;
    // stale-while-revalidate is what stops an admin's save making a visitor
    // wait on a cold query.
    expect(res.headers()['cache-control']).toMatch(/s-maxage=\d+/)
    expect(res.headers()['cache-control']).toMatch(/stale-while-revalidate=\d+/)
  })
})

test.describe('the cache keeps things apart', () => {
  test('each category gets its own cache entry', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const listingCategories = (await categories(request, community)).filter((c) => c.kind === 'listing')
    test.skip(listingCategories.length < 2, 'needs two categories to compare')

    const etags = await Promise.all(
      listingCategories.map(async (c) => (await request.get(`/${community}/${c.id}`)).headers()['etag']),
    )
    // A shared entry would mean one directory serving another's listings.
    expect(new Set(etags).size).toBe(etags.length)
  })

  test('each community gets its own cache entry', async ({ request }) => {
    const res = await request.get('/api/communities')
    const body = await res.json()
    const slugs: string[] = (body.communities ?? []).map((c: { slug: string }) => c.slug)
    test.skip(slugs.length < 2, 'only one community is configured')

    const etags = await Promise.all(
      slugs.map(async (slug) => (await request.get(`/${slug}`)).headers()['etag']),
    )
    expect(new Set(etags).size).toBe(etags.length)
  })
})

test.describe('nothing per-visitor is ever cached', () => {
  // A Set-Cookie on a cached, CDN-shareable response is served to the next
  // visitor too. Nothing on these screens should be setting one at all.
  test('a cached page sets no cookies', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    for (const path of [`/${community}`, `/${community}/${category.id}`, `/${community}/map`]) {
      const res = await request.get(path)
      expect(res.headers()['set-cookie'], path).toBeUndefined()
    }
  })

  // /inbox IS prerendered and CDN-cached, and that's correct: it's a
  // `'use client'` login shell that fetches the queue in the browser with an
  // Authorization header. What must stay true is that the cached shell is only
  // ever a shell. The day someone moves that fetch to the server to get rid of
  // the loading spinner, the page keeps working, the cache header doesn't
  // change, and one admin's inbox starts being served to whoever loads /inbox
  // next — with no visible symptom at all.
  //
  // /admin is now the standalone superadmin console (src/app/admin/page.tsx,
  // no community in its URL — see AGENTS.md's multi-community/caching
  // notes), a plain 'use client' shell same shape as /inbox: whether or not
  // it ends up prerendered/cached depends on Cache Components' own analysis
  // of it, not asserted here either way. Left in the loop either way — if
  // it's ever served from cache, this starts actually checking it, same as
  // /inbox.
  test('the admin shell carries no queue data, since it is cached', async ({ request }) => {
    for (const path of ['/admin', '/inbox']) {
      const res = await request.get(path, { failOnStatusCode: false })
      if (res.headers()['x-nextjs-cache'] !== 'HIT') continue

      const html = await res.text()

      // Checked structurally rather than by looking for anything that resembles
      // a phone number or an email: the shell legitimately carries the public
      // directory's own content, including hospital bikur cholim contacts, so
      // "looks like a phone number" is not evidence of anything. These keys
      // only exist on a moderation-queue row or a form response, and only the
      // authenticated fetch is supposed to be able to produce one.
      for (const key of ['submittedBy', 'submitted_by', 'proposed_payload', 'requestType', 'reviewed_at']) {
        expect(html, `${path} served a queue row from cache (found "${key}")`).not.toContain(key)
      }
      expect(res.headers()['set-cookie'], path).toBeUndefined()
    }
  })

  test('an admin API response is not cacheable by a CDN', async ({ request }) => {
    const res = await request.get('/api/admin/submissions', { failOnStatusCode: false })
    const cacheControl = res.headers()['cache-control'] ?? ''
    expect(cacheControl).not.toMatch(/s-maxage=[1-9]/)
  })
})

test.describe('the "/" redirect', () => {
  // Covered as a redirect in routing.spec.ts. Here the concern is different:
  // a cached redirect would pin every visitor to whichever community was
  // resolved first, including anyone with a different one remembered.
  test('is a redirect rather than a cached page body', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0, failOnStatusCode: false })
    expect([307, 308]).toContain(res.status())
    expect(res.headers()['location']).toBeTruthy()
  })
})
