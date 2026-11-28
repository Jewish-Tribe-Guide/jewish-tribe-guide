import { describe, expect, it, vi } from 'vitest'
import { adminAreas, adminNavPosition, adminTabs, superAdminTabs, type AdminArea, type AdminTab } from './adminNav'

const features = vi.hoisted(() => ({ todayHome: false }))
vi.mock('./features', () => ({ features }))

// Real bug: the Communities tab used to render for every community's admin,
// even though the route underneath it (and the GET /api/admin/communities it
// reads) is superadmin-only — an ordinary admin who clicked it just landed on
// "Only the site owner can create or browse other communities" instead of the
// tab simply not being offered.
describe('adminTabs', () => {
  // What changed opens from a row on Reports (ReportsPanel), not a tab:
  // Reports is one page (step 5).
  it('has no What changed tab', () => {
    expect(adminTabs('philly', true).find((t) => t.tab === 'changes')).toBeUndefined()
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

  // Communities and About and Privacy are cross-community, so each has one
  // address, in the superadmin console (/admin); the community's menu links
  // there rather than keeping a second copy (the user, Nov 18).
  it('includes the Communities tab for a superadmin, opening the superadmin console', () => {
    const tabs = adminTabs('philly', true)
    expect(tabs.find((t) => t.tab === 'communities')).toEqual({
      tab: 'communities',
      href: '/admin',
      label: 'Communities',
    })
  })

  it('every other tab is present regardless of superadmin status', () => {
    const nonSuperTabs = adminTabs('philly', false).map((t) => t.tab)
    const superTabs = adminTabs('philly', true).map((t) => t.tab)
    expect(superTabs.filter((t) => t !== 'communities' && t !== 'pages')).toEqual(nonSuperTabs)
  })

  // About and Privacy is one copy for every community, edited through
  // /api/admin/pages, which only the site owner passes. It used to be a tab
  // every admin saw and dead-ended in "Not authorized" for all but one;
  // under Site now (brief question 5), it has the same guard Communities
  // has, so nobody else sees it at all.
  it('offers About and Privacy to the site owner only', () => {
    expect(adminTabs('philly', false).find((t) => t.tab === 'pages')).toBeUndefined()
    expect(adminTabs('philly', true).find((t) => t.tab === 'pages')).toEqual({
      tab: 'pages',
      href: '/admin/pages',
      label: 'About and Privacy',
    })
  })
})

// The admin redesign's four areas and a gear (brief agreed Oct 28), in
// order, each with today's screens as its tabs until the later steps fold
// them together.
describe('adminAreas', () => {
  const shape = (superAdmin: boolean) =>
    adminAreas('philly', superAdmin).map((a) => [a.label, a.tabs.map((t) => t.label)])

  it('is To do, Places, Watches, Site, Reports and Settings, Communities only for a superadmin', () => {
    expect(shape(true)).toEqual([
      ['To do', ['To do', 'Feedback']],
      ['Places', ['Places']],
      ['Watches', ['Watches']],
      ['Site', ['Home page', 'Category pages', 'Campaigns', 'About and Privacy']],
      ['Reports', ['Reports']],
      ['Settings', ['Team', 'Default location', 'Communities']],
    ])
    expect(shape(false).at(-1)).toEqual(['Settings', ['Team', 'Default location']])
    expect(shape(false)[3]).toEqual(['Site', ['Home page', 'Category pages', 'Campaigns']])
  })

  it('puts every tab in exactly one area', () => {
    for (const superAdmin of [false, true]) {
      const grouped = adminAreas('philly', superAdmin).flatMap((a) => a.tabs.map((t) => t.tab))
      expect(new Set(grouped).size).toBe(grouped.length)
      expect(grouped).toEqual(adminTabs('philly', superAdmin).map((t) => t.tab))
    }
  })

  it("links each area to its first tab, and every href is under the community's console but the two cross-community ones", () => {
    for (const g of adminAreas('ues', true)) {
      expect(g.href).toBe(g.tabs[0].href)
      for (const t of g.tabs) {
        if (t.tab === 'pages' || t.tab === 'communities') expect(t.href.startsWith('/admin')).toBe(true)
        else expect(t.href === '/ues/admin' || t.href.startsWith('/ues/admin/')).toBe(true)
      }
    }
  })
})

describe('adminNavPosition', () => {
  const cases: [string, AdminArea, AdminTab][] = [
    ['/philly/admin', 'todo', 'queue'],
    // Opened from Reports since Nov 25 (item 95).
    // Its own area since Nov 28 (tracker 108).
    ['/philly/admin/watches', 'watches', 'watches'],
    ['/philly/admin/watches/place/x', 'watches', 'watches'],
    // Opened from Reports, like History; To do shows only what's waiting.
    ['/philly/admin/searches', 'reports', 'metrics'],
    ['/philly/admin/responses', 'todo', 'responses'],
    ['/philly/admin/places', 'places', 'places'],
    ['/philly/admin/categories', 'site', 'categories'],
    ['/philly/admin/categories/cat:abc', 'site', 'categories'],
    ['/philly/admin/campaigns', 'site', 'campaigns'],
    ['/philly/admin/home', 'site', 'home'],
    // No tab of its own while it's held back; its page still has a place.
    ['/philly/admin/forms', 'site', 'categories'],
    ['/philly/admin/forms/form:abc', 'site', 'categories'],
    ['/philly/admin/metrics', 'reports', 'metrics'],
    ['/philly/admin/history/approved', 'reports', 'metrics'],
    ['/philly/admin/history/rejected', 'reports', 'metrics'],
    ['/philly/admin/team', 'settings', 'team'],
    ['/philly/admin/location', 'settings', 'location'],
  ]
  it.each(cases)('%s opens %s, with %s lit', (path, area, tab) => {
    expect(adminNavPosition(path, 'philly', true)).toEqual({ area, tab })
  })

  // The public What changed page was live, through an admin's tab or header
  // link, while a code switch kept this screen out of the console, so an
  // admin couldn't hide an entry visitors saw (Nov 21).
  it('opens Reports on What changed, which Reports opens', () => {
    expect(adminNavPosition('/philly/admin/changes', 'philly', false)).toEqual({ area: 'reports', tab: 'metrics' })
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
