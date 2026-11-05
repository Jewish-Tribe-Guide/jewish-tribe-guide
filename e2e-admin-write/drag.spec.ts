import { expect, test, type Locator, type Page } from '@playwright/test'

// The lists on Site → Home page are put in order by dragging (notes
// 25-28): by the handle with a mouse, or on a phone by holding the row.
// Only a real browser lays the rows out and hit-tests them, so it's here
// and not in the unit suite. Never saves, so it writes nothing.

const order = (box: Locator) => box.getByRole('button', { name: /^Move / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

async function middle(l: Locator) {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, bottom: b.y + b.height }
}

test('a row dragged by its handle lands where it is dropped', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/philly/admin/home')
  await page.getByRole('group', { name: 'Show the page on' }).getByRole('button', { name: 'Phone' }).click()
  const tabs = page.getByRole('region', { name: 'Tabs' })
  const handles = tabs.getByRole('button', { name: /^Move / })
  await expect(handles.nth(1)).toBeVisible({ timeout: 20_000 })
  await tabs.scrollIntoViewIfNeeded()
  const before = await order(tabs)

  const from = await middle(handles.first())
  const last = await middle(tabs.locator('[data-drag-row]').last())
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, last.bottom + 10, { steps: 12 })
  await page.mouse.up()

  await expect.poll(() => order(tabs)).toEqual([...before.slice(1), before[0]])
  // Dropping isn't a tap: nothing opened.
  await expect(tabs.getByRole('button', { expanded: true })).toHaveCount(0)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  // One finger, through Chrome's own touch input: Playwright can only tap.
  async function finger(page: Page) {
    const cdp = await page.context().newCDPSession(page)
    return (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  }

  test('holding a row lifts it to drag; a tap still opens it', async ({ page }) => {
    await page.goto('/philly/admin/home')
    await page.getByRole('group', { name: 'Show the page on' }).getByRole('button', { name: 'Phone' }).tap()
    const tabs = page.getByRole('region', { name: 'Tabs' })
    const rows = tabs.locator('[data-drag-row]')
    await expect(rows.nth(1)).toBeVisible({ timeout: 20_000 })
    await rows.last().scrollIntoViewIfNeeded()
    const before = await order(tabs)

    const from = await middle(rows.first().getByRole('button', { expanded: false }))
    const to = await middle(rows.last())
    const touch = await finger(page)
    await touch('touchStart', from.x, from.y)
    await page.waitForTimeout(700)
    for (let i = 1; i <= 10; i++) await touch('touchMove', from.x, from.y + ((to.bottom + 10 - from.y) * i) / 10)
    await touch('touchEnd')

    await expect.poll(() => order(tabs)).toEqual([...before.slice(1), before[0]])
    await expect(tabs.getByRole('button', { expanded: true })).toHaveCount(0)

    // A quick tap opens the row instead.
    const row = rows.first().getByRole('button', { expanded: false })
    await row.tap()
    await expect(rows.first().getByRole('button', { expanded: true })).toBeVisible()
  })
})

// The home page's cards, in rows (artifact 8HpeQANzsQyGbyHVPsXrc5): a card
// dropped in a row's box shares that row, one dropped between boxes has a
// row of its own, and a full row takes no more. Reads what's there first,
// since the rows are the community's own.
test.describe('the home page cards', () => {
  // Each row's cards by name: a box is the cards whose spots share a border.
  const rows = (box: Locator) =>
    box.locator('[data-drag-row]').evaluateAll((els) => {
      const out: string[][] = []
      for (const el of els) {
        const name = el.querySelector('.font-medium')?.textContent
        if (!name) continue
        const slot = el.parentElement!.className
        if (!slot.includes('border-x') || slot.includes('rounded-t')) out.push([])
        out.at(-1)!.push(name)
      }
      return out
    })

  async function open(page: Page) {
    // Tall enough that every drop lands on the page: a mouse let go off it
    // never ends the drag.
    await page.setViewportSize({ width: 1400, height: 1400 })
    await page.goto('/philly/admin/home')
    const box = page.getByRole('region', { name: 'Cards under the search' })
    await expect(box.getByRole('button', { name: /^Move / }).nth(1)).toBeVisible({ timeout: 20_000 })
    await box.scrollIntoViewIfNeeded()
    return box
  }

  async function drag(page: Page, box: Locator, handle: Locator, toY: number) {
    const from = await middle(handle)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, toY, { steps: 16 })
    return async () => {
      await page.mouse.up()
      // A lifted card already shows where it would go, so wait for it to be
      // put down before reading the rows.
      await expect(box.locator('[data-drag-row].z-10')).toHaveCount(0)
    }
  }

  test('a card dropped below them all has a row of its own; dropped in a box, it shares that row', async ({ page }) => {
    const box = await open(page)
    const last = (await rows(box)).at(-1)!.at(-1)!
    const handle = box.getByRole('button', { name: `Move ${last}` })

    const end = await middle(box.locator('[data-drag-row]').last())
    await (await drag(page, box, handle, end.bottom + 10))()
    await expect.poll(async () => (await rows(box)).at(-1)).toEqual([last])

    const above = (await rows(box)).at(-2)!
    test.skip(above.length >= 3 || above.includes('Categories'), 'the row above has no room')
    // The drop left a change, so the Save bar is up along the bottom of the
    // window: bring the box clear of it before pressing a handle.
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    // Just under the row's last card, inside its box.
    const into = await middle(box.locator('[data-drag-row]').filter({ hasText: above.at(-1)! }))
    await (await drag(page, box, handle, into.bottom - 4))()
    await expect.poll(async () => (await rows(box)).at(-1)).toEqual([...above, last])
  })

  test('a full row takes no fourth card, is dimmed while one is lifted, and says so when one is held over it', async ({ page }) => {
    const box = await open(page)
    const before = await rows(box)
    const full = before.findIndex((row) => row.length === 3)
    const mover = before.find((row, i) => i > full && !row.includes('Categories'))?.[0]
    test.skip(full < 0 || !mover, 'no full row with a card below it')

    const fullSlot = box.locator('[data-drag-row]').filter({ hasText: before[full]![0]! }).locator('..')
    const handle = box.getByRole('button', { name: `Move ${mover}` })
    const from = await middle(handle)
    const onto = await middle(box.locator('[data-drag-row]').filter({ hasText: before[full]![1]! }))
    // Just lifted: the full row is dimmed, and says nothing yet.
    const drop = await drag(page, box, handle, from.y - 4)
    await expect(fullSlot).toHaveClass(/opacity-50/)
    await expect(box.getByText('Full: 3 cards at most')).toHaveCount(0)
    // Held over it (the user, Nov 4: "make that clear on the drag").
    await page.mouse.move(from.x, onto.y, { steps: 16 })
    await expect(box.getByText('Full: 3 cards at most')).toBeVisible()
    await expect(fullSlot).toHaveClass(/border-red-300/)
    await drop()
    await expect(box.getByText('Full: 3 cards at most')).toHaveCount(0)

    const after = await rows(box)
    expect(after.find((row) => row.includes(before[full]![0]!))).toEqual(before[full])
    expect(after.every((row) => row.length <= 3)).toBe(true)
  })

  test('Categories held over another card says it has a row of its own, and stays put', async ({ page }) => {
    const box = await open(page)
    const before = await rows(box)
    const at = before.findIndex((row) => row.includes('Categories'))
    test.skip(at < 0 || !before[at + 1], 'no Categories card with a row below it')

    const onto = await middle(box.locator('[data-drag-row]').filter({ hasText: before[at + 1]![0]! }))
    const drop = await drag(page, box, box.getByRole('button', { name: 'Move Categories' }), onto.y)
    await expect(box.getByText('Categories has a row of its own')).toBeVisible()
    await drop()
    await expect(box.getByText('Categories has a row of its own')).toHaveCount(0)
    expect((await rows(box)).find((row) => row.includes('Categories'))).toEqual(['Categories'])
  })

  // The user, Nov 4: moving a card out of the box of three into a row of
  // its own, between that box and the next, was "possible but not so
  // easy". The whole space between the boxes is that spot now, so a drop
  // off its centre lands there too.
  test('a card let go anywhere between two boxes has a row of its own', async ({ page }) => {
    const box = await open(page)
    const before = await rows(box)
    const r = before.findIndex((row, i) => row.length > 1 && before[i + 1] && !row.includes('Categories'))
    test.skip(r < 0, 'no shared row with another row below it')
    const card = before[r]!.at(-1)!
    const next = before[r + 1]![0]!

    const lastBottom = (await middle(box.locator('[data-drag-row]').filter({ hasText: card }))).bottom
    const nextTop = (await box.locator('[data-drag-row]').filter({ hasText: next }).boundingBox())!.y
    await (await drag(page, box, box.getByRole('button', { name: `Move ${card}` }), (lastBottom + nextTop) / 2 + 8))()

    await expect.poll(() => rows(box)).toEqual([...before.slice(0, r), before[r]!.slice(0, -1), [card], ...before.slice(r + 1)])
  })
})
