import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the Read questions tab for real: a reading the AI made is listed
// with how it was read, Approve stores who approved it and when (a rule,
// used with no AI at all), Unapprove takes that back, and Forget deletes
// it so the question is read afresh. The reading is inserted straight into
// question_reading: no test server ever calls the reader (QUESTION_READER
// =off). Needs migration 062 (question_reading) on the test project.
//
// And teaching: a reading proposes a word, Teach stores it (question_word,
// migration 063) and it reaches the public site's categories (the cached
// read every search box gets its taught words from), and Unteach takes it
// away again.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Letters only, so it's nothing a visitor could have asked. Random too:
// --repeat-each runs copies at once, in workers that can start in the
// same millisecond, and two copies sharing a row fail each other.
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.replace(/\d/g, (d) => 'ghijklmnop'[Number(d)])
const key = `qqzv read ${suffix}`

const word = `qqzv${suffix}`

test.afterEach(async () => {
  await getAdminClient().from('question_reading').delete().eq('community_id', 'philly').in('key', [key, word])
  await getAdminClient().from('question_word').delete().eq('community_id', 'philly').eq('word', word)
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

type Field = { key: string; label: string; type: string; filterable?: boolean; filterLabel?: string; options?: { value: string; label: string }[] }

test('a word a reading proposes is taught, reaches the site, and is untaught', async ({ page, request }) => {
  const supabase = getAdminClient()
  const { error: missing } = await supabase.from('question_word').select('word').limit(1)
  expect(missing?.message ?? null, 'needs migration 063 (question_word) on the test project').toBeNull()
  // Any filterable pick-list with an option, on any category.
  const { data: cats } = await supabase.from('category').select('id, plural_label, fields').eq('community_id', 'philly')
  const found = (cats as { id: string; plural_label: string; fields: Field[] }[])
    .flatMap((c) => (c.fields ?? []).filter((f) => f.type === 'select' && f.filterable && f.options?.length).map((f) => ({ c, f })))
    .at(0)
  test.skip(!found, 'no filterable pick-list on the test project')
  const { c, f } = found!
  const option = f.options![0]
  const { error } = await supabase.from('question_reading').insert({
    community_id: 'philly',
    key: word,
    question: word,
    reading: { categories: [{ id: c.id, select: { [f.key]: [option.value] } }] },
    model: 'test',
  })
  expect(error).toBeNull()

  await page.goto('/philly/admin/questions')
  const row = page.getByTestId('read-question').filter({ hasText: `“${word}”` })
  const proposal = row.getByTestId('word-proposal')
  await expect(proposal).toContainText(`“${word}” means ${c.plural_label} · ${f.filterLabel ?? f.label}: ${option.label}`, { timeout: 20_000 })
  await proposal.getByRole('button', { name: 'Teach' }).click()
  await expect(proposal).not.toBeVisible()

  const stored = async () => (await supabase.from('question_word').select('category_id, field_key, value, from_question, taught_by').eq('community_id', 'philly').eq('word', word)).data
  await expect.poll(stored).toEqual([{ category_id: c.id, field_key: f.key, value: option.value, from_question: word, taught_by: expect.any(String) }])
  // The public, cached categories carry it: every search box reads it now.
  const taughtOnSite = async () => {
    const body = await (await request.get('/api/categories?community=philly')).json()
    return (body.categories as { id: string; askWords?: { word: string }[] }[]).find((x) => x.id === c.id)?.askWords?.some((w) => w.word === word) ?? false
  }
  await expect.poll(taughtOnSite, { timeout: 30_000 }).toBe(true)

  await page.getByRole('button', { name: /Taught words/ }).click()
  const taught = page.getByTestId('taught-word').filter({ hasText: `“${word}”` })
  await taught.getByRole('button', { name: 'Unteach' }).click()
  await expect(taught).not.toBeVisible()
  await expect.poll(async () => (await stored())?.length).toBe(0)
  await expect.poll(taughtOnSite, { timeout: 30_000 }).toBe(false)
})
