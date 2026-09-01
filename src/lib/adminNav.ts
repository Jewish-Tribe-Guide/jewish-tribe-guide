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
  | 'pages'
  | 'team'
  | 'communities'

export function adminTabs(community: string): { tab: AdminTab; href: string; label: string }[] {
  const base = adminBase(community)
  return [
    { tab: 'queue', href: base, label: 'Moderation queue' },
    { tab: 'metrics', href: `${base}/metrics`, label: 'Metrics' },
    { tab: 'responses', href: `${base}/responses`, label: 'Responses' },
    { tab: 'archived', href: `${base}/archived`, label: 'Archived' },
    { tab: 'site', href: `${base}/site`, label: 'Site' },
    { tab: 'pages', href: `${base}/pages`, label: 'Pages' },
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
    // admin route to put it on instead.
    { tab: 'communities', href: `${base}/communities`, label: 'Communities' },
  ]
}
