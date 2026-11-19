import { expect, test, type Page } from '@playwright/test'
import { categories, defaultCommunity, ready, type Category } from './helpers'

// A tester always wants the map (Nov 16). On a phone, a category's list row
// is Filters · Map on the left and Sort at the right, on one line (the
// user, Nov 17), and Map opens the Map tab with a ‹ back to the category
// (D2). Synagogues' Synagogue | Minyan switch takes Sort's place at the
// right (Nov 17), in both of its views.
//
// The fit is the point of the change (the count left the row, Map lost its
// symbol, and the sides are 12px on a phone), and only a real browser lays it out, so
// it's measured here at the narrowest phone width in use, 360.

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
    for (const el of await controls.all()) {
      if (!(await el.isVisible())) continue
      const kind = await el.evaluate((e) => (e.getAttribute('data-testid') === 'list-map' ? 'map' : e.getAttribute('data-testid') === 'minyan-switch' ? 'switch' : e.getAttribute('aria-haspopup') === 'menu' ? 'sort' : 'filters'))
      boxes.push({ kind, name: (await el.innerText()).replace(/\s+/g, ' ').trim(), box: (await el.boundingBox())! })
    }
    return boxes
  }

  function expectOneLine(boxes: { name: string; box: { y: number; height: number; x: number; width: number } }[], where: string, width: number) {
    const top = Math.min(...boxes.map((b) => b.box.y))
    for (const b of boxes) {
      expect(Math.abs(b.box.y + b.box.height / 2 - (top + boxes[0].box.height / 2)), `${where}: "${b.name}" is on another line`).toBeLessThanOrEqual(6)
      expect(b.box.x + b.box.width, `${where}: "${b.name}" runs off the side`).toBeLessThanOrEqual(width)
    }
  }

  /** The row's own left and right edges. */
  async function rowSides(page: Page) {
    const box = (await page.getByTestId('list-heading').filter({ visible: true }).first().boundingBox())!
    return { left: box.x, right: box.x + box.width }
  }

  // Filters and Map always on the left, and the right holds what arranges
  // the list: Sort, Synagogues' switch, or nothing (the user, Nov 17:
  // "always know that filter and map are on the left").
  function expectSides(boxes: { kind: string; name: string; box: { x: number; width: number } }[], row: { left: number; right: number }, where: string) {
    const kinds = boxes.map((b) => b.kind)
    const names = boxes.map((b) => b.name).join(' · ')
    expect(kinds.slice(0, 2), `${where}: ${names}`).toEqual(['filters', 'map'])
    expect(kinds.length, `${where}: ${names}`).toBeLessThanOrEqual(3)
    if (kinds[2]) expect(['sort', 'switch'], `${where}: ${names}`).toContain(kinds[2])
    expect(Math.abs(boxes[0].box.x - row.left), `${where}: Filters isn't at the left`).toBeLessThanOrEqual(1)
    if (boxes[2]) expect(Math.abs(boxes[2].box.x + boxes[2].box.width - row.right), `${where}: "${boxes[2].name}" isn't at the right`).toBeLessThanOrEqual(1)
  }

  // 360 is the narrowest phone; 375 is where Map gets wider, and leaves
  // Synagogues 3px (measured Nov 17).
  // One test a width: both in one ran past the 60s budget.
  for (const width of [360, 375]) test(`Filters, Map and Sort sit on one line at ${width}, on every category with a map`, async ({ page }) => {
    const community = await defaultCommunity(page)
    const cats = await mapCategories(page, community)
    test.skip(cats.length === 0, 'needs a category with a map and listings')
    await page.setViewportSize({ width, height: 780 })
    for (const c of cats) {
      await page.goto(`/${community}/${c.id}`)
      await ready(page)
      const boxes = await rowBoxes(page)
      expectSides(boxes, await rowSides(page), `${c.label} at ${width}`)
      expectOneLine(boxes, `${c.label} at ${width}`, width)
      // The Minyan view keeps Map, on the same line as the switch.
      const switchEl = page.getByTestId('minyan-switch').filter({ visible: true }).first()
      if (await switchEl.count()) {
        await switchEl.getByRole('button').nth(1).click()
        await expect(page.getByTestId('minyanim-view')).toBeVisible()
        const inView = await rowBoxes(page)
        expectSides(inView, await rowSides(page), `${c.label}, Minyan view, at ${width}`)
        expectOneLine(inView, `${c.label}, Minyan view, at ${width}`, width)
      }
    }
  })

  test('Map opens the Map tab on the category, and ‹ comes back to it', async ({ page }) => {
    const community = await defaultCommunity(page)
    const [c] = await mapCategories(page, community)
    test.skip(!c, 'needs a category with a map and listings')
    await page.goto(`/${community}/${c.id}`)
    await ready(page)
    await page.getByTestId('list-heading').filter({ visible: true }).first().getByTestId('list-map').click()

    await expect(page).toHaveURL(new RegExp(`/${community}/map\\?(.*&)?cat=${c.id}(&.*)?$`))
    await expect(page).toHaveURL(new RegExp(`[?&]from=${c.id}(&|$)`))
    const back = page.getByTestId('map-back')
    await expect(back).toHaveAccessibleName(`Back to ${c.pluralLabel || c.label}`)
    await back.click()
    await expect(page).toHaveURL(new RegExp(`/${community}/${c.id}(\\?.*)?$`))
    // Come back to, the category lights the tab it was opened from, not the
    // Map tab just left (Nov 16). Only a real browser runs the router's Back
    // listener in its true order against ours, which is what broke this.
    const lit = page.locator('nav [aria-current="page"]').filter({ visible: true })
    await expect(lit).toHaveText(['Home'])

    // The browser's own Back does the same.
    await page.getByTestId('list-heading').filter({ visible: true }).first().getByTestId('list-map').click()
    await expect(page.getByTestId('map-back')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/${community}/${c.id}(\\?.*)?$`))
    await expect(lit).toHaveText(['Home'])
  })

  // A place's sheet is an entry of the map's own; ‹ used to close only
  // that, back to the map's list (Nov 17, found from a listing's map tile,
  // which opens the map on a place's sheet the same way).
  test('‹ comes back to the category with a place open on the map', async ({ page }) => {
    const community = await defaultCommunity(page)
    const [c] = await mapCategories(page, community)
    test.skip(!c, 'needs a category with a map and listings')
    await page.goto(`/${community}/${c.id}`)
    await ready(page)
    await page.getByTestId('list-heading').filter({ visible: true }).first().getByTestId('list-map').click()
    await expect(page.getByTestId('map-back')).toBeVisible()
    await page.getByRole('button', { name: 'Expand nearby list' }).click()
    const list = page.getByTestId('sheet-scroll')
    await list.getByTestId('nearby-name').first().click()
    await expect(page.getByRole('button', { name: 'Back to list' })).toBeVisible()

    await page.getByTestId('map-back').click()
    await expect(page).toHaveURL(new RegExp(`/${community}/${c.id}(\\?.*)?$`))
  })

  // The map stays mounted while the listing shows, and restored its place
  // once a mount: a second listing's tile opened the first one's sheet
  // (the user, Nov 17).
  test("a second listing's map tile opens that place, not the first", async ({ page }) => {
    test.skip(!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, 'the tile needs a Maps key in the build')
    // Google refuses the key on localhost; any picture keeps the tile up.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
    await page.route('https://maps.googleapis.com/maps/api/staticmap**', (r) => r.fulfill({ contentType: 'image/png', body: png }))
    const community = await defaultCommunity(page)
    let pick: { c: Category; names: string[] } | undefined
    for (const c of await mapCategories(page, community)) {
      const body = await (await page.request.get(`/api/resources?category=${c.id}&community=${community}`, { timeout: 45_000 })).json()
      const names = (body.resources as { name: string; geo?: { lat: number } }[]).filter((r) => typeof r.geo?.lat === 'number').map((r) => r.name)
      if (names.length >= 2) {
        pick = { c, names }
        break
      }
    }
    test.skip(!pick, 'needs a category with two mapped listings')
    const { c, names } = pick!
    await page.goto(`/${community}/${c.id}`)
    await ready(page)
    for (const name of names.slice(0, 2)) {
      await page.locator('main').getByRole('button', { name: `Show details for ${name}` }).first().click()
      const tile = page.getByTestId('listing-map-tile').filter({ visible: true }).first()
      await tile.scrollIntoViewIfNeeded()
      await tile.click()
      await expect(page).toHaveURL(new RegExp(`/${community}/map\\?`))
      await expect(page.getByTestId('map-sheet').getByRole('heading').first()).toHaveText(name)
      await page.getByTestId('map-back').click()
      await expect(page).toHaveURL(new RegExp(`/${community}/${c.id}(\\?.*)?$`))
      await page.keyboard.press('Escape')
    }
  })

  test('the Map tab opened as a tab has no ‹', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}/map`)
    await expect(page.getByPlaceholder(/Search name, address/)).toBeVisible()
    await expect(page.getByTestId('map-back')).toHaveCount(0)
  })
})
