import { expect, test } from '@playwright/test'
import { apiCallsForThisDocument, categoryWithListings, defaultCommunity, ready } from './helpers'

// These lock in the server-rendering work. I reported that as done once when
// it wasn't — the shell was prerendered but every content component still
// fetched after hydration, and the only way that surfaced was curling the HTML
// and counting. That check belongs in the suite, not in my memory.

test.describe('content is server-rendered', () => {
  test('a category directory ships its listings in the HTML', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    // Raw HTML, no JavaScript — this is what a crawler and a link preview see,
    // and what shows before hydration on a slow connection.
    const res = await request.get(`/${community}/${category.id}`)
    const html = await res.text()

    expect(html).toContain(category.pluralLabel)
    // A listing name, proving the rows are in the document rather than being
    // filled in later. Before this work the count here was zero.
    const listings = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const first = (await listings.json()).resources[0].name as string
    expect(html).toContain(first)
  })

  test('the home screen ships its category cards in the HTML', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const cats = await categoryWithListings(request, community)

    const res = await request.get(`/${community}`)
    const html = await res.text()

    expect(html).toContain(cats.category.pluralLabel)
  })

  test('a category page makes no API calls of its own', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await ready(page)

    // Was four (site-settings, categories, hospitals, resources) before the
    // content moved to the server.
    expect(await apiCallsForThisDocument(page)).toEqual([])
  })

  test('no loading skeletons on a settled page', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await ready(page)

    // Skeletons meant "we're still fetching". With the data in the HTML there
    // is nothing to wait for, so any skeleton left on screen is a regression.
    await expect(page.locator('.animate-pulse')).toHaveCount(0)
  })

  test('every listing is rendered, not just the first page of them', async ({
    page,
    request,
    isMobile,
  }) => {
    const community = await defaultCommunity(page)
    const { category, count } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)

    if (isMobile) {
      // The "N listings" label is `hidden sm:inline`, so there's nothing to
      // read on a phone. Count the rendered rows instead — same claim, via
      // what mobile actually shows.
      const html = await (await request.get(`/${community}/${category.id}`)).text()
      const names = (await (
        await request.get(`/api/resources?category=${category.id}&community=${community}`)
      ).json()).resources.map((r: { name: string }) => r.name as string)
      for (const name of names) {
        expect(html, `"${name}" should be in the HTML`).toContain(name)
      }
      return
    }

    // The header states the count; it should match what the API returns.
    await expect(page.getByText(new RegExp(`${count}\\s+listings?`))).toBeVisible()
  })
})
