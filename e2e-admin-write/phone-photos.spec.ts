import { expect, test, type Page } from '@playwright/test'
import { madeByTests } from '../e2e/testMadePages'
import { WRITE_SUITE_COMMUNITY } from '../scripts/writeSuiteCommunity.mjs'

// The user, Nov 15: "Campaign and banner photo don't seem to appear great on
// mobile for admin". On a 390px phone the campaign's Ends date ran off its
// card, the campaign had no preview at all (it lived only in the desktop
// side column), and a category's banner photo kept Upload/Paste/URL beside
// its 280px-wide preview, past the card's edge, so the page moved sideways.
// Layout, so only a real browser can say. Writes nothing: nothing is saved.

const WIDTH = 390

async function sideways(page: Page) {
  // Below zero on CI's browser, which keeps a scrollbar's width.
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: WIDTH, height: 844 })
})

test('a new campaign fits a phone, with the banner shown as it will look', async ({ page }) => {
  await page.goto(`/${WRITE_SUITE_COMMUNITY}/admin/campaigns`)
  // The console draws some screens twice (one hidden), as category-editor.spec.ts finds.
  const visible = page.locator(':visible')
  await page.getByRole('button', { name: /Add a campaign/ }).and(visible).click({ timeout: 30_000 })
  const form = page.getByTestId('campaign-banner-form').and(visible)
  // Its own address, so the screen mounts again and loads the campaigns and
  // categories a second time: the same allowance as the first load (CI, Nov
  // 21: still "Loading…" at 5s).
  await expect(form).toBeVisible({ timeout: 30_000 })
  await form.getByLabel('Starts').fill('2026-09-11')
  await form.getByLabel('Ends').fill('2026-09-30')

  const ends = (await form.getByLabel('Ends').boundingBox())!
  const card = (await form.boundingBox())!
  expect(ends.x + ends.width, 'Ends runs past its card').toBeLessThanOrEqual(card.x + card.width)
  await expect(page.getByTestId('campaign-banner-preview').and(visible)).toBeVisible()
  expect(await sideways(page), 'the page moves sideways').toBeLessThanOrEqual(0)
})

test('a category’s banner photo keeps its buttons on the phone’s screen', async ({ page, request }) => {
  const body = await (await request.get(`/api/categories?community=${WRITE_SUITE_COMMUNITY}`)).json()
  const category = (body.categories as { id: string; kind?: string }[]).find((c) => (!c.kind || c.kind === 'listing') && !madeByTests(c))
  expect(category, 'no listing category in the test project').toBeTruthy()
  await page.goto(`/${WRITE_SUITE_COMMUNITY}/admin/categories/${encodeURIComponent(category!.id)}`)
  const visible = page.locator(':visible')
  await page.getByRole('button', { name: /^Basics/ }).and(visible).click({ timeout: 30_000 })
  await page.getByRole('button', { name: /^Banner photo/ }).and(visible).click()

  const row = page.getByTestId('image-upload-row').and(visible)
  await expect(row).toBeVisible()
  for (const name of ['Upload', 'Paste', 'URL']) {
    const box = (await row.getByRole('button', { name: new RegExp(name) }).first().boundingBox())!
    expect(box.x + box.width, `${name} runs off the screen`).toBeLessThanOrEqual(WIDTH)
  }
  expect(await sideways(page), 'the page moves sideways').toBeLessThanOrEqual(0)
})
