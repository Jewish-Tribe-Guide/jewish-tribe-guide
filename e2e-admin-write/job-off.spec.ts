import { expect, test } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// Turns a job off and on for real (the user, Oct 31): Turn off this job says
// what it costs and asks once; the job leaves Watches for + Add a watch, and
// one tap there brings it back. Links, as every community has it and turning
// it off here runs nothing: this suite starts no nightly run. Puts it back on
// in `finally`, whatever happens.
// ─────────────────────────────────────────────────────────────────────────────

test('a job turned off leaves Watches, and comes back from Add a watch', async ({ page, request }) => {
  await page.goto('/philly/admin/watches/job/links')
  try {
    await page.getByRole('button', { name: 'Turn off this job' }).click()
    await expect(page.getByText(/^Turn off Links\?/)).toBeVisible()
    await page.getByRole('button', { name: 'Turn it off' }).click()

    await expect(page).toHaveURL(/\/philly\/admin\/watches$/)
    await expect(page.getByRole('main').getByRole('link', { name: /^Links/ })).toHaveCount(0)
    await page.getByRole('link', { name: '+ Add a watch' }).click()
    await page.getByRole('button', { name: /^Links/ }).click()

    await expect(page).toHaveURL(/\/philly\/admin\/watches$/)
    // Back in its own section, and under Needs fixing too once its last run
    // is a week old, so either row will do.
    await expect(page.getByRole('main').getByRole('link', { name: /^Links/ }).first()).toBeVisible()
  } finally {
    // The session's own cookie signs this request.
    const token = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.includes('auth-token'))?.[1] ?? '')
    const access = token ? (JSON.parse(token) as { access_token?: string }).access_token : undefined
    if (access) await request.post('/api/admin/watches?community=philly', { headers: { Authorization: `Bearer ${access}` }, data: { action: 'job-on', kind: 'links' } })
  }
})
