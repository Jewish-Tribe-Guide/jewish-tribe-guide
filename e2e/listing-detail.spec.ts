import { expect, test } from '@playwright/test'
import { categoryWithHoursField, categoryWithListings, largestCategory, defaultCommunity, dismissLocationPrompt, listingWithFourActions } from './helpers'

// Desktop opens a listing in the list's own column, the map staying beside
// it (ListingColumn); a phone opens it in a bottom sheet, the one Add and
// Edit use (MobileSheet). Neither expands inline.

test.describe('listing detail — desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop viewport only')

  test('clicking a listing opens it in the list’s column, not a dialog', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const trigger = page.getByRole('button', { name: /^Show details for / }).first()
    const name = (await trigger.getAttribute('aria-label'))!.replace(/^Show details for /, '')
    await trigger.click()

    const column = page.getByTestId('listing-column')
    await expect(column).toBeVisible()
    await expect(column.getByRole('heading', { name, exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // The list is under it, hidden, not gone.
    await expect(trigger).toBeHidden()


    // Escape goes back to the list.
    await page.keyboard.press('Escape')
    await expect(column).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Show details for ${name}` }).first()).toBeVisible()
  })

  // The action buttons sit a set gap apart from the left. Spread across the
  // column the way a phone's are, the gaps grew with its width: 40px with
  // the map beside it, 100px with the map hidden.
  test('keeps the action buttons a set gap apart, not spread across the column', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category, item } = await listingWithFourActions(request, community)

    await page.goto(`/${community}/${category.id}/${item.id}`)
    await dismissLocationPrompt(page)

    const column = page.getByTestId('listing-column').filter({ visible: true })
    const actions = column.getByTestId('listing-actions').locator(':scope > a, :scope > button')
    await expect(actions).toHaveCount(5)
    const boxes = await Promise.all((await actions.all()).map((a) => a.boundingBox()))
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.x - (boxes[i - 1]!.x + boxes[i - 1]!.width), `gap before action ${i + 1}`).toBeLessThanOrEqual(32)
    }
  })

  // Where the category has a map, the map sits beside the list at desktop
  // width (CategoryMap), and the list is one column of rows. Hiding the map
  // gives the list the whole width, in columns.
  test('puts the map beside a one-column list, and the list in columns once the map is hidden', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    // The visible one: a hidden streamed copy of the page can be in the DOM too.
    const map = page.getByTestId('category-map').filter({ visible: true })
    await expect(map).toBeVisible()
    const list = (await page.getByTestId('list-heading').filter({ visible: true }).boundingBox())!
    const mapBox = (await map.boundingBox())!
    expect(mapBox.x, 'the map sits to the right of the list').toBeGreaterThan(list.x + list.width - 1)
    const tracks = () =>
      page
        .getByRole('button', { name: /^Show details for / })
        .first()
        .evaluate((el) => {
          let node: Element | null = el
          while (node && getComputedStyle(node).display !== 'grid') node = node.parentElement
          return node ? getComputedStyle(node).gridTemplateColumns.split(' ').length : 1
        })
    expect(await tracks(), 'one column of rows beside the map').toBe(1)

    await map.getByRole('button', { name: 'Hide map' }).click()
    await expect(map).toHaveCount(0)

    // Walks up from a trigger button to the nearest ancestor CSS actually
    // lays out as a grid, rather than assuming a fixed number of DOM levels
    // — brittle against any wrapper div GenericDirectory happens to add or
    // remove between the card and its container.
    const trigger = page.getByRole('button', { name: /^Show details for / }).first()
    const columnCount = await trigger.evaluate((el) => {
      let node: Element | null = el
      while (node && getComputedStyle(node).display !== 'grid') node = node.parentElement
      if (!node) return 0
      return getComputedStyle(node).gridTemplateColumns.split(' ').length
    })
    expect(columnCount, 'the directory grid should lay out more than one column at desktop width').toBeGreaterThan(1)
  })

  // Rows are two lines (name, then a facts line) and need the width: three
  // 280px columns squeezed each one into a third of the page. The grid's
  // tracks are 420px at least, so a laptop gets two, and a narrow window
  // one — never three, however wide the screen (the page itself is capped).
  // The line between list and map (useListMapSplit). Seen live: dragged all
  // the way left, the list stopped at its narrowest and the map filled the
  // rest, but on letting go the map shrank back to 365px and left a gap on
  // the right. The saved share, rounded, put the list a fraction of a pixel
  // under its minimum, and a grid then shares what's left by the map's own
  // fraction (under 1) instead of giving it all of it.
  test('the map fills the rest of the width wherever the line is left, even at the list’s narrowest', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const line = page.getByRole('separator', { name: 'Resize the list and the map' })
    await expect(line).toBeVisible()
    const edges = () =>
      line.evaluate((el) => ({
        grid: el.parentElement!.getBoundingClientRect().right,
        map: el.nextElementSibling!.getBoundingClientRect().right,
        list: el.previousElementSibling!.getBoundingClientRect().width,
      }))
    const box = (await line.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(40, box.y + 200, { steps: 8 })
    await page.mouse.up()

    const after = await edges()
    expect(after.list, 'the list stops at its narrowest').toBeCloseTo(420, 0)
    expect(Math.abs(after.map - after.grid), 'the map reaches the right edge').toBeLessThan(1.5)

    // And after a reload, from the saved split.
    await page.reload()
    await expect(line).toBeVisible()
    const reloaded = await edges()
    expect(Math.abs(reloaded.map - reloaded.grid), 'the map reaches the right edge after a reload').toBeLessThan(1.5)
  })

  test('lays out two columns at most, and one on a narrow window, with the map hidden', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)
    const trigger = () => page.getByRole('button', { name: /^Show details for / }).first()
    const columnsAt = async (width: number) => {
      await page.setViewportSize({ width, height: 900 })
      return trigger().evaluate((el) => {
        let node: Element | null = el
        while (node && getComputedStyle(node).display !== 'grid') node = node.parentElement
        return node ? getComputedStyle(node).gridTemplateColumns.split(' ').length : 1
      })
    }

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)
    await page.getByTestId('category-map').getByRole('button', { name: 'Hide map' }).click()

    expect(await columnsAt(1920)).toBe(2)
    expect(await columnsAt(1400)).toBe(2)
    expect(await columnsAt(750)).toBe(1)
    expect(await columnsAt(600)).toBe(1)
  })

  // Opened from far down the list, the page comes up to the listing, and
  // Back goes down to the row it came from. Real scroll and a real sticky
  // header: jsdom has neither.
  test('opened from far down the list, the listing starts in view, and Back returns to its row', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const triggers = page.getByRole('button', { name: /^Show details for / })
    const row = triggers.nth(8)
    await row.scrollIntoViewIfNeeded()
    await row.click()

    const column = page.getByTestId('listing-column')
    await expect(column).toBeVisible()
    const headerBottom = (await page.locator('header').first().boundingBox())!
    await expect(column.getByRole('heading', { level: 2 }).first()).toBeInViewport()
    expect((await column.boundingBox())!.y, 'the listing starts below the site header').toBeGreaterThanOrEqual(headerBottom.y + headerBottom.height - 1)

    await column.getByRole('button', { name: /^Back to / }).click()
    await expect(column).toHaveCount(0)
    await expect(row).toBeInViewport()
  })

  // ← → and the column's own ‹ › step through the list as it's shown, and
  // the listing each lands on starts in view.
  test('steps through the list from the column, each listing starting in view', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await largestCategory(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const triggers = page.getByRole('button', { name: /^Show details for / })
    const names = await triggers.evaluateAll((els) => els.slice(0, 7).map((el) => el.getAttribute('aria-label')!.replace(/^Show details for /, '')))
    await triggers.first().click()
    const column = page.getByTestId('listing-column')
    for (let i = 0; i < 5; i++) await column.getByRole('button', { name: 'Next listing' }).click()
    await page.keyboard.press('ArrowRight')
    await expect(column.getByRole('heading', { level: 2 }).first()).toHaveText(names[6])
    await expect(column.getByRole('heading', { level: 2 }).first()).toBeInViewport()
    await expect(column.getByTestId('listing-column-bar')).toContainText('7 of')
  })
})

test.describe('listing detail — mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile viewport only')

  // The listing opens in the same sheet Add and Edit use, not inline. Here
  // rather than only in the unit tests because the parts that matter need
  // real layout: that it opens at half the screen with the list still
  // showing above it, and that a real tap on that dimmed list closes it.
  test('clicking a listing opens it in a sheet at half height, which a tap on the list closes', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)

    const trigger = page.getByRole('button', { name: /^Show details for / }).first()
    const name = (await trigger.getAttribute('aria-label'))!.replace(/^Show details for /, '')
    await trigger.click()

    const sheet = page.getByRole('dialog', { name })
    await expect(sheet).toBeVisible()
    await expect(page.getByRole('button', { name: `Hide details for ${name}` })).toBeAttached()
    // The listing view, ending in its edit bar (or, where the category can't
    // be edited, just the overflow the bar keeps).
    await expect(sheet.getByRole('button', { name: `Actions for ${name}` })).toBeAttached()

    // Settled at half: the open transition is 280ms, so poll rather than
    // snapshot the height mid-animation.
    const viewport = page.viewportSize()!
    await expect
      .poll(async () => Math.round((await sheet.boundingBox())!.height), { message: 'sheet height at rest' })
      .toBe(Math.round(viewport.height * 0.5))

    // A tap on the dimmed list above it closes it, like Add and Edit.
    await page.mouse.click(viewport.width / 2, 40)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Show details for ${name}` })).toBeVisible()
  })

  // A shared link (`?item=`) opens the sheet on arrival, and closing it has
  // to clear the param, or a reload reopens a listing the visitor closed.
  // Next keeps the previous URL's tree alive, hidden, so a copy of the open
  // sheet can linger in the DOM under display:none; getByRole ignores
  // hidden elements, which is what "closed" means to a visitor.
  test('a listing opened from a shared link closes, and stays closed', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const item = (await res.json()).resources[0] as { id: string; name: string }

    await page.goto(`/${community}/${category.id}?item=${item.id}`)
    await dismissLocationPrompt(page)

    const sheet = page.getByRole('dialog', { name: item.name })
    await expect(sheet).toBeVisible()
    await page.mouse.click(page.viewportSize()!.width / 2, 40)

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => new URL(page.url()).searchParams.get('item')).toBeNull()
    await expect(page.getByRole('button', { name: `Show details for ${item.name}` }).first()).toBeVisible()
  })

  // A listing's own link (what Share copies) is, on a phone, a page of its
  // own: the listing under a header naming the guide and the category, not a
  // sheet over a list the visitor never saw. Back goes to that list, at the
  // category's own address.
  test('a listing’s own link is a page of its own, and Back goes to its category', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const item = (await res.json()).resources[0] as { id: string; name: string }

    await page.goto(`/${community}/${category.id}/${item.id}`)
    await dismissLocationPrompt(page)

    const listing = page.getByTestId('listing-page')
    await expect(listing).toBeVisible()
    await expect(listing.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const back = page.locator('header').getByRole('button', { name: category.pluralLabel })
    await expect(back).toBeVisible()

    await back.click()
    await expect(listing).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Show details for ${item.name}` }).first()).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(`/${community}/${category.id}`)
  })

  // The page's content rises into place as it appears (fadeIn: a 6px
  // transform, 180ms; Back slides it instead). An overlay drawn inside it
  // was measured from that moving box, not the screen, for as long as it
  // ran, and sat under the site header: the backdrop started below the
  // header, so a tap at the top of the screen to close a listing hit the
  // header's back button and went home instead. It failed this file's
  // shared-link test under the full suite's load, where the page appeared
  // late enough for the tap to land inside those 180ms. The transform is
  // held here, so the moment can't be missed.
  test('a tap at the top closes a listing even while the page is still sliding in', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const item = (await res.json()).resources[0] as { id: string; name: string }

    await page.goto(`/${community}/${category.id}?item=${item.id}`)
    await dismissLocationPrompt(page)
    await expect(page.getByRole('dialog', { name: item.name })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator('main').evaluate((main) => {
      main.style.animation = 'none'
      main.style.transform = 'translateY(6px)'
    })
    await expect(page.locator('header')).toBeInViewport()

    await page.mouse.click(page.viewportSize()!.width / 2, 40)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe(`/${community}/${category.id}`)
  })
})

// Requesting removal is a step of its own inside Suggest an edit, with no
// Cancel: Back (and Escape, and the browser's or phone's Back) steps out of
// it into the edit, not out of editing. Here as well as in the unit tests
// because those mock the history; this is the real history stack, with the
// directory's own URL syncing running alongside it. Opens nothing that
// writes: the confirm is never pressed.
test('Back steps out of Request removal into the edit, not out of editing', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const { category, item } = await categoryWithHoursField(request, community)

  await page.goto(`/${community}/${category.id}`)
  await dismissLocationPrompt(page)
  await page.getByRole('button', { name: `Show details for ${item.name}` }).first().click()
  // A sheet on a phone; the list's column on desktop.
  const listing = isMobile ? page.getByRole('dialog', { name: item.name }) : page.getByTestId('listing-column')
  await expect(listing).toBeVisible()

  const suggest = listing.getByRole('button', { name: 'Suggest an edit' })
  test.skip((await suggest.count()) === 0, `${category.id} can't be edited`)
  await suggest.click()
  const editTitle = page.getByRole('heading', { name: 'Suggest an edit' })
  await expect(editTitle).toBeVisible()
  const removalLink = page.getByRole('button', { name: 'Closed for good? Request removal' })
  test.skip((await removalLink.count()) === 0, `${category.id} doesn't take removal requests`)

  await removalLink.click()
  await expect(page.getByRole('heading', { name: 'Request removal' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Confirm removal request|Verifying…)$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(editTitle).toBeVisible()

  // The other ways back, each one step: the browser's own Back (a phone's
  // back swipe is the same thing), and on desktop, Escape.
  await removalLink.click()
  await expect(page.getByRole('heading', { name: 'Request removal' })).toBeVisible()
  await page.goBack()
  await expect(editTitle).toBeVisible()
  if (!isMobile) {
    await removalLink.click()
    await expect(page.getByRole('heading', { name: 'Request removal' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(editTitle).toBeVisible()
  }

  // And one more Back leaves the edit for the listing it came from.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(listing.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Suggest an edit' })).toHaveCount(0)
})
