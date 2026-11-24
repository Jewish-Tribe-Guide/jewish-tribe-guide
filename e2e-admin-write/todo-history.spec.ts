import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { TEST_COMMUNITY } from '../scripts/testCommunity.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// To do's open place is a screen of its own (?open=<place>), so Back,
// Forward and a reload have to land on it (AGENTS.md, "A screen of its own
// is an entry in the browser's history"). It used to be written with a raw
// history.pushState, the pattern AGENTS.md warns against; it goes through
// Next's router now (useScreenHistory's moveTo).
//
// These passed against the raw pushState too (Nov 18, 7 of 7): Next's
// patched pushState copies its router's state into the entry, and To do's
// entries differ from the page before only in the query, so the copy was
// the right page. They're here so the move to the router can't break what
// worked; ModerationQueue.test.tsx pins that it goes through the router.
// Only a real browser runs Next's own popstate handling, so this is e2e.
// The row is a pending suggestion made for the test, in a category no page
// shows, deleted after.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const run = randomUUID().slice(0, 8)
const name = `E2E History ${run}`
const ids: string[] = []

test.beforeAll(async () => {
  const { data, error } = await getAdminClient()
    .from('submission')
    .insert({
      community_id: TEST_COMMUNITY,
      operation: 'create',
      target_type: 'listing',
      target_id: null,
      payload: { category: 'e2e-todo-history', name, anchorId: 'community', distance: null, address: '1 Test St, Philadelphia, PA', phone: '', details: {}, geo: { lat: 39.95, lng: -75.16 } },
      note: null,
      status: 'pending',
      submitted_by: { name: 'e2e-admin-write suite' },
    })
    .select('id')
  if (error || !data) throw new Error(`Could not seed the suggestion: ${error?.message}`)
  ids.push(...data.map((d) => d.id))
})

test.afterAll(async () => {
  if (ids.length) await getAdminClient().from('submission').delete().in('id', ids)
})

const row = (page: Page) => page.getByRole('button', { name: `Open ${name}` })
const place = (page: Page) => page.getByTestId('todo-place')

async function showsPlace(page: Page) {
  await expect(page).toHaveURL(/[?&]open=/)
  await expect(place(page)).toBeVisible({ timeout: 15_000 })
  await expect(place(page)).toContainText(name)
}

async function showsList(page: Page) {
  await expect(page).not.toHaveURL(/[?&]open=/)
  await expect(place(page)).toHaveCount(0)
  await expect(row(page)).toBeVisible({ timeout: 15_000 })
}

async function openTodo(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/${TEST_COMMUNITY}/admin`)
  await expect(row(page)).toBeVisible({ timeout: 30_000 })
}

async function toPlacesAndReload(page: Page) {
  await page.getByRole('link', { name: 'Places', exact: true }).first().click()
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/places`))
  await page.reload()
}

test('To do’s open place: Back, Forward and a reload land on it', async ({ page }) => {
  await openTodo(page)
  await row(page).click()
  await showsPlace(page)
  await page.goBack()
  await showsList(page)
  await page.goForward()
  await showsPlace(page)
  await page.reload()
  await showsPlace(page)

  // Its X is an entry too: Back from the list opens the place again.
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await showsList(page)
  await page.goBack()
  await showsPlace(page)
})

// The case a raw pushState broke: the place opened (an entry the router
// never wrote), another admin page, a reload there, then Back. The address
// came back and the page drew nothing.
test('Back to To do’s open place from another page, after a reload there', async ({ page }) => {
  await openTodo(page)
  await row(page).click()
  await showsPlace(page)
  await toPlacesAndReload(page)
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin\\?(.*&)?open=`))
  await showsPlace(page)
})

test('Back to To do’s list from another page, after a reload there', async ({ page }) => {
  await openTodo(page)
  await row(page).click()
  await showsPlace(page)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await showsList(page)
  await toPlacesAndReload(page)
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin(\\?|$)`))
  await showsList(page)
})
