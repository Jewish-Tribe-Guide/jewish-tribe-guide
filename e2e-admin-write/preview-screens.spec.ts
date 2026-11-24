import { expect, test, type Locator, type Page } from '@playwright/test'
import { TEST_COMMUNITY } from '../scripts/testCommunity.mjs'

// The full-size preview on Home page, a form's question and preview
// screens, and the superadmin console's New community are screens of their
// own: each has an address (?preview=open, ?question=N, ?step=new), so the
// browser's own Back, Forward and a reload land on it (AGENTS.md: "A screen
// of its own is an entry in the browser's history"). Before Nov 18 Home
// page's preview was an entry pushed behind Next's router with no address,
// so a reload dropped it, and a form's question and New community had no
// entry at all: Back left the page. Only a real browser runs Next's
// popstate in the order that matters. Writes nothing: nothing is saved,
// and the form is a new one that is never published.

const at = (page: Page, path: string, query: string) =>
  expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(path + query)

test('Home page’s full-size preview: Back closes it, Forward and a reload reopen it', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(`/${TEST_COMMUNITY}/admin/home`)
  const back = page.getByRole('button', { name: '← Back to editor' })
  await page.getByRole('button', { name: 'Open the preview' }).click()
  await expect(back).toBeVisible()
  await at(page, `/${TEST_COMMUNITY}/admin/home`, '?preview=open')

  await page.goBack()
  await at(page, `/${TEST_COMMUNITY}/admin/home`, '')
  await expect(back).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Search box' })).toBeVisible()

  await page.goForward()
  await expect(back).toBeVisible()

  await page.reload()
  await expect(back).toBeVisible()
  // Its own Back goes to the editor, and the address with it.
  await back.click()
  await at(page, `/${TEST_COMMUNITY}/admin/home`, '')
  await expect(page.getByRole('region', { name: 'Search box' })).toBeVisible()
})

test('a form’s question and its preview: Back, Forward and a reload land on each', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  const visible = (l: Locator) => l.and(page.locator(':visible'))
  await page.goto(`/${TEST_COMMUNITY}/admin/forms`)
  await visible(page.getByRole('button', { name: 'Add a form' })).click()
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/forms/form:new$`))
  const form = new URL(page.url()).pathname
  const formHeading = visible(page.getByRole('heading', { name: 'New form' }))
  await expect(formHeading).toBeVisible()

  // The new form's second question, opened.
  const question = visible(page.getByRole('heading', { name: 'How can we reach you?' }))
  await visible(page.getByRole('button', { name: /How can we reach you\?/ })).first().click()
  await expect(question).toBeVisible()
  await at(page, form, '?question=1')

  await page.goBack()
  await at(page, form, '')
  await expect(formHeading).toBeVisible()
  await page.goForward()
  await expect(question).toBeVisible()
  await page.reload()
  await expect(question).toBeVisible()

  // The preview, from the question.
  const back = page.getByRole('button', { name: '← Back to editor' })
  await visible(page.getByRole('button', { name: 'Open the preview' })).click()
  await expect(back).toBeVisible()
  await at(page, form, '?question=1&preview=open')
  await page.goBack()
  await at(page, form, '?question=1')
  await expect(question).toBeVisible()
  await page.goForward()
  await expect(back).toBeVisible()
  await page.reload()
  await expect(back).toBeVisible()
  await back.click()
  await at(page, form, '?question=1')
  await expect(question).toBeVisible()
})

// The superadmin console's New community, the same way (Nov 18: it was only
// state, so Back left the console). Nothing is created.
test('New community: Back closes it, Forward and a reload reopen it', async ({ page }) => {
  await page.goto('/admin')
  const form = page.getByRole('heading', { name: 'New community' })
  await page.getByRole('button', { name: '+ New community' }).click()
  await expect(form).toBeVisible()
  await at(page, '/admin', '?step=new')
  await page.goBack()
  await at(page, '/admin', '')
  await expect(form).toHaveCount(0)
  await page.goForward()
  await expect(form).toBeVisible()
  await page.reload()
  await expect(form).toBeVisible()
})
