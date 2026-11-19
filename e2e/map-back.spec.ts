import { expect, test } from '@playwright/test'
import { defaultCommunity } from './helpers'

// The browser's Back on the Map page (Nov 18, items 5 and 6 of the public
// review). A computer's Back with a place open left the map and its search
// altogether; a phone reloaded with a place open needed Back pressed twice
// to close it, the reload adding a second entry for the same place.

test('computer: Back closes the place open in the sidebar and stays on the map', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the computer’s sidebar')
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  const show = page.getByRole('button', { name: 'Show sidebar' })
  if (await show.isVisible()) await show.click()
  const list = page.getByTestId('sidebar-scroll')
  await list.getByTestId('nearby-name').first().click()
  const back = page.getByRole('button', { name: 'Back to results' }).filter({ visible: true })
  await expect(back).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('place')).not.toBeNull()

  await page.goBack()
  await expect(back).toHaveCount(0)
  await expect(list.getByTestId('nearby-name').first()).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/${community}/map`)
  expect(new URL(page.url()).searchParams.get('place')).toBeNull()

  // Closed on the screen, it takes its entry back: Back again leaves.
  await page.goForward()
  await expect(back).toBeVisible()
  await back.click()
  await expect(back).toHaveCount(0)
  await page.goBack()
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(`/${community}/map`)
})

test('phone: after a reload with a place open, one Back closes it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone’s sheet')
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await page.getByRole('button', { name: 'Expand nearby list' }).click()
  const list = page.getByTestId('sheet-scroll')
  await list.getByTestId('nearby-name').first().click()
  const backToList = page.getByRole('button', { name: 'Back to list' })
  await expect(backToList).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('place')).not.toBeNull()

  await page.reload()
  await expect(backToList).toBeVisible()

  await page.goBack()
  await expect(backToList).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe(`/${community}/map`)
})
