import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives PagesEditor's real save flow — the admin console's Pages tab (About/
// Privacy), added alongside this test. Unlike category-editor.spec.ts and
// form-editor.spec.ts, there's nothing to create or delete: `page` rows are
// singletons seeded by migration, so this edits a real row through the real
// UI and puts the original body back afterward, same restore pattern as
// e2e-cache/cache-roundtrip.spec.ts uses for site_settings.
//
// Deliberately targets "privacy", not "about": e2e-cache/cache-roundtrip.spec.ts
// has its own PATCH/poll/restore cycle against the "about" row, and this job
// (`admin-write` in ci.yml) runs concurrently with `cache-roundtrip` against
// the same shared test Supabase project — no `needs:` dependency between
// them. Both suites hitting the same singleton row raced in real CI (each
// could stomp the other's write mid-poll), which surfaced as an intermittent
// cache-roundtrip timeout with no actual caching bug behind it. Splitting the
// two suites onto different rows removes the race outright, rather than
// papering over it with a longer timeout.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

test('editing a page through the real Pages tab saves to the database', async ({ page }) => {
  const supabase = getAdminClient()
  const { data: before } = await supabase.from('page').select('body').eq('slug', 'privacy').single()
  const originalBody = before!.body as string

  const newBody = `E2E Admin Write ${randomUUID().slice(0, 8)}`

  try {
    await page.goto('/admin/pages')
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click()

    const bodyField = page.getByLabel('Body')
    await bodyField.fill(newBody)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved.')).toBeVisible({ timeout: 10_000 })

    const { data: after } = await supabase.from('page').select('body').eq('slug', 'privacy').single()
    expect(after!.body).toBe(newBody)
  } finally {
    await supabase.from('page').update({ body: originalBody }).eq('slug', 'privacy')
  }
})
