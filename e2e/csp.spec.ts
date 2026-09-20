import { expect, test, type Page } from '@playwright/test'
import { categoryWithListings, defaultCommunity, dismissLocationPrompt, ready } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// The Content-Security-Policy ships in report-only mode (src/lib/csp.ts). That
// is only safe to turn into an enforcing policy if it is QUIET on the real
// site: every violation it reports here is something that would have broken in
// enforcing mode — the map, a form, the analytics — for real visitors.
//
// So this loads the pages and opens the interactive states that pull in third
// parties, and fails on any violation the browser reports. It is also what
// stops a later change (a new script, a new API host) from quietly making the
// policy wrong: add the origin to src/lib/csp.ts, not an exception here.
//
// The browser fires `securitypolicyviolation` for report-only policies too, with
// disposition "report"; that event is what is collected.
// ─────────────────────────────────────────────────────────────────────────────

type Violation = { directive: string; blocked: string; source: string; disposition: string }

async function watchForViolations(page: Page): Promise<() => Promise<Violation[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: Violation[] }
    w.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        source: `${e.sourceFile}:${e.lineNumber}`,
        disposition: e.disposition,
      })
    })
  })
  return () => page.evaluate(() => (window as unknown as { __csp: Violation[] }).__csp)
}

const describeViolations = (vs: Violation[]) =>
  vs.map((v) => `${v.directive} <- ${v.blocked || '(inline)'}  [${v.source}]`).join('\n')

test.describe('content security policy (report-only)', () => {
  test('is actually being evaluated, so silence below means something', async ({ page, request }) => {
    const community = await defaultCommunity(page)
    const res = await request.get(`/${community}`)
    const policy = res.headers()['content-security-policy-report-only']

    expect(policy, 'the report-only header').toBeTruthy()
    expect(policy).toContain("default-src 'self'")
    // ...and the one that was already enforced is still there.
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'self'")
  })

  for (const [name, path] of [
    ['the home screen', ''],
    ['the map', '/map'],
    ['About', '/about'],
    ['Feedback', '/feedback'],
  ] as const) {
    test(`${name} triggers no violations`, async ({ page }) => {
      const violations = await watchForViolations(page)
      const community = await defaultCommunity(page)
      await page.goto(`/${community}${path}`)
      if (path === '/map') await page.locator('main').first().waitFor({ state: 'visible' })
      else await ready(page)
      await dismissLocationPrompt(page)
      // Third parties (analytics, the map's own scripts) load after `load`.
      await page.waitForTimeout(6_000)

      const seen = await violations()
      expect(seen, describeViolations(seen)).toEqual([])
    })
  }

  test('a category, a listing and the Add form (Turnstile) trigger no violations', async ({ page, request }) => {
    const violations = await watchForViolations(page)
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    await page.goto(`/${community}/${category.id}`)
    await ready(page)
    await dismissLocationPrompt(page)

    // Opens the Add form, which is what loads Cloudflare's script and frame.
    await page.getByRole('button', { name: 'Add', exact: true }).filter({ visible: true }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(6_000)

    const seen = await violations()
    expect(seen, describeViolations(seen)).toEqual([])
  })
})
