import { cookies } from 'next/headers'
import { ADMIN_COMMUNITY_COOKIE } from './configCommunity'
import { resolveCommunity, type Community } from './communityStore'

// ─────────────────────────────────────────────────────────────────────────────
// Which community the admin console is currently editing.
//
// The console lives outside /[community] (one console, not a public screen —
// see admin/layout.tsx), so it can't resolve community from the URL the way
// the public site does. Instead the admin's own switcher (see
// AdminCommunitySwitcher.tsx) writes ADMIN_COMMUNITY_COOKIE, and every read
// here — a server component via next/headers, an API route via the request's
// Cookie header — reads it back and resolves it the same way resolveCommunity
// already does for the public API: an unknown or missing slug falls back to
// the default community rather than erroring, so a stale cookie (a removed
// community, a fresh browser) never locks the console out.
// ─────────────────────────────────────────────────────────────────────────────

export { ADMIN_COMMUNITY_COOKIE }

/** For server components/layouts under /admin — reads the cookie via
 *  next/headers rather than a Request object. */
export async function adminCommunityFromCookies(): Promise<Community> {
  const store = await cookies()
  return resolveCommunity(store.get(ADMIN_COMMUNITY_COOKIE)?.value ?? null)
}

/** For /api/admin/* route handlers, which only have the raw Request — same
 *  origin fetches (every admin fetch call in the console) send cookies
 *  automatically, so this needs no client-side change to reach every route. */
export async function adminCommunityFromRequest(request: Request): Promise<Community> {
  return resolveCommunity(adminCommunitySlugFromRequest(request))
}

/** Parses the cookie's value out of a raw `Cookie` request header. Exported
 *  mainly for testing — route handlers should use adminCommunityFromRequest. */
export function adminCommunitySlugFromRequest(request: Request): string | null {
  const header = request.headers.get('cookie') ?? ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${ADMIN_COMMUNITY_COOKIE}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}
