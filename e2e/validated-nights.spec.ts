import { expect, test } from '@playwright/test'
import { defaultCommunity, ready, needs } from './helpers'

// Activity's nightly rows (the user, Nov 17; boards W1, X4, X5). Each night
// is a row in What changed that opens its own page, at its own address.

// A community with no nights yet still needs a param for Cache Components
// (generateStaticParams), so it gets "none". That must be a 404, never an
// empty "Validated" page.
test('a night that never ran is not found', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const res = await request.get(`/${community}/changes/validated/none`)
  expect(res.status()).toBe(404)
  expect((await request.get(`/${community}/changes`)).status()).toBe(200)
})

// A night only exists once the crons have run against this project, so this
// opens one when there is one and says so when there isn't.
test('a night’s row opens its page, and Back returns to What changed', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/changes`)
  await ready(page)
  await expect(page.getByTestId('changes-day').first()).toBeVisible()
  const row = page.getByTestId('validated-night').first()
  needs((await row.count()) > 0, 'no nightly runs recorded in this project yet')
  await expect(row).toContainText(/^Validated · .*against/)
  await row.getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`/${community}/changes/validated/\\d{4}-\\d{2}-\\d{2}$`))
  await expect(page.getByTestId('night-group').first()).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('night-group').first()).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(`/${community}/changes`)
})
