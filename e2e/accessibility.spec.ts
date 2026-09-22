import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { categories, categoryAddButton, categoryWithListings, defaultCommunity, dismissLocationPrompt, ready } from './helpers'
import { listingSlug } from '../src/lib/listingSlug'

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

  // ── Everything else a visitor can land on or open ──────────────────────────
  //
  // The two tests above only cover the home screen and one directory. That left
  // the map, an individual listing, the About/Privacy/Feedback pages, the
  // fixed views, and — most importantly — the interactive states (the actions
  // menu, the Add form) unchecked. A page that passes axe closed can still fail
  // once its dialog or menu is open, which is when a screen-reader user is
  // actually in it.

  async function expectNoViolations(page: import('@playwright/test').Page) {
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  }

  for (const [name, path] of [
    ['the map', 'map'],
    ['About', 'about'],
    ['Privacy', 'privacy'],
    ['Feedback', 'feedback'],
  ] as const) {
    test(`${name} has no automatically-detectable violations`, async ({ page }) => {
      const community = await defaultCommunity(page)
      await page.goto(`/${community}/${path}`)
      // ready() waits for the site header, which the phone layout of the map
      // hides on purpose (an invisible, zero-height <header>) — so the map waits
      // on its own <main> instead.
      if (path === 'map') await page.locator('main').first().waitFor({ state: 'visible' })
      else await ready(page)
      await dismissLocationPrompt(page)
      await expectNoViolations(page)
    })
  }

  test('a single listing page has no automatically-detectable violations', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const item = ((await res.json()) as { resources: { id: string; name: string }[] }).resources[0]!

    await page.goto(`/${community}/${category.id}/${listingSlug(item)}`)
    await ready(page)
    await dismissLocationPrompt(page)
    await expectNoViolations(page)
  })

  test('the fixed views (zmanim, hospitals, eruv) have no automatically-detectable violations', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const kinds = new Set((await categories(request, community)).map((c) => c.kind))

    for (const [slug, kind] of [['zmanim', 'zmanim'], ['hospitals', 'hospitals'], ['eruv', 'eruv']] as const) {
      if (!kinds.has(kind)) continue
      await page.goto(`/${community}/${slug}`)
      await ready(page)
      await dismissLocationPrompt(page)
      await expectNoViolations(page)
    }
  })

  test('a listing\'s actions menu, once open, has no automatically-detectable violations', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPrompt(page)

    await page.getByRole('button', { name: /^More actions for / }).first().click()
    await expect(page.getByRole('menu')).toBeVisible()

    // `region` (all content inside a landmark) is switched off for this one
    // check: the open menu is a transient popup portaled outside <main>, which
    // is normal for a popup and not something a landmark would improve. Every
    // other rule, including the ARIA-attribute ones that caught aria-pressed on
    // a menuitem, still runs — and `region` still runs on every page above.
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast', 'region']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })

  test('the Add form dialog, once open, has no automatically-detectable violations', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)
    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPrompt(page)

    await categoryAddButton(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await expectNoViolations(page)
  })
})
