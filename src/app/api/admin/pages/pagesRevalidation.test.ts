import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PAGE_SLUGS } from '@/lib/pagesStore'

// Saving a page has to invalidate the shared `pages` tag, the page's own path
// for every community, and — after a delay — the route once more.
//
// The last one is the fix for e2e-cache's /about failure (every poll HIT/old
// while the row held the new body). Next stamps a page entry with the time it
// is written, so a regeneration already running when the save invalidated the
// page — reading the old row — was stored as newer than the invalidation and
// served as fresh for days. See revalidateAfterInFlightRenders.ts.
//
// Asserted from the source because each is one line, invisible in any local
// run that happens not to hit the race, and the failure they guard against
// looks like flakiness rather than a missing call. e2e-cache's
// "mid-regeneration" test proves the behaviour end to end.
const ROUTE = readFileSync('src/app/api/admin/pages/[slug]/route.ts', 'utf-8')

describe('saving a page invalidates the public route', () => {
  it('invalidates the shared pages tag', () => {
    expect(ROUTE).toMatch(/revalidateTag\(\s*TAGS\.pages/)
  })

  it("also expires the page's own path, for every community", () => {
    expect(ROUTE).toMatch(/revalidatePath\(\s*routes\[slug\]\(c\.slug\)\s*\)/)
    // /about and /privacy live under /[community] — one shared `page` row,
    // but a URL per community — so this loops over every community rather
    // than revalidating a single hand-typed path.
    expect(ROUTE).toMatch(/for \(const c of communities\)/)
  })

  it('invalidates the route again once in-flight renders have finished, by its pattern', () => {
    // The pattern, not routes[slug](c.slug) a second time: Next drops a
    // revalidation repeated within one request, so repeating the concrete
    // path would schedule a second pass that silently does nothing.
    expect(ROUTE).toMatch(/revalidateRouteAfterInFlightRenders\(\s*routes\[slug\]\('\[community\]'\)\s*\)/)
  })

  it('derives the path from the slug rather than listing routes by hand', () => {
    // A hand-written list is how /privacy would get one and /about not. The
    // public route IS the slug, and PAGE_SLUGS is the closed set both the
    // route and the store share.
    for (const slug of PAGE_SLUGS) {
      expect(ROUTE).not.toContain(`revalidatePath('/${slug}')`)
      expect(ROUTE).not.toContain(`revalidatePath(\`/${slug}\`)`)
      expect(ROUTE).not.toContain(`'/[community]/${slug}'`)
    }
    expect(PAGE_SLUGS.length).toBeGreaterThan(1)
  })
})
