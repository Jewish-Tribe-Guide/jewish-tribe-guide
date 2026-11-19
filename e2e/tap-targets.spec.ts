import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { categories, defaultCommunity, ready } from './helpers'

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
    await ready(page)
    const details = page.getByTestId('listing-details').first()
    if ((await details.locator('a[href^="tel:"]').count()) === 0) continue
    return details
  }
  return null
}

test('the header’s Set location takes a fingertip', async ({ page }) => {
  await defaultCommunity(page)
  await ready(page)
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
  await ready(page)
  const all = page.getByRole('button', { name: 'All', exact: true }).locator('visible=true').first()
  await expectFingerSized(all, 'the All chip')
})

// Nov 19 (board A): a contact's phones sat side by side 4px apart, its
// email small under them, too close for a 44px tap each without one
// reaching the next number. Each is now a row of its own.
test('a contact’s phones and email each take a fingertip', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  type Entry = { phones?: string[]; email?: string }
  let found: { category: string; id: string } | null = null
  for (const category of await categories(request, community)) {
    const keys = ((category as unknown as { detailFields?: { key: string; type: string }[] }).detailFields ?? []).filter((f) => f.type === 'contacts').map((f) => f.key)
    if (!keys.length) continue
    const body = (await (await request.get(`/api/resources?category=${category.id}&community=${community}`)).json()) as { resources?: Record<string, unknown>[] }
    // One contact with two ways to reach it: the case where they crowded.
    const item = body.resources?.find((r) =>
      keys.some((k) => Array.isArray(r[k]) && (r[k] as Entry[]).some((e) => (e.phones?.length ?? 0) + (e.email ? 1 : 0) >= 2)),
    )
    if (item) {
      found = { category: category.id, id: String(item.id) }
      break
    }
  }
  test.skip(!found, 'no contact here has two ways to reach it')

  await page.goto(`/${community}/${found!.category}/${found!.id}`)
  await ready(page)
  const contacts = page.getByTestId('contact')
  await expect(contacts.first()).toBeVisible()
  const reach = 'a[href^="tel:"], a[href^="mailto:"]'
  let links = contacts.first().locator(reach)
  for (let i = 0; i < (await contacts.count()); i++) {
    links = contacts.nth(i).locator(reach)
    if ((await links.count()) >= 2) break
  }
  expect(await links.count(), 'two ways to reach one contact').toBeGreaterThanOrEqual(2)
  for (let i = 0; i < (await links.count()); i++) await expectFingerSized(links.nth(i), `the contact’s link ${i + 1}`)
})
