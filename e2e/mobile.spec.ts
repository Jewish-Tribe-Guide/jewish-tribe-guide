import { expect, test } from '@playwright/test'
import { defaultCommunity, dismissLocationPrompt } from './helpers'

// The mobile tab bar and the inline card grid only exist below the `sm`
// breakpoint, so the desktop project can't cover them at all. Mobile is also
// the primary way this site is used — someone standing in a hospital with a
// phone — which makes it the worse place to have no coverage.
test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile viewport only')

  test('the tab bar is present and navigates', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)

    const bar = page.getByRole('navigation', { name: 'Primary' })
    await expect(bar).toBeVisible()

    await bar.getByRole('button', { name: 'Map' }).click()
    await expect(page).toHaveURL(`/${community}/map`)
  })

  test('the active tab reflects the URL', async ({ page }) => {
    const community = await defaultCommunity(page)

    await page.goto(`/${community}/map`)
    await dismissLocationPrompt(page)
    const bar = page.getByRole('navigation', { name: 'Primary' })

    // aria-current is how the bar marks the current screen; it's derived from
    // the path now rather than from a `mode` in state.
    await expect(bar.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
  })

  test('the tab bar survives navigating between screens', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)

    const bar = page.getByRole('navigation', { name: 'Primary' })
    await bar.getByRole('button', { name: 'Map' }).click()
    await expect(page).toHaveURL(`/${community}/map`)

    // The chrome lives in the layout, so it should persist rather than
    // remount — a bar that disappears mid-navigation is the visible symptom.
    await expect(bar).toBeVisible()
  })

  test('the home screen renders its card grid inline', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await dismissLocationPrompt(page)

    // Mobile has no "All categories" page — its home screen IS the index.
    await expect(page.getByRole('button').filter({ hasText: /\w/ }).first()).toBeVisible()
  })
})
