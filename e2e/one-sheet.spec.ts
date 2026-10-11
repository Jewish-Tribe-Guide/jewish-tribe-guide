import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// One sheet at a time on a phone (Oct 10): Edit under a listing's box used
// to slide a second sheet up over the listing's. Now it takes the listing's
// place, with Back, and the listing comes back where it was scrolled to.
// That last part is only visible in a real browser: the edit's code loading
// the first time hid the listing for a moment, which reset its scroll.
// Read-only: it opens the edit and goes back without sending.
test('Edit under a listing’s box takes the listing’s place, and Back returns to it where it was', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'The listing is a sheet only on a phone')
  const community = await defaultCommunity(page)
  // A shul with usual Shabbos times: its "Usual Shabbos times" box has an Edit.
  let found: { category: string; id: string; name: string } | null = null
  for (const c of await categories(request, community)) {
    const fields = (c as { detailFields?: { key: string; type: string }[] }).detailFields ?? []
    const key = fields.find((f) => f.type === 'minyanim')?.key
    if (!key) continue
    const body = await (await request.get(`/api/resources?category=${c.id}&community=${community}`)).json()
    const shul = (body.resources as Record<string, unknown>[]).find((r) =>
      ((r[key] as { days?: string[] }[] | undefined) ?? []).some((m) => m.days?.includes('sat')),
    )
    if (shul) {
      found = { category: c.id, id: String(shul.id), name: String(shul.name) }
      break
    }
  }
  test.skip(!found, 'No shul with usual Shabbos times')

  await page.goto(`/${community}/${found!.category}?item=${found!.id}`)
  await ready(page)
  await dismissLocationPrompt(page)
  const listing = page.getByRole('dialog', { name: found!.name })
  const edit = listing.getByTestId('davening-shabbos').getByRole('button', { name: 'Edit', exact: true })
  await edit.scrollIntoViewIfNeeded()
  const scroller = listing.locator('.overflow-y-auto').first()
  const scrolled = await scroller.evaluate((e) => e.scrollTop)
  expect(scrolled).toBeGreaterThan(0)

  await edit.click()
  const box = page.getByRole('dialog', { name: 'Usual Shabbos times' })
  await expect(box).toBeVisible()
  await expect(listing).toBeHidden()

  await box.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(listing).toBeVisible()
  await expect(box).toBeHidden()
  expect(await scroller.evaluate((e) => e.scrollTop)).toBe(scrolled)
})
