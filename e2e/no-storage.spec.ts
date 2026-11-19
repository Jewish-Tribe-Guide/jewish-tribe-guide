import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity } from './helpers'

// Safari's "Block all cookies" makes every touch of localStorage throw
// (a SecurityError on reading `window.localStorage` itself). The map read
// its sidebar width outside a try, so the Map page, and the home that
// carries saved places, showed "Something went wrong" instead (Nov 18,
// item 20 of the public review). The site has to work without it: what it
// remembers is a convenience.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    Object.defineProperty(window, 'localStorage', { configurable: true, get: blocked })
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: blocked })
  })
})

test('with storage blocked, home, a category and the map still draw', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  for (const path of [`/${community}`, `/${community}/${category.id}`, `/${community}/map`]) {
    await page.goto(path)
    // Not ready(): the phone's Map keeps its header hidden. The page or the
    // error that replaces it, whichever comes.
    await expect(page.locator('main').or(page.getByText('Something went wrong')).first()).toBeVisible()
    // Long enough for the client's effects (saved places, the sidebar,
    // the location ask) to have run.
    await page.waitForTimeout(1_500)
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
  }
  expect(errors.filter((e) => /insecure|SecurityError|localStorage|sessionStorage/i.test(e))).toEqual([])
})
