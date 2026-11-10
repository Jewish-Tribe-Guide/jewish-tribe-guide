import { randomUUID } from 'node:crypto'
import { expect, test, type Locator } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives CategoryManager/CategoryEditor's real create+delete flow — the
// biggest untested surface of the admin console's actual write behavior
// (731 + 481 lines, 0% coverage before this). moderation.spec.ts covers
// approve/reject; nothing has ever driven creating or deleting a category
// through the real UI. Same disposable test Supabase project as the rest of
// this suite (see playwright.admin-write.config.ts).
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

// Tracked by name, not by the server-generated id: the id isn't known until
// partway through the test (after a DB lookup that itself comes after a UI
// assertion which can fail first), but the name is fixed up front. Cleanup
// looks the row up by name instead of relying on an id having been recorded
// — otherwise a test that fails before reaching the id lookup leaks a real
// row into the test project (this happened once while developing this file).
const pendingCategoryNames: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const name of pendingCategoryNames.splice(0)) {
    const { data } = await supabase.from('category').select('id').eq('plural_label', name).maybeSingle()
    if (!data) continue
    // Mirrors deleteCategory's own order (listings before the category row)
    // — belt-and-suspenders cleanup even though these tests never add listings.
    await supabase.from('resource').delete().eq('category', data.id)
    await supabase.from('category').delete().eq('id', data.id)
  }
})

// Each save below waits 30s: it is several database round trips against the
// shared test project, and on CI one has taken over 10s, still "Sending…"
// when a 10s wait ran out (Oct 18 on main, after Create; Oct 22 on #342,
// after Add listing). Written out, so e2eTimeouts.test.ts can see them.

test('creating a category through the real editor makes it live, and deleting it removes it', async ({ page }) => {
  const name = `E2E Admin Write ${randomUUID().slice(0, 8)}`
  pendingCategoryNames.push(name)

  // .and(':visible') everywhere below — Next keeps the just-navigated-away-
  // from route mounted (React <Activity>, see MapScreen.tsx's own comment
  // on the same behavior), so a hidden duplicate element from the
  // pre-navigation page can otherwise make these locators ambiguous. Same
  // treatment as the "Title" input in form-editor.spec.ts.
  const visible = (l: Locator) => l.and(page.locator(':visible'))

  await page.goto('/philly/admin/categories')
  // Board 1: on a computer the button is level with the heading, at its right.
  const heading = await visible(page.getByRole('heading', { name: 'Category pages', level: 1 })).boundingBox()
  const add = await visible(page.getByRole('button', { name: '+ New category page' })).boundingBox()
  expect(add!.y + add!.height / 2).toBeGreaterThan(heading!.y)
  expect(add!.y + add!.height / 2).toBeLessThan(heading!.y + heading!.height)
  expect(add!.x).toBeGreaterThan(heading!.x + heading!.width / 2)
  await visible(page.getByRole('button', { name: '+ New category page' })).click()

  await visible(page.getByRole('button', { name: 'Make your own page' })).click()
  await visible(page.getByLabel('Name', { exact: true })).fill(name)
  await visible(page.getByRole('button', { name: 'Create category' })).click()

  // Creating opens the new category's own page, saved (its heading is the
  // name typed, so it shows before the save lands); back to the list.
  await expect(visible(page.getByRole('status'))).toHaveText('Saved.', { timeout: 30_000 })
  await expect(page).toHaveURL(/\/philly\/admin\/categories\/cat:e2e-admin-write-/)

  // + Add a field, from a box of Fields (board 17): the ready-made list
  // loads (boards 7 and 11), and a field from it is saved onto the page, in
  // the box it shows in, opened.
  await visible(page.getByRole('button', { name: 'Contact', exact: true })).click()
  await visible(page.getByRole('button', { name: '+ Add a field' })).click()
  await visible(page.getByRole('button', { name: /^Hours/ })).click()
  await visible(page.getByRole('button', { name: `Add to ${name}` })).click()
  await expect(visible(page.getByRole('button', { name: 'Contact', expanded: true }))).toBeVisible()
  await expect(visible(page.getByRole('button', { name: /^Hours/ }))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Save' })).click()
  await expect(visible(page.getByRole('status'))).toHaveText('Saved.', { timeout: 30_000 })

  await visible(page.getByRole('button', { name: '‹ Category pages' })).click()
  // One row per page, saying how many places it has (board 1).
  const row = visible(page.getByRole('button', { name }))
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row).toContainText(`${name}0 places`)

  const supabase = getAdminClient()
  const { data: created } = await supabase
    .from('category')
    .select('id, plural_label, kind, fields')
    .eq('plural_label', name)
    .maybeSingle()
  expect(created, 'the category should exist in the database after Create').not.toBeNull()
  expect(created!.kind).toBe('listing')
  expect((created!.fields as { type: string }[]).some((f) => f.type === 'hours'), 'the ready-made Hours field should be saved').toBe(true)

  // Delete it back out through the same real UI, from the foot of its page.
  await row.click()
  await visible(page.getByRole('button', { name: 'Delete this page' })).click()
  await expect(visible(page.getByText(`Delete ${name} and every place on it?`))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Delete it' })).click()
  await expect(visible(page.getByRole('button', { name: '+ New category page' }))).toBeVisible({ timeout: 30_000 })
  await expect(row).not.toBeVisible()

  const { data: afterDelete } = await supabase
    .from('category')
    .select('id')
    .eq('id', created!.id)
    .maybeSingle()
  expect(afterDelete, 'the category should be gone after confirming delete').toBeNull()
})

test('a category created hidden stays hidden, and Places\' Add a place publishes a listing to it directly with no moderation queue', async ({ page }) => {
  const categoryName = `E2E Hidden Cat ${randomUUID().slice(0, 8)}`
  const listingName = `E2E Direct Listing ${randomUUID().slice(0, 8)}`
  pendingCategoryNames.push(categoryName)

  const visible = (l: Locator) => l.and(page.locator(':visible'))

  await page.goto('/philly/admin/categories')
  await visible(page.getByRole('button', { name: '+ New category page' })).click()

  await visible(page.getByRole('button', { name: 'Make your own page' })).click()
  await visible(page.getByLabel('Name', { exact: true })).fill(categoryName)
  // No address on this category — sidesteps the real Google Places
  // autocomplete AddressInput uses, which this suite doesn't drive anywhere
  // else; a plain name-only listing is enough to prove the direct-add path.
  // A press while typing only puts the keyboard away, so leave the name first.
  await visible(page.getByLabel('Name', { exact: true })).blur()
  await visible(page.getByRole('button', { name: 'Contact', exact: true })).click()
  await visible(page.getByRole('button', { name: /^Address/ })).click()
  await visible(page.getByRole('button', { name: 'Remove this field' })).click()
  // The create-time visibility toggle this test exists to cover — see
  // AGENTS.md's testing conventions: this failed against the pre-fix
  // CategoryEditor (no such control existed; every category was created
  // active) before it and its wiring were added. A switch beside the
  // name now.
  await visible(page.getByRole('switch', { name: 'On the site', exact: true })).click()
  await visible(page.getByRole('button', { name: 'Create category' })).click()

  await expect(visible(page.getByRole('status'))).toHaveText('Saved.', { timeout: 30_000 })
  await visible(page.getByRole('button', { name: '‹ Category pages' })).click()
  const row = visible(page.getByRole('button', { name: categoryName }))
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row).toContainText('Hidden')

  const supabase = getAdminClient()
  const { data: created } = await supabase
    .from('category')
    .select('id, active')
    .eq('plural_label', categoryName)
    .maybeSingle()
  expect(created, 'the category should exist in the database after Create').not.toBeNull()
  expect(created!.active, 'a category created with the box unchecked should never touch active:true').toBe(false)

  // Places' Add a place — publishes directly, live, with no review queue,
  // even though the category itself is hidden. This is the path a hidden
  // seasonal category (e.g. Sukkahs, ahead of its campaign banner's reveal
  // date) is meant to be seeded through. It was the category row's own
  // "+ Add listing" until Nov 3; Places offers hidden categories too.
  // The visitors' editor (ListingEditor): the Name row, then Done back to
  // the list, where Send reads "Add listing".
  await page.goto(`/philly/admin/places?category=${created!.id}`)
  await visible(page.getByRole('button', { name: 'Add a place' })).click()
  await visible(page.getByTestId('editor-row-name')).click()
  await visible(page.getByRole('textbox', { name: 'Name' })).fill(listingName)
  await visible(page.getByRole('button', { name: 'Done' })).click()
  const addButton = visible(page.getByRole('button', { name: 'Add listing' }))
  await expect(addButton).toBeEnabled()
  await addButton.click()

  // With nothing to read, "… is added" shows only while it looks, then it's
  // back on Places, listing it. Waiting on the banner raced that: CI missed
  // it, a local run caught it.
  await expect(visible(page.getByRole('button', { name: `Open ${listingName}` }))).toBeVisible({ timeout: 30_000 })

  const { data: listing } = await supabase
    .from('resource')
    .select('id, status, category')
    .eq('name', listingName)
    .maybeSingle()
  expect(listing, 'the listing should exist in the database immediately').not.toBeNull()
  expect(listing!.category).toBe(created!.id)
  expect(listing!.status, 'a direct admin add must publish immediately, not queue for moderation').toBe('approved')

  const { data: submission } = await supabase
    .from('submission')
    .select('status')
    .eq('target_id', listing!.id)
    .maybeSingle()
  expect(submission?.status ?? 'approved', 'nothing should be left pending in the moderation queue').not.toBe('pending')
})
