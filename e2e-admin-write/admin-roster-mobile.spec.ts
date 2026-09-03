import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// The admin roster on a phone.
//
// CommunityManager renders each community's admins as a four-column table:
// email, two preference pills, and Remove. `w-full` does not constrain a
// table — a table cannot render narrower than its min-content width, and a
// column of `font-mono` email addresses is a wall of unbreakable characters.
// So the table rendered 390px wide inside a 309px card, nothing clipped or
// scrolled it, and it pushed the whole document to 422px on a 375px screen.
// Remove sat ~48px past the right edge, unreachable.
//
// Asserted here rather than in a unit test because jsdom has no layout: it
// reports every width as 0 and would have called this fixed the whole time.
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE = { width: 375, height: 812 }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

const pendingSlugs: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const slug of pendingSlugs.splice(0)) {
    await supabase.from('category').delete().eq('community_id', slug)
    await supabase.from('home_section').delete().eq('community_id', slug)
    await supabase.from('community').delete().eq('slug', slug)
  }
})

const visible = (page: Page, locator: Locator) => locator.and(page.locator(':visible'))

test.describe('admin roster on a phone', () => {
  test.use({ viewport: MOBILE })

  test('every roster control stays on screen, and the page never scrolls sideways', async ({ page }) => {
    const slug = `e2e-roster-${randomUUID().slice(0, 8)}`
    pendingSlugs.push(slug)

    // Created through the real UI, like the rest of this suite: it is the
    // POST that calls revalidatePublicContent(), so the community is in the
    // very next read of the communities list instead of behind
    // cacheLife('days') with nothing to invalidate it.
    await page.goto('/philly/admin/communities')
    await visible(page, page.getByRole('button', { name: '+ New community' })).click()
    await page.getByLabel('Name').fill(`E2E Roster ${slug}`)
    await page.getByLabel('URL slug').fill(slug)
    await visible(page, page.getByRole('button', { name: /show more details/i })).click()
    await page.getByLabel('Tagline').fill('Roster layout test')
    await page.getByLabel('Mission').fill('A disposable community for the roster layout test.')
    await page.getByLabel('Region').fill('Testville')
    await page.getByLabel('Map center latitude').fill('39.95')
    await page.getByLabel('Map center longitude').fill('-75.16')
    await visible(page, page.getByRole('button', { name: 'Create community' })).click()
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`), { timeout: 10_000 })

    // A realistically long address — this is the whole mechanism. A short
    // one ("a@b.co") leaves the table narrow enough to fit and the test
    // passes against the broken layout.
    const adminEmail = `roster-layout-${randomUUID().slice(0, 8)}@averylongmailhost.example.com`
    await page.goto('/philly/admin/communities')

    // Scoped to the card for the community THIS test created. `.first()` here
    // would be philly — the real, shared one every other spec depends on —
    // and the admin would be added to it and never taken off again.
    const card = page.locator(`[data-community-slug="${slug}"]`)
    await expect(card).toBeVisible({ timeout: 15_000 })

    await card.getByPlaceholder('new-admin@example.com').fill(adminEmail)
    await card.getByRole('button', { name: 'Add admin' }).click()

    const row = card.locator('tr', { hasText: adminEmail })
    await expect(row).toBeVisible({ timeout: 15_000 })

    // 1. The document itself must not scroll sideways. This was 422 vs 375.
    const overflow = await page.evaluate(() => {
      const de = document.documentElement
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth }
    })
    expect(
      overflow.scrollWidth,
      `page scrolls sideways: ${overflow.scrollWidth}px of content in ${overflow.clientWidth}px`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1)

    // 2. Remove must be reachable without one. Its right edge was at 423px.
    const remove = row.getByRole('button', { name: 'Remove' })
    await expect(remove).toBeVisible()
    const box = (await remove.boundingBox())!
    expect(
      Math.round(box.x + box.width),
      `Remove ends at ${Math.round(box.x + box.width)}px, past the ${MOBILE.width}px viewport`,
    ).toBeLessThanOrEqual(MOBILE.width)

    // 3. With the header row hidden at this width, each pill needs its own
    //    label — two bare "On"s in a row say nothing about which is which.
    await expect(row.getByText('Submissions')).toBeVisible()
    await expect(row.getByText('Approve/reject')).toBeVisible()
  })
})
