import { expect, test } from '@playwright/test'
import { categoryWithListings, defaultCommunity, ready, settled } from './helpers'

// The full-width bands (a category's photo, the computer home's hero and map)
// are as wide as the page, not as wide as the window. `100vw` counts the
// scrollbar, which takes room on Windows and Linux, so bands sized by it
// overhung the page by the scrollbar's width: 7.5px of photo cut off on the
// left, the band's title off the column below it by as much, and the page
// 1273px wide in a 1265px window (Nov 20). src/lib/scrollbarWidth.ts and
// the `bleed-x` / `w-page` utilities fix it.
//
// Run with scrollbars that take room, as a Windows visitor has them:
// Playwright's Chromium hides them, and a Mac's float over the page (which
// is why this never showed on one). Styling them makes Chromium draw them
// in the page's width on every system.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test.describe('full-width bands are the page’s width, scrollbar and all', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'a phone’s scrollbars take no room')
  })

  async function expectFits(page: import('@playwright/test').Page, bands: string[]) {
    await ready(page)
    // Added once the page is up, so the bands must also follow a scrollbar
    // arriving after the first draw (the script's ResizeObserver).
    await page.addStyleTag({
      content: '::-webkit-scrollbar{width:15px;height:15px}::-webkit-scrollbar-thumb{background:#999}',
    })
    await page.waitForFunction(() => innerWidth > document.documentElement.clientWidth)
    await settled(page)
    // The script hears of it in its next ResizeObserver round, a frame on.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const m = await page.evaluate((selectors) => {
      const root = document.documentElement
      return {
        window: innerWidth,
        page: root.clientWidth,
        content: root.scrollWidth,
        // What sticks out past the page, deepest first, for the message:
        // on CI the category page was 8px too wide (Nov 20), never locally.
        over: [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 0.5 && !el.querySelector('*:not(svg *)'))
          .slice(0, 4)
          .map((el) => {
            const r = el.getBoundingClientRect()
            const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : ''
            return `<${el.tagName.toLowerCase()} class="${cls}"> ${Math.round(r.left)}–${Math.round(r.right)}`
          }),
        scrollbarVar: getComputedStyle(root).getPropertyValue('--scrollbar-width'),
        bands: selectors.map((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          return { sel, left: r?.left ?? null, right: r?.right ?? null }
        }),
      }
    }, bands)
    // Otherwise the test checks nothing: the overhang is the scrollbar's.
    expect(m.window - m.page, 'no scrollbar taking room on this page').toBeGreaterThan(0)
    expect(m.content, `the page is wider than the window (--scrollbar-width ${m.scrollbarVar || 'unset'}; past its edge: ${m.over.join('; ') || 'nothing'})`).toBe(m.page)
    for (const b of m.bands) {
      expect(b.left, `${b.sel} isn't on the page`).not.toBeNull()
      expect(Math.abs(b.left!), `${b.sel} starts off the page's left edge`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(b.right! - m.page), `${b.sel} doesn't end at the page's right edge`).toBeLessThanOrEqual(0.5)
    }
  }

  test('a category page', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    await page.goto(`/${community}/${category.id}`)
    await expectFits(page, ['[data-testid=category-hero]'])
  })

  test('the home', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await expectFits(page, ['[data-testid=desktop-hero]'])
  })
})
