import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity, serverMarkup } from './helpers'

// Kept in sync by hand rather than imported from src/lib/listingSlug.ts — the
// point of this test is that a URL built the same way listingSlug builds it
// actually resolves, so importing the function under test would let it pass
// even if the app and this file quietly drifted apart some other way.
function slugFor(item: { id: string; name: string }): string {
  const base = item.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const suffix = item.id.replace(/-/g, '').slice(0, 6)
  return base ? `${base}-${suffix}` : suffix
}

// A listing's own URL — /community/category/name-suffix — added so a visitor
// who found a place can send the exact page to someone else, instead of
// "go to Philly, tap Grocery, scroll to Goldi". Covers: the link works cold
// (no prior client state), it 404s for a made-up id, and an old raw-id link
// (built before this existed) still resolves.

test.describe('a listing has its own URL', () => {
  test('opened cold, it shows the listing expanded with real server markup', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const { resources } = await res.json()
    const item = resources[0] as { id: string; name: string }

    const response = await page.goto(`/${community}/${category.id}/${slugFor(item)}`)
    expect(response?.status()).toBe(200)

    const html = await response!.text()
    // Server markup, not the RSC payload — see serverMarkup's own doc comment
    // for why the naive version of this assertion passes on an empty shell.
    expect(serverMarkup(html)).toContain(item.name)

    await expect(page.getByText(item.name).first()).toBeVisible()
  })

  test('the page title names the listing, for link previews', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const { resources } = await res.json()
    const item = resources[0] as { id: string; name: string }

    await page.goto(`/${community}/${category.id}/${slugFor(item)}`)

    await expect(page).toHaveTitle(new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  test('an old link built from the raw listing id still resolves', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const { resources } = await res.json()
    const item = resources[0] as { id: string; name: string }

    const response = await page.goto(`/${community}/${category.id}/${item.id}`)

    expect(response?.status()).toBe(200)
    await expect(page.getByText(item.name).first()).toBeVisible()
  })

  test('a made-up listing id 404s', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    const response = await page.goto(`/${community}/${category.id}/not-a-real-listing`)

    expect(response?.status()).toBe(404)
  })
})
