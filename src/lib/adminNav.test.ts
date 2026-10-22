import { describe, expect, it, vi } from 'vitest'
import { adminGroups, adminNavPosition, adminTabs, superAdminTabs, type AdminGroup, type AdminTab } from './adminNav'

const features = vi.hoisted(() => ({ todayHome: false, whatChanged: false }))
vi.mock('./features', () => ({ features }))

// Real bug: the Communities tab used to render for every community's admin,
// even though the route underneath it (and the GET /api/admin/communities it
// reads) is superadmin-only — an ordinary admin who clicked it just landed on
// "Only the site owner can create or browse other communities" instead of the
// tab simply not being offered.
describe('adminTabs', () => {
  // What changed is held back from the site (features.ts): no tab for a
  // page that isn't there, and the tab again once it's switched back on.
  it('has a What changed tab only while What changed is switched on', () => {
    expect(adminTabs('philly', false).find((t) => t.tab === 'changes')).toBeUndefined()
    features.whatChanged = true
    try {
      const insights = adminGroups('philly', false).find((g) => g.group === 'insights')!
      expect(insights.tabs.at(-1)).toEqual({ tab: 'changes', href: '/philly/admin/changes', label: 'What changed' })
    } finally {
      features.whatChanged = false
    }
  })

  // The eruvim moved onto the Categories tab's Eruv row (Oct 22): no
  // category has a tab of its own. /<community>/admin/eruvim redirects
  // there (next.config.ts; e2e/routing.spec.ts).
  it('has no Eruvim tab', () => {
    for (const superAdmin of [false, true]) {
      expect(adminTabs('philly', superAdmin).find((t) => t.label === 'Eruvim' || t.href.endsWith('/eruvim'))).toBeUndefined()
    }
  })

  it('omits the Communities tab for an ordinary (non-superadmin) community admin', () => {
    const tabs = adminTabs('philly', false)
    expect(tabs.find((t) => t.tab === 'communities')).toBeUndefined()
  })

  it('includes the Communities tab for a superadmin', () => {
    const tabs = adminTabs('philly', true)
    expect(tabs.find((t) => t.tab === 'communities')).toEqual({
      tab: 'communities',
      href: '/philly/admin/communities',
      label: 'Communities',
    })
  })

  it('every other tab is present regardless of superadmin status', () => {
    const nonSuperTabs = adminTabs('philly', false).map((t) => t.tab)
    const superTabs = adminTabs('philly', true).map((t) => t.tab)
    expect(superTabs.filter((t) => t !== 'communities')).toEqual(nonSuperTabs)
  })

  // Real bug this replaced: Pages (About/Privacy — a site-wide singleton,
  // not per-community) used to be a tab here too, gated by the same global
  // SUPERADMIN_EMAILS check underneath as Communities — but with no
  // isSuperAdmin guard on the tab itself, so every ordinary admin of a
  // community saw a "Pages" tab that always dead-ended in "Not authorized".
  // It moved to the standalone superadmin console instead (superAdminTabs
  // below) rather than gaining the same guard Communities has, so there's
  // exactly one Pages screen, not a per-community mirage of one.
  it('has no Pages tab at all, for anyone', () => {
    // Label, not `t.tab === 'pages'` — 'pages' isn't a valid AdminTab any
    // more (see the type itself), so that comparison would be a compile
    // error rather than a real runtime check.
    expect(adminTabs('philly', false).find((t) => t.label === 'Pages')).toBeUndefined()
    expect(adminTabs('philly', true).find((t) => t.label === 'Pages')).toBeUndefined()
  })
})

// Fifteen tabs in one row became five groups (Oct 22). The groups as agreed
// with the user, in order, each with its tabs in order.
describe('adminGroups', () => {
  const shape = (superAdmin: boolean) =>
    adminGroups('philly', superAdmin).map((g) => [g.label, g.tabs.map((t) => t.label)])

  it('is the five agreed groups, Communities only for a superadmin', () => {
    expect(shape(true)).toEqual([
      ['To do', ['Moderation queue', 'Watches', 'Read questions', 'Responses']],
      ['Listings', ['Categories', 'Campaigns', 'Archived']],
      ['Look', ['Site', 'Desktop', 'Mobile']],
      ['Insights', ['Metrics', 'Missed searches']],
      ['Settings', ['Team', 'Communities']],
    ])
    expect(shape(false).at(-1)).toEqual(['Settings', ['Team']])
  })

  it('puts every tab in exactly one group, whatever is switched on', () => {
    for (const whatChanged of [false, true]) {
      features.whatChanged = whatChanged
      try {
        for (const superAdmin of [false, true]) {
          const grouped = adminGroups('philly', superAdmin).flatMap((g) => g.tabs.map((t) => t.tab))
          expect(new Set(grouped).size).toBe(grouped.length)
          expect(grouped).toEqual(adminTabs('philly', superAdmin).map((t) => t.tab))
          expect(grouped.includes('changes')).toBe(whatChanged)
        }
      } finally {
        features.whatChanged = false
      }
    }
  })

  it("links each group to its first tab, and every href is under the community's console", () => {
    for (const g of adminGroups('ues', true)) {
      expect(g.href).toBe(g.tabs[0].href)
      for (const t of g.tabs) expect(t.href === '/ues/admin' || t.href.startsWith('/ues/admin/')).toBe(true)
    }
  })
})

describe('adminNavPosition', () => {
  const cases: [string, AdminGroup, AdminTab][] = [
    ['/philly/admin', 'todo', 'queue'],
    ['/philly/admin/watches', 'todo', 'watches'],
    ['/philly/admin/watches/kosher', 'todo', 'watches'],
    ['/philly/admin/questions', 'todo', 'questions'],
    ['/philly/admin/responses', 'todo', 'responses'],
    ['/philly/admin/categories', 'listings', 'categories'],
    ['/philly/admin/categories/cat:abc', 'listings', 'categories'],
    ['/philly/admin/campaigns', 'listings', 'campaigns'],
    ['/philly/admin/archived', 'listings', 'archived'],
    ['/philly/admin/site', 'look', 'site'],
    ['/philly/admin/desktop', 'look', 'desktop'],
    ['/philly/admin/mobile', 'look', 'mobile'],
    ['/philly/admin/metrics', 'insights', 'metrics'],
    // The Metrics tiles open these.
    ['/philly/admin/history/approved', 'insights', 'metrics'],
    ['/philly/admin/history/rejected', 'insights', 'metrics'],
    ['/philly/admin/searches', 'insights', 'searches'],
    ['/philly/admin/team', 'settings', 'team'],
    ['/philly/admin/communities', 'settings', 'communities'],
  ]
  it.each(cases)('%s opens %s, with %s lit', (path, group, tab) => {
    expect(adminNavPosition(path, 'philly', true)).toEqual({ group, tab })
  })

  it('opens Insights on What changed while it is switched on', () => {
    expect(adminNavPosition('/philly/admin/changes', 'philly', false)).toBeNull()
    features.whatChanged = true
    try {
      expect(adminNavPosition('/philly/admin/changes', 'philly', false)).toEqual({ group: 'insights', tab: 'changes' })
    } finally {
      features.whatChanged = false
    }
  })

  // A tab's path only covers itself and what's under it, not every path
  // that happens to start with the same letters.
  it('does not light a tab for a sibling path that only shares its prefix', () => {
    expect(adminNavPosition('/philly/admin/sitemap', 'philly', true)).toBeNull()
    expect(adminNavPosition('/philly/admin/teams', 'philly', true)).toBeNull()
  })

  it("opens no group on another community's console", () => {
    expect(adminNavPosition('/ues/admin/categories', 'philly', true)).toBeNull()
  })

  it('opens nothing on Communities for an ordinary admin, who has no such tab', () => {
    expect(adminNavPosition('/philly/admin/communities', 'philly', false)).toBeNull()
  })
})

describe('superAdminTabs', () => {
  it('lists Communities and Pages, both under /admin', () => {
    expect(superAdminTabs()).toEqual([
      { tab: 'communities', href: '/admin', label: 'Communities' },
      { tab: 'pages', href: '/admin/pages', label: 'Pages' },
    ])
  })
})
