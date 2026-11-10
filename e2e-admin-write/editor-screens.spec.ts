import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// A category page's own screens (a field, Add a field, the preview, a
// Remove step) are entries in the browser's history, with their own
// address, so Back, Forward and a reload land on them (the user, Nov 9:
// "these add a field pages seem to not register as a new page"). And Back
// out of the page with unsaved changes asks first.
//
// Only a real browser can check this: every way it broke was in how Next's
// router and the browser order things, which jsdom doesn't reproduce.
// - Entries written behind the router's back: after a reload, Back from
//   another tab changed the address and never drew the page.
// - Entries written by the router land only once its navigation does, and a
//   quicker click drops one: adding a field stepped back out of the page.
// - Listeners on window run in the order they were added, capture or not:
//   the router's ran first and Back left without asking.
// Its own page each run, made and deleted here, so nothing an admin does to
// a real page can reach it.
// ─────────────────────────────────────────────────────────────────────────────

const pendingCategoryNames: string[] = []

test.afterEach(async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  for (const name of pendingCategoryNames.splice(0)) {
    const { data } = await supabase.from('category').select('id').eq('plural_label', name).maybeSingle()
    if (data) await supabase.from('category').delete().eq('id', data.id)
  }
})

async function makePage(page: Page, visible: (l: Locator) => Locator): Promise<{ name: string; editor: string }> {
  const name = `E2E Screens ${randomUUID().slice(0, 8)}`
  pendingCategoryNames.push(name)
  await page.goto('/philly/admin/categories')
  await visible(page.getByRole('button', { name: '+ New category page' })).click()
  await visible(page.getByRole('button', { name: 'Make your own page' })).click()
  await visible(page.getByLabel('Name', { exact: true })).fill(name)
  await visible(page.getByRole('button', { name: 'Create category' })).click()
  // Saving is several database round trips against the shared test project.
  await expect(visible(page.getByRole('status'))).toHaveText('Saved.', { timeout: 30_000 })
  await expect(page).toHaveURL(/\/philly\/admin\/categories\/cat:e2e-screens-[^/?]+$/)
  return { name, editor: new URL(page.url()).pathname }
}

test('a page’s screens are history entries: Back, Forward and reload land on each', async ({ page }) => {
  const visible = (l: Locator) => l.and(page.locator(':visible'))
  const { name, editor } = await makePage(page, visible)
  const dialogs: string[] = []
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  const at = async (query: string) => expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(editor + query)
  const title = (t: string | RegExp) => visible(page.getByRole('heading', { name: t }))
  const thePage = title(name)
  // In the Fields box, not the preview beside it, which has an Hours too.
  // Every box is open (E1b).
  const fields = page.getByRole('region', { name: 'Fields' })
  const openHours = () => visible(fields.getByRole('button', { name: /^Hours/ })).click()
  // Hours lands in Contact, so Contact's Add a field offers it (Nov 9).
  const addAField = () => visible(fields.getByRole('button', { name: 'Add a field to Contact' })).click()

  // Add a field: the list, then a field looked at, each its own entry.
  await addAField()
  await at('?add=list&in=contact')
  await visible(page.getByRole('button', { name: /^Hours/ })).click()
  await expect(title(/^Hours/)).toBeVisible()
  // The screen shows at once; the address follows once the router lands.
  await expect.poll(() => new URL(page.url()).search).toMatch(/^\?add=(?!list|make)/)
  const look = new URL(page.url()).search
  await page.goBack()
  await expect(title('Add a field')).toBeVisible()
  await at('?add=list&in=contact')
  await page.goForward()
  await expect(title(/^Hours/)).toBeVisible()
  await page.reload()
  await expect(title(/^Hours/)).toBeVisible({ timeout: 30_000 })
  await at(look)
  await visible(page.getByRole('button', { name: `Add to ${name}` })).click()
  await expect(thePage).toBeVisible()
  await at('')
  await visible(page.getByRole('button', { name: 'Save' })).click()
  await expect(visible(page.getByRole('status'))).toHaveText('Saved.', { timeout: 30_000 })

  // A field's own screen.
  await openHours()
  await at('?field=hours')
  await page.reload()
  await expect(title(/^Hours/)).toBeVisible({ timeout: 30_000 })
  await page.goBack()
  await expect(thePage).toBeVisible()
  await page.goForward()
  await expect(title(/^Hours/)).toBeVisible()
  await at('?field=hours')

  // The whole page, full size, on top of the field (from How it looks).
  await visible(page.getByRole('button', { name: 'See the whole page' })).click()
  await at('?field=hours&preview=1')
  await page.goBack()
  await expect(title(/^Hours/)).toBeVisible()
  await at('?field=hours')
  await page.goForward()
  await visible(page.getByRole('button', { name: '← Back to editor' })).click()
  await expect(title(/^Hours/)).toBeVisible()
  await at('?field=hours')

  // A reload on the preview, Back to the page, a field, another tab and
  // Back (the walk that found it, Nov 9): an entry written behind the
  // router's back changed the address here and never drew the page.
  await visible(page.getByRole('button', { name: 'See the whole page' })).click()
  await at('?field=hours&preview=1')
  await page.reload()
  await expect(visible(page.getByRole('button', { name: '← Back to editor' }))).toBeVisible({ timeout: 30_000 })
  await page.goBack()
  await expect(title(/^Hours/)).toBeVisible()
  await page.goBack()
  await expect(thePage).toBeVisible()
  await at('')
  await openHours()
  await at('?field=hours')
  await visible(page.getByRole('link', { name: /^Places/ })).click()
  await expect(page).toHaveURL(/\/philly\/admin\/places$/)
  await page.goBack()
  await expect(title(/^Hours/)).toBeVisible({ timeout: 30_000 })
  await at('?field=hours')
  await page.goBack()
  await expect(thePage).toBeVisible()

  // Quick clicks, no waiting between: making a field and adding it comes
  // back to the page, not past it (which asked to leave).
  await addAField()
  await visible(page.getByRole('searchbox', { name: 'Search fields' })).fill('Night line')
  await visible(page.getByRole('button', { name: 'Make your own: Night line' })).click()
  await visible(page.getByRole('button', { name: /^Link/ })).click()
  await expect(title(/^Night line/)).toBeVisible()
  await at('?field=night_line')
  await page.goBack()
  await expect(thePage).toBeVisible()
  await at('')
  expect(dialogs, 'nothing asked to leave on the way').toEqual([])
})

test('Back out of a page with unsaved changes asks; No stays with them, Yes leaves', async ({ page }) => {
  const visible = (l: Locator) => l.and(page.locator(':visible'))
  const { name, editor } = await makePage(page, visible)
  // Into the page from the list, as an admin gets there: by then the
  // router's own Back listener has long been there.
  await visible(page.getByRole('button', { name: '‹ Category pages' })).click()
  await visible(page.getByRole('button', { name })).click({ timeout: 30_000 })
  await expect(page).toHaveURL(new RegExp(`${editor}$`))
  const upvotes = visible(page.getByRole('radiogroup', { name: 'Can visitors upvote places?' }))
  await upvotes.getByRole('radio', { checked: false }).click()
  await expect(visible(page.getByRole('button', { name: 'Save' }))).toBeVisible()

  const asked: string[] = []
  page.once('dialog', (d) => {
    asked.push(d.message())
    void d.dismiss()
  })
  await page.goBack()
  await expect.poll(() => asked).toEqual(['Leave without saving? Your changes will be lost.'])
  await expect.poll(() => new URL(page.url()).pathname).toBe(editor)
  await expect(visible(page.getByRole('button', { name: 'Save' }))).toBeVisible()

  page.once('dialog', (d) => void d.accept())
  await page.goBack()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/philly/admin/categories')
  await expect(visible(page.getByRole('button', { name: '+ New category page' }))).toBeVisible({ timeout: 30_000 })
})
