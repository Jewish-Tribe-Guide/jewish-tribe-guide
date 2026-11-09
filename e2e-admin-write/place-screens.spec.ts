import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// The screens inside a place are entries in the browser's history, each with
// its own address, so Back, Forward and a reload land on each (AGENTS.md: "A
// screen of its own is an entry in the browser's history"; the user, Nov 9:
// "I feel like that issue keeps happening in other contexts"). Before, these
// were entries pushed behind Next's router with nothing in the address
// (useHistoryDepth): a reload went back to the place, Forward onto a closed
// row did nothing, and Back from another tab changed the address and drew
// nothing.
//
// One walk per kind of place: a listing in Places, an eruv in Places, a new
// place and a change in To do. Each opens its steps, then goes Back over
// them, Forward again, reloads, leaves for another tab and comes Back, and
// closes them on the screen. Only a real browser shows how Next's router
// and the browser order things; jsdom doesn't.
//
// The listing and the eruv are made here in a hidden category / as a row of
// their own, deleted after. The To do suggestions are pending only, in the
// test project's Shuls category (To do reads the site's categories, which a
// hidden one isn't among); nothing is approved, so no page shows them.
// ─────────────────────────────────────────────────────────────────────────────

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const run = randomUUID().slice(0, 8)
const categoryId = `e2e-screens-${run}`
const name = `E2E Screens ${run}`
const newName = `${name} New`
const eruvId = `e2e-screens-${run}`
const eruvName = `E2E Screens Eruv ${run}`
const minyanim = [{ id: 'm1', tefillah: 'shacharis', days: ['mon', 'tue'], time: '7:00am' }]
const submissions: string[] = []

test.beforeAll(async () => {
  const s = db()
  const category = await s.from('category').insert({
    id: categoryId,
    community_id: 'philly',
    label: categoryId,
    plural_label: categoryId,
    fields: [{ key: 'minyanim', type: 'minyanim', label: 'Minyanim', renderAs: 'row' }],
    kind: 'listing',
    active: false,
  })
  if (category.error) throw new Error(`Could not seed the category: ${category.error.message}`)
  const place = await s
    .from('resource')
    .insert({ community_id: 'philly', category: categoryId, name, anchor_id: 'community', address: '1 Test St, Philadelphia, PA', details: { minyanim }, status: 'approved' })
    .select('id')
    .single()
  if (place.error) throw new Error(`Could not seed the listing: ${place.error.message}`)
  const eruv = await s.from('eruv').insert({ community_id: 'philly', id: eruvId, name: eruvName, active: true })
  if (eruv.error) throw new Error(`Could not seed the eruv: ${eruv.error.message}`)
  const pending = { community_id: 'philly', target_type: 'listing', note: null, status: 'pending', submitted_by: { name: 'e2e-admin-write suite' } }
  const sent = await s
    .from('submission')
    .insert([
      { ...pending, operation: 'create', target_id: null, payload: { category: 'synagogue', name: newName, anchorId: 'community', distance: null, address: '2 Test St, Philadelphia, PA', phone: '', details: { minyanim }, geo: { lat: 39.95, lng: -75.16 } } },
      { ...pending, operation: 'update', target_id: place.data.id, payload: { category: 'synagogue', name, anchorId: 'community', address: '1 Test St, Philadelphia, PA', details: { minyanim: [{ ...minyanim[0], time: '7:15am' }] } } },
    ])
    .select('id')
  if (sent.error) throw new Error(`Could not seed the suggestions: ${sent.error.message}`)
  submissions.push(...sent.data.map((x) => x.id))
})

test.afterAll(async () => {
  const s = db()
  if (submissions.length) await s.from('submission').delete().in('id', submissions)
  await s.from('resource').delete().eq('community_id', 'philly').eq('category', categoryId)
  await s.from('category').delete().eq('community_id', 'philly').eq('id', categoryId)
  await s.from('eruv').delete().eq('community_id', 'philly').eq('id', eruvId)
})

type Screen = { shows: Locator; open?: () => Promise<void>; close?: () => Promise<void> }

const address = (page: Page) => {
  const u = new URL(page.url())
  return u.pathname + u.search
}

/** Opens each screen after the first in turn, then walks the history over
 *  them every way an admin can. `screens[0]` is the place itself. */
async function walk(page: Page, screens: Screen[]) {
  const at: string[] = []
  // A reload loads the whole list again (Places, To do) before the place
  // and its steps can open: seconds, with the suite's other workers on the
  // same test project.
  const only = async (i: number, how: string, timeout = 5_000) => {
    await expect(screens[i].shows, `${how}: screen ${i} isn’t showing`).toBeVisible({ timeout })
    for (const [j, s] of screens.entries()) if (j !== i) await expect(s.shows, `${how}: screen ${j} shows with ${i}`).not.toBeVisible()
    await expect.poll(() => address(page), { message: `${how}: the address for screen ${i}` }).toBe(at[i])
  }
  await expect(screens[0].shows).toBeVisible()
  await expect(page).toHaveURL(/[?&](place|open)=/)
  at.push(address(page))
  for (let i = 1; i < screens.length; i++) {
    await screens[i].open!()
    await expect(screens[i].shows).toBeVisible()
    // The screen shows at once; the address follows once the router lands.
    await expect.poll(() => address(page), { message: `screen ${i} has no address of its own` }).not.toBe(at[i - 1])
    at.push(address(page))
  }
  const last = screens.length - 1

  for (let i = last - 1; i >= 0; i--) {
    await page.goBack()
    await only(i, 'Back')
  }
  for (let i = 1; i <= last; i++) {
    await page.goForward()
    await only(i, 'Forward')
  }
  await page.reload()
  await only(last, 'a reload', 20_000)

  // Another tab, then Back to it: after a reload, entries written behind the
  // router's back changed the address here and drew nothing.
  await page.locator('nav a:visible', { hasText: /^Reports/ }).first().click()
  await expect.poll(() => address(page)).not.toContain('/admin?')
  await expect.poll(() => address(page)).not.toContain('place=')
  await page.goBack()
  await only(last, 'Back from another tab')

  // Closed on the screen: back over its entry, never out of the place.
  for (let i = last; i >= 1; i--) {
    await screens[i].close!()
    await only(i - 1, 'closed on the screen')
  }
}

const visible = (page: Page, l: Locator) => l.and(page.locator(':visible'))

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('a listing in Places: a box, then a minyan in it', async ({ page }) => {
  await page.goto('/philly/admin/places')
  await page.getByLabel('Find a place by name').fill(name)
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  const back = () => visible(page, page.getByRole('button', { name: '‹ Back' })).first().click()
  await walk(page, [
    { shows: page.getByRole('button', { name: /^Usual weekday times.*7 AM/ }) },
    { shows: page.getByRole('button', { name: 'Add a minyan' }), open: () => page.getByRole('button', { name: /^Usual weekday times.*7 AM/ }).click(), close: back },
    { shows: page.getByRole('button', { name: 'Remove this minyan' }), open: () => page.getByRole('button', { name: /^7 AM/ }).click(), close: back },
  ])
  // Still on the place: its own Back is what leaves it.
  await expect(page).toHaveURL(/\/philly\/admin\/places\?place=[^&]+$/)
})

test('an eruv in Places: a row', async ({ page }) => {
  await page.goto('/philly/admin/places')
  await page.getByLabel('Find a place by name').fill(eruvName)
  await page.getByRole('button', { name: `Open ${eruvName}`, exact: true }).click()
  await walk(page, [
    { shows: page.getByRole('button', { name: /^Status\s*Nothing/ }) },
    { shows: page.getByRole('button', { name: 'Add a source' }), open: () => page.getByRole('button', { name: /^Status/ }).click(), close: () => page.getByRole('button', { name: 'Done', exact: true }).click() },
  ])
  await expect(page).toHaveURL(new RegExp(`\\?place=${eruvId}$`))
})

test('a new place in To do: a box, then a minyan in it', async ({ page }) => {
  await page.goto('/philly/admin')
  await page.getByRole('button', { name: `Open ${newName}`, exact: true }).click()
  const done = () => page.getByRole('button', { name: 'Done', exact: true }).click()
  await walk(page, [
    { shows: page.getByRole('button', { name: /^Usual weekday times.*7 AM/ }) },
    { shows: page.getByRole('button', { name: 'Add a minyan' }), open: () => page.getByRole('button', { name: /^Usual weekday times.*7 AM/ }).click(), close: done },
    { shows: page.getByRole('button', { name: 'Remove this minyan' }), open: () => page.getByRole('button', { name: /^7 AM/ }).click(), close: done },
  ])
  await expect(page).toHaveURL(/\/philly\/admin\?open=[^&]+$/)
})

test('a change in To do: a minyan in the box it changes', async ({ page }) => {
  await page.goto('/philly/admin')
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  await walk(page, [
    { shows: page.getByRole('button', { name: 'Change to 7:15 AM' }) },
    { shows: page.getByRole('button', { name: 'Remove this minyan' }), open: () => page.getByRole('button', { name: /^7:15 AM/ }).click(), close: () => page.getByRole('button', { name: 'Done', exact: true }).click() },
  ])
  await expect(page).toHaveURL(/\/philly\/admin\?open=[^&]+$/)
})
