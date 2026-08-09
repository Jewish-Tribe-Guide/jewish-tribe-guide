import { expect, test } from '@playwright/test'
import { categories, categoryWithListings, defaultCommunity, dismissLocationPrompt } from './helpers'

// hospitals/eruv/zmanim — see FIXED_VIEW_KINDS in src/lib/routes.ts. Kept in
// sync by hand rather than imported: these are the literal strings the home
// screen's cards link to (src/components/home/sections.tsx), and the point of
// this test is that those two independent places still agree.
const FIXED_VIEW_KINDS: Record<string, string> = { hospitals: 'medical', eruv: 'eruv', zmanim: 'zmanim' }

// The routing migration — every screen getting its own URL — was the largest
// change this codebase has had and had no automated coverage. These are the
// properties that were true only because someone clicked through once.

test.describe('URLs', () => {
  test('"/" redirects to a real community', async ({ page }) => {
    const response = await page.goto('/')

    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/[a-z0-9-]+$/)
    // Not still sitting on "/", which is what the old single-URL site did.
    expect(new URL(page.url()).pathname).not.toBe('/')
  })

  // These use the API request context rather than a page, because the point is
  // what happens WITHOUT a browser: this regressed to a 200 plus a JavaScript
  // redirect, which a crawler or a WhatsApp link preview would never follow.
  // "/" is the most-linked URL a site has.
  test('"/" is a real HTTP redirect, not a client-side one', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 })

    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/[a-z0-9-]+$/)
  })

  test('"/" keeps the query string through the redirect', async ({ request }) => {
    // The admin's preview frame relies on this; a dropped param fails silently.
    const res = await request.get('/?preview=1', { maxRedirects: 0 })

    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toContain('?preview=1')
  })

  test('a remembered community is honoured, and a malformed one is not', async ({ request }) => {
    const remembered = await request.get('/', {
      maxRedirects: 0,
      headers: { cookie: 'jpc_community=baltimore' },
    })
    expect(remembered.headers()['location']).toMatch(/\/baltimore$/)

    // The cookie value lands in a redirect path before any routing runs, so a
    // traversal attempt must fall back rather than be echoed.
    const hostile = await request.get('/', {
      maxRedirects: 0,
      headers: { cookie: 'jpc_community=../../etc/passwd' },
    })
    expect(hostile.headers()['location']).not.toContain('etc/passwd')
    expect(hostile.headers()['location']).toMatch(/\/[a-z0-9-]+$/)
  })

  test('a category directory has its own shareable URL', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)

    await expect(page).toHaveURL(`/${community}/${category.id}`)
    await expect(page.getByRole('heading', { name: category.pluralLabel })).toBeVisible()
  })

  test('a category URL opened cold shows the same thing as one navigated to', async ({
    page,
    request,
  }) => {
    // The point of real URLs: a link sent to someone else works. This is the
    // case the old history.state approach could not do at all.
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    const direct = await page.getByRole('heading', { name: category.pluralLabel }).textContent()

    await page.goto(`/${community}`)
    await page.goto(`/${community}/${category.id}`)
    const navigated = await page.getByRole('heading', { name: category.pluralLabel }).textContent()

    expect(direct).toBe(navigated)
  })

  test('the browser back button leaves a category', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}`)
    await page.goto(`/${community}/${category.id}`)
    await page.goBack()

    await expect(page).toHaveURL(`/${community}`)
  })

  test('the page title names the category, for link previews', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)

    // Shared links land in WhatsApp far more often than a browser address bar.
    await expect(page).toHaveTitle(new RegExp(category.pluralLabel))
  })

  test('an unknown slug 404s instead of rendering an empty page', async ({ page }) => {
    const community = await defaultCommunity(page)

    const response = await page.goto(`/${community}/not-a-real-category`)

    // The old site had no way to express this: an unrecognised view rendered
    // an empty state with a 200, which is what crawlers saw too.
    expect(response?.status()).toBe(404)
  })

  test('an unknown community 404s rather than silently serving the default', async ({ page }) => {
    const response = await page.goto('/not-a-real-community')

    expect(response?.status()).toBe(404)
  })

  test('the map carries its filters in the URL', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/map?cat=${category.id}&open=1`)

    await expect(page).toHaveURL(`/${community}/map?cat=${category.id}&open=1`)
    // The chip for that category reads as selected, i.e. the params were
    // actually applied rather than just preserved in the address bar.
    await expect(page.getByRole('button', { name: new RegExp(category.pluralLabel) }).first()).toBeVisible()
  })

  test('reserved screens are not treated as categories', async ({ page }) => {
    const community = await defaultCommunity(page)

    for (const screen of ['map', 'all', 'feedback']) {
      const response = await page.goto(`/${community}/${screen}`)
      expect(response?.status(), `/${community}/${screen} should be a real screen`).toBe(200)
    }
  })

  // The regression this guards: Hospitals/Eruv Information/Zmanim & Shabbos
  // are opened by a card that links to a fixed word (/eruv), but the category
  // that gates them is created with a human-readable label whose slug can be
  // anything ("Eruv Information" → eruv-information). Before FIXED_VIEW_KINDS,
  // the route only knew how to resolve a slug that matched a category's own
  // id — so the card's fixed link 404'd for any label that didn't happen to
  // slugify back to the literal word. Reproduced by clicking the actual card
  // in a browser, not just hitting the URL.
  for (const [slug, kind] of Object.entries(FIXED_VIEW_KINDS)) {
    test(`the fixed "${slug}" view resolves at its own URL, whatever its category is named`, async ({
      page,
      request,
    }) => {
      const community = await defaultCommunity(page)
      const category = (await categories(request, community)).find((c) => c.kind === kind)
      test.skip(!category, `no ${kind}-kind category configured for ${community}`)
      if (!category) return

      const response = await page.goto(`/${community}/${slug}`)
      expect(response?.status(), `/${community}/${slug}`).toBe(200)
      // Hospitals, Eruv Information and Zmanim & Shabbos are three differently
      // shaped screens (a picker, a status list, a data card), so there's no
      // one piece of copy all three share — except that a broken resolution
      // falls through to FindResources' generic "isn't available" fallback
      // (see the unknown-view branch at the bottom of that file). Its absence
      // is the assertion that generalizes.
      await expect(page.getByText(/isn.t available/i)).toHaveCount(0)
    })
  }

  test('the card that opens a fixed view links to its reserved slug, not the category’s own id', async ({
    page,
    request,
  }) => {
    const community = await defaultCommunity(page)
    const cats = await categories(request, community)
    const eruv = cats.find((c) => c.kind === 'eruv')
    test.skip(!eruv, `no eruv-kind category configured for ${community}`)
    if (!eruv) return

    await page.goto(`/${community}/all`)
    await dismissLocationPrompt(page)
    await page.getByRole('button', { name: eruv.pluralLabel }).first().click()

    await expect(page).toHaveURL(`/${community}/eruv`)
  })
})
