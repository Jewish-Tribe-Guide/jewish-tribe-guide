import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// Oct 16: a minyan tapped in Minyanim by time opens its place on that
// minyan, the time it showed at the top, rather than at the top of the
// place for the visitor to find it in the table. The whole way through a
// real app: the row's link, the listing's own address, the box.
test('a minyan tapped in Minyanim by time opens its place on that minyan', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const shuls = (await categories(request, community)).find((c) => ((c as { detailFields?: { type: string }[] }).detailFields ?? []).some((f) => f.type === 'minyanim'))
  test.skip(!shuls, 'No category with minyanim')

  await page.goto(`/${community}/${shuls!.id}?davening=1`)
  await ready(page)
  await dismissLocationPrompt(page)
  const rows = page.getByTestId('minyanim-rows')
  // Late in the day there may be nothing left today: tomorrow, then.
  if ((await rows.getByRole('link').count()) === 0) await page.getByRole('tab').nth(1).click()
  const row = rows.getByRole('link').first()
  await expect(row).toBeVisible()
  const time = (await row.locator('span').first().innerText()).trim()
  await row.click()

  const box = page.getByTestId('tapped-minyan').filter({ visible: true })
  await expect(box).toBeVisible()
  await expect(box).toContainText('The minyan you tapped')
  await expect(box).toContainText(time)
})
