import { expect, test, type Page } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready, type Category } from './helpers'

// The count over a category's list ("7 listings") sits the same distance
// above the first row on every category page (the user, Oct 20: a gap under
// it on Networking, Cemetery and WhatsApp, and nowhere else).
//
// Those three are the categories with no address, so no map: their heading
// sits in the search toolbar, whose bottom margin (there to part the search
// box from the list) was added under the heading as well. A category with a
// map puts its heading at the top of the list column instead, with nothing
// under it but its own padding.

async function withListings(page: Page, community: string, wantAddress: boolean): Promise<Category | null> {
  for (const c of (await categories(page.request, community)).filter((c) => c.kind === 'listing' && (c.hasAddress !== false) === wantAddress)) {
    const body = await (await page.request.get(`/api/resources?category=${c.id}&community=${community}`, { timeout: 45_000 })).json()
    if (body.ok && body.resources.length > 0) return c
  }
  return null
}

async function gapUnderHeading(page: Page, community: string, category: Category): Promise<number> {
  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await dismissLocationPrompt(page)
  const heading = page.getByTestId('list-heading').filter({ visible: true }).first()
  const row = page.getByTestId('directory-row').filter({ visible: true }).first()
  await expect(row).toBeVisible()
  const h = (await heading.locator('h2').boundingBox())!
  const r = (await row.boundingBox())!
  return r.y - (h.y + h.height)
}

test('the listing count sits as close to the list without a map as with one', async ({ page }) => {
  const community = await defaultCommunity(page)
  const noMap = await withListings(page, community, false)
  const withMap = await withListings(page, community, true)
  test.skip(!noMap || !withMap, 'needs a category with listings on each side')
  const without = await gapUnderHeading(page, community, noMap!)
  const withIt = await gapUnderHeading(page, community, withMap!)
  expect(Math.abs(without - withIt), `${noMap!.label}: ${without}px under the count; ${withMap!.label}: ${withIt}px`).toBeLessThanOrEqual(4)
})
