import { describe, expect, it, vi } from 'vitest'
import { adminAreas, adminNavPosition, adminTabs, superAdminTabs, type AdminArea, type AdminTab } from './adminNav'

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
      const reports = adminAreas('philly', false).find((a) => a.area === 'reports')!
      expect(reports.tabs.at(-1)).toEqual({ tab: 'changes', href: '/philly/admin/changes', label: 'What changed' })
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

// The admin redesign's four areas and a gear (brief agreed Oct 28), in
// order, each with today's screens as its tabs until the later steps fold
// them together.
describe('adminAreas', () => {
  const shape = (superAdmin: boolean) =>
    adminAreas('philly', superAdmin).map((a) => [a.label, a.tabs.map((t) => t.label)])

  it('is To do, Places, Site, Reports and Settings, Communities only for a superadmin', () => {
    expect(shape(true)).toEqual([
      ['To do', ['Suggestions', 'Watches', 'Searches', 'Read questions', 'Responses']],
      ['Places', ['Archived']],
      ['Site', ['Categories', 'Campaigns', 'Basics', 'On a computer', 'On a phone']],
      ['Reports', ['Numbers', 'History']],
      ['Settings', ['Team', 'Communities']],
    ])
    expect(shape(false).at(-1)).toEqual(['Settings', ['Team']])
  })

  it('puts every tab in exactly one area, whatever is switched on', () => {
    for (const whatChanged of [false, true]) {
      features.whatChanged = whatChanged
      try {
        for (const superAdmin of [false, true]) {
          const grouped = adminAreas('philly', superAdmin).flatMap((a) => a.tabs.map((t) => t.tab))
          expect(new Set(grouped).size).toBe(grouped.length)
          expect(grouped).toEqual(adminTabs('philly', superAdmin).map((t) => t.tab))
          expect(grouped.includes('changes')).toBe(whatChanged)
        }
      } finally {
        features.whatChanged = false
      }
    }
  })

  it("links each area to its first tab, and every href is under the community's console", () => {
    for (const g of adminAreas('ues', true)) {
      expect(g.href).toBe(g.tabs[0].href)
      for (const t of g.tabs) expect(t.href === '/ues/admin' || t.href.startsWith('/ues/admin/')).toBe(true)
    }
  })
})

describe('adminNavPosition', () => {
  const cases: [string, AdminArea, AdminTab][] = [
    ['/philly/admin', 'todo', 'queue'],
    ['/philly/admin/watches', 'todo', 'watches'],
    ['/philly/admin/watches/kind/restaurant', 'todo', 'watches'],
    ['/philly/admin/searches', 'todo', 'searches'],
    ['/philly/admin/questions', 'todo', 'questions'],
    ['/philly/admin/responses', 'todo', 'responses'],
    ['/philly/admin/archived', 'places', 'archived'],
    ['/philly/admin/categories', 'site', 'categories'],
    ['/philly/admin/categories/cat:abc', 'site', 'categories'],
    ['/philly/admin/campaigns', 'site', 'campaigns'],
    ['/philly/admin/site', 'site', 'site'],
    ['/philly/admin/desktop', 'site', 'desktop'],
    ['/philly/admin/mobile', 'site', 'mobile'],
    ['/philly/admin/metrics', 'reports', 'metrics'],
    ['/philly/admin/history/approved', 'reports', 'history'],
    ['/philly/admin/history/rejected', 'reports', 'history'],
    ['/philly/admin/team', 'settings', 'team'],
    ['/philly/admin/communities', 'settings', 'communities'],
  ]
  it.each(cases)('%s opens %s, with %s lit', (path, area, tab) => {
    expect(adminNavPosition(path, 'philly', true)).toEqual({ area, tab })
  })

  it('opens Reports on What changed while it is switched on', () => {
    expect(adminNavPosition('/philly/admin/changes', 'philly', false)).toBeNull()
    features.whatChanged = true
    try {
      expect(adminNavPosition('/philly/admin/changes', 'philly', false)).toEqual({ area: 'reports', tab: 'changes' })
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

  it("opens no area on another community's console", () => {
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
