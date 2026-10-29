import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

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
    community_id: 'philly',
    label: categoryId,
    plural_label: categoryId,
    fields: [],
    kind: 'listing',
    active: false,
  })
  if (categoryError) throw new Error(`Could not seed the category: ${categoryError.message}`)
  const { error } = await supabase.from('resource').insert({
    community_id: 'philly',
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
  await supabase.from('submission').delete().eq('community_id', 'philly').eq('payload->>category', categoryId)
  await supabase.from('resource').delete().eq('community_id', 'philly').eq('category', categoryId)
  await supabase.from('category').delete().eq('community_id', 'philly').eq('id', categoryId)
})

test('a place is found by name, archived after asking, and brought back', async ({ page }) => {
  const supabase = getAdminClient()
  const status = async () => (await supabase.from('resource').select('status').eq('community_id', 'philly').eq('name', name).single()).data?.status

  await page.goto('/philly/admin/places')
  await page.getByLabel('Find a place by name').fill(name)
  await page.getByRole('button', { name: `Open ${name}` }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  await page.getByRole('button', { name: 'Archive it' }).click()
  await expect(page.getByText(`Take ${name} off the site? It stays under Archived.`)).toBeVisible()
  await page.getByRole('button', { name: 'Archive it' }).click()
  await expect.poll(status).toBe('archived')

  // Back on the list: no longer on the site, under Archived instead.
  await page.getByLabel('Find a place by name').fill(name)
  await expect(page.getByRole('button', { name: `Open ${name}` })).not.toBeVisible()
  await page.getByRole('button', { name: /^Archived · / }).click()
  await expect(page).toHaveURL(/show=archived/)
  await page.getByRole('button', { name: `Open ${name}` }).click()
  await page.getByRole('button', { name: 'Bring it back' }).click()
  await expect.poll(status).toBe('approved')
})

test('the old Archived tab opens Places on Archived', async ({ page }) => {
  await page.goto('/philly/admin/archived')
  await expect(page).toHaveURL(/\/philly\/admin\/places\?show=archived$/)
  await expect(page.getByRole('button', { name: /^Archived · / })).toHaveAttribute('aria-pressed', 'true')
})
