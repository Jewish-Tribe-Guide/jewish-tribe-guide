// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import ContributePicker from './ContributePicker'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

// SuggestListingCard's "Submit a Listing" step (Edit/Report used to be a
// separate listing-search picker, EditReportPicker — deleted along with the
// Add/Edit/Report buttons this used to pair with; see UpdateListingsCard's
// own doc). What matters here: only categories where Add is actually
// enabled show up (the same gate the real Add button already respects), the
// search field filters that list live, and picking a category hands off to
// the real Add form that already exists.

describe('ContributePicker', () => {
  // Found Nov 16: Escape left it open, unlike every other dialog here.
  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<ContributePicker onClose={onClose} />, {
      content: { categories: [makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })] },
    })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('only lists categories where Add is actually enabled', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const noAdd = makeCategory({
      id: 'synagogue',
      pluralLabel: 'Synagogues',
      capabilities: { add: false, edit: true, report: true, directorySearch: true, map: true },
    })
    renderWithProviders(<ContributePicker onClose={vi.fn()} />, {
      content: { categories: [grocery, noAdd] },
    })

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Synagogues')).not.toBeInTheDocument()
  })

  // Names only from Nov 14 looked unfinished; the user (Nov 16) chose the
  // home tiles' photos beside them. Still no icons or emoji.
  it('shows each category with its home tile’s photo, and no icon', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores', cardImageUrl: 'https://example.com/grocery.jpg' })
    renderWithProviders(<ContributePicker onClose={vi.fn()} />, { content: { categories: [grocery] } })
    const link = screen.getByRole('link', { name: 'Grocery Stores' })
    expect(link.querySelector('img')?.getAttribute('src')).toContain('grocery.jpg')
    expect(link.querySelector('svg')).toBeNull()
    expect(link.textContent).toBe('Grocery Stores')
  })

  it('uses the banner picture when that is the one set, as the home tile does', () => {
    const food = makeCategory({ id: 'food', pluralLabel: 'Food', cardImageUrl: null, cardBandImageUrl: 'https://example.com/food.jpg' })
    renderWithProviders(<ContributePicker onClose={vi.fn()} />, { content: { categories: [food] } })
    expect(screen.getByRole('link', { name: 'Food' }).querySelector('img')?.getAttribute('src')).toContain('food.jpg')
  })

  it('keeps a plain square where a category has no picture, so the names line up', () => {
    const plain = makeCategory({ id: 'plain', pluralLabel: 'Plain', cardImageUrl: null, cardBandImageUrl: null })
    renderWithProviders(<ContributePicker onClose={vi.fn()} />, { content: { categories: [plain] } })
    const link = screen.getByRole('link', { name: 'Plain' })
    expect(link.querySelector('img')).toBeNull()
    expect(link.querySelector('[data-testid="picker-photo"]')).not.toBeNull()
  })

  it('filters the category list live as you type', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderWithProviders(<ContributePicker onClose={vi.fn()} />, {
      content: { categories: [grocery, synagogue] },
    })

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.getByText('Synagogues')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search categories'), 'grocery')

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Synagogues')).not.toBeInTheDocument()
  })

  it('links straight into that category\'s Add form (?form=create)', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<ContributePicker onClose={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    const link = screen.getByRole('link', { name: 'Grocery Stores' })
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/grocery\?form=create$/))
  })

  it('shows the picker title', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<ContributePicker onClose={vi.fn()} />, {
      content: { categories: [grocery] },
    })

    expect(screen.getByRole('heading', { name: 'Add a listing' })).toBeInTheDocument()
  })
})
