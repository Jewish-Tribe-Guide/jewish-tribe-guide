import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the Missed searches tab for real: a counted search shows up under
// "Not in the guide", Dismiss takes it off the to-do list and stores that,
// Restore puts it back. The count is inserted straight into daily_count —
// the counter that normally writes it (/api/counts via countEvent) never
// counts from an automated browser, by design. Needs migration 058
// (search_miss_dismissal) on the test project.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Letters only: nothing in the guide can match it, and nothing close either,
// so it lands in "Not in the guide" whatever the test project holds. (A run
// of digits could read as a phone number, which the counter drops.)
const suffix = Date.now().toString(36).replace(/\d/g, (d) => 'ghijklmnop'[Number(d)])
const term = `qqzv ${suffix}`

test.afterEach(async () => {
  const supabase = getAdminClient()
  await supabase.from('daily_count').delete().eq('community_id', 'philly').eq('kind', 'search_miss').eq('key', term)
  await supabase.from('search_miss_dismissal').delete().eq('community_id', 'philly').eq('key', term)
})

test('a missed search is listed, dismissed for real, and restored', async ({ page }) => {
  const supabase = getAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('daily_count').insert({ community_id: 'philly', kind: 'search_miss', key: term, day: today, count: 3 })
  expect(error).toBeNull()

  await page.goto('/philly/admin/searches')
  const missing = page.locator('section', { has: page.getByRole('heading', { name: /^Not in the guide/ }) })
  const row = missing.getByTestId('missed-search').filter({ hasText: `“${term}”` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText('3 times')

  await row.getByRole('button', { name: 'Dismiss' }).click()
  await expect(row).not.toBeVisible()
  await expect
    .poll(async () => (await supabase.from('search_miss_dismissal').select('key').eq('community_id', 'philly').eq('key', term)).data?.length)
    .toBe(1)

  await page.getByRole('button', { name: 'Show Dismissed' }).click()
  const dismissed = page.getByTestId('missed-search').filter({ hasText: `“${term}”` })
  await dismissed.getByRole('button', { name: 'Restore' }).click()
  await expect(row).toBeVisible()
  await expect
    .poll(async () => (await supabase.from('search_miss_dismissal').select('key').eq('community_id', 'philly').eq('key', term)).data?.length)
    .toBe(0)
})
