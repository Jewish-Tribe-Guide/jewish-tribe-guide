import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the Main dishes tab for real (agreed Oct 1): what the menu reader
// proposed for a food place is listed with the menu's own words, the admin
// unticks one, adds one and approves, and the listing then has exactly
// those dishes, each dated by the menu ("seen"), with the menu's address, through
// approve_menu_dishes. The proposal is inserted straight into menu_reading:
// no test ever calls the AI. Needs migration 065 on the test project, and
// a category with a list of dishes (Food's "Main dishes").
//
// Its own listing, made here and deleted after, so nothing an admin does
// to the real ones can reach it.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type Field = { key: string; type: string; countLabel?: string; showCountInHeader?: boolean }

const id = randomUUID()
// Not "qqzv": the other specs' made-up search words start with it, and this
// listing stays in the site's cached lists until the next invalidation, so
// a name sharing it made a missed search look found.
const name = `Dishfixture ${id.slice(0, 8)}`
const sourceUrl = 'https://menu.example.invalid/menu'

test.afterEach(async () => {
  const supabase = getAdminClient()
  await supabase.from('menu_reading').delete().eq('community_id', 'philly').eq('resource_id', id)
  await supabase.from('resource').delete().eq('id', id)
})

test('a menu reading is checked, edited and approved onto its listing, dated by its menu', async ({ page }) => {
  const supabase = getAdminClient()
  const { error: missing } = await supabase.from('menu_reading').select('resource_id').limit(1)
  expect(missing?.message ?? null, 'needs migration 065 (menu_reading) on the test project').toBeNull()
  const { data: cats } = await supabase.from('category').select('id, fields').eq('community_id', 'philly')
  const found = (cats as { id: string; fields: Field[] }[])
    .flatMap((c) => (c.fields ?? []).filter((f) => f.type === 'tags' && f.showCountInHeader && /\bdish$/i.test(f.countLabel ?? '')).map((f) => ({ c, f })))
    .at(0)
  test.skip(!found, 'no category with a list of dishes on the test project')
  const { c, f } = found!

  expect(
    (await supabase.from('resource').insert({ id, community_id: 'philly', category: c.id, name, status: 'approved', details: { website: 'https://menu.example.invalid' } })).error,
  ).toBeNull()
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
          { name: 'Falafel', quote: 'Falafel in pita', checked: true, named: true },
        ],
      })
    ).error,
  ).toBeNull()

  await page.goto('/philly/admin/dishes')
  const toCheck = page.locator('section', { has: page.getByRole('heading', { name: /^To check/ }) })
  const card = toCheck.getByTestId('dish-place').filter({ hasText: name })

  // The listing went straight into the database, so the cached list of
  // listings the tab reads (listApprovedResources, cacheLife hours) knows
  // nothing about it. This used to pass only while no test had cached that
  // list yet: on a warm server it failed four runs in five, and once admin
  // saves gained a delayed second invalidation (revalidateAfterInFlightRenders)
  // public pages re-rendered sooner and cached it on a cold one too. A real
  // listing arrives through a save that invalidates, so invalidate as a
  // direct write must (AGENTS.md) — the admin's own token, from the session
  // the page just loaded — then reload: the first read after it is
  // stale-while-revalidate, the next one fresh.
  const revalidated = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k))
    const token = key ? (JSON.parse(localStorage.getItem(key)!) as { access_token?: string }).access_token : undefined
    const res = await fetch('/api/admin/revalidate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    return res.status
  })
  expect(revalidated, 'POST /api/admin/revalidate with the signed-in admin’s token').toBe(200)
  await expect(async () => {
    await page.reload()
    await expect(card).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  await expect(card).toContainText('Shawarma from “Chicken Shawarma Plate”')
  await expect(card.getByRole('link', { name: 'menu.example.invalid/menu ↗' })).toHaveAttribute('href', sourceUrl)

  await card.getByRole('button', { name: /Fountain Drinks/ }).click()
  await card.getByLabel(`Add a dish at ${name}`).fill('Laffa Wraps')
  await card.getByLabel(`Add a dish at ${name}`).press('Enter')
  await card.getByRole('button', { name: 'Approve 3 dishes' }).click()
  await expect(card).not.toBeVisible()

  const stored = async () => (await supabase.from('resource').select('details').eq('id', id).single()).data?.details as Record<string, unknown>
  await expect.poll(async () => (await stored())[f.key]).toEqual(['Shawarma', 'Falafel', 'Laffa Wraps'])
  const details = await stored()
  // Each dated (a JSON object's keys come back in Postgres's order, not ours).
  expect(Object.keys((details.itemMenu as Record<string, Record<string, string>>)[f.key]).sort()).toEqual(['Falafel', 'Laffa Wraps', 'Shawarma'])
  expect(details.menuUrl).toBe(sourceUrl)
  // A menu isn't someone eating there: nothing is "seen".
  expect(details.itemSeen).toBeUndefined()
  const reading = (await supabase.from('menu_reading').select('status, decided_by').eq('resource_id', id).single()).data
  expect(reading?.status).toBe('approved')
  expect(reading?.decided_by).toBeTruthy()

  // And the listing says so.
  await page.goto(`/philly/${c.id}/${id}`)
  const dishes = page.getByTestId('listing-items')
  await expect(dishes).toContainText('Main dishes · 3', { timeout: 20_000 })
  await expect(dishes).toContainText('seen')
  await expect(dishes.getByRole('link', { name: 'Full menu' })).toHaveAttribute('href', sourceUrl)
})

// Oct 20: a place whose menu couldn't be read gets three ways on. "No menu"
// takes it out of "Couldn't be read" and is kept; Undo puts it back; "Give
// its menu link" saves the link on the listing even when the reader can't
// open it (a .invalid address never resolves, so no AI is ever asked).
test('a menu that couldn’t be read: no menu, undone, then its menu link given', async ({ page }) => {
  const supabase = getAdminClient()
  const { data: cats } = await supabase.from('category').select('id, fields').eq('community_id', 'philly')
  const found = (cats as { id: string; fields: Field[] }[])
    .flatMap((c) => (c.fields ?? []).filter((f) => f.type === 'tags' && f.showCountInHeader && /\bdish$/i.test(f.countLabel ?? '')).map((f) => ({ c, f })))
    .at(0)
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

  await page.goto('/philly/admin/dishes')
  // Written straight to the database: invalidate as a direct write must (see above).
  const revalidated = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k))
    const token = key ? (JSON.parse(localStorage.getItem(key)!) as { access_token?: string }).access_token : undefined
    return (await fetch('/api/admin/revalidate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status
  })
  expect(revalidated).toBe(200)
  const card = page.getByTestId('dish-place').filter({ hasText: name })
  await expect(async () => {
    await page.reload()
    await page.getByRole('button', { name: 'Show Couldn’t be read' }).click()
    await expect(card).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  await expect(card).toContainText('Couldn’t read a menu on its website.')

  const reading = async () => (await supabase.from('menu_reading').select('status, note, decided_by').eq('resource_id', id).maybeSingle()).data
  await card.getByRole('button', { name: 'No menu' }).click()
  await expect(page.getByTestId('dish-counts')).toContainText('no menu')
  await expect.poll(async () => (await reading())?.note).toBe('No menu')
  expect((await reading())?.decided_by).toBeTruthy()

  // Kept: after a reload it's under "No menu", and Undo takes it away.
  await page.reload()
  await page.getByRole('button', { name: 'Show No menu' }).click()
  await expect(card).toContainText('No menu, said')
  await card.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(reading).toBeNull()

  // Back as not read yet (it has a website); fail it again for the link.
  await supabase.from('menu_reading').insert({ community_id: 'philly', resource_id: id, status: 'failed', source_url: null, note: 'Couldn’t read a menu on its website.', dishes: [] })
  await page.reload()
  await page.getByRole('button', { name: 'Show Couldn’t be read' }).click()
  await card.getByRole('button', { name: 'Give its menu link' }).click()
  await card.getByLabel(`${name}’s menu link`).fill('menu.example.invalid/our-menu')
  await card.getByRole('button', { name: /^Save/ }).click()
  const details = async () => (await supabase.from('resource').select('details').eq('id', id).single()).data?.details as Record<string, unknown>
  await expect.poll(async () => (await details()).menuUrl).toBe('https://menu.example.invalid/our-menu')
  expect((await details()).website).toBe('https://menu.example.invalid')
})

