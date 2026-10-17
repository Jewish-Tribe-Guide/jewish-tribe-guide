import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt, largestCategory, ready } from './helpers'

// A row swiped open on a phone is put away by the next touch anywhere else,
// as iPhone lists do (the user, Oct 16): a tap on another row does only
// that, and doesn't also open that row's listing. A real browser, because
// which element a touch lands on is hit-testing jsdom doesn't do.
test('phone: with a row swiped open, a tap on another row only closes it', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'Rows swipe on a phone')
  const community = await defaultCommunity(page)
  const { category } = await largestCategory(request, community)
  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await dismissLocationPrompt(page)

  // SwipeRow's wrapper, one per row.
  const rows = page.locator('main [data-swipe-group]')
  const [first, second] = [rows.nth(0), rows.nth(1)]
  await expect(second).toBeVisible()

  const b = (await first.boundingBox())!
  await page.mouse.move(b.x + b.width - 30, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width - 150, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
  const save = first.getByRole('button', { name: /^Save / })
  await expect(save, 'the first row is open').toBeVisible()

  // Left of the row's middle: its avatar and name, not a button in it.
  await second.tap({ position: { x: 30, y: 20 } })
  await expect(save, 'the first row is put away').toBeHidden()
  await page.waitForTimeout(500)
  expect(page.url(), 'and no listing opened').not.toContain('item=')

  await second.tap({ position: { x: 30, y: 20 } })
  await expect(page, 'the next tap is a tap').toHaveURL(/item=/)
})

// The same on a computer (the user, Oct 16), where the swipe is a
// trackpad's: a click on another row only puts the open one away, and so
// does a scroll. Real wheel events through real hit-testing.
test('computer: with a row swiped open, a click on another row or a scroll only closes it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the computer’s sidebar')
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  const show = page.getByRole('button', { name: 'Show sidebar' })
  if (await show.isVisible()) await show.click()
  const list = page.getByTestId('sidebar-scroll')
  // SwipeRow's wrapper, one per row. Not .touch-pan-y, which this list's
  // row content has too: "the second row" was the first one's content.
  const rows = list.locator('[data-swipe-group]')
  const [first, second] = [rows.nth(0), rows.nth(1)]
  await expect(second).toBeVisible()
  const save = first.getByRole('button', { name: /^Save / })

  async function swipeOpen() {
    const b = (await first.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.wheel(100, 0)
    await expect(save, 'the first row is open').toBeVisible()
    // Its swipe has settled.
    await page.waitForTimeout(300)
  }

  const back = page.getByRole('button', { name: 'Back to results' }).filter({ visible: true })
  await swipeOpen()
  await second.getByTestId('nearby-name').click()
  await expect(save, 'a click on another row puts it away').toBeHidden()
  await page.waitForTimeout(500)
  await expect(back, 'and opened nothing').toBeHidden()

  await swipeOpen()
  await page.mouse.wheel(0, 60)
  await expect(save, 'a scroll puts it away').toBeHidden()

  await second.getByTestId('nearby-name').click()
  await expect(back, 'the next click is a click').toBeVisible()
})
