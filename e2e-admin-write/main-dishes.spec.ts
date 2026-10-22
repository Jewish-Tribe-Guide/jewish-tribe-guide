import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the Watches tab's Main dishes page for real (drawn Oct 21,
// 7EYjgU1WcHrXG2W6Qpigb7): a place opened is its listing's Main dishes box,
// the listing's list marked by what its menu said. Use this makes the
// listing's list the menu's: a dish a reader found before and the menu no
// longer names comes off, a new one goes on, a dish added by hand stays.
// Edit is the listing's own dishes editor, saved straight to the listing.
// The reading is inserted straight into menu_reading, and every AI read the
// page starts is answered here: no test ever calls the AI. Needs migration
// 065 on the test project, and a category with a list of dishes (Food's
// "Main dishes").
//
// Its own listing, made here and deleted after, so nothing an admin does
// to the real ones can reach it.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type Field = { key: string; type: string; countLabel?: string; showCountInHeader?: boolean }

// A new listing for each test: one deleted straight from the database stays
// in the site's cached lists until the next invalidation, so a second test
// reusing its id was handed the first one's dishes.
let id = ''
// Not "qqzv": the other specs' made-up search words start with it, and this
// listing stays in the site's cached lists until the next invalidation, so
// a name sharing it made a missed search look found.
let name = ''
test.beforeEach(() => {
  id = randomUUID()
  name = `Dishfixture ${id.slice(0, 8)}`
})
const sourceUrl = 'https://menu.example.invalid/menu'
const earlier = '2026-09-01T12:00:00.000Z'

test.afterEach(async () => {
  const supabase = getAdminClient()
  await supabase.from('menu_reading').delete().eq('community_id', 'philly').eq('resource_id', id)
  await supabase.from('resource').delete().eq('id', id)
})

async function dishField() {
  const supabase = getAdminClient()
  const { error: missing } = await supabase.from('menu_reading').select('resource_id').limit(1)
  expect(missing?.message ?? null, 'needs migration 065 (menu_reading) on the test project').toBeNull()
  const { data: cats } = await supabase.from('category').select('id, fields').eq('community_id', 'philly')
  return (cats as { id: string; fields: Field[] }[])
    .flatMap((c) => (c.fields ?? []).filter((f) => f.type === 'tags' && f.showCountInHeader && /\bdish$/i.test(f.countLabel ?? '')).map((f) => ({ c, f })))
    .at(0)
}

/** The page reads nothing as it opens (Oct 22: the morning's
 *  /api/cron/read-menus does); should a read be sent, the AI is never
 *  asked: it comes back with nothing. */
async function noAiReads(page: Page) {
  await page.route('**/api/admin/main-dishes**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST' && (req.postData() ?? '').includes('"action":"read"')) return route.fulfill({ json: { ok: true } })
    return route.fallback()
  })
}

/** Opens the page with the fixture's row on it, in its tab. The listing went
 *  straight into the database, so the cached list of listings the page reads
 *  (listApprovedResources, cacheLife hours) knows nothing about it until an
 *  invalidation, as a direct write must (AGENTS.md): the admin's own token,
 *  then reload until it shows. */
async function openRow(page: Page, tab: RegExp) {
  await noAiReads(page)
  await page.goto('/philly/admin/watches/dishes')
  const revalidated = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k))
    const token = key ? (JSON.parse(localStorage.getItem(key)!) as { access_token?: string }).access_token : undefined
    return (await fetch('/api/admin/revalidate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status
  })
  expect(revalidated, 'POST /api/admin/revalidate with the signed-in admin’s token').toBe(200)
  const row = page.getByTestId('job-row').filter({ hasText: name })
  await expect(async () => {
    await page.reload()
    await page.getByRole('tab', { name: tab }).click()
    await expect(row).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  return row
}

test('Use this: the dish the menu no longer names comes off, the new one goes on, one added by hand stays', async ({ page }) => {
  const supabase = getAdminClient()
  const found = await dishField()
  test.skip(!found, 'no category with a list of dishes on the test project')
  const { c, f } = found!

  // Shawarma and Tofu were found on its menu before; Laffa was added by hand.
  const details = { website: 'https://menu.example.invalid', [f.key]: ['Shawarma', 'Tofu', 'Laffa'], itemMenu: { [f.key]: { Shawarma: earlier, Tofu: earlier } } }
  expect((await supabase.from('resource').insert({ id, community_id: 'philly', category: c.id, name, status: 'approved', details })).error).toBeNull()
  expect(
    (
      await supabase.from('menu_reading').insert({
        community_id: 'philly',
        resource_id: id,
        status: 'proposed',
        source_url: sourceUrl,
        model: 'test',
        dishes: [
          { name: 'Shawarma', quote: 'Chicken Shawarma Plate', checked: true, named: true },
          { name: 'Falafel', quote: 'Falafel in pita', checked: true, named: true },
          { name: 'Tofu', quote: '', checked: false, missing: true },
          { name: 'Laffa', quote: '', checked: false, missing: true },
        ],
      })
    ).error,
  ).toBeNull()

  const row = await openRow(page, /^To check/)
  await expect(row.getByTestId('job-status')).toHaveText('1 update')
  await row.getByRole('button', { name }).click()
  const box = row.getByRole('region', { name: 'Main dishes' })
  await expect(box.getByTestId('box-pill')).toHaveText('2 updates')
  await expect(box.locator('[data-testid="box-row"][data-mark="gone"]')).toHaveText(['Not on the menuTofu'])
  await expect(box.locator('[data-testid="box-row"][data-mark="new"]')).toContainText(['Falafel“Falafel in pita”'])
  await expect(box.getByTestId('box-row').filter({ hasText: 'Laffa' })).toHaveAttribute('data-mark', 'same')
  await expect(box.getByTestId('box-source')).toContainText('From menu.example.invalid/menu')

  await box.getByRole('button', { name: 'Use this' }).click()
  await expect(box.getByTestId('box-pill')).toHaveText(/^Used /)

  const stored = async () => (await supabase.from('resource').select('details').eq('id', id).single()).data?.details as Record<string, unknown>
  await expect.poll(async () => (await stored())[f.key]).toEqual(['Shawarma', 'Laffa', 'Falafel'])
  const after = await stored()
  // Dated by the menu: what it named. Laffa stays undated, Tofu's date goes.
  expect(Object.keys((after.itemMenu as Record<string, Record<string, string>>)[f.key]).sort()).toEqual(['Falafel', 'Shawarma'])
  expect(after.menuUrl).toBe(sourceUrl)
  const reading = (await supabase.from('menu_reading').select('status, decided_by').eq('resource_id', id).single()).data
  expect(reading?.status).toBe('approved')
  expect(reading?.decided_by).toBeTruthy()

  // And the listing says so.
  await page.goto(`/philly/${c.id}/${id}`)
  const dishes = page.getByTestId('listing-items')
  await expect(dishes).toContainText('Main dishes · 3', { timeout: 20_000 })
  await expect(dishes.getByRole('link', { name: 'Full menu' })).toHaveAttribute('href', sourceUrl)
})

test('Edit: the listing’s own dishes editor, started from the menu’s list, saved to the listing', async ({ page }) => {
  const supabase = getAdminClient()
  const found = await dishField()
  test.skip(!found, 'no category with a list of dishes on the test project')
  const { c, f } = found!

  const details = { website: 'https://menu.example.invalid', [f.key]: ['Shawarma'], itemMenu: { [f.key]: { Shawarma: earlier } } }
  expect((await supabase.from('resource').insert({ id, community_id: 'philly', category: c.id, name, status: 'approved', details })).error).toBeNull()
  expect(
    (
      await supabase.from('menu_reading').insert({
        community_id: 'philly',
        resource_id: id,
        status: 'proposed',
        source_url: sourceUrl,
        model: 'test',
        dishes: [
          { name: 'Shawarma', quote: 'Chicken Shawarma Plate', checked: true, named: true },
          { name: 'Fountain Drinks', quote: 'Fountain drinks', checked: true, named: true },
        ],
      })
    ).error,
  ).toBeNull()

  const row = await openRow(page, /^To check/)
  await row.getByRole('button', { name }).click()
  await row.getByRole('region', { name: 'Main dishes' }).getByRole('button', { name: 'Edit' }).click()
  // The menu's list, in the listing's editor: take the drink off, add one.
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^Fountain Drinks/ }).click()
  await sheet.getByRole('button', { name: 'Remove' }).click()
  await sheet.getByPlaceholder('Add a dish').fill('Laffa Wraps')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save to the listing' }).click()
  await expect(sheet).not.toBeVisible()
  await expect(row.getByTestId('job-status')).toHaveText(/^Used /)

  const stored = async () => (await supabase.from('resource').select('details').eq('id', id).single()).data?.details as Record<string, unknown>
  await expect.poll(async () => (await stored())[f.key]).toEqual(['Shawarma', 'Laffa Wraps'])
  // Only what its menu named is dated by it.
  expect(Object.keys(((await stored()).itemMenu as Record<string, Record<string, string>>)[f.key])).toEqual(['Shawarma'])
  expect((await supabase.from('menu_reading').select('status').eq('resource_id', id).single()).data?.status).toBe('approved')
})

// A place whose menu couldn't be read: Reads open, why on its page, and
// "No menu" (its Reading switch off) kept and undone; then its menu link
// given, saved on the listing even when the reader can't open it (a
// .invalid address never resolves, so no AI is ever asked).
test('a menu that can’t be read: No menu, switched back on, then its menu link given', async ({ page }) => {
  const supabase = getAdminClient()
  const found = await dishField()
  test.skip(!found, 'no category with a list of dishes on the test project')
  const { c } = found!

  expect((await supabase.from('resource').insert({ id, community_id: 'philly', category: c.id, name, status: 'approved', details: { website: 'https://menu.example.invalid' } })).error).toBeNull()
  expect(
    (
      await supabase.from('menu_reading').insert({
        community_id: 'philly',
        resource_id: id,
        status: 'failed',
        source_url: 'https://menu.example.invalid',
        note: 'Couldn’t read a menu on its website.',
        dishes: [],
      })
    ).error,
  ).toBeNull()

  const row = await openRow(page, /^Can’t be read/)
  await expect(row.getByTestId('job-status')).toHaveText('No menu found')
  await row.getByRole('button', { name }).click()
  const reads = row.getByTestId('job-reads')
  await expect(reads.getByTestId('job-source')).toContainText('Couldn’t read a menu on its website.')

  const reading = async () => (await supabase.from('menu_reading').select('status, note, decided_by').eq('resource_id', id).maybeSingle()).data
  await reads.getByRole('button', { name: 'No menu' }).click()
  await expect(row.getByTestId('job-status')).toHaveText('Reading off')
  await expect.poll(async () => (await reading())?.note).toBe('No menu')
  expect((await reading())?.decided_by).toBeTruthy()

  // Kept: after a reload it's Off, and the switch turns it back on.
  const off = await openRow(page, /^Off/)
  await off.getByRole('button', { name }).click()
  await off.getByTestId('job-reads').getByRole('switch', { name: 'Reading' }).click()
  await expect.poll(reading).toBeNull()

  // Fail it again for the link.
  await supabase.from('menu_reading').insert({ community_id: 'philly', resource_id: id, status: 'failed', source_url: null, note: 'Couldn’t read a menu on its website.', dishes: [] })
  const again = await openRow(page, /^Can’t be read/)
  await again.getByRole('button', { name }).click()
  await again.getByTestId('job-reads').getByRole('button', { name: 'Add a page' }).click()
  await again.getByLabel('Its menu page or PDF').fill('menu.example.invalid/our-menu')
  await again.getByRole('button', { name: 'Save and read' }).click()
  const details = async () => (await supabase.from('resource').select('details').eq('id', id).single()).data?.details as Record<string, unknown>
  await expect.poll(async () => (await details()).menuUrl).toBe('https://menu.example.invalid/our-menu')
  expect((await details()).website).toBe('https://menu.example.invalid')
})
