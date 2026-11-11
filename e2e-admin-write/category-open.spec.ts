import { expect, test, type Locator, type Request } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// A category page opens from the list without waiting on the server (the
// user, Nov 9: "still was delay after clicking food category page in
// admin"). Each page's address is rendered on the server the first time it
// is opened after a deploy, 0.7–1.4s on a preview, and the click waited for
// it. The list now loads its rows' addresses behind it, so a click is
// answered from what's already here.
//
// Only a production build shows this: next dev renders every navigation on
// demand. It reads no timings, which a shared runner makes flaky; it checks
// that the click asks the server for nothing.
// ─────────────────────────────────────────────────────────────────────────────

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isRsc = (r: Request) => r.headers()['rsc'] === '1' || new URL(r.url()).searchParams.has('_rsc')

test('a category page opens from the list without asking the server', async ({ page }) => {
  const visible = (l: Locator) => l.and(page.locator(':visible'))
  // A page with places on it, by its name in the list.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: rows } = await supabase.from('category').select('id, plural_label').eq('community_id', 'philly').eq('kind', 'listing').order('plural_label')
  const target = rows![0]
  const path = `/philly/admin/categories/cat:${target.id}`

  // Its address, loaded behind the list. Without that there's nothing to
  // wait for, and the click below is what fails.
  const loaded = page.waitForResponse((res) => isRsc(res.request()) && new URL(res.url()).pathname === path, { timeout: 20_000 }).catch(() => null)
  await page.goto('/philly/admin/categories')
  const row = visible(page.getByRole('button', { name: new RegExp(escape(target.plural_label)) })).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await loaded

  const asked: string[] = []
  page.on('request', (r) => {
    if (isRsc(r) && new URL(r.url()).pathname === path) asked.push(r.url())
  })
  await row.click()
  await expect(visible(page.getByRole('heading', { name: target.plural_label }))).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${escape(path)}$`))
  expect(asked).toEqual([])
})
