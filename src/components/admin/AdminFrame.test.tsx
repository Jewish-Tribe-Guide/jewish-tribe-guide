// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import AdminFrame from './AdminFrame'
import { AdminBack } from './AdminUI'

const nav = vi.hoisted(() => ({ pathname: '/philly/admin', count: null as number | null }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/lib/communityContext', () => ({ useCommunitySlug: () => 'philly' }))
vi.mock('@/lib/contentContext', () => ({ useSiteSettings: () => ({ name: 'Philly Jewish Guide' }) }))
vi.mock('@/lib/features', () => ({ features: { todayHome: false, whatChanged: false } }))
vi.mock('@/lib/useTodo', () => ({ useTodoCount: () => nav.count }))

afterEach(() => {
  cleanup()
  nav.count = null
})

function show(pathname: string, isSuperAdmin = false) {
  nav.pathname = pathname
  render(
    <AdminFrame isSuperAdmin={isSuperAdmin} email="admin@example.com" token="tok" onSignOut={() => {}}>
      <p>the screen</p>
    </AdminFrame>,
  )
  const sidebar = screen.getByRole('navigation', { name: 'Admin' })
  return {
    sidebar: within(sidebar).getAllByRole('link').map((a) => a.textContent),
    lit: within(sidebar).getAllByRole('link').filter((a) => a.getAttribute('aria-current')).map((a) => a.textContent),
    phoneBar: within(screen.getByRole('navigation', { name: 'Admin areas' })).getAllByRole('link').map((a) => a.textContent),
    heading: screen.getByRole('heading', { level: 1 }).textContent,
  }
}

// The admin redesign's shell (boards 1, 2, 5, 10, 11): four areas, then
// Settings and View the site; the open area's name is the screen's heading.
describe('AdminFrame', () => {
  it('lists the four areas, then Settings and View the site, and lights the open one', () => {
    const { sidebar, lit, heading } = show('/philly/admin/categories/cat:abc')
    expect(sidebar).toEqual(['To do', 'Places', 'Site', 'Reports', 'Settings', 'View the site'])
    expect(lit).toEqual(['Site'])
    // The open tab is the heading, with the way back to Site's list on a
    // phone, where Site's tabs don't fit (board 21).
    expect(heading).toBe('Category pages')
    const back = screen.getByRole('link', { name: '‹ Site' })
    expect(back).toHaveAttribute('href', '/philly/admin/site')
    expect(back).toHaveClass('md:hidden')
    expect(screen.getByRole('navigation', { name: 'Site' })).toHaveClass('hidden', 'md:flex')
  })

  it('puts only the four areas in the phone bar, Settings behind the gear', () => {
    const { phoneBar } = show('/philly/admin')
    expect(phoneBar).toEqual(['To do', 'Places', 'Site', 'Reports'])
    expect(screen.getByLabelText('Settings')).toHaveAttribute('href', '/philly/admin/team')
  })

  it("shows the open area's pages as tabs under the heading, the current one lit", () => {
    show('/philly/admin/menus')
    const tabs = within(screen.getByRole('navigation', { name: 'Site' })).getAllByRole('link')
    expect(tabs.map((a) => a.textContent)).toEqual(['Home page', 'Category pages', 'Forms', 'Header and menus', 'Campaigns'])
    expect(tabs.map((a) => a.getAttribute('aria-current'))).toEqual([null, null, null, 'page', null])
  })

  // Step 2: To do is one list. Its other pages open from it, headed by
  // their own name, with the way back.
  it('shows To do with no tabs, and its other pages with "‹ To do"', () => {
    expect(show('/philly/admin').heading).toBe('To do')
    expect(screen.queryByRole('navigation', { name: 'To do' })).toBeNull()
    expect(screen.queryByRole('link', { name: '‹ To do' })).toBeNull()
    cleanup()
    const { heading, lit } = show('/philly/admin/responses')
    expect(heading).toBe('Responses')
    expect(lit).toEqual(['To do'])
    expect(screen.queryByRole('navigation', { name: 'To do' })).toBeNull()
    for (const back of screen.getAllByRole('link', { name: '‹ To do' })) expect(back).toHaveAttribute('href', '/philly/admin')
  })

  it("counts what To do holds on To do alone, in the sidebar and the phone's bar", () => {
    nav.count = 18
    const { sidebar, phoneBar } = show('/philly/admin/team')
    expect(sidebar).toEqual(['To do18', 'Places', 'Site', 'Reports', 'Settings', 'View the site'])
    expect(phoneBar).toEqual(['To do · 18', 'Places', 'Site', 'Reports'])
    cleanup()
    nav.count = 0
    expect(show('/philly/admin').phoneBar[0]).toBe('To do')
  })

  // Reports is one page (step 5); History and every search nobody found
  // open from its rows and are still Reports.
  it('shows Reports, and History and Searches under it, with no tabs', () => {
    for (const path of ['/philly/admin/metrics', '/philly/admin/history/rejected', '/philly/admin/searches']) {
      const { heading, lit } = show(path)
      expect(heading).toBe('Reports')
      expect(lit).toEqual(['Reports'])
      expect(screen.queryByRole('navigation', { name: 'Reports' })).toBeNull()
      cleanup()
    }
  })

  it('shows no tabs for an area with one page of its own name, and a plain heading off the map', () => {
    // Places is one list (step 3): Archived is a filter on it, not a tab.
    expect(show('/philly/admin/places').heading).toBe('Places')
    expect(screen.queryByRole('navigation', { name: 'Places' })).toBeNull()
    cleanup()
    expect(show('/philly/admin/nowhere').heading).toBe('Admin')
    expect(screen.queryByRole('navigation', { name: 'Site' })).toBeNull()
  })

  // Site works on a phone too (board 21): its list of screens instead of
  // the tabs, and no screen held back for a computer.
  it('opens Site on a phone to its list of screens, and hides no screen', () => {
    show('/philly/admin/home')
    expect(screen.queryByText(/Open on a computer/)).toBeNull()
    expect(screen.getByText('the screen').parentElement).not.toHaveClass('hidden')
    expect(within(screen.getByRole('navigation', { name: 'Admin areas' })).getByRole('link', { name: 'Site' })).toHaveAttribute('href', '/philly/admin/site')
    cleanup()
    // The list itself lights Site, and carries no tabs of its own.
    const { lit } = show('/philly/admin/site')
    expect(lit).toEqual(['Site'])
    expect(screen.getByRole('navigation', { name: 'Site' })).toHaveClass('hidden')
    expect(screen.getByRole('navigation', { name: 'Site' })).not.toHaveClass('md:flex')
  })

  // A screen with its own way back (an opened category, a watch) heads
  // itself; the frame's heading steps aside so there aren't two (board 19c).
  it('steps its heading aside for a screen that heads itself', () => {
    nav.pathname = '/philly/admin/watches/kind/synagogue'
    render(
      <AdminFrame isSuperAdmin={false} email="admin@example.com" token="tok" onSignOut={() => {}}>
        <AdminBack back={{ label: 'Watches', href: '/philly/admin/watches' }} title="Shul times" />
      </AdminFrame>,
    )
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Shul times'])
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  it('draws Settings as a gear, not a sun', () => {
    show('/philly/admin')
    const gear = screen.getByLabelText('Settings').querySelector('svg')!
    // A toothed ring round a hole: one closed outline. A sun's rays are
    // separate strokes, each its own move.
    const outlines = [...gear.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '')
    expect(outlines).toHaveLength(1)
    expect(outlines[0].match(/M/gi)).toHaveLength(1)
    expect(outlines[0].trim()).toMatch(/z$/i)
    expect(gear.querySelectorAll('circle')).toHaveLength(1)
  })

  it('says who is signed in, with Sign out', () => {
    show('/philly/admin')
    expect(screen.getByText(/^Signed in as/)).toHaveTextContent('Signed in as admin@example.com')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('offers Communities under Settings to the site owner only', () => {
    show('/philly/admin/team')
    expect(within(screen.getByRole('navigation', { name: 'Settings' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Team', 'Community'])
    cleanup()
    show('/philly/admin/team', true)
    expect(within(screen.getByRole('navigation', { name: 'Settings' })).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Team',
      'Community',
      'Communities',
    ])
  })
})
