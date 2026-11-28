import { expect, test } from '@playwright/test'
import { TEST_COMMUNITY } from '../scripts/testCommunity.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Turns a job off and on for real (the user, Oct 31; the switch since Nov
// 28, boards L2b and L1): the Watching switch turns it off with nothing
// asked, its Watches row then says Off, and the same switch on its page
// turns it back on. Broken links, as every community has it and turning
// it off here runs nothing: this suite starts no nightly run. Puts it back
// on in `finally`, whatever happens.
// ─────────────────────────────────────────────────────────────────────────────

// Watches' read again is held back after Turn on, so Links has to show on
// from the switch itself. Next keeps the Watches left behind React's
// <Activity>, and the one that came back used to show Links off until that
// read answered: over 5s on CI's busy test project (PR 405's first run, Nov
// 20). useWatchJobs.test.tsx has the same with no browser.
const jobsRead = (url: URL) => url.pathname === '/api/admin/watches/jobs'

test('a job turned off says so on Watches, and turns back on from its page', async ({ page, request }) => {
  await page.goto(`/${TEST_COMMUNITY}/admin/watches/job/links`)
  let release = () => {}
  try {
    const watching = page.getByRole('switch', { name: 'Broken links on' })
    await expect(watching).toHaveAttribute('aria-checked', 'true')
    await watching.click()
    await expect(watching).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('watching-state')).toHaveText(/^Off/)

    await page.getByRole('link', { name: '‹ Watches' }).click()
    await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/watches$`))
    const row = page.getByRole('main').getByRole('link', { name: /^Broken links/ })
    await expect(row).toContainText('Off')
    await row.click()
    await expect(watching).toHaveAttribute('aria-checked', 'false')

    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(jobsRead, async (route) => {
      await held
      await route.continue().catch(() => {})
    })
    await watching.click()
    await expect(watching).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('link', { name: '‹ Watches' }).click()
    await expect(page).toHaveURL(new RegExp(`/${TEST_COMMUNITY}/admin/watches$`))
    await expect(page.getByRole('main').getByRole('link', { name: /^Broken links/ })).not.toContainText('Off')
  } finally {
    release()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    // The session's own cookie signs this request.
    const token = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.includes('auth-token'))?.[1] ?? '')
    const access = token ? (JSON.parse(token) as { access_token?: string }).access_token : undefined
    if (access) await request.post(`/api/admin/watches?community=${TEST_COMMUNITY}`, { headers: { Authorization: `Bearer ${access}` }, data: { action: 'job-on', kind: 'links' } })
  }
})
