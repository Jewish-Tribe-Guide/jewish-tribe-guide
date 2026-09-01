import { randomUUID } from 'node:crypto'
import { expect, test, type Locator } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { CACHE_TEST_ADMIN_EMAIL, resolveDefaultCommunityAdminEmail } from '../scripts/cacheE2eAdmin.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Drives CommunityManager's real create flow — creating a community through
// the actual admin UI, both "start empty" and "clone from an existing
// community". Same disposable test Supabase project as the rest of this
// suite (see playwright.admin-write.config.ts).
//
// The "clone from" case seeds its own source community + category directly
// via the service-role key rather than depending on whatever 'philly'
// happens to hold in this shared test project at the moment — that state is
// mutated by every other spec in this suite and isn't this test's to assume.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

// Tracked by slug — every row this suite creates, cleaned up in reverse
// dependency order (categories/home_sections before the community row
// itself, since there's no FK cascade — community_id is a plain text
// column, same reasoning cloneCommunityContent's own comment gives).
const pendingSlugs: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const slug of pendingSlugs.splice(0)) {
    await supabase.from('resource').delete().eq('community_id', slug)
    await supabase.from('category').delete().eq('community_id', slug)
    await supabase.from('home_section').delete().eq('community_id', slug)
    await supabase.from('community').delete().eq('slug', slug)
  }
})

const visible = (page: import('@playwright/test').Page, locator: Locator) => locator.and(page.locator(':visible'))

// Tagline/mission/region/timezone/map center/colors live under a collapsed
// "More details" disclosure now (see CommunityManager.tsx's own comment on
// why — none of it is required to create a community, since it starts
// unpublished either way). This suite still fills them in by hand rather
// than relying on the city picker's auto-fill, so it stays independent of
// Google Places being reachable in CI.
async function openMoreDetails(page: import('@playwright/test').Page) {
  await visible(page, page.getByRole('button', { name: /show more details/i })).click()
}

test('creating a community through the real UI, starting empty, makes it live with no redeploy', async ({ page, request }) => {
  const slug = `e2e-fresh-${randomUUID().slice(0, 8)}`
  pendingSlugs.push(slug)
  const name = `E2E Fresh ${slug}`

  await page.goto('/philly/admin/communities')
  await visible(page, page.getByRole('button', { name: '+ New community' })).click()

  await page.getByLabel('Name').fill(name)
  // Slug auto-derives from the name; the generated one won't match our
  // randomUUID-based fixture, so overwrite it to keep cleanup exact.
  await page.getByLabel('URL slug').fill(slug)
  await openMoreDetails(page)
  await page.getByLabel('Tagline').fill('Guide for residents & visitors')
  await page.getByLabel('Mission').fill('A guide to a brand-new disposable test community.')
  await page.getByLabel('Region').fill('Testville')
  await page.getByLabel('Map center latitude').fill('39.95')
  await page.getByLabel('Map center longitude').fill('-75.16')
  // "Start empty" is the default selection — no change needed.

  await visible(page, page.getByRole('button', { name: 'Create community' })).click()

  // Successful creation redirects into the new community's own admin console.
  await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`), { timeout: 10_000 })

  const supabase = getAdminClient()
  const { data: created } = await supabase.from('community').select('slug, name, admin_emails').eq('slug', slug).maybeSingle()
  expect(created, 'the community should exist in the database after Create').not.toBeNull()
  expect(created!.name).toBe(name)

  // Every superadmin (SUPERADMIN_EMAILS, computed for this run by
  // run-test-project-server.mjs the same way auth.setup.ts's own session
  // is) should be folded in automatically — the "Admin emails" field above
  // was never filled in, so a community whose admin_emails came out empty
  // would otherwise lock every superadmin out of the console it just
  // created (see the create route's own comment). Not read from
  // process.env.SUPERADMIN_EMAILS here — that's set inside the webServer's
  // own child process (run-test-project-server.mjs), not visible to this
  // Playwright test process — so it's recomputed the same way instead.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const testAdminEmail = await resolveDefaultCommunityAdminEmail(supabaseUrl, serviceRoleKey)
  const expectedSuperadmins = Array.from(new Set([CACHE_TEST_ADMIN_EMAIL, testAdminEmail]))
  for (const email of expectedSuperadmins) {
    expect(created!.admin_emails).toContain(email)
  }

  // Live immediately — no redeploy, no manual cache warmup.
  const publicRes = await request.get(`/${slug}`)
  expect(publicRes.status()).toBe(200)

  const { data: categories } = await supabase.from('category').select('id').eq('community_id', slug)
  expect(categories ?? []).toEqual([])
})

test('cloning from an existing community carries its categories over', async ({ page }) => {
  // The stale-communities-list poll below can alone take up to 30s (see its
  // own comment) — Playwright's 30s default test timeout leaves nothing left
  // over to actually fill in and submit the second form afterward.
  test.setTimeout(75_000)

  const sourceSlug = `e2e-clone-src-${randomUUID().slice(0, 8)}`
  const targetSlug = `e2e-clone-dst-${randomUUID().slice(0, 8)}`
  pendingSlugs.push(sourceSlug, targetSlug)
  const sourceName = `E2E Clone Source ${sourceSlug}`

  // The source community is created through the real UI (not a direct DB
  // insert) specifically so its own creation goes through
  // revalidatePublicContent() — otherwise the cached GET /api/communities
  // the second creation's "Clone from…" dropdown reads wouldn't know this
  // community exists yet, and there'd be nothing to select below.
  await page.goto('/philly/admin/communities')
  await visible(page, page.getByRole('button', { name: '+ New community' })).click()
  await page.getByLabel('Name').fill(sourceName)
  await page.getByLabel('URL slug').fill(sourceSlug)
  await openMoreDetails(page)
  await page.getByLabel('Tagline').fill('Source')
  await page.getByLabel('Mission').fill('Source community for a clone test.')
  await page.getByLabel('Region').fill('Testville')
  await page.getByLabel('Map center latitude').fill('39.95')
  await page.getByLabel('Map center longitude').fill('-75.16')
  await visible(page, page.getByRole('button', { name: 'Create community' })).click()
  await expect(page).toHaveURL(new RegExp(`/${sourceSlug}/admin$`), { timeout: 10_000 })

  // One category, seeded directly — cloneCommunityContent reads categories
  // with an uncached query, so this needs no cache-busting of its own.
  const supabase = getAdminClient()
  const { error: categoryErr } = await supabase.from('category').insert({
    id: 'grocery',
    community_id: sourceSlug,
    label: 'Grocery Store',
    plural_label: 'Grocery Stores',
    icon: '🛒',
    kind: 'listing',
  })
  expect(categoryErr).toBeNull()

  // The communities list (GET /api/communities → listCommunities(), 'use
  // cache', cacheLife('days')) is stale-while-revalidate: the source's own
  // creation called revalidateTag(TAGS.communities, 'max') a moment ago, but
  // that marks the entry stale rather than purging it — the very next read
  // can still get served the pre-creation snapshot while a fresh one
  // regenerates behind it (same mechanism AGENTS.md documents for the
  // cache-roundtrip /about flake). CommunityManager only fetches once per
  // mount, so Playwright's own retry-the-same-DOM behavior on selectOption
  // below can't out-wait a stale first load — only a fresh navigation can.
  // Poll with real reloads instead of trusting the first one.
  await expect(async () => {
    await page.goto('/philly/admin/communities')
    // Scoped to the community-list card's own link, not just any text match
    // — the admin's own community switcher also renders this name as an
    // <option>, which a plain getByText matches too and makes ambiguous.
    await expect(page.getByRole('link', { name: sourceName })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000, 3_000] })

  const name = `E2E Clone Target ${targetSlug}`
  await visible(page, page.getByRole('button', { name: '+ New community' })).click()

  await page.getByLabel('Name').fill(name)
  await page.getByLabel('URL slug').fill(targetSlug)
  await openMoreDetails(page)
  await page.getByLabel('Tagline').fill('Guide for residents & visitors')
  await page.getByLabel('Mission').fill('A guide to a cloned disposable test community.')
  await page.getByLabel('Region').fill('Testville')
  await page.getByLabel('Map center latitude').fill('39.95')
  await page.getByLabel('Map center longitude').fill('-75.16')
  await page.getByLabel('Starting content').selectOption({ label: `Clone from ${sourceName}` })

  await visible(page, page.getByRole('button', { name: 'Create community' })).click()
  await expect(page).toHaveURL(new RegExp(`/${targetSlug}/admin$`), { timeout: 10_000 })

  const { data: clonedCategory } = await supabase
    .from('category')
    .select('id, label')
    .eq('community_id', targetSlug)
    .eq('id', 'grocery')
    .maybeSingle()
  expect(clonedCategory, 'the source category should have been cloned onto the new community').not.toBeNull()
  expect(clonedCategory!.label).toBe('Grocery Store')
})

test('deleting a community through the real UI removes it and everything in it', async ({ page }) => {
  const slug = `e2e-delete-${randomUUID().slice(0, 8)}`
  pendingSlugs.push(slug) // idempotent no-op cleanup if the delete below already got it
  const name = `E2E Delete ${slug}`

  // Created through the real UI (not a direct DB insert), same reasoning as
  // the clone test's source community above: creating through
  // POST /api/admin/communities is what calls revalidatePublicContent(), so
  // the community actually shows up in the very next GET
  // /api/admin/communities read instead of sitting behind
  // cacheLife('days')'s stale-while-revalidate window with nothing to ever
  // invalidate it.
  await page.goto('/philly/admin/communities')
  await visible(page, page.getByRole('button', { name: '+ New community' })).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('URL slug').fill(slug)
  await openMoreDetails(page)
  await page.getByLabel('Tagline').fill('Guide for residents & visitors')
  await page.getByLabel('Mission').fill('A guide to a disposable test community, about to be deleted.')
  await page.getByLabel('Region').fill('Testville')
  await page.getByLabel('Map center latitude').fill('39.95')
  await page.getByLabel('Map center longitude').fill('-75.16')
  await visible(page, page.getByRole('button', { name: 'Create community' })).click()
  await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`), { timeout: 10_000 })

  // A category + listing, added directly — there's something real to prove
  // gets swept along with the community, beyond what the creation flow
  // itself produces (which is nothing, for "start empty").
  const supabase = getAdminClient()
  const { error: categoryErr } = await supabase.from('category').insert({
    id: 'grocery',
    community_id: slug,
    label: 'Grocery Store',
    plural_label: 'Grocery Stores',
    icon: '🛒',
    kind: 'listing',
  })
  expect(categoryErr).toBeNull()
  const { error: resourceErr } = await supabase.from('resource').insert({
    id: randomUUID(),
    community_id: slug,
    category: 'grocery',
    name: 'Test Grocery',
    status: 'approved',
    details: {},
  })
  expect(resourceErr).toBeNull()

  // Same staleness reasoning as the clone test's second poll — the
  // just-created community's own revalidation happened a moment ago and
  // marks the entry stale rather than purging it, so the very next read can
  // still serve the pre-creation snapshot while a fresh one regenerates.
  await expect(async () => {
    await page.goto('/philly/admin/communities')
    await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000, 3_000] })

  const row = page.getByRole('link', { name }).locator('..')
  await visible(page, row.getByRole('button', { name: 'Delete' })).click()
  await page.getByLabel(`Type ${slug} to confirm`).fill(slug)
  // Waited for explicitly rather than inferred from the UI settling — this
  // is the one action in this whole file whose success can't be re-derived
  // from a later poll (there's nothing left to look at once it works).
  // confirmDelete() does a real window.location.reload() on success (see
  // its own comment: staying mounted and soft-refetching in place hit a
  // genuine Next.js Cache Components bug — the client bailed out of
  // reconciling this route and hard-navigated to the public site instead,
  // right when this same DELETE's own revalidation landed), so the
  // reliable signal here is the DELETE response itself, not any DOM state.
  const [deleteRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === 'DELETE' && res.url().includes(`/api/admin/communities/${slug}`),
    ),
    visible(page, page.getByRole('button', { name: 'Delete forever' })).click(),
  ])
  expect(deleteRes.status(), 'DELETE /api/admin/communities/:slug should succeed').toBe(200)

  // The reload lands back on this same page; same stale-while-revalidate
  // reasoning as the poll above applies to it too (revalidatePublicContent()
  // marks the cached list stale rather than purging it), so confirm with a
  // poll rather than trusting the reload's own first paint.
  await expect(async () => {
    await page.goto('/philly/admin/communities')
    await expect(page.getByRole('link', { name })).not.toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000, 3_000] })

  const { data: communityRow } = await supabase.from('community').select('slug').eq('slug', slug).maybeSingle()
  expect(communityRow, 'the community row should be gone').toBeNull()
  const { data: categoryRows } = await supabase.from('category').select('id').eq('community_id', slug)
  expect(categoryRows ?? [], 'its category should be gone too').toEqual([])
  const { data: resourceRows } = await supabase.from('resource').select('id').eq('community_id', slug)
  expect(resourceRows ?? [], 'its listing should be gone too').toEqual([])
})
