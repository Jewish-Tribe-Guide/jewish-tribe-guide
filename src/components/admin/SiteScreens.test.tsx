// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import SiteScreens from './SiteScreens'

vi.mock('@/lib/communityContext', () => ({ useCommunitySlug: () => 'philly' }))

afterEach(cleanup)

// Site on a phone opens to its screens as rows (board 21), where a computer
// has them as tabs.
describe('SiteScreens', () => {
  it('lists each of Site’s screens, then View the site', () => {
    render(<SiteScreens isSuperAdmin={false} />)
    const rows = screen.getAllByRole('link')
    expect(rows.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home page', '/philly/admin/home'],
      ['Category pages', '/philly/admin/categories'],
      ['Forms', '/philly/admin/forms'],
      ['Header and menus', '/philly/admin/menus'],
      ['Campaigns', '/philly/admin/campaigns'],
      ['View the site', '/philly'],
    ])
  })

  it('has About and Privacy for the site owner, who keeps it for every community', () => {
    render(<SiteScreens isSuperAdmin />)
    expect(screen.getByRole('link', { name: 'About and Privacy' })).toHaveAttribute('href', '/philly/admin/pages')
  })
})
