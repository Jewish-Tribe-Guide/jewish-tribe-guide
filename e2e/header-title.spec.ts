import { expect, test } from '@playwright/test'
import { categories, dismissLocationPrompt, ready } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// The phone header's title is big, and never cut off (Nov 16, the user: too
// small next to Spotify, "be aware of long names"). It used to be 18px and
// still cut off a long page name ("Candle Lig…" on a 320px phone). Now it's
// 22px when it fits and steps down until it does, then two lines (FitTitle).
//
// Read from the running app: the longest page name it has, on the narrowest
// phone the site supports and a common one. Phone only: the computer header
// has its own size.
// ─────────────────────────────────────────────────────────────────────────────

test.skip(({ isMobile }) => !isMobile, 'the phone header')

const title = (page: import('@playwright/test').Page) => page.locator('header span.truncate:visible').first()

for (const width of [320, 375]) {
  test(`on a ${width}px phone, the longest page name fits the header whole`, async ({ page, request }) => {
    const longest = (await categories(request, 'philly')).sort((a, b) => b.pluralLabel.length - a.pluralLabel.length)[0]
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`/philly/${longest.id}`)
    await ready(page)
    await dismissLocationPrompt(page)
    await expect(title(page)).toHaveText(longest.pluralLabel)
    // Fitting is measured after the header draws, so wait for it to settle.
    // On one line, or on two when it can't fit even at 15px.
    const cut = () => title(page).evaluate((el) => Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight))
    await expect.poll(cut, { message: `"${longest.pluralLabel}" is cut off` }).toBeLessThanOrEqual(0)
    // And inside the header, not spilling below it.
    const [box, header] = await Promise.all([title(page).boundingBox(), page.locator('header').first().boundingBox()])
    expect(box!.y + box!.height).toBeLessThanOrEqual(header!.y + header!.height)
  })
}

test('a short page name is 22px, as big as an app’s', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/philly/you')
  await ready(page)
  await expect(title(page)).toHaveText('You')
  await expect(title(page)).toHaveCSS('font-size', '22px')
})
