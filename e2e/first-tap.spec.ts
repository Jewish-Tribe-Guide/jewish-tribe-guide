import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunitySlug, dismissLocationPrompt, ready } from './helpers'

// The first tap on a place on a phone (speed targets, docs/speed-targets.md:
// something visible at once, the answer within a second). The sheet slid up
// empty and the place arrived ~0.3s later, on the first tap only: its code
// loaded on that tap, and React holds a loading state it has shown for at
// least 300ms (measured on the live site, Nov 16; see preloadable.tsx).
//
// Asserted on order, not time, so a slow CI runner can't flake it: in no
// frame is the sheet on screen without the place in it.

test('the first tap on a place shows the place with its sheet, never an empty sheet', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'a phone opens a place in a sheet')
  const community = await defaultCommunitySlug(request)
  const { category } = await categoryWithListings(request, community)

  await page.goto(`/${community}/${category.id}`)
  await ready(page)
  await dismissLocationPrompt(page)
  const row = page.getByRole('button', { name: /^Show details for / }).first()
  await expect(row).toBeVisible()
  const name = (await row.getAttribute('aria-label'))!.replace(/^Show details for /, '')

  // The code is loaded once the page is idle, as a visitor reading the list
  // would give it. Two idle callbacks: the first is the one that starts it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const idle = (fn: () => void) => requestIdleCallback(fn, { timeout: 4000 })
        idle(() => idle(() => setTimeout(resolve, 300)))
      }),
  )

  await page.evaluate((name) => {
    const w = window as unknown as { __frames: string[] }
    w.__frames = []
    const look = () => {
      const sheet = [...document.querySelectorAll('[role="dialog"]')].find((d) => {
        const r = d.getBoundingClientRect()
        return r.height > 0 && r.top < innerHeight
      })
      if (sheet) w.__frames.push(sheet.textContent?.includes(name) ? 'place' : 'empty')
      // Watches until the sheet is up, however long the tap takes to land,
      // then for 60 frames (~1s): past the 300ms the old code held it empty.
      if (w.__frames.length < 60) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }, name)

  await row.click()
  await expect(page.getByRole('dialog').filter({ hasText: name }).first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: string[] }).__frames.length)).toBe(60)

  const frames = await page.evaluate(() => (window as unknown as { __frames: string[] }).__frames)
  expect(frames.length, 'the sheet should have been seen at all').toBeGreaterThan(0)
  expect(frames.filter((f) => f === 'empty').length, `frames with the sheet up and ${name} not in it`).toBe(0)
})
