import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the Read questions tab for real: a reading the AI made is listed
// with how it was read, Approve stores who approved it and when (a rule,
// used with no AI at all), Unapprove takes that back, and Forget deletes
// it so the question is read afresh. The reading is inserted straight into
// question_reading: no test server ever calls the reader (QUESTION_READER
// =off). Needs migration 062 (question_reading) on the test project.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Letters only, so it's nothing a visitor could have asked.
const suffix = Date.now().toString(36).replace(/\d/g, (d) => 'ghijklmnop'[Number(d)])
const key = `qqzv read ${suffix}`

test.afterEach(async () => {
  await getAdminClient().from('question_reading').delete().eq('community_id', 'philly').eq('key', key)
})

test('a read question is listed as read, approved and unapproved for real, and forgotten', async ({ page }) => {
  const supabase = getAdminClient()
  const { data: cats } = await supabase.from('category').select('id, plural_label').eq('community_id', 'philly').limit(1)
  const category = cats![0] as { id: string; plural_label: string }
  const { error } = await supabase.from('question_reading').insert({
    community_id: 'philly',
    key,
    question: key,
    reading: { categories: [{ id: category.id }] },
    model: 'test',
    hits: 3,
  })
  expect(error).toBeNull()
  const stored = async () => (await supabase.from('question_reading').select('approved_at, approved_by').eq('community_id', 'philly').eq('key', key)).data

  await page.goto('/philly/admin/questions')
  const review = page.locator('section', { has: page.getByRole('heading', { name: /^To review/ }) })
  const row = review.getByTestId('read-question').filter({ hasText: `“${key}”` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText('3 times')
  await expect(row).toContainText(category.plural_label)

  await row.getByRole('button', { name: 'Approve' }).click()
  await expect(row).not.toBeVisible()
  await expect.poll(async () => (await stored())?.[0]?.approved_at).toBeTruthy()
  expect((await stored())?.[0]?.approved_by).toBeTruthy()

  await page.getByRole('button', { name: 'Show Approved' }).click()
  const approved = page.getByTestId('read-question').filter({ hasText: `“${key}”` })
  await approved.getByRole('button', { name: 'Unapprove' }).click()
  await expect(row).toBeVisible()
  await expect.poll(async () => (await stored())?.[0]?.approved_at ?? null).toBeNull()

  await row.getByRole('button', { name: 'Forget' }).click()
  await expect(row).not.toBeVisible()
  await expect.poll(async () => (await stored())?.length).toBe(0)
})
