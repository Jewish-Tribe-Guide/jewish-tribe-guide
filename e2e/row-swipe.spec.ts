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

  // SwipeRow's wrapper; nothing else on the page has this class.
  const rows = page.locator('main .touch-pan-y')
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
