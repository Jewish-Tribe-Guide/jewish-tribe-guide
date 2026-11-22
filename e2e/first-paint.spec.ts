import { expect, test, type Page } from '@playwright/test'
import { categoryWithListings, listingWithFourActions } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// What a screen paints before the app's code has run (the user, Nov 22: "when
// the mobile version loads it shows the desktop version for a brief moment").
//
// Which layout a screen draws used to be decided in JavaScript, after the
// page had measured the window, and until then it assumed a computer. So a
// phone's first paint was the computer's: the home page's map, Suggest and
// Stay in the Loop cards over its tiles, the site's name where a page's
// "‹ Food" goes, a listing's link showing the whole list, and the header
// over the map. The layout is CSS's call now, which knows the screen at the
// first paint.
//
// The page's own inline scripts still run (they put the streamed parts of
// the page in place, as a real load does before the app's code arrives);
// only the app's code is held back, so what's checked is that moment.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ serviceWorkers: 'block' })

async function beforeTheCode(page: Page, path: string) {
  await page.route(/\/_next\/static\/.*\.js(\?|$)/, (route) => route.abort())
  await page.goto(path)
}

const header = (page: Page) => page.locator('header').first()

test('the home page paints its own layout first', async ({ page, isMobile }) => {
  await beforeTheCode(page, '/philly')
  const cards = page.locator('[data-spot^="cards"]')
  await expect(cards.first()).toBeAttached()
  if (isMobile) {
    await expect(page.getByTestId('category-tiles')).toBeVisible()
    // The computer's cards (the map, Suggest, Stay in the Loop) aren't drawn.
    for (const card of await cards.all()) await expect(card).toBeHidden()
  } else {
    await expect(cards.first()).toBeVisible()
    await expect(page.getByTestId('category-tiles')).toBeHidden()
  }
})

test('a category page paints its own header first', async ({ page, request, isMobile }) => {
  const { category } = await categoryWithListings(request, 'philly')
  await beforeTheCode(page, `/philly/${category.id}`)
  const title = header(page).getByText(category.pluralLabel, { exact: true })
  if (isMobile) {
    await expect(title).toBeVisible()
    await expect(header(page).getByRole('button', { name: category.pluralLabel })).toBeVisible()
  } else {
    // A computer's header keeps the site's name; the page's title is on its photo.
    await expect(title).toBeHidden()
  }
})

test('a listing’s own link paints the listing, not the list under it', async ({ page, request, isMobile }) => {
  const { category, item } = await listingWithFourActions(request, 'philly')
  await beforeTheCode(page, `/philly/${category.id}/${item.id}`)
  await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
  // The list is there underneath for Back, but not shown.
  await expect(page.locator('[data-testid="directory-row"]').first()).toBeHidden()
  if (isMobile) await expect(header(page).getByText(category.pluralLabel, { exact: true })).toBeVisible()
})

test('the map paints without the header on a phone', async ({ page, isMobile }) => {
  await beforeTheCode(page, '/philly/map')
  if (isMobile) await expect(header(page)).toBeHidden()
  else await expect(header(page)).toBeVisible()
})
