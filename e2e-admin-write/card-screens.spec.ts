import { expect, test } from '@playwright/test'
import { TEST_COMMUNITY } from '../scripts/testCommunity.mjs'

// Boards V4/V4b (Nov 15): Right now's choices are a screen of its own in
// Home page, with an address (?card=rightNow), so the browser's own Back,
// Forward and a reload land on it (AGENTS.md: "A screen of its own is an
// entry in the browser's history"). Only a real browser runs Next's
// popstate in the order that matters. Writes nothing: nothing is saved.

test('Right now’s screen: Back returns to the boxes, Forward and a reload reopen it', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(`/${TEST_COMMUNITY}/admin/home`)
  // On a phone the home always has Right now, so its row is always there.
  await page.getByRole('group', { name: 'Show the page on' }).getByRole('button', { name: 'Phone' }).click({ timeout: 20_000 })
  await page.getByRole('region', { name: 'Under the search' }).getByRole('button', { name: /Right Now/ }).click()

  const screenOf = page.getByTestId('right-now-screen')
  await expect(screenOf).toBeVisible()
  // router.push writes the address once the server's answer lands. This file
  // sorts first, so in CI that is a cold server's first admin navigation:
  // over 5s on PR 387 (Nov 16), with the screen already showing.
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/home\\?card=rightNow$`), { timeout: 20_000 })
  // What can answer, once the categories have loaded.
  await expect(screenOf.getByRole('checkbox').first()).toBeVisible({ timeout: 20_000 })

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/home$`))
  await expect(screenOf).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Search box' })).toBeVisible()

  await page.goForward()
  await expect(screenOf).toBeVisible()

  await page.reload()
  await expect(screenOf).toBeVisible({ timeout: 20_000 })
  // Its own Back goes to the boxes, and the address with it.
  await screenOf.getByRole('button', { name: 'Back to the cards' }).click()
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/home$`))
  await expect(screenOf).toHaveCount(0)
})
