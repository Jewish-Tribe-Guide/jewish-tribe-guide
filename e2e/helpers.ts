import type { Page, APIRequestContext } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers.
//
// Everything here derives what to expect from the running app rather than
// hardcoding it. This is a content-driven site: an admin can rename "Grocery
// Stores", add a community, or archive the last listing in a category. A test
// asserting on "ACME Markets" would fail on a content edit rather than on a
// regression, and a suite that cries wolf gets ignored.
// ─────────────────────────────────────────────────────────────────────────────

// Every content read below goes through this rather than `request.get`
// directly.
//
// These calls are FIXTURES — "which category has an Hours field", "which one
// has listings" — not the behaviour under test. Playwright charges them to
// the same budget as the assertions, and both an API request and a test
// default to 30s, so a single contended read cannot be absorbed by either:
// the request gives up at exactly the moment the test would have.
//
// That is the CI failure this exists for. `mobile.spec.ts`'s hours-editor
// test timed out inside categoryWithHoursField on GET /api/categories — a URL
// warmup.setup.ts had already fetched, so not a cold cache — while 158 tests
// around it passed and the whole local run passed 159/159. What is left is
// CPU contention: `next start` on a two-core runner, serving three parallel
// workers, can queue even a warm read past 30s.
//
// So the request gets its own explicit budget, and playwright.config.ts's
// test timeout sits above it. A dead endpoint still fails, and fails with the
// URL named, rather than as an opaque whole-test timeout. Same reasoning
// warmup.setup.ts already applies to the cold read — this covers the
// contended one, which warming cannot.
const API_TIMEOUT = 45_000

async function apiGet(request: APIRequestContext, url: string): Promise<Record<string, unknown>> {
  const res = await request.get(url, { timeout: API_TIMEOUT })
  if (!res.ok()) throw new Error(`GET ${url} returned ${res.status()}`)
  return (await res.json()) as Record<string, unknown>
}

/** The community slug the site redirects "/" to. */
export async function defaultCommunity(page: Page): Promise<string> {
  const response = await page.goto('/')
  if (!response) throw new Error('No response for "/"')
  const slug = new URL(page.url()).pathname.split('/').filter(Boolean)[0]
  if (!slug) throw new Error(`"/" did not redirect to a community (landed on ${page.url()})`)
  return slug
}

export type Category = {
  id: string
  label: string
  pluralLabel: string
  kind: string
  /** False when the category collects no address at all (WhatsApp groups,
   *  Cemetery). Those aren't distance-based, so nothing measures or prompts
   *  for a location on them — see ResourceLoader's `addressPrompt`. */
  hasAddress?: boolean
}

/** Every category for a community, straight from the app's own API. */
export async function categories(request: APIRequestContext, community: string): Promise<Category[]> {
  const body = await apiGet(request, `/api/categories?community=${community}`)
  if (!body.ok) throw new Error('Could not read categories')
  return body.categories as Category[]
}

/** A listing-kind category that actually has listings, so directory tests
 *  exercise a populated page rather than an empty state. */
export async function categoryWithListings(
  request: APIRequestContext,
  community: string,
): Promise<{ category: Category; count: number }> {
  const all = await categories(request, community)
  for (const category of all.filter((c) => c.kind === 'listing')) {
    const body = await apiGet(request, `/api/resources?category=${category.id}&community=${community}`)
    if (body.ok && (body.resources as unknown[]).length > 0) {
      return { category, count: (body.resources as unknown[]).length }
    }
  }
  throw new Error('No listing category has any listings — cannot test a populated directory')
}

/** A listing-kind category that is actually distance-based — `hasAddress` is
 *  not false — and has listings. For anything asserting on distances or the
 *  location prompt, neither of which exists on a category that collects no
 *  address.
 *
 *  categoryWithListings is NOT a substitute: it returns the first category
 *  with any listings at all, and in the real community that is `cemetery`,
 *  which has hasAddress false. A distance test built on it finds nothing and
 *  fails, having exercised the wrong category — the same trap
 *  categoryWithMapPoints below was added for. It has now caught two tests. */
export async function categoryWithDistances(
  request: APIRequestContext,
  community: string,
): Promise<{ category: Category; count: number }> {
  const all = await categories(request, community)
  for (const category of all.filter((c) => c.kind === 'listing' && c.hasAddress !== false)) {
    const body = await apiGet(request, `/api/resources?category=${category.id}&community=${community}`)
    const resources = (body.resources ?? []) as unknown[]
    if (body.ok && resources.length > 0) return { category, count: resources.length }
  }
  throw new Error('No distance-based listing category has any listings')
}

/** A listing-kind category with an Hours-type field and at least one real
 *  listing, plus that listing itself — for tests that need to open the edit
 *  form's Hours editor on a real listing rather than an empty one. */
export async function categoryWithHoursField(
  request: APIRequestContext,
  community: string,
): Promise<{ category: Category; item: { id: string; name: string } }> {
  // Via categories() rather than its own inline fetch — this used to duplicate
  // that call, and the duplicate is the line CI timed out on.
  const all = (await categories(request, community)) as (Category & {
    detailFields?: { type: string }[]
  })[]
  const withHours = all.filter(
    (c) => c.kind === 'listing' && c.detailFields?.some((f) => f.type === 'hours'),
  )
  for (const category of withHours) {
    const body = await apiGet(request, `/api/resources?category=${category.id}&community=${community}`)
    const resources = body.resources as { id: string; name: string }[]
    if (body.ok && resources.length > 0) {
      return { category, item: resources[0] }
    }
  }
  throw new Error('No listing category with an Hours field has any listings')
}

/** A listing-kind category with at least one listing that actually has map
 *  coordinates — for map-specific tests. Distinct from categoryWithListings:
 *  a category can have real listings and still never produce a pin (no
 *  address collected — some categories turn "Has address" off entirely — so
 *  there's nothing to geocode). ResourceMapView's `allPoints` silently drops
 *  any listing missing `geo`, which means its category never gets a filter
 *  chip either; a map test that picked one of those via categoryWithListings
 *  would wait forever for a chip that can never render (seen for real: an
 *  admin added a "Cemetery" category with `hasAddress: false` and CI started
 *  failing here, not from a bug — see git blame around where this was added). */
export async function categoryWithMapPoints(
  request: APIRequestContext,
  community: string,
): Promise<{ category: Category; count: number }> {
  const all = await categories(request, community)
  for (const category of all.filter((c) => c.kind === 'listing')) {
    const body = await apiGet(request, `/api/resources?category=${category.id}&community=${community}`)
    if (!body.ok) continue
    const withGeo = (body.resources as { geo?: unknown }[]).filter((r) => r.geo)
    if (withGeo.length > 0) return { category, count: withGeo.length }
  }
  throw new Error('No listing category has any map-plottable (geocoded) listings — cannot test the map')
}

/** The listing-kind category with the MOST listings — for tests that need a
 *  page long enough to actually scroll. `categoryWithListings` returns the
 *  first one with any at all, which is routinely a 4-entry category whose
 *  page is shorter than the viewport; a scroll test on that scrolls zero
 *  pixels and then passes or fails for reasons having nothing to do with
 *  what it meant to check. Derived from the running app, not hardcoded —
 *  which category is biggest changes as an admin edits content. */
export async function largestCategory(
  request: APIRequestContext,
  community: string,
): Promise<{ category: Category; count: number }> {
  const all = await categories(request, community)
  let best: { category: Category; count: number } | null = null
  for (const category of all.filter((c) => c.kind === 'listing')) {
    const body = await apiGet(request, `/api/resources?category=${category.id}&community=${community}`)
    const count = body.ok ? (body.resources as unknown[]).length : 0
    if (!best || count > best.count) best = { category, count }
  }
  if (!best || best.count === 0) throw new Error('No listing category has any listings')
  return best
}

/** Dismisses the "Share your live location?" prompt if it's showing.
 *
 *  It's a full-screen overlay that intercepts pointer events, so on mobile —
 *  where it appears on a first visit — nothing else on the page is clickable
 *  until it's dealt with. A real visitor answers it before doing anything else,
 *  so tests do too.
 *
 *  The prompt renders after a data-dependent effect, not on first paint, so
 *  a one-shot `isVisible()` check races it: it can appear moments after the
 *  check passes and intercept whatever the test clicks next. Actively wait a
 *  bit instead — harmless (and fast to resolve) when it never shows up. */
export async function dismissLocationPrompt(page: Page): Promise<void> {
  const notNow = page.getByRole('button', { name: 'Not now' })
  try {
    await notNow.waitFor({ state: 'visible', timeout: 1000 })
  } catch {
    return
  }
  await notNow.click()
  await notNow.waitFor({ state: 'hidden' })
}

/** Waits for the page to be settled enough to assert on.
 *
 *  Deliberately not `networkidle`: the map, the zmanim strip and geolocation
 *  keep connections open, so it never settles on some screens and the test
 *  times out having proved nothing. Playwright discourages it for this reason.
 *  Waiting for the app's own chrome is both faster and a real signal. */
export async function ready(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await page.locator('header').first().waitFor({ state: 'visible' })
}

/** The server's HTML with `<script>` contents removed — i.e. the markup a
 *  browser would actually lay out, minus the data React ships alongside it.
 *
 *  This distinction is the whole point. A React Server Components response
 *  carries every listing name and category label a second time, serialized into
 *  `self.__next_f.push(...)` inside a script tag, whether or not any of it was
 *  rendered. So `expect(html).toContain('Rodeph Shalom Synagogue')` passes on a
 *  page that rendered an empty shell — which is exactly what these tests were
 *  doing, while claiming to prove the opposite.
 *
 *  Streamed content is deliberately kept: React flushes late Suspense content
 *  into `<div hidden>` blocks and moves it with a script, and that content was
 *  still rendered on the server, so it counts. Only the serialized payload goes. */
export function serverMarkup(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

/** Counts requests this document made to the app's own /api/*.
 *
 *  Uses the performance timeline rather than Playwright's network events
 *  because the timeline resets per document. Network events accumulate across
 *  navigations, which produced a false "still fetching" reading during the
 *  server-rendering work.
 *
 *  Scoped to same-origin: Sentry's ingest URL is
 *  `https://<org>.ingest.<region>.sentry.io/api/<project>/envelope/…` — a
 *  bare `/api/` substring match (this test's original form) false-positives
 *  on that once a real `NEXT_PUBLIC_SENTRY_DSN` is configured (Sentry is
 *  inert without one), since Sentry's own path happens to contain `/api/`
 *  too, on a completely different domain. */
export async function apiCallsForThisDocument(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((name) => name.startsWith(`${location.origin}/api/`))
      .map((name) => name.replace(location.origin, '')),
  )
}
