import { expect, test, type Page } from '@playwright/test'
import { categoryWithListings, defaultCommunity, ready } from './helpers'

// A category page writes its search into the address behind Next's router
// (FindResourcesConnected), so typing doesn't re-render the page. Coming
// back to the tab after an admin's change refreshes it
// (RefreshContentOnReturn), and that refresh's commit wrote back the
// address the router last knew: the search, the filters, an open listing
// and the Minyan view all fell out of the address, so a reload showed
// another screen (Nov 18, `?davening=1` gone). An open listing is written
// that way on every screen size, so it stands for the rest. (A typed search
// survived the refresh even before, so it proves nothing here.)

/** Comes back to the tab with the content changed, and waits for the
 *  refresh that brings and the moment after it commits. The refresh's own
 *  request: not a prefetch of either kind (a segment prefetch has its own
 *  header, and answering to one let this pass before the refresh went). */
async function refreshOnReturn(page: Page) {
  // Past RefreshContentOnReturn's ten-second throttle, counted from load.
  await page.waitForTimeout(11_000)
  const refreshed = page.waitForResponse(
    (r) => {
      const h = r.request().headers()
      return h['rsc'] === '1' && !h['next-router-prefetch'] && !h['next-router-segment-prefetch']
    },
    { timeout: 10_000 },
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await refreshed
  // The refresh's render commits a moment after its response.
  await page.waitForTimeout(1_500)
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/content-version',
    (route) => route.fulfill({ json: { ok: true, version: 'changed-by-address-on-return-spec' } }),
  )
})

test('a refresh on coming back keeps an open listing in the address', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)

  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await page.getByRole('button', { name: /^Show details for / }).first().click()
  await expect.poll(() => new URL(page.url()).searchParams.get('item')).not.toBeNull()
  const item = new URL(page.url()).searchParams.get('item')

  await refreshOnReturn(page)
  expect(new URL(page.url()).searchParams.get('item')).toBe(item)
})

// Back and Forward onto a category land on what its address says, as a
// link does (Nov 18). Before, Forward to a search dropped it from the page
// and the address. After a reload, Back to it threw a hydration error by
// hand; the reload test below guards that path but passed against the old
// code headless too, so the Forward test is the one that proves the fix.
const searchbox = (page: Page, label: string) => page.getByRole('searchbox', { name: `Search ${label}` }).filter({ visible: true })
const push = (page: Page, to: string) =>
  page.evaluate((url) => (window as unknown as { next: { router: { push(u: string): void } } }).next.router.push(url), to)

test('Forward to a search shows the search', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)

  await page.goto(`/${community}`)
  await ready(page)
  await push(page, `/${community}/${category.id}?q=open`)
  await expect(searchbox(page, category.pluralLabel)).toHaveValue('open')

  await page.goBack()
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${community}`)
  await page.goForward()
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${community}/${category.id}`)
  await expect(searchbox(page, category.pluralLabel)).toHaveValue('open')
  await page.waitForTimeout(1_000)
  expect(new URL(page.url()).searchParams.get('q')).toBe('open')
})

test('Back to a search after a reload shows the search, without a hydration error', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(`/${community}/${category.id}?q=open`)
  await ready(page)
  await expect(searchbox(page, category.pluralLabel)).toHaveValue('open')

  await push(page, `/${community}`)
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${community}`)
  await page.reload()
  await page.goBack()
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/${community}/${category.id}`)
  await ready(page)

  await expect(searchbox(page, category.pluralLabel)).toHaveValue('open')
  await page.waitForTimeout(1_000)
  expect(new URL(page.url()).searchParams.get('q')).toBe('open')
  // A production build names a hydration error by number (#418, #423, #425).
  expect(errors.filter((e) => /hydrat|react\.dev\/errors\/4(18|23|25)|error #4(18|23|25)/i.test(e))).toEqual([])
})
