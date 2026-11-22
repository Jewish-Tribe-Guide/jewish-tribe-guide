// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import SiteScreens from './SiteScreens'

vi.mock('@/lib/communityContext', () => ({ useCommunitySlug: () => 'philly', useCommunityTimezone: () => 'America/New_York' }))
const content = vi.hoisted(() => ({ categories: [{}, {}, {}] as unknown[], banners: [] as unknown[] }))
vi.mock('@/lib/contentContext', () => ({
  useCategories: () => content.categories,
  useForms: () => [],
  useCampaignBanners: () => content.banners,
}))
vi.mock('@/lib/useNow', () => ({ useNow: () => Date.parse('2026-11-22T17:00:00Z') }))

afterEach(cleanup)

// Site on a phone opens to its screens as rows (board 21), where a computer
// has them as tabs.
describe('SiteScreens', () => {
  it('lists each of Site’s screens, then View the site', () => {
    render(<SiteScreens isSuperAdmin={false} />)
    const rows = screen.getAllByRole('link')
    expect(rows.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home pageThe big line, the photo, and what’s below it', '/philly/admin/home'],
      ['Category pages3 categories', '/philly/admin/categories'],
      ['CampaignsNone running', '/philly/admin/campaigns'],
      ['View the site', '/philly'],
    ])
  })

  // Board 21 draws a line under each row; they were left off (item 66).
  it('says under Campaigns which one is running today', () => {
    content.banners = [
      { id: 'b1', categoryId: 'c', title: 'Sukkos meals', subtitle: '', startDate: '2026-10-01', endDate: '2026-10-10', destination: 'list' },
      { id: 'b2', categoryId: 'c', title: 'Chanukah gifts', subtitle: '', startDate: '2026-11-20', endDate: '2026-12-20', destination: 'map' },
    ]
    render(<SiteScreens isSuperAdmin={false} />)
    expect(screen.getByRole('link', { name: /Campaigns/ })).toHaveTextContent('Running: Chanukah gifts')
    content.banners = []
  })

  it('has About and Privacy for the site owner, who keeps it for every community', () => {
    render(<SiteScreens isSuperAdmin />)
    expect(screen.getByRole('link', { name: 'About and Privacy' })).toHaveAttribute('href', '/admin/pages')
  })
})
