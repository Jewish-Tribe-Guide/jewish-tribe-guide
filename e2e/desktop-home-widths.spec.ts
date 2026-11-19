import { expect, test, type Locator } from '@playwright/test'
import { defaultCommunity, previewSettings, ready } from './helpers'

// The computer home sizes each section by its own box, not by the window
// (the user, Nov 12: "our desktop homepage is [not] so great at shrinking").
// At 820px the trust strip used to squeeze four columns into unreadable
// slivers, Suggest a listing and Stay in the Loop kept their side-by-side
// layout until the words were a column one word wide, and the times broke
// mid-answer. Container queries, so only a real browser can say.

const box = async (l: Locator) => {
  const b = await l.boundingBox()
  if (!b) throw new Error('not laid out')
  return b
}

async function open(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  const community = await defaultCommunity(page)
  await previewSettings(page, community, { homeStyle: 'classic' })
  await page.goto(`/${community}?preview=1`)
  await ready(page)
}

test.describe('computer home at a narrow window', () => {
  test.skip(({ isMobile }) => isMobile, 'the computer home only')

  test('at 820px each section stacks inside its own box', async ({ page }) => {
    await open(page, 820)

    // Suggest a listing and Stay in the Loop: the button and the email box
    // go under the words, and nothing sticks out of its card.
    for (const [id, control] of [
      ['home-suggest', page.getByTestId('home-suggest').getByRole('button', { name: 'Suggest a listing' })],
      ['home-subscribe', page.getByTestId('home-subscribe').getByRole('button', { name: 'Sign up' })],
    ] as const) {
      const card = page.getByTestId(id)
      await card.scrollIntoViewIfNeeded()
      const heading = await box(card.getByRole('heading'))
      const c = await box(control)
      const outer = await box(card)
      expect(c.y, `${id}: its control sits under the heading`).toBeGreaterThan(heading.y + heading.height)
      expect(c.x + c.width, `${id}: its control stays inside the card`).toBeLessThanOrEqual(outer.x + outer.width)
      // The heading keeps a readable measure: two lines at most.
      expect(heading.height, `${id}: heading on at most two lines`).toBeLessThan(90)
    }

    // The trust strip: its heading on a row of its own, the points under it.
    const band = page.getByTestId('desktop-trust-band')
    const title = await box(band.getByText('Kept up by the community', { exact: true }))
    const point = await box(band.getByText('Every listing is dated'))
    expect(point.y).toBeGreaterThan(title.y + title.height)
    expect(point.width, 'a point is wide enough to read').toBeGreaterThan(150)

    // The two time cards: whichever answers are showing stay on one line.
    for (const answer of await page.locator('[data-testid$="-answer"]:visible').all()) {
      const lineHeight = await answer.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
      expect((await box(answer)).height, `${await answer.textContent()} on one line`).toBeLessThan(lineHeight * 1.5)
    }
  })

  test('at 1280px they are side by side, as drawn', async ({ page }) => {
    await open(page, 1280)

    // Side by side once the card itself is 540px wide (board W7l), whatever
    // the window: an admin can put Suggest in a row of three, and then it
    // stacks even here (the test project's rows did, Nov 12 CI).
    for (const [id, name] of [['home-suggest', 'Suggest a listing'], ['home-subscribe', 'Sign up']] as const) {
      const card = page.getByTestId(id)
      await card.scrollIntoViewIfNeeded()
      const heading = await box(card.getByRole('heading'))
      const button = await box(card.getByRole('button', { name }))
      if ((await box(card)).width >= 540) expect(button.x, `${id}: its control beside the words`).toBeGreaterThan(heading.x + heading.width)
      else expect(button.y, `${id}: its control under the words`).toBeGreaterThan(heading.y + heading.height)
      // Quiet (board W7l): no taller than the words and one small control need.
      if ((await box(card)).width >= 540) expect((await box(card)).height, `${id}: a short card`).toBeLessThan(170)
    }

    const band = page.getByTestId('desktop-trust-band')
    const title = await box(band.getByText('Kept up by the community', { exact: true }))
    const point = await box(band.getByText('Every listing is dated'))
    expect(point.x).toBeGreaterThan(title.x + title.width)
  })
})
