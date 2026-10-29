import { features } from './features'

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
  | 'changes'
  | 'categories'
  | 'responses'
  | 'places'
  | 'home'
  | 'forms'
  | 'menus'
  | 'pages'
  | 'campaigns'
  | 'metrics'
  | 'searches'
  | 'watches'
  | 'team'
  | 'community'
  | 'communities'

export type AdminTabLink = { tab: AdminTab; href: string; label: string }

// The console's four areas and a gear (the admin redesign, Oct 28): To do,
// Places, Site and Reports, with Settings set apart at the bottom of the
// sidebar and behind the gear on a phone. Every page keeps its own URL; the
// open area is whichever one holds the tab the current path belongs to
// (adminNavPosition below). An area with more than one page shows them as
// tabs under its heading, until the later steps fold them together. To do
// shows none: its other pages open from its list, with a way back.
export type AdminArea = 'todo' | 'places' | 'site' | 'reports' | 'settings'

export type AdminAreaLinks = { area: AdminArea; label: string; href: string; tabs: AdminTabLink[] }

// `isSuperAdmin`: whether to include the Communities tab at all. Its route
// and the GET /api/admin/communities it reads are superadmin-only
// server-side, so for anyone else it would only ever dead-end.
export function adminAreas(community: string, isSuperAdmin: boolean): AdminAreaLinks[] {
  const base = adminBase(community)
  const areas: Omit<AdminAreaLinks, 'href'>[] = [
    {
      area: 'todo',
      label: 'To do',
      tabs: [
        // One list (step 2), opened from its rows rather than tabs: the
        // others are where its bottom rows lead.
        { tab: 'queue', href: base, label: 'To do' },
        { tab: 'watches', href: `${base}/watches`, label: 'Watches' },
        { tab: 'searches', href: `${base}/searches`, label: 'Searches' },
        { tab: 'responses', href: `${base}/responses`, label: 'Responses' },
      ],
    },
    {
      area: 'places',
      label: 'Places',
      // Every listing in one list; archived ones are a filter on it.
      tabs: [{ tab: 'places', href: `${base}/places`, label: 'Places' }],
    },
    {
      area: 'site',
      label: 'Site',
      // Screen by screen, each tab the screen it changes (step 4). Home page
      // and Header and menus share one draft and one Save (see
      // SiteSettingsLayout). About and Privacy is one copy for every
      // community, so only the site owner has it.
      tabs: [
        { tab: 'home', href: `${base}/home`, label: 'Home page' },
        { tab: 'categories', href: `${base}/categories`, label: 'Category pages' },
        { tab: 'forms', href: `${base}/forms`, label: 'Forms' },
        { tab: 'menus', href: `${base}/menus`, label: 'Header and menus' },
        { tab: 'campaigns', href: `${base}/campaigns`, label: 'Campaigns' },
        ...(isSuperAdmin ? [{ tab: 'pages' as const, href: `${base}/pages`, label: 'About and Privacy' }] : []),
      ],
    },
    {
      area: 'reports',
      label: 'Reports',
      tabs: [
        // One page (step 5); History opens from its last row.
        { tab: 'metrics', href: `${base}/metrics`, label: 'Reports' },
        // Held back from the site for now (see features.ts).
        ...(features.whatChanged ? [{ tab: 'changes' as const, href: `${base}/changes`, label: 'What changed' }] : []),
      ],
    },
    {
      area: 'settings',
      label: 'Settings',
      tabs: [
        { tab: 'team', href: `${base}/team`, label: 'Team' },
        { tab: 'community', href: `${base}/community`, label: 'Community' },
        ...(isSuperAdmin ? [{ tab: 'communities' as const, href: `${base}/communities`, label: 'Communities' }] : []),
      ],
    },
  ]
  // An area's own link opens its first tab.
  return areas.map((a) => ({ ...a, href: a.tabs[0].href }))
}

/** Every tab, in nav order — the areas above, flattened. */
export function adminTabs(community: string, isSuperAdmin: boolean): AdminTabLink[] {
  return adminAreas(community, isSuperAdmin).flatMap((a) => a.tabs)
}

// Paths a tab covers besides its own: History (/history/approved and
// /history/rejected) is part of Reports.
const TAB_ALSO_COVERS: Partial<Record<AdminTab, string[]>> = {
  metrics: ['/history'],
}

/** Which area is open and which tab is lit, for the current path. The
 *  queue (the console's own base URL) only matches exactly — every other
 *  href starts with it. Any other tab matches its own path and everything
 *  under it ('/philly/admin/categories' also covers the editor at
 *  /philly/admin/categories/cat:<id>). A path no tab owns opens nothing. */
export function adminNavPosition(
  pathname: string,
  community: string,
  isSuperAdmin: boolean,
): { area: AdminArea; tab: AdminTab } | null {
  const base = adminBase(community)
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  for (const a of adminAreas(community, isSuperAdmin)) {
    for (const t of a.tabs) {
      const paths = t.href === base ? [] : [t.href, ...(TAB_ALSO_COVERS[t.tab] ?? []).map((p) => `${base}${p}`)]
      if (t.href === base ? pathname === base : paths.some(under)) return { area: a.area, tab: t.tab }
    }
  }
  return null
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
