import { expect, test } from '@playwright/test'
import {
  apiCallsForThisDocument,
  categoryWithListings,
  defaultCommunity,
  dismissLocationPrompt,
  ready,
  serverMarkup,
} from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// These lock in the server-rendering work. I reported that as done once when it
// wasn't — the shell was prerendered but every content component still fetched
// after hydration, and the only way that surfaced was curling the HTML and
// counting. That check belongs in the suite, not in my memory.
//
// Then the check itself turned out not to work. `expect(html).toContain(name)`
// matched the React Server Components payload — the same listing names,
// serialized into a <script> — so it passed on a page that rendered nothing.
// The test that existed to prevent a recurrence of exactly this bug was
// reporting a green run while the bug was present.
//
// Everything below now goes through serverMarkup(), which drops script
// contents. See the two `test.fail()` cases: the content is NOT in the HTML
// today, and saying so out loud is the point.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('content is server-rendered', () => {
  // KNOWN FAILING — documenting real behaviour, not a flaky test.
  //
  // `[community]/page.tsx` and `[slug]/page.tsx` wrap their screens in
  // <Suspense> so `useSearchParams` doesn't block prerendering. The intent was
  // that only the part reading the query string waits for the request, but the
  // whole content subtree ended up inside the boundary, so the document ships a
  // shell: `/philly` has no <main> at all, and a category page's <main> is 42
  // characters of nothing.
  //
  // The data is still loaded on the server and arrives with the document (see
  // "makes no API calls of its own" below, which genuinely passes) — it just
  // isn't rendered into HTML. The cost is no-JS clients, first contentful
  // paint, and lower-tier crawlers; titles and metadata are unaffected.
  //
  // test.fail() rather than a deletion or a skip: the suite stays green, the
  // bug stays visible, and the day someone narrows those boundaries these turn
  // red to say so.
  test.fail('a category directory ships its listings in the HTML', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    // Raw HTML, no JavaScript — this is what a crawler and a link preview see,
    // and what shows before hydration on a slow connection.
    const res = await request.get(`/${community}/${category.id}`)
    const markup = serverMarkup(await res.text())

    expect(markup).toContain(category.pluralLabel)
    // A listing name, proving the rows are in the document rather than being
    // filled in later.
    const listings = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const first = (await listings.json()).resources[0].name as string
    expect(markup).toContain(first)
  })

  test.fail('the home screen ships its category cards in the HTML', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const cats = await categoryWithListings(request, community)

    const res = await request.get(`/${community}`)
    const markup = serverMarkup(await res.text())

    expect(markup).toContain(cats.category.pluralLabel)
  })

  // The narrower claim that does hold today, kept separate so a fix to the
  // above can't quietly take this with it: the document carries the content as
  // data, rather than the browser having to go and ask for it.
  test('the listings arrive with the document, not in a later request', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    const html = await (await request.get(`/${community}/${category.id}`)).text()
    const listings = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const first = (await listings.json()).resources[0].name as string

    expect(html).toContain(first)
  })

  // Guards the helper itself. If serverMarkup ever stopped stripping the
  // payload, every assertion above would go quietly green for the wrong reason
  // — which is the failure this whole file just lived through.
  test('serverMarkup strips the RSC payload it is supposed to strip', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    const html = await (await request.get(`/${community}/${category.id}`)).text()

    expect(html, 'the payload should be in the raw response').toContain('__next_f')
    expect(serverMarkup(html), 'and gone from the markup').not.toContain('__next_f')
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
      // read on a phone. Check the rendered rows instead — same claim, via what
      // mobile actually shows.
      //
      // Asserts on the rendered page rather than the HTML. This is a pagination
      // claim, not a server-rendering one, and it used to search the raw
      // response — which meant it passed on names found only in the RSC
      // payload, and would have gone red for a completely unrelated reason the
      // day the boundaries above get narrowed.
      await ready(page)
      await dismissLocationPrompt(page)
      const names: string[] = (await (
        await request.get(`/api/resources?category=${category.id}&community=${community}`)
      ).json()).resources.map((r: { name: string }) => r.name as string)

      // toContainText, not a one-shot innerText() snapshot. Because the content
      // is client-rendered (see the boundary note at the top of this file),
      // <main> is an empty fallback for a moment after `ready()` — which waits
      // on the header, and the header is part of the shell that was there all
      // along. Reading it once caught the empty string about two runs in three.
      const main = page.locator('main')
      for (const name of names) {
        await expect(main, `"${name}" should be on the page`).toContainText(name)
      }
      return
    }

    // The header states the count; it should match what the API returns.
    await expect(page.getByText(new RegExp(`${count}\\s+listings?`))).toBeVisible()
  })
})
