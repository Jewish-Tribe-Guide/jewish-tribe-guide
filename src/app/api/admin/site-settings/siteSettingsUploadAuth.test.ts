import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A community-only admin (on that community's own `admin_emails`, not the
// global SUPERADMIN_EMAILS env var) could load and save every other part of
// the Site Settings editor, but a real click on "Upload image" or on the
// photo preview to reposition/re-zoom it 401'd with "Not authorized." — the
// upload routes checked the caller against getAdminUser (global-only), while
// GET/PATCH /api/admin/site-settings (and every other community-scoped admin
// route — category/form editors, the moderation queue, …) check
// getAdminUserForCommunity instead. Pasting a URL directly "worked" only
// because that path never calls either route — it's client-side state, not a
// working alternative.
//
// Asserted from the source (same technique pagesRevalidation.test.ts uses):
// both calls are one line each, and a route silently reverting to the
// global-only check would otherwise only surface as a support report from a
// real community admin, not a local test failure.
const HERO_ROUTE = readFileSync('src/app/api/admin/site-settings/hero-image/route.ts', 'utf-8')
const LOGO_ROUTE = readFileSync('src/app/api/admin/site-settings/logo/route.ts', 'utf-8')

describe('the hero photo / logo upload routes use community-scoped admin auth', () => {
  it('hero-image: checks getAdminUserForCommunity, not the global-only getAdminUser', () => {
    expect(HERO_ROUTE).toMatch(/getAdminUserForCommunity\(/)
    // Not `getAdminUser(` on its own — note "getAdminUserForCommunity(" does
    // NOT match this pattern (the char right after "getAdminUser" there is
    // "F", not "("), so this only catches the bare, global-only call.
    expect(HERO_ROUTE).not.toMatch(/getAdminUser\(/)
  })

  it('logo: checks getAdminUserForCommunity, not the global-only getAdminUser', () => {
    expect(LOGO_ROUTE).toMatch(/getAdminUserForCommunity\(/)
    expect(LOGO_ROUTE).not.toMatch(/getAdminUser\(/)
  })
})
