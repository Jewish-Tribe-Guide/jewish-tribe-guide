import { expect, test } from '@playwright/test'
import { TEST_COMMUNITY } from '../scripts/testCommunity.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Kosher certification's lists (boards L2e, L2g, Nov 28): on a computer,
// each row ends in a pencil and a × you can see. Their class was once put
// together from a variable, which Tailwind never sees, so both were
// display:none on every screen while every unit test passed (jsdom applies
// no CSS). Read-only.
// ─────────────────────────────────────────────────────────────────────────────

test('on a computer, each kosher list shows its Edit and Remove', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/${TEST_COMMUNITY}/admin/watches/job/kosher`)
  const rows = page.getByTestId('kosher-list')
  await expect(rows.first()).toBeVisible()
  const count = await rows.count()
  expect(count, 'the seed has kosher lists').toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i).getByRole('button', { name: /^Edit\b/ }).first()).toBeVisible()
    await expect(rows.nth(i).getByRole('button', { name: /^Remove\b/ }).first()).toBeVisible()
  }
})
