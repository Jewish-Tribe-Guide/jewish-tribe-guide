import { expect, test } from '@playwright/test'
import { categoryWithHoursField, categoryWithListings, largestCategory, defaultCommunity, dismissLocationPrompt, listingWithFourActions, openListingEditor } from './helpers'

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

    await column.getByTestId('listing-column-bar').getByRole('button', { name: category.pluralLabel, exact: true }).click()
    await expect(column).toHaveCount(0)
    await expect(row).toBeInViewport()
  })

  // Oct 6, B: the listing has the top of the page. The list's search and
  // examples stayed above it and pushed it halfway down the screen. And the
  // browser's own Back closes it, as the column's "‹ {category}" does.
  test('has the top of the page, and the browser’s Back closes it', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)
    const search = page.getByRole('searchbox', { name: `Search ${category.pluralLabel}` })
    await expect(search).toBeVisible()

    await page.getByRole('button', { name: /^Show details for / }).first().click()
    const column = page.getByTestId('listing-column')
    await expect(column).toBeVisible()
    await expect(search).toBeHidden()
    const viewport = page.viewportSize()!
    expect((await column.boundingBox())!.y, 'the listing starts in the top half of the screen').toBeLessThan(viewport.height / 2)

    await page.goBack()
    await expect(column).toHaveCount(0)
    await expect(search).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(`/${community}/${category.id}`)
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
  // A closed group (a shul's denomination) opened, a listing in it read and
  // closed: the group then couldn't be closed (the user, Oct 11). Coming
  // back marks the listing's row found, which held its group open, and the
  // heading flipped what was remembered underneath it.
  for (const back of ['the column’s back', 'the browser’s Back'] as const) {
    test(`a group opened, a listing in it read and closed by ${back}, closes again`, async ({ page, request }) => {
      const community = await defaultCommunity(page)
      const res = await request.get(`/api/categories?community=${community}`)
      const grouped = ((await res.json()).categories as { id: string; kind: string; groupBy?: unknown }[]).filter((c) => c.kind === 'listing' && c.groupBy)
      let found = false
      for (const category of grouped) {
        await page.goto(`/${community}/${category.id}`)
        await dismissLocationPrompt(page)
        if ((await page.locator('button[aria-expanded="false"][aria-controls]').count()) > 0) {
          found = true
          break
        }
      }
      test.skip(!found, 'No category has closed groups')

      const rowsId = (await page.locator('button[aria-expanded="false"][aria-controls]').first().getAttribute('aria-controls'))!
      const heading = page.locator(`button[aria-controls="${rowsId}"]`)
      await heading.click()
      await expect(heading).toHaveAttribute('aria-expanded', 'true')
      await page.locator(`[id="${rowsId}"]`).getByRole('button', { name: /^Show details for / }).first().click()
      const column = page.getByTestId('listing-column')
      await expect(column).toBeVisible()
      if (back === 'the browser’s Back') await page.goBack()
      else await column.getByTestId('listing-column-bar').getByRole('button').first().click()
      await expect(column).toHaveCount(0)

      await heading.click()
      await expect(heading).toHaveAttribute('aria-expanded', 'false')
    })
  }

  // Editing (Oct 11): ‹ Food, ‹ 1 of 72 › and the places beside it each
  // left the edit, dropping what was changed. The editor's own ‹ is the
  // only way back, and the bar returns with the listing.
  test('the column’s bar goes while the listing is being edited, and comes back after', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category, item } = await categoryWithHoursField(request, community)

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)
    await page.getByRole('button', { name: `Show details for ${item.name}` }).first().click()
    const column = page.getByTestId('listing-column')
    await expect(column.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
    const bar = column.getByTestId('listing-column-bar')
    await expect(bar).toBeVisible()
    test.skip((await column.getByRole('button', { name: 'Suggest an edit' }).count()) === 0, `${category.id} can't be edited`)

    await openListingEditor(page, column)
    await expect(page.getByTestId('editor-list')).toBeVisible()
    await expect(bar).toHaveCount(0)
    await expect(column.getByRole('button', { name: 'Next listing' })).toHaveCount(0)

    await column.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(column.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
    await expect(bar).toBeVisible()
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
    // Waited for, not read once: the category's list can show a moment
    // before the address updates (failed that way once in a full run, Sep 30).
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${community}/${category.id}`)
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

// Request removal is in the listing's ••• menu (Oct 11), a screen of its
// own with no Cancel: Back (and the browser's or phone's Back, and Escape
// on desktop) returns to the listing. Here as well as in the unit tests
// because those mock the history; this is the real history stack, with
// the directory's own URL syncing running alongside it. Opens nothing that
// writes: the confirm is never pressed.
test('Request removal, from the ••• menu, is its own screen, and Back returns to the listing', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const { category, item } = await categoryWithHoursField(request, community)

  await page.goto(`/${community}/${category.id}`)
  await dismissLocationPrompt(page)
  await page.getByRole('button', { name: `Show details for ${item.name}` }).first().click()
  // A sheet on a phone; the list's column on desktop.
  const listing = isMobile ? page.getByRole('dialog', { name: item.name }) : page.getByTestId('listing-column')
  await expect(listing).toBeVisible()
  const name = listing.getByRole('heading', { name: item.name, exact: true })
  // Its content loads after the sheet opens: count its buttons after that.
  await expect(name).toBeVisible()

  const openRemoval = async () => {
    const more = listing.getByRole('button', { name: `Actions for ${item.name}` })
    await more.scrollIntoViewIfNeeded()
    await more.click()
    await page.getByRole('menuitem', { name: 'Request removal' }).click()
    await expect(page.getByRole('heading', { name: 'Request removal' })).toBeVisible()
  }
  // Offered wherever the listing can be edited (removal requests are on
  // for every category here).
  test.skip((await listing.getByRole('button', { name: 'Suggest an edit' }).count()) === 0, `${category.id} can't be edited`)

  await openRemoval()
  await expect(page.getByRole('button', { name: /^(Confirm removal request|Verifying…)$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(name).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Request removal' })).toHaveCount(0)

  // The browser's own Back (a phone's back swipe is the same thing).
  await openRemoval()
  await page.goBack()
  await expect(name).toBeVisible()
})

// A row of the editor (Oct 11) is a step inside it: the header's Back
// closes the row, not the editor.
test('Back steps out of an open row of the editor, not out of editing', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  // The longest editor: it has rows of both kinds.
  const { category, item } = await categoryWithHoursField(request, community, { longest: true })

  await page.goto(`/${community}/${category.id}`)
  await dismissLocationPrompt(page)
  await page.getByRole('button', { name: `Show details for ${item.name}` }).first().click()
  const listing = isMobile ? page.getByRole('dialog', { name: item.name }) : page.getByTestId('listing-column')
  await expect(listing).toBeVisible()
  await expect(listing.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
  const suggest = listing.getByRole('button', { name: 'Suggest an edit' })
  test.skip((await suggest.count()) === 0, `${category.id} can't be edited`)
  await openListingEditor(page, listing)
  const list = page.getByTestId('editor-list')
  await expect(list).toBeVisible()

  const back = page.getByRole('button', { name: 'Back', exact: true }).filter({ visible: true }).first()
  // The name opens where it is, inside its card (Oct 11, "editorlook").
  await page.getByTestId('editor-row-name').click()
  await expect(list.getByTestId('editor-open-name')).toBeVisible()
  await back.click()
  await expect(page.getByTestId('editor-open-name')).toHaveCount(0)
  await expect(list).toBeVisible()

  // A row holding a list opens on a screen of its own.
  const screenRow = page.locator('[data-opens="screen"]').first()
  test.skip((await screenRow.count()) === 0, `${item.name} has no row on a screen of its own`)
  await screenRow.click()
  await expect(page.locator('[data-testid^="editor-open-"]')).toBeVisible()
  await expect(list).toHaveCount(0)
  await back.click()
  await expect(list).toBeVisible()
})

// A row's own screen swapped out the list inside the same scroll region and
// kept its offset (Oct 11): opened from low in the list, it started part way
// down, its first lines out of sight. It starts at its top, and Back comes
// back to the row. The longest editor, where the list runs furthest: on a
// phone this goes red without the fix. On desktop no category shows it since
// Hours opens in place (a tall screen low in the list was what did); it runs
// there as a guard.
test('a row’s own screen starts at its top, and Back returns to the row', async ({ page, request, isMobile }) => {
    const community = await defaultCommunity(page)
    const { category, item } = await categoryWithHoursField(request, community, { longest: true })

    await page.goto(`/${community}/${category.id}`)
    await dismissLocationPrompt(page)
    await page.getByRole('button', { name: `Show details for ${item.name}` }).first().click()
    const listing = isMobile ? page.getByRole('dialog', { name: item.name }) : page.getByTestId('listing-column')
    await expect(listing.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
    test.skip((await listing.getByRole('button', { name: 'Suggest an edit' }).count()) === 0, `${category.id} can't be edited`)
    await openListingEditor(page, listing)
    await expect(page.getByTestId('editor-list')).toBeVisible()
    // A filled row, or one under "Not on the listing yet".
    const rows = page.locator('[data-opens="screen"]')
    test.skip((await rows.count()) === 0, `${item.name} has no row on a screen of its own`)

    // Read down to the end of the list first, as someone checking it has:
    // the sheet's own scroll region on a phone, the page on desktop.
    await page.getByTestId('editor-list').evaluate((el) => {
      let region = el.parentElement
      while (region && !/^(auto|scroll)$/.test(getComputedStyle(region).overflowY)) region = region.parentElement
      if (region) region.scrollTop = region.scrollHeight
      else window.scrollTo(0, document.documentElement.scrollHeight)
    })
    const row = page.getByTestId((await rows.first().getAttribute('data-testid'))!)
    await row.click()

    // The screen's top edge, inside what its scroll region shows.
    const open = page.locator('[data-testid^="editor-open-"]')
    await expect(open).toBeVisible()
    await expect
      .poll(() =>
        open.evaluate((el) => {
          let region = el.parentElement
          while (region && !/^(auto|scroll)$/.test(getComputedStyle(region).overflowY)) region = region.parentElement
          const top = region && region !== document.body && region !== document.documentElement ? region.getBoundingClientRect().top : 0
          return el.getBoundingClientRect().top - top
        }),
      )
      .toBeGreaterThanOrEqual(0)

    await page.getByRole('button', { name: 'Back', exact: true }).filter({ visible: true }).first().click()
    await expect(row).toBeInViewport()
})

// A note box was three lines high whatever was in it, so a mikvah's longer
// note or an About scrolled inside the box, its end out of sight (the user,
// Oct 11). It grows to fit. Typed only, never sent.
test('a long note grows its box rather than scrolling inside it', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const { category, item } = await categoryWithHoursField(request, community, { also: 'textarea' })

  await page.goto(`/${community}/${category.id}`)
  await dismissLocationPrompt(page)
  await page.getByRole('button', { name: `Show details for ${item.name}` }).first().click()
  const listing = isMobile ? page.getByRole('dialog', { name: item.name }) : page.getByTestId('listing-column')
  await expect(listing.getByRole('heading', { name: item.name, exact: true })).toBeVisible()
  test.skip((await listing.getByRole('button', { name: 'Suggest an edit' }).count()) === 0, `${category.id} can't be edited`)
  await openListingEditor(page, listing)
  await expect(page.getByTestId('editor-list')).toBeVisible()
  // Whichever row opening in place holds a note: About, or one of the
  // admin's boxes.
  const open = page.locator('[data-testid^="editor-open-"]')
  const box = open.locator('textarea').first()
  const rows = page.locator('[data-opens="here"]')
  for (let i = 0; i < (await rows.count()); i++) {
    await rows.nth(i).click()
    if (await box.count()) break
    await open.getByRole('button', { name: 'Done' }).click()
  }
  test.skip((await box.count()) === 0, `${category.id} has no note opening in place`)
  await box.fill(Array.from({ length: 10 }, (_, i) => `Line ${i + 1} of a long note`).join('\n'))
  await expect.poll(() => box.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
})
