// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import SuggestListingCard from './SuggestListingCard'
import { LIFT_ON_HOVER } from './AnswerCard'

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

  // Nov 14: the whole card lifts like the other computer-home cards and
  // opens the picker from anywhere on it; the picker can still close.
  it('lifts on hover and opens the picker from anywhere on the card', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })
    const box = screen.getByTestId('home-suggest')
    expect(box).toHaveClass(...LIFT_ON_HOVER.split(' '))

    await user.click(screen.getByRole('heading', { name: 'Know a place we’re missing?' }))
    expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // Board W7l (Nov 15): the page's quiet sign-off, so the map above stays
  // the bigger thing: a small heading and a small button, beside the words
  // once the card is 540px wide, stacked under that (jsdom has no layout;
  // the widths themselves are e2e/desktop-home-widths.spec.ts).
  it('is a quiet card: a small heading, side by side from 540px, stacked in a narrow box', () => {
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })
    const box = screen.getByTestId('home-suggest')
    expect(box).toHaveClass('flex-col', '@[540px]:flex-row')
    expect(box).not.toHaveClass('@[920px]:min-h-[240px]')
    expect(box.parentElement).toHaveClass('@container')
    expect(screen.getByRole('heading', { name: 'Know a place we’re missing?' })).toHaveClass('text-[21px]')
    expect(screen.getByRole('button', { name: 'Suggest a listing' })).toHaveClass('h-10')
  })
})
