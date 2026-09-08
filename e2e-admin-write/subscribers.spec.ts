import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the admin Subscribers tab's real list+remove behavior — the one
// piece of the category-subscriptions feature (SubscribeSection.tsx) that
// had no admin surface at all before this. There's no admin "create" flow
// (subscribers only ever come from the public signup form), so the fixture
// is inserted directly rather than through the UI, same disposable test
// Supabase project as the rest of this suite (see
// playwright.admin-write.config.ts). Cleanup mirrors category-editor.spec.ts's
// own pattern: tracked by email (known up front), not by id, so a test that
// fails before reaching a DB lookup doesn't leak a real row.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

const pendingEmails: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const email of pendingEmails.splice(0)) {
    await supabase.from('subscriber').delete().eq('community_id', 'philly').eq('email', email)
  }
})

test('the Subscribers tab lists a real subscriber, and Remove deletes it for real', async ({ page }) => {
  const email = `e2e-admin-write-${randomUUID().slice(0, 8)}@example.com`
  pendingEmails.push(email)

  const supabase = getAdminClient()
  const { error: insertError } = await supabase.from('subscriber').insert({
    community_id: 'philly',
    email,
    categories: null,
    notify_add: true,
    notify_closure: false,
  })
  expect(insertError).toBeNull()

  await page.goto('/philly/admin/subscribers')

  // A table row now (see SubscriberManager.tsx's own comment — matches
  // CommunityManager's Admins roster shape), not a bare div.
  const row = page.locator('tr', { hasText: email })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(row.getByText('All categories')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await row.getByRole('button', { name: 'Remove' }).click()

  await expect(row).not.toBeVisible()

  const { data: afterDelete } = await supabase.from('subscriber').select('id').eq('community_id', 'philly').eq('email', email)
  expect(afterDelete).toEqual([])
})
