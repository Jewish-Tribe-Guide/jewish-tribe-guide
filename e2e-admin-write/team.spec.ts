import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Settings → Team (the admin redesign's step 5): one list of who can sign in,
// added to and removed from by the community's own admins. It took over from
// the site owner's Communities tab, whose roster table once pushed a phone's
// page 47px sideways (a column of unbreakable email addresses), so the same
// check runs here on a phone: jsdom has no layout and can't see it.
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE = { width: 375, height: 812 }

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const added: string[] = []

// Whatever the test did, the address it made up comes off philly's list.
test.afterEach(async () => {
  const supabase = getAdminClient()
  const gone = new Set(added.splice(0).map((e) => e.toLowerCase()))
  if (gone.size === 0) return
  const { data } = await supabase.from('community').select('admin_emails').eq('slug', 'philly').single()
  const emails = ((data?.admin_emails as string[] | null) ?? []).filter((e) => !gone.has(e.toLowerCase()))
  await supabase.from('community').update({ admin_emails: emails }).eq('slug', 'philly')
})

const visible = (page: Page, locator: Locator) => locator.and(page.locator(':visible'))

async function addAdmin(page: Page, email: string) {
  added.push(email)
  await page.goto('/philly/admin/team')
  const admins = visible(page, page.getByRole('region', { name: 'Admins' }))
  await admins.getByRole('textbox', { name: 'Email' }).fill(email)
  await admins.getByRole('button', { name: 'Add admin' }).click()
  const row = admins.getByRole('listitem').filter({ hasText: email })
  await expect(row).toBeVisible({ timeout: 10_000 })
  return { admins, row }
}

test('an admin adds someone to the team and takes them off again', async ({ page }) => {
  const email = `team-${randomUUID().slice(0, 8)}@example.com`
  const { admins, row } = await addAdmin(page, email)

  const stored = async () => (await getAdminClient().from('community').select('admin_emails').eq('slug', 'philly').single()).data?.admin_emails as string[]
  expect(await stored()).toContain(email)

  await row.getByRole('button', { name: `Remove ${email}` }).click()
  await admins.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(admins.getByText(email)).toHaveCount(0)
  expect(await stored()).not.toContain(email)
})

test.describe('on a phone', () => {
  test.use({ viewport: MOBILE })

  test('a long address stays on screen with its Remove, and the page never scrolls sideways', async ({ page }) => {
    // Realistically long: a short one leaves the row narrow enough to fit
    // and the test passes against a broken layout.
    const email = `team-layout-${randomUUID().slice(0, 8)}@averylongmailhost.example.com`
    const { row } = await addAdmin(page, email)

    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
    expect(overflow.scrollWidth, `page scrolls sideways: ${overflow.scrollWidth}px in ${overflow.clientWidth}px`).toBeLessThanOrEqual(overflow.clientWidth + 1)

    const box = (await row.getByRole('button', { name: `Remove ${email}` }).boundingBox())!
    expect(Math.round(box.x + box.width), 'Remove ends past the viewport').toBeLessThanOrEqual(MOBILE.width)
  })
})
