// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { Eruv } from '@/lib/eruv'
import type { CategoryConfig } from '@/lib/categories'
import { EruvListing } from './EruvListing'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/eruv',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

// Nov 9: an opened eruv shows the Eruv page's Fields, in its boxes, after
// its name and status (eruvFields.ts). A page never saved shows the rows an
// eruv always had.

const eruv: Eruv = {
  id: 'center-city', name: 'Center City Eruv', covers: 'Center City and South Philadelphia.', website: 'https://www.centercityeruv.com/', hotline: '2155550100', alertsUrl: null,
  statusUrl: null, statusDated: false, status: 'up', statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
  details: { certifiedBy: 'Rabbi A', area: 'Philadelphia' },
}
const page = (over: Partial<CategoryConfig> = {}): CategoryConfig => ({ id: 'eruv-information', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', detailFields: [], kind: 'eruv', ...over })
const open = (categories: CategoryConfig[]) =>
  renderWithProviders(<EruvListing eruv={eruv} color="#000" now={new Date('2026-11-09T15:00:00Z')} timezone="America/New_York" candles={null} />, { content: { categories } })

describe('EruvListing — the Eruv page’s fields', () => {
  it('never saved, shows the rows an eruv always had: Where it goes in its box, then its contacts', () => {
    open([page()])
    expect(screen.getByRole('heading', { name: 'Where it goes' })).toBeInTheDocument()
    expect(screen.getByText('Center City and South Philadelphia.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /centercityeruv\.com/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /2155550100/ })).toBeInTheDocument()
    expect(screen.queryByText('Rabbi A')).not.toBeInTheDocument()
  })

  it('follows a saved page: its boxes and its own fields, and nothing taken off it', () => {
    open([
      page({
        detailFields: [
          { key: 'area', label: 'Area', type: 'text', showInHeader: true },
          { key: 'hotline', label: 'Hotline', type: 'tel' },
          { key: 'certifiedBy', label: 'Certified by', type: 'text' },
        ],
        listingParts: { boxes: [{ title: 'Who checks it', fields: ['certifiedBy'] }] },
      }),
    ])
    expect(screen.getByRole('heading', { name: 'Who checks it' })).toBeInTheDocument()
    expect(screen.getByText('Rabbi A')).toBeInTheDocument()
    expect(screen.getByText(/Eruv · Philadelphia/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /2155550100/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Where it goes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /centercityeruv\.com/ })).not.toBeInTheDocument()
  })
})
