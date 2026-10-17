import { randomUUID } from 'node:crypto'
import { expect, test, type Locator } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Drives the Campaigns tab's real create flow, specifically the case that
// motivated it: linking a category that's currently HIDDEN and has never had
// a live campaign yet (a brand-new seasonal category, before its reveal
// date). CampaignBannerManager used to source its "Category" dropdown from
// the public, filtered listCategories() (via useCategories()/ContentProvider)
// — which hides an inactive category unless a currently-live campaign
// already promotes it. A category with no campaign yet can never satisfy
// that, so it could never be selected here in the first place: a real
// chicken-and-egg gap, not just a hypothetical. Same disposable test
// Supabase project as the rest of this suite.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

// Same by-name tracking as category-editor.spec.ts's own cleanup, and for
// the same reason: ids aren't known until partway through the test.
const pendingCategoryNames: string[] = []
const pendingBannerTitles: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const title of pendingBannerTitles.splice(0)) {
    await supabase.from('campaign_banner').delete().eq('title', title)
  }
  for (const name of pendingCategoryNames.splice(0)) {
    const { data } = await supabase.from('category').select('id').eq('plural_label', name).maybeSingle()
    if (!data) continue
    await supabase.from('resource').delete().eq('category', data.id)
    await supabase.from('category').delete().eq('id', data.id)
  }
})

function isoDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

test('a hidden, not-yet-promoted category can still be linked to a future campaign banner', async ({ page }) => {
  const categoryName = `E2E Future Campaign Cat ${randomUUID().slice(0, 8)}`
  const bannerTitle = `E2E Future Banner ${randomUUID().slice(0, 8)}`
  pendingCategoryNames.push(categoryName)
  pendingBannerTitles.push(bannerTitle)

  const visible = (l: Locator) => l.and(page.locator(':visible'))

  // Create the category hidden — the state a not-yet-launched seasonal
  // category (Sukkahs, ahead of Sukkot) is meant to sit in.
  await page.goto('/philly/admin/categories')
  await visible(page.getByRole('button', { name: '+ New category' })).click()
  await page.getByPlaceholder('e.g. Schools').and(page.locator(':visible')).fill(categoryName)
  await visible(page.getByLabel('Visible on the site immediately')).uncheck()
  await visible(page.getByRole('button', { name: 'Create category' })).click()
  await expect(page.locator('div.rounded-lg.shadow-sm:visible', { hasText: categoryName })).toBeVisible({
    timeout: 10_000,
  })

  const supabase = getAdminClient()
  const { data: category } = await supabase.from('category').select('id, active').eq('plural_label', categoryName).maybeSingle()
  expect(category?.active).toBe(false)

  // Now link it to a campaign whose window hasn't started yet — the category
  // has no live campaign promoting it, so this is exactly the case the fix
  // covers: it must still be a selectable option, not filtered out.
  await page.goto('/philly/admin/campaigns')
  await visible(page.getByRole('button', { name: '+ Add a campaign banner' })).click()

  // Scoped to the form itself (data-testid="campaign-banner-form") and
  // located structurally, not via getByLabel: this form's <select>/<input>
  // elements sit in <label> wrappers with no htmlFor/id, so their computed
  // accessible name folds in their own current value (accname's "name from
  // content" for embedded controls) — and getByLabel then matches on that,
  // colliding with unrelated generic label text elsewhere in this shared
  // test project's admin chrome ("Category", "Start date", etc). Structural
  // lookup by field order/type sidesteps it entirely.
  const form = visible(page.getByTestId('campaign-banner-form'))
  await form.getByPlaceholder('Sukkah Map').fill(bannerTitle)
  await form.locator('select').first().selectOption({ label: `${categoryName} (hidden)` }) // Category, then destination
  await form.locator('input[type="date"]').nth(0).fill(isoDate(30)) // Start date, then End date
  await form.locator('input[type="date"]').nth(1).fill(isoDate(40))
  await form.getByRole('button', { name: 'Save' }).click()

  // Saved banner shows in the list, its category labeled hidden — proof the
  // link actually took, not just that the dropdown offered the option.
  const row = page.locator('div.flex.items-center.justify-between.gap-3:visible', { hasText: bannerTitle })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(row).toContainText(`${categoryName} (hidden)`)

  const { data: banner } = await supabase
    .from('campaign_banner')
    .select('category_id, start_date, end_date')
    .eq('title', bannerTitle)
    .maybeSingle()
  expect(banner?.category_id).toBe(category!.id)

  // Linking a future campaign must not itself flip the category live —
  // that only happens once the campaign's own start date arrives (already
  // covered at the unit level by categoryStore.test.ts's own campaign-
  // promotion cases).
  const { data: categoryAfter } = await supabase.from('category').select('active').eq('id', category!.id).maybeSingle()
  expect(categoryAfter?.active).toBe(false)
})
