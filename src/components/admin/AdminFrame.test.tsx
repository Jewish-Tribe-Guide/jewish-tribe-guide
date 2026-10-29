// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import AdminFrame from './AdminFrame'

const nav = vi.hoisted(() => ({ pathname: '/philly/admin' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/lib/communityContext', () => ({ useCommunitySlug: () => 'philly' }))
vi.mock('@/lib/contentContext', () => ({ useSiteSettings: () => ({ name: 'Philly Jewish Guide' }) }))
vi.mock('@/lib/features', () => ({ features: { todayHome: false, whatChanged: false } }))

afterEach(cleanup)

function show(pathname: string, isSuperAdmin = false) {
  nav.pathname = pathname
  render(
    <AdminFrame isSuperAdmin={isSuperAdmin} email="admin@example.com" onSignOut={() => {}}>
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
    show('/philly/admin/searches')
    const tabs = within(screen.getByRole('navigation', { name: 'To do' })).getAllByRole('link')
    expect(tabs.map((a) => a.textContent)).toEqual(['Suggestions', 'Watches', 'Searches', 'Read questions', 'Responses'])
    expect(tabs.map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'page', null, null])
  })

  it('names the one page of an area whose page is called something else', () => {
    show('/philly/admin/archived')
    expect(within(screen.getByRole('navigation', { name: 'Places' })).getByRole('link').textContent).toBe('Archived')
  })

  it('shows no tabs for an area with one page of its own name, and a plain heading off the map', () => {
    expect(show('/philly/admin/nowhere').heading).toBe('Admin')
    expect(screen.queryByRole('navigation', { name: 'To do' })).toBeNull()
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
