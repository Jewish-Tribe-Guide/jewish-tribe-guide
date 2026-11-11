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

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

// Board G5b (Nov 11): on its own after the map, a heading, one line and one
// button that opens the same ContributePicker as "+ Add". No photo.
describe('SuggestListingCard', () => {
  it('asks for a missing place, in words and no photo', () => {
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })

    expect(screen.getByRole('heading', { name: 'Know a place we’re missing?' })).toBeInTheDocument()
    expect(screen.getByText('Add it, or fix one that’s out of date. A person checks every change.')).toBeInTheDocument()
    expect(screen.getByTestId('home-suggest').querySelector('img')).toBeNull()
  })

  it('opens ContributePicker on "Suggest a listing"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Suggest a listing' }))

    expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeInTheDocument()
  })

  // Board G5c (Nov 11): a stop of its own, not a footnote to the map.
  it('is a tall section with a big heading', () => {
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })
    expect(screen.getByTestId('home-suggest')).toHaveClass('min-h-[240px]')
    expect(screen.getByRole('heading', { name: 'Know a place we’re missing?' })).toHaveClass('text-[38px]')
  })
})
