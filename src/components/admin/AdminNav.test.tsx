// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import AdminNav from './AdminNav'

const nav = vi.hoisted(() => ({ pathname: '/philly/admin', superAdmin: false }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/lib/communityContext', () => ({ useCommunitySlug: () => 'philly' }))
vi.mock('./AdminAuthGate', () => ({ useIsSuperAdmin: () => nav.superAdmin }))
vi.mock('@/lib/features', () => ({ features: { todayHome: false, whatChanged: false } }))

afterEach(cleanup)

function show(pathname: string, superAdmin = false) {
  nav.pathname = pathname
  nav.superAdmin = superAdmin
  render(<AdminNav />)
  const groups = screen.getByRole('navigation', { name: 'Admin' }).firstElementChild as HTMLElement
  return {
    groups: within(groups).getAllByRole('link').map((a) => a.textContent),
    openGroup: within(groups).getAllByRole('link').find((a) => a.getAttribute('aria-current'))?.textContent,
    tabs: screen.queryByTestId('admin-subnav') ? within(screen.getByTestId('admin-subnav')).getAllByRole('link') : [],
  }
}

// Fifteen tabs in one row became two (Oct 22): the five groups on top, the
// open group's tabs underneath, and the open group comes from the URL.
describe('AdminNav', () => {
  it('shows the five groups on top and only the open group\'s tabs underneath', () => {
    const { groups, openGroup, tabs } = show('/philly/admin/categories/cat:abc')
    expect(groups).toEqual(['To do', 'Listings', 'Look', 'Insights', 'Settings'])
    expect(openGroup).toBe('Listings')
    expect(tabs.map((a) => a.textContent)).toEqual(['Categories', 'Campaigns', 'Archived'])
    expect(tabs.map((a) => a.getAttribute('aria-current'))).toEqual(['page', null, null])
    expect(screen.queryByRole('link', { name: 'Moderation queue' })).toBeNull()
  })

  it('links each group to its first tab', () => {
    show('/philly/admin')
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href('To do')).toBe('/philly/admin')
    expect(href('Listings')).toBe('/philly/admin/categories')
    expect(href('Look')).toBe('/philly/admin/site')
    expect(href('Insights')).toBe('/philly/admin/metrics')
    expect(href('Settings')).toBe('/philly/admin/team')
  })

  it('opens To do on the queue', () => {
    const { openGroup, tabs } = show('/philly/admin')
    expect(openGroup).toBe('To do')
    expect(tabs.map((a) => a.textContent)).toEqual(['Moderation queue', 'Watches', 'Read questions', 'Responses'])
    expect(tabs[0]).toHaveAttribute('aria-current', 'page')
  })

  it('offers Communities under Settings to the site owner only', () => {
    expect(show('/philly/admin/team').tabs.map((a) => a.textContent)).toEqual(['Team'])
    cleanup()
    expect(show('/philly/admin/team', true).tabs.map((a) => a.textContent)).toEqual(['Team', 'Communities'])
  })

  it('opens no group and shows no second row on a path no tab owns', () => {
    const { openGroup, tabs } = show('/philly/admin/nowhere')
    expect(openGroup).toBeUndefined()
    expect(tabs).toEqual([])
  })
})
