import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PAGE_SLUGS } from '@/lib/pagesStore'

// Saving a page has to invalidate BOTH the shared `pages` tag and the page's
// own path.
//
// The tag alone is demonstrably not always enough. e2e-cache's /about test
// fails intermittently with x-nextjs-cache HIT on every poll — the page's own
// cached entry never even reaching STALE — while the stored row provably holds
// the new body. The mechanism is still unknown and does not reproduce on
// demand (warm server 15/15 and 12/12 clean, cold build 5/5 clean, CI fails
// repeatedly), but the symptom is exactly "this path's entry was not marked",
// and revalidatePath marks it.
//
// Asserted from the source because both calls are one line each, invisible in
// any local run that happens to pass, and the failure they guard against
// looks like flakiness rather than a missing call.
const ROUTE = readFileSync('src/app/api/admin/pages/[slug]/route.ts', 'utf-8')

describe('saving a page invalidates the public route', () => {
  it('invalidates the shared pages tag', () => {
    expect(ROUTE).toMatch(/revalidateTag\(\s*TAGS\.pages/)
  })

  it("also invalidates the page's own path", () => {
    expect(
      /revalidatePath\(\s*`\/\$\{slug\}`\s*\)/.test(ROUTE),
      'the tag alone has been observed not to mark the page entry — see this file’s note',
    ).toBe(true)
  })

  it('derives the path from the slug rather than listing routes by hand', () => {
    // A hand-written list is how /privacy would get one and /about not. The
    // public route IS the slug, and PAGE_SLUGS is the closed set both the
    // route and the store share.
    for (const slug of PAGE_SLUGS) {
      expect(ROUTE).not.toContain(`revalidatePath('/${slug}')`)
    }
    expect(PAGE_SLUGS.length).toBeGreaterThan(1)
  })
})
