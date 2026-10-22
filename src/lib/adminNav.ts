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
  | 'archived'
  | 'site'
  | 'desktop'
  | 'mobile'
  | 'campaigns'
  | 'metrics'
  | 'searches'
  | 'questions'
  | 'watches'
  | 'team'
  | 'communities'

export type AdminTabLink = { tab: AdminTab; href: string; label: string }

// Fifteen tabs in one row stopped being readable (Oct 22), so they sit in
// five groups: the top row is the groups, the second row is the open
// group's tabs. Every page keeps its own URL — the open group is whichever
// one holds the tab the current path belongs to (adminNavPosition below).
export type AdminGroup = 'todo' | 'listings' | 'look' | 'insights' | 'settings'

export type AdminGroupLinks = { group: AdminGroup; label: string; href: string; tabs: AdminTabLink[] }

// `isSuperAdmin`: whether to include the Communities tab at all — its own
// route (and the GET /api/admin/communities it reads) are already
// superadmin-gated server-side (see CommunityManager's own comment), but
// leaving the tab visible to every ordinary community admin just handed
// them a click that always dead-ends in "Only the site owner can create or
// browse other communities" instead of not offering it in the first place.
export function adminGroups(community: string, isSuperAdmin: boolean): AdminGroupLinks[] {
  const base = adminBase(community)
  const groups: Omit<AdminGroupLinks, 'href'>[] = [
    {
      group: 'todo',
      label: 'To do',
      tabs: [
        { tab: 'queue', href: base, label: 'Moderation queue' },
        // What the guide keeps current on its own, a row per job (Oct 21):
        // Dishes (each food place's main dishes, read off its own menu, which
        // was a tab of its own), Hospitals (from Refuah), and the pages it
        // reads every morning (Keystone-K's list, shul times pages).
        { tab: 'watches', href: `${base}/watches`, label: 'Watches' },
        // How the AI reader read what people asked, approvable as rules.
        { tab: 'questions', href: `${base}/questions`, label: 'Read questions' },
        { tab: 'responses', href: `${base}/responses`, label: 'Responses' },
      ],
    },
    {
      group: 'listings',
      label: 'Listings',
      tabs: [
        { tab: 'categories', href: `${base}/categories`, label: 'Categories' },
        // Seasonal promotions (a "Sukkah Map" every Sukkot, or whatever the next
        // one-off is) — see CampaignBannerManager's own doc.
        { tab: 'campaigns', href: `${base}/campaigns`, label: 'Campaigns' },
        { tab: 'archived', href: `${base}/archived`, label: 'Archived' },
      ],
    },
    {
      group: 'look',
      label: 'Look',
      // Split from one combined "Desktop & mobile" tab into two — the desktop
      // redesign grew enough device-only settings (top nav, the hero band,
      // the Browse card's own copy, the home-screen accent color) that a
      // device toggle inside one tab stopped scaling; each device now gets
      // its own tab, same as Site, all three sharing one draft/Save (see
      // SiteSettingsLayout) — which is why they're one group.
      tabs: [
        { tab: 'site', href: `${base}/site`, label: 'Site' },
        { tab: 'desktop', href: `${base}/desktop`, label: 'Desktop' },
        { tab: 'mobile', href: `${base}/mobile`, label: 'Mobile' },
      ],
    },
    {
      group: 'insights',
      label: 'Insights',
      tabs: [
        { tab: 'metrics', href: `${base}/metrics`, label: 'Metrics' },
        // What visitors searched for and didn't find: the seeding to-do list.
        { tab: 'searches', href: `${base}/searches`, label: 'Missed searches' },
        // Held back from the site for now (see features.ts).
        ...(features.whatChanged ? [{ tab: 'changes' as const, href: `${base}/changes`, label: 'What changed' }] : []),
      ],
    },
    {
      group: 'settings',
      label: 'Settings',
      tabs: [
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
      ],
    },
  ]
  // A group's own link opens its first tab.
  return groups.map((g) => ({ ...g, href: g.tabs[0].href }))
}

/** Every tab, in nav order — the groups above, flattened. */
export function adminTabs(community: string, isSuperAdmin: boolean): AdminTabLink[] {
  return adminGroups(community, isSuperAdmin).flatMap((g) => g.tabs)
}

// Pages that are no tab of their own but are reached from one, so the nav
// stays on that tab while you're there: /history/approved and
// /history/rejected are what the Metrics tiles open.
const TAB_ALSO_COVERS: Partial<Record<AdminTab, string[]>> = {
  metrics: ['/history'],
}

/** Which group is open and which tab is lit, for the current path. The
 *  queue (the console's own base URL) only matches exactly — every other
 *  href starts with it. Any other tab matches its own path and everything
 *  under it ('/philly/admin/categories' also covers the editor at
 *  /philly/admin/categories/cat:<id>). A path no tab owns opens nothing. */
export function adminNavPosition(
  pathname: string,
  community: string,
  isSuperAdmin: boolean,
): { group: AdminGroup; tab: AdminTab } | null {
  const base = adminBase(community)
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  for (const g of adminGroups(community, isSuperAdmin)) {
    for (const t of g.tabs) {
      const paths = t.href === base ? [] : [t.href, ...(TAB_ALSO_COVERS[t.tab] ?? []).map((p) => `${base}${p}`)]
      if (t.href === base ? pathname === base : paths.some(under)) return { group: g.group, tab: t.tab }
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
