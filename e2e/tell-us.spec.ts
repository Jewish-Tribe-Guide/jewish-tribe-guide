import { expect, test, type Page } from '@playwright/test'
import { categoryAddButton, categoryWithListings, defaultCommunity, ready } from './helpers'

// "+ Add" opens Find the place (board R3b, Nov 27; the box, "Add or update
// a place", until then) on every screen but the Map (decided Oct 5), with
// the AI box one row on it (R4). Read-only like everything in e2e/: nothing
// here reads a message or sends one (that would call the AI and file a
// suggestion).

/** Find the place's row into the AI box, and the box it opens. */
async function openPaste(page: Page) {
  await page.getByRole('dialog', { name: 'Find the place' }).getByRole('button', { name: /^Or paste a post or a photo/ }).click()
  return page.getByRole('dialog', { name: 'Paste a post or a photo' })
}

test('the home page’s “+ Add” opens Find the place', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}`)
  await ready(page)

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const find = page.getByRole('dialog', { name: 'Find the place' })
  await expect(find.getByPlaceholder('Search by name or address…')).toBeVisible()
  // Filling it in by hand is offered once something is typed (Nov 27).
  await expect(find.getByRole('button', { name: /not on Google/ })).toHaveCount(0)
  await expect(find.getByRole('button', { name: /^Or paste a post or a photo/ })).toBeVisible()
})

test('a category’s “+” opens Find the place, with the paste box one row away, sent as it is, and Back', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/${category.id}`)
  await ready(page)

  await categoryAddButton(page).click()
  const box = await openPaste(page)
  // Sent as it is (Nov 27, board S1b): no AI tag, since the sender checks
  // nothing; an admin checks what the AI reads from it.
  await expect(box.getByTestId('read-by-ai')).toHaveCount(0)
  await box.getByLabel('Your message').fill('Acme on 5th has challah')
  await expect(box.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  await box.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Find the place' })).toBeVisible()
})

// Boards S2 and S4c (Nov 27): Send answers at once with Sent, and You lists
// what this phone sent, Live opening the listing. Both of the post's routes
// are answered here, so nothing is kept or read (e2e writes nothing).
test('a post sent from the box says Sent, and You lists it with where it stands', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const ID = '00000000-aaaa-4aaa-8aaa-0000000e2e01'
  const href = `/${community}/${category.id}/a-place`
  let sent: string | null = null
  await page.route('**/api/message/queue**', async (route) => {
    sent = route.request().postDataBuffer()?.toString() ?? ''
    await route.fulfill({ json: { ok: true, id: ID } })
  })
  await page.route('**/api/updates**', (route) => route.fulfill({ json: { ok: true, statuses: { [ID]: { state: 'live', href, at: new Date().toISOString() } } } }))
  await page.goto(`/${community}/${category.id}`)
  await ready(page)

  await categoryAddButton(page).click()
  const box = await openPaste(page)
  await box.getByLabel('Your message').fill('Acme on 5th has challah')
  await box.getByRole('button', { name: 'Send', exact: true }).click()
  const done = page.getByTestId('tell-us-sent')
  await expect(done).toContainText('An admin checks it before it’s on the site.')
  expect(sent).toContain('Acme on 5th has challah')
  await done.getByRole('button', { name: 'Done' }).click()

  await page.goto(`/${community}/you`)
  const yours = page.getByTestId('you-updates')
  await expect(yours.getByTestId('you-update')).toHaveCount(1)
  await expect(yours.getByTestId('you-update')).toContainText('Acme on 5th has challah')
  await expect(yours.getByTestId('you-update-state')).toHaveText('Live')
  await expect(yours.getByRole('link')).toHaveAttribute('href', href)
})

// The user, Nov 10: the box's steps were React state only, so the
// browser's Back from "Add to …" closed the whole box and lost what was
// typed (AGENTS.md: "A screen of its own is an entry in the browser's
// history"). Each step has its own address now; Back and Forward walk them.
test('the browser’s Back and Forward walk the box’s steps, a row’s Back keeping what was typed', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  await page.goto(`/${community}/${category.id}`)
  await ready(page)

  const page0 = page.url()
  await categoryAddButton(page).click()
  const find = page.getByRole('dialog', { name: 'Find the place' })
  await expect(find).toBeVisible()
  const box = () => new URL(page.url()).searchParams.get('box')
  // Add's first screen is the box's own root: no step in the address.
  expect(box()).toBeNull()
  await find.getByPlaceholder('Search by name or address…').fill('A place')
  await find.getByRole('button', { name: /^Fill in “A place” yourself/ }).click()
  const adding = page.getByRole('dialog', { name: /^Add to / })
  await expect(adding).toBeVisible()
  await expect.poll(box).toBe('add')
  await adding.getByTestId('editor-row-name').click()
  await expect.poll(box).toBe('add/name')
  await page.locator('#edit-name').fill('A place typed in')

  await page.goBack()
  await expect(adding).toBeVisible()
  await expect(page.locator('#edit-name')).toBeHidden()
  await expect(adding.getByTestId('editor-row-name')).toContainText('A place typed in')
  await page.goBack()
  await expect(find).toBeVisible()
  expect(page.url()).toBe(page0)

  await page.goForward()
  await expect(adding).toBeVisible()

  // Closing it takes its steps off the address (Escape: a phone's sheet
  // has no X, it's dragged away).
  await page.keyboard.press('Escape')
  await expect(adding).toBeHidden()
  await expect.poll(() => page.url()).toBe(page0)
})

// Oct 27, the user: on a phone "you don't necessarily notice the 'fill it
// in yourself' option", and closing it is "a sudden shift in the background
// lighting" that a listing doesn't have. At half height the link sat under
// the screen's edge; the box now opens at its content's height. And it was
// taken off the page the moment it closed, its dimmed backdrop with it, in
// one frame; it slides and fades away now, as a listing does.
// MobileSheet's HALF_FRACTION: a sheet opens no shorter than this.
const HALF = 0.5

test.describe('the box on a phone', { tag: '@mobile' }, () => {

  test('opens tall enough to show the AI row, and no taller', async ({ page }) => {
    // A phone with Safari's bars showing: shorter than the emulated screen.
    await page.setViewportSize({ width: 375, height: 660 })
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await ready(page)

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const box = page.getByRole('dialog', { name: 'Find the place' })
    const link = box.getByRole('button', { name: /^Or paste a post or a photo/ })
    await expect(link).toBeVisible()
    // Once it has finished sliding up.
    await expect.poll(async () => (await box.boundingBox())?.y).toBeLessThan(660)
    await page.waitForTimeout(400)
    const sheet = (await box.boundingBox())!
    const yourself = (await link.boundingBox())!
    expect(yourself.y + yourself.height, 'the AI row is on the screen').toBeLessThanOrEqual(660)
    // Ends under it, or at the sheet's half-screen floor when there's less
    // than that to show (an empty search, since Fill it in yourself waits
    // for something typed, Nov 27).
    const gap = sheet.y + sheet.height - (yourself.y + yourself.height)
    expect(gap < 60 || Math.abs(sheet.height - 660 * HALF) <= 2, `and the box ends under it (${gap}px below, ${sheet.height}px tall)`).toBe(true)
    expect(sheet.height, 'not the full height').toBeLessThan(660 - 76)
  })

  test('closing slides and fades it away, as a listing does', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await ready(page)

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await (await openPaste(page)).getByLabel('Your message').fill('Acme on 5th has challah')
    await page.waitForTimeout(400)
    // Timed in the page: Playwright's own round trips are slower than the slide.
    const shownAfter60ms = await page.evaluate(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await new Promise((r) => setTimeout(r, 60))
      return !!document.querySelector('[role=dialog][aria-label="Paste a post or a photo"]')
    })
    expect(shownAfter60ms, 'still sliding away 60ms after closing').toBe(true)
    await expect(page.getByRole('dialog', { name: 'Paste a post or a photo' })).toHaveCount(0)

    // And opened again, it starts over, on Find the place.
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect((await openPaste(page)).getByLabel('Your message')).toHaveValue('')
  })
})

test('the Map has no “+ Add”', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  // On a phone the Map hides the header, so wait for its own search box:
  // a page that hasn't rendered would have no Add either.
  await page.getByPlaceholder(/Search name, address/).filter({ visible: true }).waitFor()
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
})

// Oct 15: an open listing's Edit listing opens the editor itself, not the
// box about it ("show actual edit. Not AI"). On a phone the page's
// floating "+" steps aside while a listing is open (it covered the
// listing's overflow); on desktop it stays (the listing's own row is at
// its foot, out of sight), for adding anything. A click here fails if
// anything covers it.
test('an open listing’s Edit listing opens the editor, not the box about that listing', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const { category } = await categoryWithListings(request, community)
  const body = await (await request.get(`/api/resources?category=${category.id}&community=${community}`)).json()
  const listing = body.resources[0] as { id: string; name: string }
  await page.goto(`/${community}/${category.id}?item=${listing.id}`)
  await ready(page)

  if (isMobile) {
    await expect(categoryAddButton(page)).toHaveCount(0)
  } else {
    await categoryAddButton(page).click()
    const general = page.getByRole('dialog', { name: 'Find the place' })
    await expect(general).toBeVisible()
    await general.getByRole('button', { name: 'Close' }).click()
    await expect(general).toBeHidden()
  }
  await page.getByRole('button', { name: 'Edit listing' }).filter({ visible: true }).click()
  // The listing-shaped editor, which says it has nothing to send yet.
  await expect(page.getByRole('button', { name: 'No changes yet' }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: `Update ${listing.name}` })).toHaveCount(0)
})
