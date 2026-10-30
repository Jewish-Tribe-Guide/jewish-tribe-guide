import { expect, test } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// Real, signed-in admin console coverage — the gap every other e2e test
// leaves: api.spec.ts only proves an ANONYMOUS caller is refused, and nothing
// before this ever actually drove the authenticated UI (approving a
// submission, editing a category, previewing settings).
//
// Runs in the `admin` project (see playwright.config.ts), which reuses the
// session e2e/auth.setup.ts mints via the service-role key — the real
// production admin address in SUPERADMIN_EMAILS, since there is no separate
// test-admin account.
//
// DELIBERATELY READ-ONLY. Two independent reasons, either one sufficient on
// its own:
//   1. This suite's own rule (see AGENTS.md): nothing in e2e/ may write to
//      the database — it runs against the real Supabase project.
//   2. The session above belongs to the real admin identity, not a
//      disposable test account — a write here would be a real action taken
//      by that real admin, not a sandboxed one.
// Every test below opens screens, follows links, and reads real content —
// never Approve/Reject/Save/Delete.
//
// Expectations are derived from the running app's own public API (same
// pattern as e2e/helpers.ts), not hardcoded — an admin editing content
// shouldn't make these tests start failing for the wrong reason.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('admin console', () => {
  test('shows the moderation queue for a signed-in admin, not the login form', async ({ page }) => {
    // /philly/admin, not bare /admin — /admin is now the standalone
    // superadmin console (src/app/admin/page.tsx), a different page with no
    // moderation queue on it at all. See next.config.ts's own note on why
    // /admin no longer redirects here.
    await page.goto('/philly/admin')

    await expect(page.getByText(/^Signed in as /)).toBeVisible()
    // The magic-link login form's own submit button — its absence is the
    // signal we're past MagicLinkLogin, not stuck on it.
    await expect(page.getByRole('button', { name: 'Send magic link' })).not.toBeVisible()
    // The one thing distinguishing "queue empty" from "not actually signed
    // in" — see ModerationQueue's own 401 handling.
    await expect(page.getByText(/not an authorized admin/)).not.toBeVisible()
  })

  test('the moderation queue loads to either real submissions or the empty state, not stuck loading', async ({ page }) => {
    await page.goto('/philly/admin')

    await expect(page.getByText('Loading submissions…')).not.toBeVisible({ timeout: 10_000 })
    // To do: "Nothing to do." or a count of what's waiting.
    const empty = page.getByText('Nothing to do.')
    const waiting = page.getByText(/^\d+ to decide$/)
    await expect(empty.or(waiting)).toBeVisible()
  })

  test('the Categories tab lists the real configured categories', async ({ page, request }) => {
    const res = await request.get('/api/categories')
    const body = await res.json()
    const listingCategory = (body.categories as { kind: string; pluralLabel: string }[]).find((c) => c.kind === 'listing')
    test.skip(!listingCategory, 'no listing-kind category configured')

    await page.goto('/philly/admin/categories')

    // .first(): a row also shows its own raw id in small print (e.g.
    // "childcare" under "Childcare"), which Playwright's default
    // case-insensitive text match treats as a second hit for the same query.
    await expect(page.getByText(listingCategory!.pluralLabel).first()).toBeVisible()
  })

  test('opening a category’s editor shows its own real saved name, without saving anything', async ({ page, request }) => {
    const res = await request.get('/api/categories')
    const body = await res.json()
    const listingCategory = (body.categories as { kind: string; pluralLabel: string }[]).find((c) => c.kind === 'listing')
    test.skip(!listingCategory, 'no listing-kind category configured')

    await page.goto('/philly/admin/categories')
    // Scoped to the row's own card (CategoryRow's outer element — see
    // CategoryManager.tsx) rather than any div containing the text, which
    // matched ancestor containers wrapping the whole list and made `.last()`
    // land on something with no Edit button in it at all.
    const row = page.locator('div.rounded-lg.shadow-sm', { hasText: listingCategory!.pluralLabel }).first()
    await row.getByRole('button', { name: 'Edit' }).click()

    // The editor's own heading (AdminBack's bar, an h1 since boards 19–21c).
    await expect(page.getByRole('heading', { level: 1, name: listingCategory!.pluralLabel })).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true }).first()).toHaveValue(listingCategory!.pluralLabel)
    // Read-only: navigate back out via the editor's own back link rather
    // than Save, leaving nothing changed.
    await page.getByRole('button', { name: '‹ Category pages' }).click()
    await expect(page).toHaveURL(/\/philly\/admin\/categories$/)
  })

  // Site is settings by screen (admin redesign, board 7): the home page's
  // fields on one tab, the header's on another.
  test('the Home page tab shows the real saved search placeholder and link-preview title', async ({ page, request }) => {
    const res = await request.get('/api/site-settings')
    const settings = (await res.json()).settings as { searchPlaceholder: string; heroTitle: string }

    await page.goto('/philly/admin/home')
    await expect(page.getByRole('heading', { name: 'Top of the page' })).toBeVisible()
    await expect(page.getByLabel('Search box')).toHaveValue(settings.searchPlaceholder)
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(settings.heroTitle)
    await expect(page.locator('text=/^(Error|Something went wrong)/')).not.toBeVisible()
  })

  test('Settings → Community shows the real saved site name', async ({ page, request }) => {
    const res = await request.get('/api/site-settings')
    const settings = (await res.json()).settings as { name: string }

    await page.goto('/philly/admin/community')
    await expect(page.getByRole('heading', { name: 'Name and logo' })).toBeVisible()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(settings.name)
    await expect(page.locator('text=/^(Error|Something went wrong)/')).not.toBeVisible()
  })

  test('the Header and menus tab shows the computer’s and the phone’s menus', async ({ page }) => {
    await page.goto('/philly/admin/menus')
    await expect(page.getByRole('heading', { name: 'Top of the page, on a computer' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tabs, on a phone' })).toBeVisible()
    await expect(page.locator('text=/^(Error|Something went wrong)/')).not.toBeVisible()
  })

  test('the old Site addresses land on the new tabs', async ({ page }) => {
    for (const [from, to] of [['desktop', 'home'], ['mobile', 'menus']]) {
      await page.goto(`/philly/admin/${from}`)
      await expect(page).toHaveURL(new RegExp(`/philly/admin/${to}$`))
    }
  })

  // Site itself is a page now, its screens as rows (board 21), no longer a
  // redirect to Home page.
  test('Site opens its list of screens', async ({ page }) => {
    await page.goto('/philly/admin/site')
    await expect(page).toHaveURL(/\/philly\/admin\/site$/)
    await expect(page.getByRole('main').getByRole('link', { name: 'View the site' })).toBeVisible()
  })

  test('Reports loads real numbers, not stuck loading', async ({ page }) => {
    await page.goto('/philly/admin/metrics')

    // Every box renders even with nothing counted or decided yet.
    await expect(page.getByRole('heading', { name: 'Listing views' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^Decided in / })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Taken' })).toBeVisible()
    await expect(page.locator('text=/^(Error|Something went wrong)/')).not.toBeVisible()
  })

  test('the Home page tab shows the home page beside it, on a computer or a phone', async ({ page }) => {
    await page.goto('/philly/admin/home')
    const preview = page.getByRole('complementary', { name: 'Preview' })

    // The preview is a real iframe of the site — its own frame, not this
    // page's DOM, so assert via Playwright's frame API.
    await expect(preview.locator('iframe')).toHaveAttribute('src', '/philly?preview=1')
    await expect(page.frameLocator('iframe[title="Preview"]').locator('header').first()).toBeVisible()
    await preview.getByRole('button', { name: 'Phone' }).click()
    await expect(preview.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.frameLocator('iframe[title="Preview"]').locator('body')).toBeVisible()
  })
})
