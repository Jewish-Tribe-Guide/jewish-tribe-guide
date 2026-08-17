// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { GenericListingCard } from './GenericListingCard'

// The first component test built on the CommunityProvider/ContentProvider
// harness (renderWithProviders) — this was the specific component the
// provider-harness gap was blocking (see the memory note it closes out).
// GenericListingCard is one of the most-used components in the app (every
// row in every category directory), so it doubles as the harness's own
// integration test: if this renders correctly, the harness works.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

const requiredHandlers = {
  onVote: vi.fn(),
  onTagClick: vi.fn(),
  onFilterOpen: vi.fn(),
  onFilterBool: vi.fn(),
  onFilterSelect: vi.fn(),
  onEdit: vi.fn(),
  onReport: vi.fn(),
}

describe('GenericListingCard — collapsed', () => {
  it('shows the listing name and a "category · address" subtitle', () => {
    const category = makeCategory()
    const item = makeListing({ name: 'Acme Grocery', address: '1 Main St, Philadelphia, PA 19104' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
      { content: { categories: [category] } },
    )

    expect(screen.getByText('Acme Grocery')).toBeInTheDocument()
    expect(screen.getByText('Grocery Store · 1 Main St, Philadelphia')).toBeInTheDocument()
  })

  it('starts collapsed (aria-expanded=false) and expands on click', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    const row = screen.getByRole('button', { expanded: false })
    await user.click(row)

    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
  })

  it('does not render an upvote count when upvotes is false', () => {
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={7} {...requiredHandlers} />,
    )
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('shows an "Open" badge only when a listing has hours saying so', () => {
    const category = makeCategory({ detailFields: [{ key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }] })
    // hours as a plain string the app doesn't understand reads as closed —
    // good enough to prove the badge is absent without a fragile hours fixture.
    const item = makeListing({ hours: 'not a real schedule' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )
    expect(screen.queryByText('Open')).not.toBeInTheDocument()
  })

  it('calls onNameClick instead of expanding when the name itself is clicked, in a mixed-category list', async () => {
    const user = userEvent.setup()
    const onNameClick = vi.fn()
    const category = makeCategory()
    const item = makeListing({ name: 'Acme Grocery' })
    renderWithProviders(
      <GenericListingCard
        item={item}
        category={category}
        upvotes={false}
        count={0}
        onNameClick={onNameClick}
        {...requiredHandlers}
      />,
    )

    await user.click(screen.getByText('Acme Grocery'))

    expect(onNameClick).toHaveBeenCalledTimes(1)
    // Expanding is a separate, unrelated interaction — clicking the name
    // alone shouldn't also toggle the row.
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
  })
})

describe('GenericListingCard — expanded', () => {
  it('shows the full address and an Edit button once expanded, when the category allows editing', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ address: '1 Main St, Philadelphia, PA 19104' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByText('1 Main St, Philadelphia, PA 19104')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('calls onEdit when the Edit button is clicked', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { name: /edit/i }))

    expect(requiredHandlers.onEdit).toHaveBeenCalledTimes(1)
  })
})
