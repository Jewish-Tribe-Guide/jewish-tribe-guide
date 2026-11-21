import { expect, test, type Page } from '@playwright/test'
import { categoryAddButton, categoryWithListings, defaultCommunity, ready } from './helpers'

// ── A keyboard and a screen reader can use the dialogs and the search (Nov 20) ──
// The health sweep found that no dialog or sheet moved the focus: Add opened
// its box, the focus stayed on the button behind it, and Tab walked the page
// under the backdrop. And a search said nothing to a screen reader as its
// results changed. useDialogFocus and SearchAnnouncer are the fixes; this is
// where they're proved, in a real browser, since jsdom moves no focus on Tab
// and has no idea what a browser counts as reachable.

const NOTHING = 'zqxw qvvjk'

const inDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-modal="true"]'))
// What has the focus, for a failure's message.
const focused = (page: Page) => page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160) ?? 'nothing')

test('the Add box takes the focus, keeps it on Tab, and gives it back on Escape', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/${category.id}`)
  await ready(page)

  const add = categoryAddButton(page)
  await add.focus()
  await page.keyboard.press('Enter')
  const dialog = page.locator('[role="dialog"][aria-modal="true"]')
  await expect(dialog).toBeVisible()
  await expect.poll(() => inDialog(page), { message: 'the focus went into the box' }).toBe(true)

  // Round it more than once both ways: a control the browser can reach and
  // the trap doesn't count would let the focus out at one end.
  for (let i = 1; i <= 20; i++) {
    await page.keyboard.press('Tab')
    expect(await inDialog(page), `Tab ${i} left the box, for ${await focused(page)}`).toBe(true)
  }
  for (let i = 1; i <= 20; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await inDialog(page), `Shift+Tab ${i} left the box, for ${await focused(page)}`).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(add).toBeFocused()
})

test('a search on the home tells a screen reader what it found', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}`)
  await ready(page)
  const said = page.getByTestId('search-announcer')
  await expect(said).toHaveAttribute('role', 'status')
  await expect(said).toHaveText('')

  const box = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  await box.fill(category.pluralLabel)
  await expect(said).toHaveText(/^\d+ results?$/)
  await box.fill(NOTHING)
  await expect(said).toHaveText(`Nothing found for “${NOTHING}”`)
})

test('a search on a category page tells a screen reader how many listings it found', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const listed = await (await request.get(`/api/resources?category=${category.id}&community=${community}`)).json()
  const name: string = listed.resources[0].name
  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  const said = page.getByTestId('search-announcer')
  await expect(said).toHaveAttribute('role', 'status')
  await expect(said).toHaveText('')

  const box = page.getByRole('searchbox', { name: `Search ${category.pluralLabel}` }).filter({ visible: true })
  await box.fill(name)
  await expect(said).toHaveText(/^\d+ listings?$/)
  await box.fill(NOTHING)
  await expect(said).toHaveText(`Nothing found for “${NOTHING}”`)
})

test('a search on You tells a screen reader what it found', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/you`)
  await ready(page)
  const said = page.getByTestId('search-announcer')
  await expect(said).toHaveAttribute('role', 'status')
  await expect(said).toHaveText('')

  const box = page.getByTestId('you-search').getByRole('textbox')
  await box.fill(category.pluralLabel)
  await expect(said).toHaveText(/^\d+ results?$/)
  await box.fill(NOTHING)
  await expect(said).toHaveText(`Nothing found for “${NOTHING}”`)
})
