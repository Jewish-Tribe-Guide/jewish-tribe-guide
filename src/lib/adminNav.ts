// /admin and /inbox's real, externally-visible URLs — masked via a rewrite in
// next.config.ts onto the actual (unprefixed) route files, since both live
// outside /[community] and would otherwise inherit its public SiteChrome (see
// src/app/admin/layout.tsx's own comment). Every internal link/pathname
// comparison in the admin UI should go through these rather than a literal
// '/admin' string, so they stay correct against what the browser's address
// bar (and usePathname()) actually shows post-rewrite.
//
// 'philly' is hardcoded — admin is still one global console, not
// per-community (same doc'd limitation); generalize this alongside that if
// real per-community admin ever happens.
export const ADMIN_BASE = '/philly/admin'
export const INBOX_BASE = '/philly/inbox'

// The admin's own tab bar — one ordered list instead of two things (a label
// map plus a separately-maintained render-order array) that could drift
// apart, which is exactly what happened before this: TAB_LABELS' own key
// order didn't match the array AdminTabs actually rendered from.
export type AdminTab = 'queue' | 'categories' | 'responses' | 'archived' | 'site' | 'home' | 'metrics'

export const ADMIN_TABS: { tab: AdminTab; href: string; label: string }[] = [
  { tab: 'queue', href: ADMIN_BASE, label: 'Moderation queue' },
  { tab: 'metrics', href: `${ADMIN_BASE}/metrics`, label: 'Metrics' },
  { tab: 'responses', href: `${ADMIN_BASE}/responses`, label: 'Responses' },
  { tab: 'archived', href: `${ADMIN_BASE}/archived`, label: 'Archived' },
  { tab: 'site', href: `${ADMIN_BASE}/site`, label: 'Site' },
  // Not "Home page" any more — what's left here is whatever exists on exactly
  // one of the two devices, and the mobile tab bar shows on every phone screen,
  // not just the home one.
  { tab: 'home', href: `${ADMIN_BASE}/home`, label: 'Desktop & mobile' },
  { tab: 'categories', href: `${ADMIN_BASE}/categories`, label: 'Categories' },
]
