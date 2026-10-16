import { expect, test, type Locator, type Page } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt } from './helpers'

// The Map page's list of places (the user, Oct 16):
// - Back from a place opened deep in the list landed at the list's top. It
//   comes back where it was now, on a phone's sheet and a computer's sidebar.
// - Lowered after scrolling, the phone's sheet showed a row cut off under
//   its line. Lowered, it's only its line now.
// Scroll offsets, sizes and clipping, so a real browser: jsdom lays nothing out.

/** Scrolls a list down, and opens the first place that's in view there. */
async function scrollAndOpen(page: Page, list: Locator, top: number) {
  await list.evaluate((el, y) => el.scrollTo(0, y), top)
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(top)
  const listBox = (await list.boundingBox())!
  const names = list.getByTestId('nearby-name')
  const count = await names.count()
  for (let i = 0; i < count; i++) {
    const b = await names.nth(i).boundingBox()
    if (b && b.y > listBox.y && b.y + b.height < listBox.y + listBox.height) {
      await names.nth(i).click()
      return
    }
  }
  throw new Error('no place in view in the list')
}

test('phone: Back from a place puts the sheet’s list where it was', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone’s sheet')
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  await page.getByRole('button', { name: 'Expand nearby list' }).click()
  const list = page.getByTestId('sheet-scroll')
  await expect(list.getByTestId('nearby-name').first()).toBeVisible()

  await scrollAndOpen(page, list, 400)
  await expect(page.getByRole('button', { name: 'Back to list' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to list' }).click()
  await expect(list.getByTestId('nearby-name').first()).toBeAttached()
  await expect.poll(() => list.evaluate((el) => el.scrollTop), 'the list is where it was').toBe(400)
})

test('phone: lowered after scrolling, the sheet is only its line', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone’s sheet')
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  const sheet = page.getByTestId('map-sheet')
  const list = page.getByTestId('sheet-scroll')

  await page.getByRole('button', { name: 'Expand nearby list' }).click()
  await expect(list.getByTestId('nearby-name').first()).toBeVisible()
  await list.evaluate((el) => el.scrollTo(0, 400))
  // A tap on the handle: half to full, then full to lowered.
  const handle = page.getByRole('button', { name: 'Drag to resize nearby list' })
  await handle.click()
  await handle.click()
  await expect(page.getByRole('button', { name: 'Expand nearby list' })).toBeVisible()
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.height), 'it has settled lowered').toBe(64)

  // The sheet clips what's below its handle, so: the list starts where
  // the sheet ends. (Its own box keeps its bottom padding, clipped.)
  const [s, l] = [(await sheet.boundingBox())!, (await list.boundingBox())!]
  expect(l.y, 'none of the list shows under the line').toBeGreaterThanOrEqual(s.y + s.height - 0.5)
})

test('computer: Back from a place puts the sidebar’s list where it was', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the computer’s sidebar')
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  // The sidebar can start closed here; open it as someone would.
  const show = page.getByRole('button', { name: 'Show sidebar' })
  if (await show.isVisible()) await show.click()
  const list = page.getByTestId('sidebar-scroll')
  await expect(list.getByTestId('nearby-name').first()).toBeVisible()

  await scrollAndOpen(page, list, 400)
  const back = page.getByRole('button', { name: 'Back to results' }).filter({ visible: true })
  await expect(back).toBeVisible()
  await back.click()
  await expect(list.getByTestId('nearby-name').first()).toBeVisible()
  await expect.poll(() => list.evaluate((el) => el.scrollTop), 'the list is where it was').toBe(400)
})
