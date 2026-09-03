import { describe, expect, it } from 'vitest'
import { adminTabs, superAdminTabs } from './adminNav'

// Real bug: the Communities tab used to render for every community's admin,
// even though the route underneath it (and the GET /api/admin/communities it
// reads) is superadmin-only — an ordinary admin who clicked it just landed on
// "Only the site owner can create or browse other communities" instead of the
// tab simply not being offered.
describe('adminTabs', () => {
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

describe('superAdminTabs', () => {
  it('lists Communities and Pages, both under /admin', () => {
    expect(superAdminTabs()).toEqual([
      { tab: 'communities', href: '/admin', label: 'Communities' },
      { tab: 'pages', href: '/admin/pages', label: 'Pages' },
    ])
  })
})
