// The admin's own tab bar — one ordered list instead of two things (a label
// map plus a separately-maintained render-order array) that could drift
// apart, which is exactly what happened before this: TAB_LABELS' own key
// order didn't match the array AdminTabs actually rendered from.
export type AdminTab = 'queue' | 'categories' | 'responses' | 'archived' | 'site' | 'home' | 'metrics'

export const ADMIN_TABS: { tab: AdminTab; href: string; label: string }[] = [
  { tab: 'queue', href: '/admin', label: 'Moderation queue' },
  { tab: 'metrics', href: '/admin/metrics', label: 'Metrics' },
  { tab: 'responses', href: '/admin/responses', label: 'Responses' },
  { tab: 'archived', href: '/admin/archived', label: 'Archived' },
  { tab: 'site', href: '/admin/site', label: 'Site' },
  // Not "Home page" any more — what's left here is whatever exists on exactly
  // one of the two devices, and the mobile tab bar shows on every phone screen,
  // not just the home one.
  { tab: 'home', href: '/admin/home', label: 'Desktop & mobile' },
  { tab: 'categories', href: '/admin/categories', label: 'Categories' },
]
