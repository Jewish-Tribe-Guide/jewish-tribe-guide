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
    const empty = page.getByText('🎉 Nothing pending — the queue is clear.')
    const anyCard = page.locator('button', { hasText: 'Approve' }).first()
    await expect(empty.or(anyCard)).toBeVisible()
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

    await expect(page.locator('h2', { hasText: `Edit “${listingCategory!.pluralLabel}”` }).first()).toBeVisible()
    // Read-only: navigate back out via the editor's own Cancel/Back control
    // rather than Save, leaving nothing changed.
    await page.getByRole('button', { name: /Back to categories/i }).click()
    await expect(page).toHaveURL(/\/philly\/admin\/categories$/)
  })

  test('the Site tab shows the real saved site name and tagline', async ({ page, request }) => {
    const res = await request.get('/api/site-settings')
    const body = await res.json()
    const settings = body.settings as { name: string; tagline: string }

    await page.goto('/philly/admin/site')

    // Not getByLabel, and not a plain hasText filter: each <label> also
    // wraps its own trailing helper text, which folds into the computed
    // accessible name — and Tagline's own helper text is "Shown under the
    // site name in the header", a case-insensitive substring match for
    // "Site name" too. `{ exact: true }` pins it to the heading span alone.
    const siteNameLabel = page.locator('label').filter({ has: page.getByText('Site name', { exact: true }) })
    const taglineLabel = page.locator('label').filter({ has: page.getByText('Tagline', { exact: true }) })
    await expect(siteNameLabel.locator('input')).toHaveValue(settings.name)
    await expect(taglineLabel.locator('input')).toHaveValue(settings.tagline)
  })

  test('the Desktop & mobile tab loads without error', async ({ page }) => {
    await page.goto('/philly/admin/home')

    await expect(page.getByText('Featured cards')).toBeVisible()
    await expect(page.locator('text=/^(Error|Something went wrong)/')).not.toBeVisible()
  })

  test('the Metrics tab shows real submission stats, not stuck loading', async ({ page }) => {
    await page.goto('/philly/admin/metrics')

    // Loading text should resolve to a real number, not sit forever — and
    // "Approved"/"Rejected" tiles always render even with zero decided
    // submissions (getSubmissionFunnelStats returns 0s, not an error).
    await expect(page.getByText('Loading metrics…')).not.toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Pending')).toBeVisible()
    await expect(page.getByText('Approval rate')).toBeVisible()
    await expect(page.locator('text=/^(Error|Something went wrong)/')).not.toBeVisible()
  })

  test('opening the Site tab’s preview shows the live home screen, and closes back to the editor untouched', async ({ page }) => {
    await page.goto('/philly/admin/site')
    await page.getByRole('button', { name: 'Preview' }).click()

    // The preview is a real iframe of the live site — its own frame, not
    // this page's DOM, so assert via Playwright's frame API rather than a
    // page-level locator.
    const frame = page.frameLocator('iframe')
    await expect(frame.locator('body')).toBeVisible()

    await page.getByRole('button', { name: /close|back to editor/i }).click()
    await expect(page.getByRole('button', { name: 'Preview' })).toBeVisible()
  })
})
