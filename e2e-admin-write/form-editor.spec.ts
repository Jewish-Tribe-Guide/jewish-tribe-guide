import { randomUUID } from 'node:crypto'
import { expect, test, type Locator } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives FormEditor's real create(+publish)+delete flow through CategoryManager
// — the other half of the "admin console's actual write behavior" gap
// alongside category-editor.spec.ts. A brand-new form is create-then-publish
// in one step (see FormEditor's createAndPublish — there's no bare "save" for
// a form that doesn't exist yet), so this exercises formStore.createForm's
// real write path, not just the draft-save one submissionStore.test.ts/
// formStore.test.ts already cover with mocks.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

// Tracked by title, not by the server-generated id — see the identical
// comment in category-editor.spec.ts for why: a test that fails before
// reaching the id lookup would otherwise leak a real row.
const pendingFormTitles: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const title of pendingFormTitles.splice(0)) {
    const { data } = await supabase.from('form').select('id').eq('title', title).maybeSingle()
    if (!data) continue
    // Mirrors deleteForm's own order (responses before the form row).
    await supabase.from('form_response').delete().eq('form_id', data.id)
    await supabase.from('form').delete().eq('id', data.id)
  }
})

test('creating and publishing a form through the real editor makes it live, and deleting it removes it', async ({ page }) => {
  const title = `E2E Admin Write ${randomUUID().slice(0, 8)}`
  pendingFormTitles.push(title)

  // .and(':visible') everywhere below — Next keeps the just-navigated-away-
  // from route mounted (React <Activity>, see MapScreen.tsx's own comment
  // on the same behavior), so a hidden duplicate element from the
  // pre-navigation page can otherwise make these locators ambiguous.
  const visible = (l: Locator) => l.and(page.locator(':visible'))

  await page.goto('/admin/categories')
  await visible(page.getByRole('button', { name: '+ Add Form' })).click()

  const titleInput = visible(page.getByLabel('Title', { exact: true }))
  await titleInput.fill('') // NEW_FORM_DEFAULTS.title is "New form" — clear it first
  await titleInput.fill(title)
  await visible(page.getByRole('button', { name: 'Publish' })).click()

  // Publishing navigates back to the list and reloads it.
  const row = page.locator('div.rounded-lg.shadow-sm:visible', { hasText: title })
  await expect(row).toBeVisible({ timeout: 10_000 })

  const supabase = getAdminClient()
  const { data: created } = await supabase.from('form').select('id, title, steps').eq('title', title).maybeSingle()
  expect(created, 'the form should exist in the database after Publish').not.toBeNull()
  expect(Array.isArray(created!.steps) && created!.steps.length).toBeGreaterThan(0)

  // Delete it back out through the same real UI.
  await row.getByRole('button', { name: 'Delete' }).click()
  await row.getByRole('button', { name: 'Delete form & responses' }).click()
  await expect(row).not.toBeVisible()

  const { data: afterDelete } = await supabase.from('form').select('id').eq('id', created!.id).maybeSingle()
  expect(afterDelete, 'the form should be gone after confirming delete').toBeNull()
})
