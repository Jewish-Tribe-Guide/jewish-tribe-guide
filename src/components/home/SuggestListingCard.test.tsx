// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import SuggestListingCard from './SuggestListingCard'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

// New card (Phase 6d, docs/desktop-mockup-plan.md) — fixed, non-admin-
// editable copy, and a single action that opens the same ContributePicker
// UpdateListingsCard's own Add button used to (see that component's doc for
// why the action moved here).
describe('SuggestListingCard', () => {
  it('renders its fixed copy', () => {
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })

    expect(screen.getByText('Get involved')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Suggest a Listing' })).toBeInTheDocument()
    expect(screen.getByText('Help keep our community guide accurate and useful.')).toBeInTheDocument()
  })

  it('opens ContributePicker on "Submit a Listing"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Submit a Listing' }))

    expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeInTheDocument()
  })
})
