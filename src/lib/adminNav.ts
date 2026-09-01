// /admin and /inbox's real, externally-visible URLs — masked via a rewrite in
// next.config.ts onto the actual (internal) route files, since both live
// outside /[community] and would otherwise inherit its public SiteChrome (see
// src/app/admin/[community]/layout.tsx's own comment). Every internal
// link/pathname comparison in the admin UI should go through these rather
// than a literal '/admin' string, so they stay correct against what the
// browser's address bar (and usePathname()) actually shows post-rewrite.
//
// Admin is per-community now — /philly/admin and /ues/admin are genuinely
// different route trees (src/app/admin/[community]/...), each locked to its
// own community by the URL itself. `adminBase`/`adminTabs` take the
// community explicitly rather than hardcoding one, so every caller reads its
// community from context (useCommunitySlug()) instead of assuming 'philly'.
export function adminBase(community: string): string {
  return `/${community}/admin`
}

// /inbox has no per-community split (it's a single hospital-facing queue,
// not scoped by community) — stays hardcoded, same known limitation as
// before.
export const INBOX_BASE = '/philly/inbox'

// The admin's own tab bar — one ordered list instead of two things (a label
// map plus a separately-maintained render-order array) that could drift
// apart, which is exactly what happened before this: TAB_LABELS' own key
// order didn't match the array AdminTabs actually rendered from.
export type AdminTab =
  | 'queue'
  | 'categories'
  | 'responses'
  | 'archived'
  | 'site'
  | 'home'
  | 'metrics'
  | 'team'
  | 'communities'

// `isSuperAdmin`: whether to include the Communities tab at all — its own
// route (and the GET /api/admin/communities it reads) are already
// superadmin-gated server-side (see CommunityManager's own comment), but
// leaving the tab visible to every ordinary community admin just handed
// them a click that always dead-ends in "Only the site owner can create or
// browse other communities" instead of not offering it in the first place.
export function adminTabs(community: string, isSuperAdmin: boolean): { tab: AdminTab; href: string; label: string }[] {
  const base = adminBase(community)
  return [
    { tab: 'queue', href: base, label: 'Moderation queue' },
    { tab: 'metrics', href: `${base}/metrics`, label: 'Metrics' },
    { tab: 'responses', href: `${base}/responses`, label: 'Responses' },
    { tab: 'archived', href: `${base}/archived`, label: 'Archived' },
    { tab: 'site', href: `${base}/site`, label: 'Site' },
    // Not "Home page" any more — what's left here is whatever exists on
    // exactly one of the two devices, and the mobile tab bar shows on every
    // phone screen, not just the home one.
    { tab: 'home', href: `${base}/home`, label: 'Desktop & mobile' },
    { tab: 'categories', href: `${base}/categories`, label: 'Categories' },
    // Every one of THIS community's own admins can reach this — see
    // /api/admin/team's own comment — unlike Communities below, which is
    // superadmin-only underneath.
    { tab: 'team', href: `${base}/team`, label: 'Team' },
    // Cross-community: creating a new community isn't an action scoped to
    // whichever one you're currently editing, but this tab still lives
    // under the current community's console — there's no community-less
    // admin route to put it on instead. Superadmin-only — see this
    // function's own doc.
    ...(isSuperAdmin ? [{ tab: 'communities' as const, href: `${base}/communities`, label: 'Communities' }] : []),
  ]
}

// The standalone superadmin console's own tab bar (/admin, no community
// segment — src/app/admin/page.tsx and src/app/admin/pages/page.tsx). Kept
// separate from adminTabs above rather than folded in: those tabs are
// per-community (base derives from a community slug), these two screens are
// genuinely cross-community and live outside every community's own console
// entirely — About/Privacy used to have a "Pages" tab inside
// /{community}/admin too, gated by the same global SUPERADMIN_EMAILS check
// underneath, but that only ever worked for a superadmin and dead-ended in
// "Not authorized" for every other admin of that community, the same
// UX mistake the Communities tab's own isSuperAdmin guard above exists to
// avoid. Moving it here instead of just hiding it means there's exactly one
// admin-emails page, not one that quietly differs per community.
export type SuperAdminTab = 'communities' | 'pages'

export function superAdminTabs(): { tab: SuperAdminTab; href: string; label: string }[] {
  return [
    { tab: 'communities', href: '/admin', label: 'Communities' },
    { tab: 'pages', href: '/admin/pages', label: 'Pages' },
  ]
}
