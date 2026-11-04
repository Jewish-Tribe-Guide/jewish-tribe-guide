import { expect, test, type Locator, type Page } from '@playwright/test'

// The lists on Site → Header and menus are put in order by dragging (notes
// 25-28): by the handle with a mouse, or on a phone by holding the row.
// Only a real browser lays the rows out and hit-tests them, so it's here
// and not in the unit suite. Never saves, so it writes nothing.

const order = (box: Locator) => box.getByRole('button', { name: /^Move / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

async function middle(l: Locator) {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, bottom: b.y + b.height }
}

test('a row dragged by its handle lands where it is dropped', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/philly/admin/menus')
  const tabs = page.getByRole('region', { name: 'Tabs, on a phone' })
  const handles = tabs.getByRole('button', { name: /^Move / })
  await expect(handles.nth(1)).toBeVisible({ timeout: 20_000 })
  await tabs.scrollIntoViewIfNeeded()
  const before = await order(tabs)

  const from = await middle(handles.first())
  const last = await middle(tabs.locator('[data-drag-row]').last())
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, last.bottom + 10, { steps: 12 })
  await page.mouse.up()

  await expect.poll(() => order(tabs)).toEqual([...before.slice(1), before[0]])
  // Dropping isn't a tap: nothing opened.
  await expect(tabs.getByRole('button', { expanded: true })).toHaveCount(0)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  // One finger, through Chrome's own touch input: Playwright can only tap.
  async function finger(page: Page) {
    const cdp = await page.context().newCDPSession(page)
    return (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  }

  test('holding a row lifts it to drag; a tap still opens it', async ({ page }) => {
    await page.goto('/philly/admin/menus')
    const tabs = page.getByRole('region', { name: 'Tabs, on a phone' })
    const rows = tabs.locator('[data-drag-row]')
    await expect(rows.nth(1)).toBeVisible({ timeout: 20_000 })
    await rows.last().scrollIntoViewIfNeeded()
    const before = await order(tabs)

    const from = await middle(rows.first().getByRole('button', { expanded: false }))
    const to = await middle(rows.last())
    const touch = await finger(page)
    await touch('touchStart', from.x, from.y)
    await page.waitForTimeout(700)
    for (let i = 1; i <= 10; i++) await touch('touchMove', from.x, from.y + ((to.bottom + 10 - from.y) * i) / 10)
    await touch('touchEnd')

    await expect.poll(() => order(tabs)).toEqual([...before.slice(1), before[0]])
    await expect(tabs.getByRole('button', { expanded: true })).toHaveCount(0)

    // A quick tap opens the row instead.
    const row = rows.first().getByRole('button', { expanded: false })
    await row.tap()
    await expect(rows.first().getByRole('button', { expanded: true })).toBeVisible()
  })
})
