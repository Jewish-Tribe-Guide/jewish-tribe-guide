import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { TEST_COMMUNITY } from '../scripts/testCommunity.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Drives Places for real (the admin redesign's step 3): a listing is found
// by name, archived from its own screen after one question, and brought
// back from the Archived pill, the database following each step. The
// listing sits in a hidden category made for the test, so no page and no
// other test sees it. Places reads uncached, so a row inserted here shows
// without a revalidate.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const categoryId = `e2e-places-${randomUUID().slice(0, 8)}`
const name = `E2E Places ${randomUUID()}`

test.beforeEach(async () => {
  const supabase = getAdminClient()
  const { error: categoryError } = await supabase.from('category').insert({
    id: categoryId,
    community_id: TEST_COMMUNITY,
    label: categoryId,
    plural_label: categoryId,
    fields: [],
    kind: 'listing',
    active: false,
  })
  if (categoryError) throw new Error(`Could not seed the category: ${categoryError.message}`)
  const { error } = await supabase.from('resource').insert({
    community_id: TEST_COMMUNITY,
    category: categoryId,
    name,
    anchor_id: 'community',
    address: '1 Test St, Philadelphia, PA',
    details: {},
    status: 'approved',
  })
  if (error) throw new Error(`Could not seed the listing: ${error.message}`)
})

test.afterEach(async () => {
  const supabase = getAdminClient()
  await supabase.from('submission').delete().eq('community_id', TEST_COMMUNITY).eq('payload->>category', categoryId)
  await supabase.from('resource').delete().eq('community_id', TEST_COMMUNITY).eq('category', categoryId)
  await supabase.from('category').delete().eq('community_id', TEST_COMMUNITY).eq('id', categoryId)
})

test('a place is found by name, archived after asking, and brought back', async ({ page }) => {
  const supabase = getAdminClient()
  const status = async () => (await supabase.from('resource').select('status').eq('community_id', TEST_COMMUNITY).eq('name', name).single()).data?.status

  await page.goto(`/${TEST_COMMUNITY}/admin/places`)
  await page.getByLabel('Find a place by name').fill(name)
  await page.getByRole('button', { name: `Open ${name}` }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  await page.getByRole('button', { name: 'Archive it' }).click()
  await expect(page.getByText(`Take ${name} off the site? It stays under Archived.`)).toBeVisible()
  // Waits on the archive's own answer, not a 5s poll of the database: the
  // archive is six database calls one after another, and when the poll gave
  // up first (PR 405), the cleanup below deleted the suggestion the server
  // was still approving.
  const archived = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes('/api/admin/listings/'))
  await page.getByRole('button', { name: 'Archive it' }).click()
  expect((await archived).status(), 'the archive’s answer').toBe(200)
  await expect.poll(status).toBe('archived')

  // Back on the list: no longer on the site, under Archived instead.
  await page.getByLabel('Find a place by name').fill(name)
  await expect(page.getByRole('button', { name: `Open ${name}` })).not.toBeVisible()
  await page.getByRole('button', { name: /^On the site/ }).click()
  await page.getByRole('menuitemradio', { name: /^Archived/ }).click()
  await expect(page).toHaveURL(/show=archived/)
  await page.getByRole('button', { name: `Open ${name}` }).click()
  const restored = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/admin/archived-listings/'))
  await page.getByRole('button', { name: 'Bring it back' }).click()
  expect((await restored).status(), 'bringing it back’s answer').toBe(200)
  await expect.poll(status).toBe('approved')
})

test('the old Archived tab opens Places on Archived', async ({ page }) => {
  await page.goto(`/${TEST_COMMUNITY}/admin/archived`)
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/places\\?show=archived$`))
  await expect(page.getByRole('button', { name: 'On the site: Archived' })).toBeVisible()
})

// The user, Nov 2: Checked by opened off the screen, and the page could then
// be moved sideways. jsdom has no layout, so this runs on a phone's width.
for (const width of [390, 320]) {
  test(`on a ${width}px phone, each Places menu opens on the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`/${TEST_COMMUNITY}/admin/places`)
    for (const name of ['On the site', 'Category', 'Checked by']) {
      const button = page.getByRole('button', { name: new RegExp(`^${name}:`) })
      await expect(button).toBeEnabled({ timeout: 30_000 })
      await button.click()
      const box = (await page.getByRole('menu', { name }).boundingBox())!
      expect(box.x, `${name} starts off the screen`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${name} ends off the screen`).toBeLessThanOrEqual(width)
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      // Below zero on CI's browser, which keeps a scrollbar's width.
      expect(sideways, `${name} lets the page move sideways`).toBeLessThanOrEqual(0)
      await page.keyboard.press('Escape')
    }
  })
}
