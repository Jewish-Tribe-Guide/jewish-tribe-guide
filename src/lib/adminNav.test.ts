import { describe, expect, it } from 'vitest'
import { adminTabs } from './adminNav'

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
})
