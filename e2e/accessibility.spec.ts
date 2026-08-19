import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { categoryWithListings, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// A real axe-core pass against the pages a visitor actually lands on cold —
// home and a category directory — added after a Lighthouse audit turned up a
// genuine, "serious"-impact issue (nested-interactive, below) that had never
// been checked for before. Same rationale as server-rendering.spec.ts: an
// automated check belongs in the suite, not in a one-off session's memory.
//
// color-contrast is disabled deliberately, not because it never matters —
// axe (like Lighthouse, which runs the same engine) can only sample a
// flat background color, and every hit here is white text with its own
// `drop-shadow` rendered over a photo, a standard legibility pattern axe has
// no way to evaluate. Re-enable it if a genuinely flat-background contrast
// issue shows up somewhere else; don't just raise the threshold to make this
// one go quiet.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('accessibility', () => {
  test('the home screen has no automatically-detectable violations', async ({ page }) => {
    const community = await defaultCommunity(page)
    await page.goto(`/${community}`)
    await ready(page)
    await dismissLocationPrompt(page)

    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })

  // Used to be a documented test.fail() here: GenericListingCard's row was
  // role="button" (the whole row toggled the card open/closed, including
  // via keyboard) while also containing genuinely interactive children —
  // UpvoteButton, an external-link button, the Open/badge Chips. A screen
  // reader can't reliably operate a control nested inside another one.
  //
  // Fixed by dropping role="button"/tabIndex/aria-expanded from the row —
  // its onClick stays as a mouse/touch "click anywhere" convenience, but
  // the chevron is now a real <button> carrying aria-expanded and a label,
  // with no onClick of its own: a native button's click, from either a
  // mouse or a keyboard Enter/Space, bubbles straight up to the row's
  // handler, so there's exactly one place the toggle logic lives. See
  // GenericListingCard's own comments on both elements.
  test('a category directory has no automatically-detectable violations', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPrompt(page)

    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
})
