// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import AdminFrame from './AdminFrame'

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
    expect(heading).toBe('Site')
  })

  it('puts only the four areas in the phone bar, Settings behind the gear', () => {
    const { phoneBar } = show('/philly/admin')
    expect(phoneBar).toEqual(['To do', 'Places', 'Site', 'Reports'])
    expect(screen.getByLabelText('Settings')).toHaveAttribute('href', '/philly/admin/team')
  })

  it("shows the open area's pages as tabs under the heading, the current one lit", () => {
    show('/philly/admin/desktop')
    const tabs = within(screen.getByRole('navigation', { name: 'Site' })).getAllByRole('link')
    expect(tabs.map((a) => a.textContent)).toEqual(['Categories', 'Campaigns', 'Basics', 'On a computer', 'On a phone'])
    expect(tabs.map((a) => a.getAttribute('aria-current'))).toEqual([null, null, null, 'page', null])
  })

  // Step 2: To do is one list. Its other pages open from it, headed by
  // their own name, with the way back.
  it('shows To do with no tabs, and its other pages with "‹ To do"', () => {
    expect(show('/philly/admin').heading).toBe('To do')
    expect(screen.queryByRole('navigation', { name: 'To do' })).toBeNull()
    expect(screen.queryByRole('link', { name: '‹ To do' })).toBeNull()
    cleanup()
    const { heading, lit } = show('/philly/admin/searches')
    expect(heading).toBe('Searches')
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

  it('names the one page of an area whose page is called something else', () => {
    show('/philly/admin/team')
    expect(within(screen.getByRole('navigation', { name: 'Settings' })).getByRole('link').textContent).toBe('Team')
  })

  it('shows no tabs for an area with one page of its own name, and a plain heading off the map', () => {
    // Places is one list (step 3): Archived is a filter on it, not a tab.
    expect(show('/philly/admin/places').heading).toBe('Places')
    expect(screen.queryByRole('navigation', { name: 'Places' })).toBeNull()
    cleanup()
    expect(show('/philly/admin/nowhere').heading).toBe('Admin')
    expect(screen.queryByRole('navigation', { name: 'Site' })).toBeNull()
  })

  // Site is for a computer (brief, question 6): on a phone it says so.
  it('tells a phone to open Site on a computer, and keeps the screen for a computer', () => {
    show('/philly/admin/site')
    expect(screen.getByText('Open on a computer to edit the site')).toBeInTheDocument()
    expect(screen.getByText('the screen').parentElement).toHaveClass('hidden', 'md:block')
    cleanup()
    show('/philly/admin')
    expect(screen.queryByText('Open on a computer to edit the site')).toBeNull()
  })

  it('says who is signed in, with Sign out', () => {
    show('/philly/admin')
    expect(screen.getByText(/^Signed in as/)).toHaveTextContent('Signed in as admin@example.com')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('offers Communities under Settings to the site owner only', () => {
    show('/philly/admin/team')
    expect(within(screen.getByRole('navigation', { name: 'Settings' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Team'])
    cleanup()
    show('/philly/admin/team', true)
    expect(within(screen.getByRole('navigation', { name: 'Settings' })).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Team',
      'Communities',
    ])
  })
})
