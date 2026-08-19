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

  // KNOWN FAILING — documenting a real issue, not a flaky test.
  //
  // GenericListingCard's row is `role="button"` (the whole row toggles the
  // card open/closed, including via keyboard — see its own onKeyDown), but
  // it also contains genuinely interactive children: UpvoteButton, an
  // external-link button for any URL-type field, and the "Open"/badge
  // Chips. A screen reader can't reliably operate an interactive control
  // nested inside another one — this is real assistive-tech breakage, not
  // just an audit nitpick.
  //
  // Not fixed here: the row-is-the-whole-tap-target pattern is deliberate
  // (see the component's own comments) and used on every listing card on
  // the site, so the fix needs a UX call — e.g. dropping role="button" from
  // the row and giving keyboard users a real, non-nesting control instead —
  // not a quick prop tweak. test.fail() rather than a skip: the suite stays
  // green, the bug stays visible, and the day someone restructures that row
  // this turns red to say so, the same signal server-rendering.spec.ts's
  // two cases gave before they were fixed.
  test.fail('a category directory has no automatically-detectable violations', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPrompt(page)

    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
})
