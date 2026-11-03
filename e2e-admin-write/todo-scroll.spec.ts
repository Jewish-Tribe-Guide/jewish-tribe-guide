import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// To do keeps your spot (the user, Nov 2: "when I scroll on to do and then
// click a listing ... it loads the whole page"). On a computer the list
// moves into a column beside the open place, so the row you clicked has to
// stay where it was on screen, and closing the place has to bring the list
// back with that row where you left it. Positions, so it's a real browser's
// job, not jsdom's. The rows are pending suggestions made for the test, in
// a category no page shows, deleted after.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const run = randomUUID().slice(0, 8)
const names = Array.from({ length: 14 }, (_, i) => `E2E Spot ${run} ${String(i + 1).padStart(2, '0')}`)
const ids: string[] = []

test.beforeAll(async () => {
  const { data, error } = await getAdminClient()
    .from('submission')
    .insert(
      names.map((name) => ({
        operation: 'create',
        target_type: 'listing',
        target_id: null,
        payload: { category: 'e2e-todo-scroll', name, anchorId: 'community', distance: null, address: '1 Test St, Philadelphia, PA', phone: '', details: {}, geo: { lat: 39.95, lng: -75.16 } },
        note: null,
        status: 'pending',
        submitted_by: { name: 'e2e-admin-write suite' },
      })),
    )
    .select('id')
  if (error || !data) throw new Error(`Could not seed the suggestions: ${error?.message}`)
  ids.push(...data.map((d) => d.id))
})

test.afterAll(async () => {
  if (ids.length) await getAdminClient().from('submission').delete().in('id', ids)
})

const top = (page: Page, name: string) => page.getByRole('button', { name: `Open ${name}` }).evaluate((el) => Math.round(el.getBoundingClientRect().top))

/** To do at a computer's width, once the list is whole. The jobs answer
 *  after To do does and add their places to the list (30 rows to 57 on the
 *  test project): a row's spot means nothing while rows still arrive above it. */
async function openTodo(page: Page) {
  const inFlight = new Set<unknown>()
  page.on('request', (r) => void (r.url().includes('/api/admin/') && inFlight.add(r)))
  page.on('requestfinished', (r) => void inFlight.delete(r))
  page.on('requestfailed', (r) => void inFlight.delete(r))
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto('/philly/admin')
  await expect(page.getByRole('button', { name: `Open ${names[9]}` })).toBeVisible()
  let rows = -1
  await expect
    .poll(
      async () => {
        const now = inFlight.size === 0 ? await page.locator('[data-place]').count() : -1
        const steady = now >= 0 && now === rows
        rows = now
        return steady
      },
      { intervals: [700], timeout: 30_000 },
    )
    .toBe(true)
}

test('opening a place and closing it keeps the row you clicked where it was', async ({ page }) => {
  await openTodo(page)
  const name = names[9]
  const row = page.getByRole('button', { name: `Open ${name}` })
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  expect(await page.evaluate(() => window.scrollY), 'the list must be scrolled for this to test anything').toBeGreaterThan(200)
  const before = await top(page, name)

  await row.click()
  await expect(page).toHaveURL(/[?&]open=/)
  await expect(page.locator('[data-place][aria-current="true"]')).toContainText(name)
  await expect.poll(async () => Math.abs((await top(page, name)) - before), { message: 'the row moved when its place opened' }).toBeLessThan(6)

  // Scrolled in its column since, and closed with To do in the sidebar.
  await page.locator('[data-place][aria-current="true"]').evaluate((el) => {
    el.closest<HTMLElement>('.md\\:overflow-y-auto')!.scrollTop += 90
  })
  const scrolled = await top(page, name)
  await page.locator('nav a:visible', { hasText: /^To do/ }).first().click()
  await expect(page).not.toHaveURL(/[?&]open=/)
  await expect.poll(async () => Math.abs((await top(page, name)) - scrolled), { message: 'the list came back somewhere else' }).toBeLessThan(6)
})

// The user, Nov 2: "Should there be a way to x out of the to do listings?"
// The open place's X, and Esc, put the list back at full width, the row
// where it was; Esc typed into a box is the box's.
test('the open place’s X and Esc close it, back to the whole list', async ({ page }) => {
  await openTodo(page)
  const name = names[9]
  const row = page.getByRole('button', { name: `Open ${name}` })
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const before = await top(page, name)

  await row.click()
  await expect(page).toHaveURL(/[?&]open=/)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page).not.toHaveURL(/[?&]open=/)
  await expect(page.locator('[data-place][aria-current="true"]')).toHaveCount(0)
  await expect.poll(async () => Math.abs((await top(page, name)) - before), { message: 'the X put the list back somewhere else' }).toBeLessThan(6)

  await row.click()
  await expect(page).toHaveURL(/[?&]open=/)
  const box = page.getByRole('searchbox').or(page.getByRole('textbox')).first()
  await box.focus()
  await page.keyboard.press('Escape')
  await expect(page, 'Esc in a box closed the place').toHaveURL(/[?&]open=/)
  await box.blur()
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/[?&]open=/)
  await expect(page.locator('[data-place][aria-current="true"]')).toHaveCount(0)
})

// The user, Nov 2: how much room To do takes. The line between the list and
// the open place drags, and the width stays for the next place opened, and
// after a reload.
test('dragging the line between the list and the place sets the list’s width, and it’s kept', async ({ page }) => {
  await openTodo(page)
  const row = page.getByRole('button', { name: `Open ${names[9]}` })
  await row.click()
  await expect(page).toHaveURL(/[?&]open=/)
  const line = page.getByRole('separator', { name: 'Resize To do and the place' })
  const list = page.locator('[data-place]').first()
  const listWidth = () => list.evaluate((el) => Math.round(el.getBoundingClientRect().width))
  const before = await listWidth()
  const box = (await line.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 200, { steps: 4 })
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + 200, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await listWidth()) - before, { message: 'the list didn’t widen' }).toBeGreaterThan(140)
  const wide = await listWidth()

  await page.reload()
  await expect(page).toHaveURL(/[?&]open=/)
  await expect(page.getByRole('separator', { name: 'Resize To do and the place' })).toBeVisible()
  await expect.poll(listWidth, { message: 'the width wasn’t kept' }).toBe(wide)

  // Double-click: back to the usual width.
  await page.getByRole('separator', { name: 'Resize To do and the place' }).dblclick()
  await expect.poll(listWidth).toBe(before)
})
