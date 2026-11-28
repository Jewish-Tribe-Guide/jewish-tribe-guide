import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  ADMIN_WRITE_TEST_ADMIN_EMAIL,
  CACHE_TEST_ADMIN_EMAIL,
} from '../scripts/cacheE2eAdmin.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Drives CommunityManager's real create flow — New community through the
// actual admin UI, with the starter pack off and on (the pack copies from the
// seed's default community, philly) — and deleting one. Same local test
// database as the rest of this suite (see playwright.admin-write.config.ts).
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey)
}

// Tracked by slug — every row this suite creates, cleaned up in reverse
// dependency order (categories/home_sections before the community row
// itself, since there's no FK cascade — community_id is a plain text
// column, as removeUnfinishedCommunity's own comment gives).
const pendingSlugs: string[] = []

test.afterEach(async () => {
  const supabase = getAdminClient()
  for (const slug of pendingSlugs.splice(0)) {
    await supabase.from('resource').delete().eq('community_id', slug)
    await supabase.from('category').delete().eq('community_id', slug)
    await supabase.from('home_section').delete().eq('community_id', slug)
    await supabase.from('site_settings').delete().eq('community_id', slug)
    await supabase.from('tag').delete().eq('community_id', slug)
    await supabase.from('community').delete().eq('slug', slug)
  }
})

const visible = (page: import('@playwright/test').Page, locator: Locator) => locator.and(page.locator(':visible'))

// New community asks Google for cities through our own /api/admin/cities
// (Nov 25), which the page answers here: the suite stays independent of
// Google being reachable, or a key being set, in CI.
async function answerForGoogle(page: Page) {
  await page.route('**/api/admin/cities?**', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('placeId')) {
      return route.fulfill({ json: { ok: true, city: { city: 'Testville', area: 'Pennsylvania', lat: 39.95, lng: -75.16, timezone: 'America/New_York' } } })
    }
    return route.fulfill({ json: { ok: true, cities: [{ placeId: 'p-testville', city: 'Testville', area: 'PA, USA' }] } })
  })
}

// Create lands back on the list, the new community marked. A full load, and
// the create itself overran 10s on a CI runner (PR 387, Nov 16).
const CREATED = 30_000

/** Makes a community through New community, as the site owner would. */
async function createThroughUI(page: Page, { name, slug, starterPack }: { name: string; slug: string; starterPack: boolean }) {
  await answerForGoogle(page)
  await page.goto('/admin')
  await visible(page, page.getByRole('button', { name: 'New community' })).click()
  await page.getByRole('combobox', { name: 'Which city?' }).fill('Testv')
  await page.getByRole('option', { name: 'Testville, PA, USA' }).click()
  await expect(page.getByLabel('Name')).toHaveValue('Testville Jewish Guide')
  await page.getByLabel('Name').fill(name)
  // The address follows the city; the test's own keeps cleanup exact.
  await page.getByRole('button', { name: 'Edit its address' }).click()
  await page.getByLabel(/Its address/).fill(slug)
  if (!starterPack) await page.getByRole('switch', { name: 'Starter pack' }).click()
  await page.getByRole('button', { name: 'Create Testville' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin\\?made=${slug}$`), { timeout: CREATED })
  const card = page.locator(`[data-community-slug="${slug}"]`)
  await expect(card).toHaveAttribute('data-just-made', 'true')
  return card
}

test('a community made with the starter pack off starts hidden, with only the screens every community has', async ({ page, request }) => {
  const slug = `e2e-fresh-${randomUUID().slice(0, 8)}`
  pendingSlugs.push(slug)
  const name = `E2E Fresh ${slug}`

  const card = await createThroughUI(page, { name, slug, starterPack: false })
  await expect(card).toContainText(name)
  await expect(card).toContainText('Hidden')
  await expect(card.getByRole('link', { name: 'Open its admin' })).toHaveAttribute('href', `/${slug}/admin`)
  await expect(card.getByRole('button', { name: 'Copy preview link' })).toBeVisible()

  const supabase = getAdminClient()
  const { data: created } = await supabase.from('community').select('name, region, timezone, admin_emails, visible').eq('slug', slug).maybeSingle()
  expect(created, 'the community should exist in the database after Create').not.toBeNull()
  expect(created).toMatchObject({ name, region: 'Testville', timezone: 'America/New_York', visible: false })

  // Every superadmin (SUPERADMIN_EMAILS, computed for this run by
  // run-test-project-server.mjs the same way auth.setup.ts's own session
  // is) is folded in, so none is locked out of what they just made. Both
  // suites' admins: the server lists both, whichever suite started it.
  for (const email of [CACHE_TEST_ADMIN_EMAIL, ADMIN_WRITE_TEST_ADMIN_EMAIL]) {
    expect(created!.admin_emails).toContain(email)
  }

  // Live to whoever has the link — no redeploy, no manual cache warmup.
  const publicRes = await request.get(`/${slug}`)
  expect(publicRes.status()).toBe(200)

  // Nothing but the Map, Candle Lighting and Eruv, on from the start.
  const { data: categories } = await supabase.from('category').select('kind, active').eq('community_id', slug)
  expect((categories ?? []).filter((c) => c.active).map((c) => c.kind).sort()).toEqual(['eruv', 'map', 'zmanim'])
  expect(categories).toHaveLength(3)
})

test('the starter pack copies the default’s pack pages, home and tabs, with no places, photos or hechshers', async ({ page }) => {
  const slug = `e2e-pack-${randomUUID().slice(0, 8)}`
  pendingSlugs.push(slug)

  await createThroughUI(page, { name: `E2E Pack ${slug}`, slug, starterPack: true })

  const supabase = getAdminClient()
  const { data: categories } = await supabase.from('category').select('id, kind, card_image_url, fields').eq('community_id', slug)
  expect((categories ?? []).map((c) => c.id).sort()).toEqual(['eruv-information', 'grocery', 'map', 'mikvah', 'restaurant', 'synagogue', 'zmanim'])
  expect((categories ?? []).every((c) => c.card_image_url === null)).toBe(true)
  const food = (categories ?? []).find((c) => c.id === 'restaurant')!
  const hechsher = (food.fields as { key: string; options?: unknown[] }[]).find((f) => f.key === 'kosherCert')
  if (hechsher) expect(hechsher.options).toEqual([])

  const { data: sections } = await supabase.from('home_section').select('id, kind, card_ids').eq('community_id', slug)
  expect(sections!.length).toBeGreaterThan(0)
  const packIds = new Set((categories ?? []).map((c) => c.id))
  for (const section of sections!) {
    expect(['zmanim', 'shabbat', 'featured', 'listings']).not.toContain(section.kind)
    for (const id of (section.card_ids as string[]) ?? []) expect(packIds.has(id), `${section.id} shows ${id}`).toBe(true)
  }

  const { data: settings } = await supabase.from('site_settings').select('name, desktop_hero_headline, logo_url').eq('community_id', slug).maybeSingle()
  expect(settings).toMatchObject({ name: `E2E Pack ${slug}`, logo_url: null })
  expect(settings!.desktop_hero_headline ?? '').not.toContain('Philadelphia')

  const { count: tags } = await supabase.from('tag').select('slug', { count: 'exact', head: true }).eq('community_id', slug)
  expect(tags).toBeGreaterThan(0)
  const { count: places } = await supabase.from('resource').select('id', { count: 'exact', head: true }).eq('community_id', slug)
  expect(places).toBe(0)
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
  await createThroughUI(page, { name, slug, starterPack: false })

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

  // The list reads the communities fresh (Nov 25), so a load shows it.
  await page.reload()
  const card = page.locator(`[data-community-slug="${slug}"]`)
  await card.getByRole('button', { name: 'Delete', exact: true }).click()
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
  // The page is loaded already, so the next load is that reload. A goto
  // while it's still under way aborts (ERR_ABORTED, both full local runs
  // on Nov 28), so it's waited for first.
  const reloaded = page.waitForEvent('load')
  const [deleteRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === 'DELETE' && res.url().includes(`/api/admin/communities/${slug}`),
    ),
    visible(page, page.getByRole('button', { name: 'Delete forever' })).click(),
  ])
  expect(deleteRes.status(), 'DELETE /api/admin/communities/:slug should succeed').toBe(200)

  // The reload lands back on this same page, which reads the list fresh.
  await reloaded
  await page.goto('/admin')
  await expect(page.getByRole('button', { name: 'New community' })).toBeVisible()
  await expect(page.locator(`[data-community-slug="${slug}"]`)).toHaveCount(0)

  const { data: communityRow } = await supabase.from('community').select('slug').eq('slug', slug).maybeSingle()
  expect(communityRow, 'the community row should be gone').toBeNull()
  const { data: categoryRows } = await supabase.from('category').select('id').eq('community_id', slug)
  expect(categoryRows ?? [], 'its category should be gone too').toEqual([])
  const { data: resourceRows } = await supabase.from('resource').select('id').eq('community_id', slug)
  expect(resourceRows ?? [], 'its listing should be gone too').toEqual([])
})
