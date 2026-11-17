import { expect, test, type Page } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready, type Category } from './helpers'

// A tester always wants the map (Nov 16). On a phone, a category's list row
// is Map · Filters · Sort, on one line (board G1/G2), and Map opens the Map
// tab with a ‹ back to the category (D2). Synagogues' Synagogue | Minyan
// switch shares the line (G3/G5), in both of its views.
//
// The fit is the point of the change (the count left the row and the
// buttons went to 10px a side to make it), and only a real browser lays it
// out, so it's measured here at the narrowest phone width in use, 360.

test.describe('the phone list row with Map', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only: a computer has the map beside the list')
  test.use({ viewport: { width: 360, height: 780 } })

  async function mapCategories(page: Page, community: string): Promise<Category[]> {
    const out: Category[] = []
    for (const c of (await categories(page.request, community)).filter((c) => c.kind === 'listing' && c.hasAddress !== false)) {
      const body = await (await page.request.get(`/api/resources?category=${c.id}&community=${community}`, { timeout: 45_000 })).json()
      if (body.ok && body.resources.length > 0) out.push(c)
    }
    return out
  }

  /** The row's controls, laid out: each one's top and bottom. */
  async function rowBoxes(page: Page) {
    const heading = page.getByTestId('list-heading').filter({ visible: true }).first()
    await expect(heading.getByTestId('list-map')).toBeVisible()
    const controls = heading.locator('[data-testid="list-map"], [data-testid="minyan-switch"], button[aria-haspopup]')
    const boxes = []
    for (const el of await controls.all()) if (await el.isVisible()) boxes.push({ name: (await el.innerText()).replace(/\s+/g, ' ').trim(), box: (await el.boundingBox())! })
    return boxes
  }

  function expectOneLine(boxes: { name: string; box: { y: number; height: number; x: number; width: number } }[], where: string) {
    const top = Math.min(...boxes.map((b) => b.box.y))
    for (const b of boxes) {
      expect(Math.abs(b.box.y + b.box.height / 2 - (top + boxes[0].box.height / 2)), `${where}: "${b.name}" is on another line`).toBeLessThanOrEqual(6)
      expect(b.box.x + b.box.width, `${where}: "${b.name}" runs off the side`).toBeLessThanOrEqual(360)
    }
  }

  test('Map, Filters and Sort sit on one line at 360, on every category with a map', async ({ page }) => {
    const community = await defaultCommunity(page)
    const cats = await mapCategories(page, community)
    test.skip(cats.length === 0, 'needs a category with a map and listings')
    for (const c of cats) {
      await page.goto(`/${community}/${c.id}`)
      await ready(page)
      await dismissLocationPrompt(page)
      const boxes = await rowBoxes(page)
      const names = boxes.map((b) => b.name)
      expect(names.indexOf('Map'), `${c.label}: Map comes before Filters (${names.join(' · ')})`).toBeLessThan(names.findIndex((n) => n.startsWith('Filters')))
      expectOneLine(boxes, c.label)
      // The Minyan view keeps Map, on the same line as the switch.
      const switchEl = page.getByTestId('minyan-switch').filter({ visible: true }).first()
      if (await switchEl.count()) {
        await switchEl.getByRole('button').nth(1).click()
        await expect(page.getByTestId('minyanim-view')).toBeVisible()
        expectOneLine(await rowBoxes(page), `${c.label}, Minyan view`)
      }
    }
  })

  test('Map opens the Map tab on the category, and ‹ comes back to it', async ({ page }) => {
    const community = await defaultCommunity(page)
    const [c] = await mapCategories(page, community)
    test.skip(!c, 'needs a category with a map and listings')
    await page.goto(`/${community}/${c.id}`)
    await ready(page)
    await dismissLocationPrompt(page)
    await page.getByTestId('list-heading').filter({ visible: true }).first().getByTestId('list-map').click()

    await expect(page).toHaveURL(new RegExp(`/${community}/map\\?(.*&)?cat=${c.id}(&.*)?$`))
    await expect(page).toHaveURL(new RegExp(`[?&]from=${c.id}(&|$)`))
    const back = page.getByTestId('map-back')
    await expect(back).toHaveAccessibleName(`Back to ${c.pluralLabel || c.label}`)
    await back.click()
    await expect(page).toHaveURL(new RegExp(`/${community}/${c.id}(\\?.*)?$`))
  })

  test('the Map tab opened as a tab has no ‹', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}/map`)
    await dismissLocationPrompt(page)
    await expect(page.getByPlaceholder(/Search name, address/)).toBeVisible()
    await expect(page.getByTestId('map-back')).toHaveCount(0)
  })
})
