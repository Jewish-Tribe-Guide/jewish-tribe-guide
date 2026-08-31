/** Remembers the last community read on this device, for the "/" redirect.
 *
 *  Defined here rather than in communityContext.tsx because that file is a
 *  `'use client'` module, and importing one into proxy.ts silently gave the
 *  proxy an undefined cookie name — so a remembered community was read as
 *  absent and every visitor was sent to the default. */
export const COMMUNITY_COOKIE = 'jpc_community'

/** Which community the admin console is editing. Separate from COMMUNITY_COOKIE
 *  (the public "/" redirect hint) because the two are unrelated: an admin
 *  browsing /ues on the public site and editing Philly in another tab is a
 *  normal, expected split. There is one shared /admin console (no per-community
 *  admin route yet — see admin/layout.tsx), and this cookie is what tells it
 *  which community's content to load and write to. */
export const ADMIN_COMMUNITY_COOKIE = 'jpc_admin_community'

/** The implicit single community a database with no `community` rows behaves
 *  as, and the slug "/" falls back to when nothing better is known.
 *
 *  In its own module so `proxy.ts` can import it. The proxy runs before
 *  rendering, on every request it matches, and importing communityStore there
 *  would drag the Supabase client in with it for the sake of one string. */
export const CONFIG_COMMUNITY_SLUG = 'philly'

/** A plausible community slug. Used by the proxy to decide whether a value
 *  from a cookie is worth redirecting to at all — it can't reach the database
 *  to check that the community really exists, so this is a shape check, not an
 *  existence check. An unknown-but-well-formed slug 404s at the route, which
 *  is the correct answer for a community that has been renamed or removed. */
export function looksLikeCommunitySlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
}
