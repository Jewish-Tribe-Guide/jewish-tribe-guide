import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the AI's readings on To do for real (the admin redesign's step 2:
// the Read questions tab is gone, its readings are rows under "Searches
// nobody found"). A reading that proposes a word is a row of its own;
// Dismiss deletes the reading so the question is read afresh. The reading
// is inserted straight into question_reading: no test server ever calls
// the reader (QUESTION_READER=off). Needs migration 062 (question_reading)
// on the test project.
//
// And teaching: the row's proposed word, Teach stores it (question_word,
// migration 063) and it reaches the public site's categories (the cached
// read every search box gets its taught words from), and Unteach, on the
// Searches page's Taught words, takes it away again.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Letters only, so it's nothing a visitor could have asked. Random too:
// --repeat-each runs copies at once, in workers that can start in the
// same millisecond, and two copies sharing a row fail each other.
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.replace(/\d/g, (d) => 'ghijklmnop'[Number(d)])
// Ends in x: the search reads a word ending in s as a plural and teaches
// it without the s, which failed this one run in 26.
const word = `qqzv${suffix}x`

test.afterEach(async () => {
  await getAdminClient().from('question_reading').delete().eq('community_id', 'philly').eq('key', word)
  await getAdminClient().from('question_word').delete().eq('community_id', 'philly').eq('word', word)
})

type Field = { key: string; label: string; type: string; filterable?: boolean; filterLabel?: string; options?: { value: string; label: string }[] }

/** A reading of `word` as one option of a filterable pick-list, which the
 *  console proposes teaching. Skips when the test project has none. */
async function seedReading() {
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
    hits: 3,
  })
  expect(error).toBeNull()
  return { c, f, option }
}

/** The reading's row on To do, opened. */
async function openRow(page: import('@playwright/test').Page) {
  await page.goto('/philly/admin')
  // At the bottom of To do, folded: there when there's time.
  await page.getByRole('button', { name: /^Searches nobody found/ }).click({ timeout: 20_000 })
  const searches = page.getByRole('region', { name: 'Searches nobody found' })
  await expect(searches).toBeVisible({ timeout: 20_000 })
  // Five show; the test project may hold more searches than that.
  const more = searches.getByRole('button', { name: /^\d+ more$/ })
  if (await more.count()) await more.click()
  const row = searches.getByTestId('todo-search').filter({ hasText: `“${word}”` })
  await expect(row).toBeVisible()
  await expect(row).toContainText('3 searches')
  await row.getByRole('button', { expanded: false }).click()
  return row
}

test('a reading with a word to teach is a To do row, and Dismiss forgets it for real', async ({ page }) => {
  const supabase = getAdminClient()
  await seedReading()
  const stored = async () => (await supabase.from('question_reading').select('key').eq('community_id', 'philly').eq('key', word)).data

  const row = await openRow(page)
  // A reading never answers on the site, so there's nothing to approve.
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0)
  await row.getByRole('button', { name: 'Dismiss' }).click()
  await expect(row).not.toBeVisible()
  await expect.poll(async () => (await stored())?.length).toBe(0)
})

test('a word a reading proposes is taught, reaches the site, and is untaught', async ({ page, request }) => {
  const supabase = getAdminClient()
  const { c, f, option } = await seedReading()

  const row = await openRow(page)
  const proposal = row.getByTestId('todo-word')
  await expect(proposal).toContainText(`“${word}” means ${c.plural_label} · ${f.filterLabel ?? f.label}: ${option.label}`)
  await proposal.getByRole('button', { name: 'Teach' }).click()
  // Taught, the search is off the list.
  await expect(row).not.toBeVisible()

  const stored = async () => (await supabase.from('question_word').select('category_id, field_key, value, from_question, taught_by').eq('community_id', 'philly').eq('word', word)).data
  await expect.poll(stored).toEqual([{ category_id: c.id, field_key: f.key, value: option.value, from_question: word, taught_by: expect.any(String) }])
  // The public, cached categories carry it: every search box reads it now.
  const taughtOnSite = async () => {
    const body = await (await request.get('/api/categories?community=philly')).json()
    return (body.categories as { id: string; askWords?: { word: string }[] }[]).find((x) => x.id === c.id)?.askWords?.some((w) => w.word === word) ?? false
  }
  await expect.poll(taughtOnSite, { timeout: 30_000 }).toBe(true)

  await page.goto('/philly/admin/searches')
  await page.getByRole('button', { name: /Taught words/ }).click()
  const taught = page.getByTestId('taught-word').filter({ hasText: `“${word}”` })
  await taught.getByRole('button', { name: 'Unteach' }).click()
  await expect(taught).not.toBeVisible()
  await expect.poll(async () => (await stored())?.length).toBe(0)
  await expect.poll(taughtOnSite, { timeout: 30_000 }).toBe(false)
})
