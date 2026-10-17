import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { categories, categoryWithListings, defaultCommunity, dismissLocationPrompt } from './helpers'
import { fixedViewSlug } from '../src/lib/routes'

// ─────────────────────────────────────────────────────────────────────────────
// Search takes you to the page (Oct 13, canvas page "lands"): typing on the
// home screen shows where it could go, and Enter goes to the first, a real
// page with the words in its box. One test per row of "where Enter goes"
// (src/lib/searchLands.ts), against whatever the data holds.
// ─────────────────────────────────────────────────────────────────────────────

type Field = { key: string; type: string }
type Cat = Awaited<ReturnType<typeof categories>>[number] & { detailFields?: Field[] }

async function homeBox(page: Page, community: string) {
  await page.goto(`/${community}`)
  await dismissLocationPrompt(page)
  return page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
}

/** Types into the home box and waits for its lines: the page is running,
 *  and has worked out where Enter goes. */
async function typeAndWait(page: Page, box: ReturnType<Page['getByRole']>, text: string) {
  await box.fill(text)
  const lines = page.getByTestId('search-lines').filter({ visible: true })
  await expect(lines).toBeVisible()
  return lines
}

async function itemOnAListing(request: APIRequestContext, community: string): Promise<{ category: Cat; item: string } | null> {
  const all = (await categories(request, community)) as Cat[]
  for (const c of all.filter((x) => x.kind === 'listing')) {
    const keys = (c.detailFields ?? []).filter((f) => f.type === 'tags').map((f) => f.key)
    if (!keys.length) continue
    const body = await (await request.get(`/api/resources?category=${c.id}&community=${community}`, { timeout: 45_000 })).json()
    for (const r of (body.resources ?? []) as Record<string, unknown>[]) {
      for (const k of keys) {
        const tags = r[k]
        const item = Array.isArray(tags) ? (tags as unknown[]).find((t) => typeof t === 'string' && /^[A-Za-z]{4,}$/.test(t)) : undefined
        if (typeof item === 'string') return { category: c, item }
      }
    }
  }
  return null
}

test('a place’s name: its line opens its listing', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const body = await (await request.get(`/api/resources?category=${category.id}&community=${community}`, { timeout: 45_000 })).json()
  const place = (body.resources as { id: string; name: string }[])[0]!

  const box = await homeBox(page, community)
  const lines = await typeAndWait(page, box, place.name)
  await lines.getByRole('option').filter({ hasText: place.name }).first().click()

  await page.waitForURL((url) => url.pathname.startsWith(`/${community}/${category.id}/`))
  await expect(page.getByText(place.name).filter({ visible: true }).first()).toBeVisible()
})

test('an item: Enter goes where its first line says, the item in that page’s box and ticked in its Filters', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const found = await itemOnAListing(request, community)
  test.skip(!found, 'no listing has an item')
  const { item } = found!

  const box = await homeBox(page, community)
  const lines = await typeAndWait(page, box, item)
  const first = lines.getByRole('option').first()
  const href = await first.getByRole('link').getAttribute('href')
  const says = (await first.textContent()) ?? ''
  await box.press('Enter')

  await page.waitForURL((url) => `${url.pathname}${url.search}` === href)
  await expect(page.getByRole('searchbox').filter({ visible: true }).first()).toHaveValue(item)
  // "Grocery · 10 with Challah": the page has Challah ticked, and counts it.
  if (says.includes(`with ${item}`)) {
    const filters = page.getByRole('button', { name: /^Filters/ }).filter({ visible: true })
    await expect(filters).toContainText(/[1-9]/)
    await filters.click()
    await expect(page.getByRole('group', { name: 'Has' }).getByRole('button', { name: new RegExp(`^${item}`) })).toHaveAttribute('aria-pressed', 'true')
  }
  // No sentence answering over the list, no Share this answer, no Read as.
  await expect(page.getByRole('button', { name: 'Share this answer' })).toHaveCount(0)
  await expect(page.getByTestId('read-as')).toHaveCount(0)
})

// The user, Oct 13: a search from home to a category page already
// visited showed the whole list, the box empty. The page is kept alive
// between visits, and only its first took the address's search.
test('a second search to a page already visited lands on that search, not the whole list', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const found = await itemOnAListing(request, community)
  test.skip(!found, 'no listing has an item')
  const { category, item } = found!

  const box = await homeBox(page, community)
  await typeAndWait(page, box, category.label)
  const first = page.getByTestId('search-lines').filter({ visible: true }).getByRole('option').first()
  await expect(first.getByRole('link')).toHaveAttribute('href', `/${community}/${category.id}`)
  await box.press('Enter')
  await page.waitForURL((url) => url.pathname === `/${community}/${category.id}`)
  await expect(page.getByRole('searchbox').filter({ visible: true }).first()).toHaveValue('')

  await page.goBack()
  await page.waitForURL((url) => url.pathname === `/${community}`)
  const again = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  const lines = await typeAndWait(page, again, item)
  const href = await lines.getByRole('option').first().getByRole('link').getAttribute('href')
  test.skip(!href?.startsWith(`/${community}/${category.id}?`), `"${item}" goes elsewhere first`)
  await again.press('Enter')

  await page.waitForURL((url) => `${url.pathname}${url.search}` === href)
  await expect(page.getByRole('searchbox').filter({ visible: true }).first()).toHaveValue(item)
  // And it stays: nothing clears the address after landing.
  await page.waitForTimeout(800)
  expect(new URL(page.url()).searchParams.get('q')).toBe(item)
})

// The user, Oct 13: "going in and out … seems to break it". Back to home,
// then a search to a page not yet opened, and it came up blank: the page
// took the Back just before for its own arrival.
test('Back to home, then a search to another page: that page has the search', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const found = await itemOnAListing(request, community)
  test.skip(!found, 'no listing has an item')
  const { category, item } = found!
  // A kind of place no prompt goes to, so the search's page is a new one.
  const other = ((await categories(request, community)) as Cat[]).find((c) => c.kind === 'listing' && c.id !== category.id && !['restaurant', 'synagogue'].includes(c.id))
  test.skip(!other, 'only one kind of place')

  await homeBox(page, community)
  const card = page.locator(`a[href="/${community}/${other!.id}"]`).filter({ visible: true }).first()
  test.skip((await card.count()) === 0, `no link to ${other!.id} on home`)
  await card.click()
  await page.waitForURL((url) => url.pathname === `/${community}/${other!.id}`)

  await page.goBack()
  await page.waitForURL((url) => url.pathname === `/${community}`)
  // Straight from Back: a "Try asking" tapped (nothing typed first), or
  // the item typed and Enter at once.
  const prompt = page.getByTestId('search-prompts').filter({ visible: true }).getByRole('button').first()
  if (await prompt.count()) {
    await prompt.click()
    await page.waitForURL((url) => url.pathname !== `/${community}`)
    const q = new URL(page.url()).searchParams.get('q')
    if (q) await expect(page.getByRole('searchbox').filter({ visible: true }).first()).toHaveValue(q)
    await page.waitForTimeout(800)
    expect(new URL(page.url()).searchParams.get('q')).toBe(q)
    return
  }
  const again = page.getByRole('textbox', { name: 'Search resources' }).filter({ visible: true })
  await again.fill(item)
  await again.press('Enter')
  await page.waitForURL((url) => url.pathname !== `/${community}`)
  test.skip(!page.url().includes(`/${category.id}?`), `"${item}" goes elsewhere first`)
  await expect(page.getByRole('searchbox').filter({ visible: true }).first()).toHaveValue(item)
  await page.waitForTimeout(800)
  expect(new URL(page.url()).searchParams.get('q')).toBe(item)
})

test('a minyan: Minyanim by time, the words in its box, no sentence over the list', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const shuls = ((await categories(request, community)) as Cat[]).find((c) => c.detailFields?.some((f) => f.type === 'minyanim'))
  test.skip(!shuls, 'no category with minyanim')

  const box = await homeBox(page, community)
  await typeAndWait(page, box, 'next maariv')
  await box.press('Enter')

  await page.waitForURL((url) => url.pathname === `/${community}/${shuls!.id}` && url.searchParams.get('davening') === '1')
  await expect(page.getByTestId('minyanim-view')).toBeVisible()
  await expect(page.getByRole('searchbox').filter({ visible: true }).first()).toHaveValue('next maariv')
  // The sentence stays only to say why a list is empty.
  const rows = page.getByTestId('minyanim-rows').getByRole('link')
  if ((await rows.count()) > 0) await expect(page.getByTestId('minyanim-answer')).toHaveCount(0)
})

test('a zman: the times page, with the time asked for picked out', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const zmanim = ((await categories(request, community)) as Cat[]).find((c) => c.kind === 'zmanim')
  test.skip(!zmanim, 'no zmanim page')

  const box = await homeBox(page, community)
  await typeAndWait(page, box, 'when is candle lighting')
  await box.press('Enter')

  // The page's own word (/zmanim), never the category's id: that's the
  // admin's label slugified and opens an empty directory (a55b0b9). Here
  // they happen to match, so the id passed by luck.
  await page.waitForURL((url) => url.pathname === `/${community}/${fixedViewSlug('zmanim')}` && url.searchParams.get('time') === 'candles')
  await expect(page.locator('[data-picked="true"]').filter({ visible: true }).first()).toContainText(/Candle|Candles/)
})

test('the eruv: its page', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const eruv = ((await categories(request, community)) as Cat[]).find((c) => c.kind === 'eruv')
  test.skip(!eruv, 'no eruv page')

  const box = await homeBox(page, community)
  await typeAndWait(page, box, 'is the eruv up')
  await box.press('Enter')
  // /eruv, not the category's id (`eruv-information`), which is an empty
  // directory: the bug a55b0b9 fixed, which this used to assert.
  await page.waitForURL((url) => url.pathname === `/${community}/${fixedViewSlug('eruv')}`)
  await expect(page.getByRole('heading', { level: 1 }).filter({ visible: true }).first()).toContainText(eruv!.pluralLabel)
})

test('nothing anywhere: Enter stays on home and says so, with where to ask', async ({ page }) => {
  const community = await defaultCommunity(page)
  const box = await homeBox(page, community)
  await box.fill('xqzvplk wobblefrump')
  // Nothing to wait on but the page running: Enter is pressed until it
  // takes (before hydration the box has no handler).
  await expect(async () => {
    await box.press('Enter')
    await expect(page.getByTestId('ask-the-group').filter({ visible: true })).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByTestId('ask-the-group').filter({ visible: true })).toContainText('Nothing in the guide for “xqzvplk wobblefrump”.')
  expect(new URL(page.url()).pathname).toBe(`/${community}`)
})

// The user, Oct 16: "in Food ×" took about half a phone's search box, so a
// phone doesn't show it (the page's title says Food right above). Its ✕,
// the way to the whole guide, is in the card when nothing here matched.
test('a category’s box: “in Food” only where there’s room, and the whole guide when nothing’s here', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/${category.id}`)
  await dismissLocationPrompt(page)
  const box = page.getByRole('searchbox', { name: `Search ${category.pluralLabel}` }).filter({ visible: true })
  await expect(box).toBeVisible()

  const scope = page.getByText(`in ${category.pluralLabel}`, { exact: true })
  if (isMobile) {
    await expect(scope).not.toHaveCount(0)
    await expect(scope.filter({ visible: true })).toHaveCount(0)
  } else {
    await expect(scope.filter({ visible: true })).toBeVisible()
  }

  await box.fill('xqzvplk wobblefrump')
  const card = page.getByTestId('ask-the-group').filter({ visible: true })
  await expect(card).toContainText(`Nothing in ${category.pluralLabel} for “xqzvplk wobblefrump”.`)
  await card.getByRole('link', { name: 'Search the whole guide' }).click()
  await page.waitForURL((url) => url.pathname.startsWith(`/${community}/ask/`))
})
