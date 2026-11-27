import { expect, test, type Page } from '@playwright/test'
import { largestCategory, ready, settled } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// The floating "+ Add" on a phone goes while you scroll down and comes back
// as you scroll up, and at the end of the page (the user, Nov 24: "Hide
// while scrolling"). It sat over half a tile in the home's right-hand
// column, and a tap there opened Add instead of the tile. A computer keeps
// it in the site header instead (D1b, Nov 27), which stays put.
//
// The page is scrolled with the mouse wheel, so the browser fires its own
// scroll events, as a finger's would.
// ─────────────────────────────────────────────────────────────────────────────

const add = (page: Page) => page.getByRole('button', { name: 'Add or update', exact: true }).filter({ visible: true })

async function open(page: Page, path: string) {
  await page.goto(path)
  await ready(page)
  await settled(page)
  await expect(add(page)).toBeVisible()
}

/** What a tap where the "+" is would reach. */
const tapReaches = (page: Page, at: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest('button[aria-label="Add or update"]') ? 'add' : 'page'
  }, at)

async function wheel(page: Page, dy: number) {
  await page.mouse.move(100, 300)
  await page.mouse.wheel(0, dy)
}

async function checkPhone(page: Page, path: string) {
  await open(page, path)
  const box = (await add(page).boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(await tapReaches(page, centre)).toBe('add')

  await wheel(page, 300)
  await expect(add(page)).toBeHidden()
  // What was under it takes the tap now.
  await expect.poll(() => tapReaches(page, centre)).toBe('page')

  await wheel(page, -120)
  await expect(add(page)).toBeVisible()

  await wheel(page, 100_000)
  await expect.poll(() => page.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2)).toBe(true)
  await expect(add(page)).toBeVisible()
}

test('a phone’s home hides the + while scrolling down', { tag: '@mobile' }, async ({ page }) => {
  await checkPhone(page, '/philly')
})

test('a phone’s category page hides its + while scrolling down', { tag: '@mobile' }, async ({ page, request }) => {
  const { category } = await largestCategory(request, 'philly')
  await checkPhone(page, `/philly/${category.id}`)
})

test('a computer keeps Add or update in the header while scrolling', { tag: '@desktop' }, async ({ page }) => {
  await open(page, '/philly')
  await expect(add(page)).toHaveAttribute('data-testid', 'header-add')
  await wheel(page, 400)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await expect(add(page)).toBeVisible()
})

// The header's Add or update (D1b) beside the nav and Set location pushed a
// 660px-wide window sideways (744px of page) and wrapped the site's name
// at 1024px. Under 1100px it's the + alone.
test('a narrow computer’s header fits without scrolling sideways', { tag: '@desktop' }, async ({ page }) => {
  for (const width of [660, 1024]) {
    await page.setViewportSize({ width, height: 700 })
    await open(page, '/philly')
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `at ${width}px`).toBeLessThanOrEqual(width)
  }
})
