import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// Tap targets (Nov 18, review item 39).
//
// The header's Set location was 30px tall, a listing's phone number and
// website 18px, and the map's chips 32px: under the 44px a fingertip needs,
// so a tap beside one did nothing or hit its neighbour. Each now takes a
// 44px tap without changing how it looks (tap-44 in globals.css), which only
// a real browser can show: the tap area is an empty box, invisible to a
// measurement of the control, and clipped by any parent that hides overflow.
// So this asks the browser what is under a point 21px above and below each
// control's middle.
// ─────────────────────────────────────────────────────────────────────────────

/** What a tap 21px above and below the control's middle lands on. */
async function tapArea(target: Locator) {
  return target.evaluate((el) => {
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const lands = (dy: number) => {
      const at = document.elementFromPoint(x, y + dy)
      return at === el || el.contains(at) ? 'the control' : (at?.outerHTML.slice(0, 120) ?? 'nothing')
    }
    return { above: lands(-21), below: lands(21) }
  })
}

async function expectFingerSized(target: Locator, what: string) {
  await expect(target, what).toBeVisible()
  expect(await tapArea(target), `${what}: a tap 21px either side of its middle`).toEqual({
    above: 'the control',
    below: 'the control',
  })
}

/** A listing whose opened page shows a phone number and a website. */
async function listingWithPhoneAndWebsite(request: APIRequestContext, community: string, page: Page) {
  for (const category of (await categories(request, community)).filter((c) => c.kind === 'listing')) {
    const res = await request.get(`/api/resources?category=${category.id}&community=${community}`)
    const body = (await res.json()) as { ok: boolean; resources?: { id: string; phone?: string; website?: string }[] }
    const item = body.resources?.find((r) => r.phone && r.website)
    if (!item) continue
    await page.goto(`/${community}/${category.id}/${item.id}`)
    await dismissLocationPrompt(page)
    const details = page.getByTestId('listing-details').first()
    if ((await details.locator('a[href^="tel:"]').count()) === 0) continue
    return details
  }
  return null
}

test('the header’s Set location takes a fingertip', async ({ page }) => {
  await defaultCommunity(page)
  await ready(page)
  await dismissLocationPrompt(page)
  const control = page.locator('header').getByRole('button', { name: 'Set location' }).locator('visible=true').first()
  await expectFingerSized(control, 'Set location')
})

test('a listing’s phone number and website take a fingertip', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const details = await listingWithPhoneAndWebsite(request, community, page)
  test.skip(!details, 'no listing here shows both a phone number and a website')

  await expectFingerSized(details!.locator('a[href^="tel:"]').first(), 'the phone number')
  await expectFingerSized(details!.locator('a[target="_blank"]').first(), 'the website')
})

test('the map’s chips take a fingertip', async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await dismissLocationPrompt(page)
  const all = page.getByRole('button', { name: 'All', exact: true }).locator('visible=true').first()
  await expectFingerSized(all, 'the All chip')
})
