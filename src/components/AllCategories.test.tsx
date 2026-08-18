// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import type { HomeSection } from '@/lib/homeSections'
import AllCategories from './AllCategories'

// No next/navigation mock needed here — unlike GenericListingCard/SiteHeader,
// nothing in this tree calls useCommunitySlug()/useActiveCommunity(), only
// useCategories()/useHomeSections()/useForms() (ContentProvider). Proves the
// harness works fine without the router mock when a component doesn't need it.

afterEach(() => cleanup())

const handlers = {
  onNavigate: vi.fn(),
  onOpenFlow: vi.fn(),
  onUp: vi.fn(),
}

describe('AllCategories', () => {
  it('groups categories into their configured sections', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    const homeSections: HomeSection[] = [{ id: 'sec-1', title: 'Essentials', sortOrder: 0, cardIds: ['grocery'] }]

    renderWithProviders(<AllCategories {...handlers} />, {
      content: { categories: [grocery, synagogue], homeSections },
    })

    expect(screen.getByText('All categories')).toBeInTheDocument()
    expect(screen.getByText('Essentials')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    // Not in any configured section — falls into the catch-all "More" group.
    expect(screen.getByText('More')).toBeInTheDocument()
    expect(screen.getByText('Synagogues')).toBeInTheDocument()
  })

  it('calls onUp when the Up button is clicked', async () => {
    const onUp = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<AllCategories {...handlers} onUp={onUp} />, {
      content: { categories: [makeCategory()] },
    })

    await user.click(screen.getByText('Home'))

    expect(onUp).toHaveBeenCalledTimes(1)
  })

  it('renders every card in a single "More" group when no home sections are configured', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<AllCategories {...handlers} />, {
      content: { categories: [grocery], homeSections: [] },
    })

    expect(screen.getByText('More')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Essentials')).not.toBeInTheDocument()
  })
})
