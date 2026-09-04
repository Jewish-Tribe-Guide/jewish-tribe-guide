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

// HomeBreak's Add step (Edit/Report moved to EditReportPicker — a listing
// search, not a category picker; see that component's own tests). What
// matters here: only categories where Add is actually enabled show up (the
// same gate the real Add button already respects), the search field
// filters that list live, and picking a category hands off to the real
// Add form that already exists.

describe('ContributePicker', () => {
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
