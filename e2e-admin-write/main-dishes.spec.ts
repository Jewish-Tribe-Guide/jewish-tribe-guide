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
  await expect(card).toBeVisible({ timeout: 20_000 })
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
