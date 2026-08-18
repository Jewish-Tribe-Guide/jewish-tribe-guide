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

test('creating a category through the real editor makes it live, and deleting it removes it', async ({ page }) => {
  const name = `E2E Admin Write ${randomUUID().slice(0, 8)}`
  pendingCategoryNames.push(name)

  // .and(':visible') everywhere below — Next keeps the just-navigated-away-
  // from route mounted (React <Activity>, see MapScreen.tsx's own comment
  // on the same behavior), so a hidden duplicate element from the
  // pre-navigation page can otherwise make these locators ambiguous. Same
  // treatment as the "Title" input in form-editor.spec.ts.
  const visible = (l: Locator) => l.and(page.locator(':visible'))

  await page.goto('/admin/categories')
  await visible(page.getByRole('button', { name: '+ New category' })).click()

  await page.getByPlaceholder('e.g. Schools').and(page.locator(':visible')).fill(name)
  await visible(page.getByRole('button', { name: 'Create category' })).click()

  // Saving navigates back to the list and reloads it.
  const row = page.locator('div.rounded-lg.shadow-sm:visible', { hasText: name })
  await expect(row).toBeVisible({ timeout: 10_000 })

  const supabase = getAdminClient()
  const { data: created } = await supabase
    .from('category')
    .select('id, plural_label, kind')
    .eq('plural_label', name)
    .maybeSingle()
  expect(created, 'the category should exist in the database after Create').not.toBeNull()
  expect(created!.kind).toBe('listing')

  // Delete it back out through the same real UI.
  await row.getByRole('button', { name: 'Delete' }).click()
  await row.getByRole('button', { name: 'Delete category & listings' }).click()
  await expect(row).not.toBeVisible()

  const { data: afterDelete } = await supabase
    .from('category')
    .select('id')
    .eq('id', created!.id)
    .maybeSingle()
  expect(afterDelete, 'the category should be gone after confirming delete').toBeNull()
})
