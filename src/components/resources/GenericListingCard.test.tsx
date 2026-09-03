// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
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

    // The chevron is the only element carrying aria-expanded (the row
    // itself is a plain div now — see GenericListingCard's own comment on
    // why: it holds other real interactive children, so it can't also be
    // an ARIA button). Clicking it exercises the real accessible path,
    // not just the row's mouse-only onClick convenience.
    const toggle = screen.getByRole('button', { expanded: false })
    await user.click(toggle)

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

  // The Open badge is the most time-sensitive thing on the card, and it used
  // to be computed once from `new Date()` during render and never revisited —
  // nothing in the app ticked, and nothing listened for the tab coming back.
  // A phone backgrounded in a hospital corridor at 4pm and looked at again at
  // 10pm still showed "Open" for a shop that had closed at 5.
  it('drops the "Open" badge once the listing has closed, when the tab comes back', () => {
    vi.useFakeTimers()
    try {
      // A Friday, mid-afternoon, for a place open 09:00–17:00 that day.
      vi.setSystemTime(new Date('2026-08-28T14:00:00'))
      const category = makeCategory({
        detailFields: [{ key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }],
      })
      const item = makeListing({ hours: { fri: { open: '09:00', close: '17:00' } } })

      renderWithProviders(
        <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
      )
      expect(screen.getByText('Open')).toBeInTheDocument()

      // Away past closing time. A hidden tab doesn't tick, so this has to be
      // the visibilitychange that corrects it, not an interval.
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      act(() => void vi.advanceTimersByTime(5 * 60 * 60 * 1000))
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      act(() => document.dispatchEvent(new Event('visibilitychange')))

      expect(screen.queryByText('Open')).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      vi.useRealTimers()
    }
  })

  // Google keeps a temporarily-closed place's posted hours exactly as they
  // were, so before this the card read those hours, showed a green "Open"
  // chip, and gave no hint the shop was shut — the closure notice existed only
  // once you expanded the card.
  it('shows a closure on the collapsed card, and never an Open badge with it', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-31T12:00:00')) // a Monday, midday
      const category = makeCategory({
        detailFields: [{ key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }],
      })
      const item = makeListing({
        hours: { mon: { open: '09:00', close: '17:00' } },
        businessStatus: 'CLOSED_TEMPORARILY',
      })

      renderWithProviders(
        <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
      )

      expect(screen.getByText('Temporarily closed')).toBeInTheDocument()
      expect(screen.queryByText('Open')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Nothing is remembered between syncs — businessStatus is rewritten on every
  // run — so the badge has to disappear on its own the day Google reopens it.
  it('goes back to a plain Open badge once the status is OPERATIONAL again', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-31T12:00:00'))
      const category = makeCategory({
        detailFields: [{ key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }],
      })
      const item = makeListing({
        hours: { mon: { open: '09:00', close: '17:00' } },
        businessStatus: 'OPERATIONAL',
      })

      renderWithProviders(
        <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
      )

      expect(screen.getByText('Open')).toBeInTheDocument()
      expect(screen.queryByText('Temporarily closed')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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

// ── The empty distance slot ───────────────────────────────────────────────────
//
// The distance column used to render only when there was a distance to show,
// so with no location set it wasn't empty — it was absent. Every card looked
// complete, and nothing on the page hinted that distances existed at all. The
// only clue was one pill at the top of the directory, which reads like the
// first-load location popup the visitor already dismissed.
//
// Holding the slot open puts the hint in the row, where the eye already is,
// repeated down the whole list — without interrupting anything.

describe('GenericListingCard — distance slot', () => {
  const slotLabel = /set your location to see distances/i

  it('holds the slot open when there is no location set', () => {
    renderWithProviders(
      <GenericListingCard
        item={makeListing()}
        category={makeCategory()}
        upvotes={false}
        count={0}
        showDistanceSlot
        {...requiredHandlers}
      />,
    )
    expect(screen.getByRole('button', { name: slotLabel })).toBeInTheDocument()
  })

  it('shows the real distance instead once there is one', () => {
    renderWithProviders(
      <GenericListingCard
        item={makeListing({ milesFromAddress: 0.42 })}
        category={makeCategory()}
        upvotes={false}
        count={0}
        showDistanceSlot
        {...requiredHandlers}
      />,
    )
    expect(screen.getByText(/0\.4 mi/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: slotLabel })).not.toBeInTheDocument()
  })

  // Search results and the home screen's cross-category lists render the same
  // card without a directory around it, and have nowhere to send the tap.
  it('stays out of the way when the caller does not ask for it', () => {
    renderWithProviders(
      <GenericListingCard
        item={makeListing()}
        category={makeCategory()}
        upvotes={false}
        count={0}
        {...requiredHandlers}
      />,
    )
    expect(screen.queryByRole('button', { name: slotLabel })).not.toBeInTheDocument()
  })

  it('opens the location picker without expanding the card', async () => {
    const user = userEvent.setup()
    const opened = vi.fn()
    document.addEventListener('jpc:open-location', opened)

    renderWithProviders(
      <GenericListingCard
        item={makeListing()}
        category={makeCategory()}
        upvotes={false}
        count={0}
        showDistanceSlot
        {...requiredHandlers}
      />,
    )

    await user.click(screen.getByRole('button', { name: slotLabel }))

    expect(opened).toHaveBeenCalledTimes(1)
    // The row's own click handler expands the card. A tap meant for the slot
    // must not also do that — the visitor asked for the location picker, not
    // for this listing's details.
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()

    document.removeEventListener('jpc:open-location', opened)
  })
})
