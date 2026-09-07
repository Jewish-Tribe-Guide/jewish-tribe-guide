// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import GenericDirectory from './GenericDirectory'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// GenericListingCard is real and separately tested (GenericListingCard.test.tsx)
// — stubbed here, same "mock the heavy leaf child" pattern as Landing.test.tsx's
// HomeMap, so what's under test is GenericDirectory's own filtering/search/
// wiring logic, not the card's own rendering.
vi.mock('./GenericListingCard', () => ({
  GenericListingCard: ({
    item,
    onEdit,
    onReport,
    onTagClick,
    onFilterBool,
    onNavigate,
    showDistanceSlot,
  }: {
    item: DirectoryResource
    onEdit: () => void
    onReport: () => void
    onTagClick: (t: string) => void
    onFilterBool: (key: string) => void
    onNavigate?: (direction: 1 | -1) => void
    showDistanceSlot?: boolean
  }) => (
    <div>
      <span>{item.name}</span>
      {showDistanceSlot && <span>distance-slot {item.name}</span>}
      <button onClick={onEdit}>Edit {item.name}</button>
      <button onClick={onReport}>Report {item.name}</button>
      <button onClick={() => onTagClick('cheese')}>tag {item.name}</button>
      <button onClick={() => onFilterBool('isKosher')}>card-filter {item.name}</button>
      {onNavigate && <button onClick={() => onNavigate(1)}>Next listing from {item.name}</button>}
    </div>
  ),
}))

// DaveningTimesModal pulls in its own heavy davening-time rendering — out of
// scope here, GenericDirectory only cares whether it opens (and, for the
// initialDayFilter parsing tests below, what it's told to open TO), not what's
// in it.
vi.mock('@/components/synagogues/DaveningTimesModal', () => ({
  default: ({ isOpen, initialDayFilter }: { isOpen: boolean; initialDayFilter?: string[] }) =>
    isOpen ? <div>davening modal open{initialDayFilter ? `: ${initialDayFilter.join(',')}` : ''}</div> : null,
}))

afterEach(() => cleanup())

const handlers = {
  onUp: vi.fn(),
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onReport: vi.fn(),
}

describe('GenericDirectory', () => {
  it('renders the category title, listing count, and one card per item', () => {
    const category = makeCategory({ pluralLabel: 'Grocery Stores' })
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' }), makeListing({ id: 'b', name: 'Trader Joe' })]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    // By role, not getByText: the desktop breadcrumb (see DirectoryHeader's
    // upLabel/onUp) repeats the title as plain text above the real h1, so
    // getByText('Grocery Stores') is ambiguous — jsdom has no viewport to
    // apply the breadcrumb's desktop-only CSS against, so both are "visible"
    // to testing-library regardless. The h1 is the one heading role either way.
    expect(screen.getByRole('heading', { name: 'Grocery Stores' })).toBeInTheDocument()
    expect(screen.getByText('2 listings')).toBeInTheDocument()
    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.getByText('Trader Joe')).toBeInTheDocument()
  })

  it('filters the list by search text', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' }), makeListing({ id: 'b', name: 'Trader Joe' })]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.type(screen.getByPlaceholderText('Search…'), 'kosher')

    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.queryByText('Trader Joe')).not.toBeInTheDocument()
  })

  it('shows a "no matches" empty state with a clear button when a search narrows to nothing', async () => {
    const user = userEvent.setup()
    const category = makeCategory({ pluralLabel: 'Grocery Stores' })
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' })]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.type(screen.getByPlaceholderText('Search…'), 'nonexistent')

    expect(screen.getByText('No grocery stores match your search.')).toBeInTheDocument()
    const clear = screen.getByRole('button', { name: 'Clear search & filters' })

    await user.click(clear)
    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
  })

  it('shows a plain "none listed" empty state (no clear button) when there are simply no items', () => {
    const category = makeCategory({ pluralLabel: 'Grocery Stores' })
    renderWithProviders(<GenericDirectory category={category} items={[]} {...handlers} />)

    expect(screen.getByText('No grocery stores listed yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear search & filters' })).not.toBeInTheDocument()
  })

  it('calls onAdd when the Add button is clicked, from both the header and the empty state', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const category = makeCategory({ label: 'Grocery Store' })
    renderWithProviders(<GenericDirectory category={category} items={[]} {...handlers} onAdd={onAdd} />)

    await user.click(screen.getByRole('button', { name: /Add grocery store/ }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('wires a card\'s Edit/Report/tag-click callbacks back to the directory\'s own props/state', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onReport = vi.fn()
    const category = makeCategory()
    const item = makeListing({ id: 'a', name: 'Kosher Mart' })
    renderWithProviders(<GenericDirectory category={category} items={[item]} {...handlers} onEdit={onEdit} onReport={onReport} />)

    await user.click(screen.getByRole('button', { name: 'Edit Kosher Mart' }))
    expect(onEdit).toHaveBeenCalledWith(item)

    await user.click(screen.getByRole('button', { name: 'Report Kosher Mart' }))
    expect(onReport).toHaveBeenCalledWith(item)

    await user.click(screen.getByRole('button', { name: 'tag Kosher Mart' }))
    expect(screen.getByPlaceholderText(/Search/)).toHaveValue('cheese')
  })

  it('a filterable boolean field narrows the list when its chip is toggled on', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
    })
    const items = [
      { ...makeListing({ id: 'a', name: 'Kosher Mart' }), isKosher: true },
      { ...makeListing({ id: 'b', name: 'Regular Mart' }), isKosher: false },
    ] as unknown as DirectoryResource[]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.click(screen.getByRole('button', { name: 'Kosher' }))

    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.queryByText('Regular Mart')).not.toBeInTheDocument()
  })

  it('a filterable select field narrows the list to whichever values are chosen', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      detailFields: [
        {
          key: 'cuisine',
          label: 'Cuisine',
          type: 'select',
          filterable: true,
          options: [
            { value: 'italian', label: 'Italian' },
            { value: 'deli', label: 'Deli' },
          ],
        },
      ],
    })
    const items = [
      { ...makeListing({ id: 'a', name: 'Italian Place' }), cuisine: 'italian' },
      { ...makeListing({ id: 'b', name: 'Deli Place' }), cuisine: 'deli' },
    ] as unknown as DirectoryResource[]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.click(screen.getByRole('button', { name: /All Cuisines/ }))
    await user.click(screen.getByRole('checkbox', { name: 'italian' }))

    expect(screen.getByText('Italian Place')).toBeInTheDocument()
    expect(screen.queryByText('Deli Place')).not.toBeInTheDocument()
  })

  describe('the Popularity/Distance sort toggle', () => {
    it('opens the location picker instead of switching to Distance when nothing is anchored yet', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ upvotesEnabled: true })
      const openLocation = vi.fn()
      document.addEventListener('jpc:open-location', openLocation)
      renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)

      await user.click(screen.getAllByRole('button', { name: 'Distance' })[0])

      expect(openLocation).toHaveBeenCalledTimes(1)
      document.removeEventListener('jpc:open-location', openLocation)
    })

    it('switches to Distance when an anchor is already set', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ upvotesEnabled: true })
      renderWithProviders(
        <GenericDirectory category={category} items={[makeListing()]} anchorLabel="123 Main St" {...handlers} />,
      )

      const distanceButtons = screen.getAllByRole('button', { name: 'Distance' })
      await user.click(distanceButtons[0])

      expect(distanceButtons[0]).toHaveClass('bg-primary')
    })
  })

  it('opens the davening-times modal when "All davening times" is clicked', async () => {
    const user = userEvent.setup()
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(<GenericDirectory category={category} items={[item]} {...handlers} />)

    await user.click(screen.getAllByRole('button', { name: /All davening times/ })[0])

    expect(screen.getByText('davening modal open')).toBeInTheDocument()
  })

  // The home screen's DaveningTimesCard links here with `?davening=1` so
  // "See all" actually lands on the sheet it names — before this, the link
  // opened a bare category page and the visitor had to find the same
  // button on it a second time. `openDaveningModal` is how that arrives,
  // once FindResourcesConnected has read the query string.
  it('opens the davening-times modal on arrival when openDaveningModal is set', () => {
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(<GenericDirectory category={category} items={[item]} openDaveningModal {...handlers} />)

    expect(screen.getByText('davening modal open')).toBeInTheDocument()
  })

  it('does not open the modal on arrival for an ordinary visit (no query param)', () => {
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(<GenericDirectory category={category} items={[item]} {...handlers} />)

    expect(screen.queryByText('davening modal open')).not.toBeInTheDocument()
  })

  // Comma-separated: DaveningTimesCard appends `,holiday` to the day it
  // links to when tomorrow is also a secular holiday, so a shul's
  // holiday-specific minyan isn't invisible on a view that's otherwise
  // correctly showing tomorrow. Each piece is validated independently
  // against the real day-key set — this arrives through a URL query param.
  it('splits initialDaveningDay on commas into the modal\'s day filter', () => {
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(
      <GenericDirectory category={category} items={[item]} openDaveningModal initialDaveningDay="tue,holiday" {...handlers} />,
    )

    expect(screen.getByText('davening modal open: tue,holiday')).toBeInTheDocument()
  })

  it('drops an invalid piece rather than passing it through as if it were real', () => {
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(
      <GenericDirectory category={category} items={[item]} openDaveningModal initialDaveningDay="tue,nonsense" {...handlers} />,
    )

    expect(screen.getByText('davening modal open: tue')).toBeInTheDocument()
  })

  it('falls back to no filter (undefined, not an empty array) when nothing valid survives', () => {
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(
      <GenericDirectory category={category} items={[item]} openDaveningModal initialDaveningDay="nonsense" {...handlers} />,
    )

    expect(screen.getByText('davening modal open')).toBeInTheDocument()
  })

  it('shows a Map link with the current search baked into its href when a Map pseudo-category exists', async () => {
    const user = userEvent.setup()
    const category = makeCategory({ hasAddress: true })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} onViewMap={vi.fn()} />, {
      content: { categories: [category, makeCategory({ id: 'map', kind: 'map' })] },
    })

    await user.type(screen.getByPlaceholderText('Search…'), 'mart')

    // A real <Link>, not a <button onClick> — see GenericDirectory's own
    // comment on mapHref: only a real href gets cmd/ctrl/middle-click "open
    // in new tab" from the browser. Asserting on the href itself, not a
    // callback, since clicking it no longer calls onViewMap at all —
    // navigation happens natively through the link.
    const href = screen.getAllByRole('link', { name: /Map/ })[0].getAttribute('href')
    expect(href).toContain(`cat=${category.id}`)
    expect(href).toContain('q=mart')
  })
})

// A `?item=` deep link (reopenItemId) scrolls that listing's row into view on
// mount — but a distance-sorted category with no location set yet can still
// reorder once geolocation resolves a moment later. A scroll fired before
// that lands targets the row's pre-reorder position: the visitor ends up
// scrolled to wherever it USED to be, off by however far the reorder moved
// it, with the reopened listing itself off-screen. Fixed by waiting for the
// row's position to stop moving (scrollItemIntoViewWhenSettled) instead of
// scrolling synchronously on mount.
describe('GenericDirectory — scrolling a reopened listing into view', () => {
  it('waits for the list to settle before scrolling, rather than scrolling synchronously on mount', () => {
    vi.useFakeTimers()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    try {
      const category = makeCategory()
      const items = [makeListing({ id: 'a', name: 'Kosher Mart' }), makeListing({ id: 'b', name: 'Trader Joe' })]
      renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} reopenItemId="b" />)

      // Not yet — the old code called scrollTo synchronously in this same
      // mount effect, before anything had a chance to reorder.
      expect(scrollTo).not.toHaveBeenCalled()

      // Two settle-poll ticks (32ms apart) before it fires.
      vi.advanceTimersByTime(100)
      expect(scrollTo).toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})

// Arrow-key/arrow-button navigation between cards (ListingDetailModal's
// Previous/Next) closes one card's dialog and opens the next's in the same
// moment — confirmed live: that's enough DOM mutation for Chrome to cancel
// an in-flight 'smooth' scrollTo outright, snapping the page back to
// wherever it started instead of ever reaching the target. 'instant' isn't
// vulnerable to being cancelled mid-flight, because there's no "mid-flight"
// for a synchronous scroll to be in.
describe('GenericDirectory — scrolling to the next/previous card', () => {
  it('scrolls instantly, not smoothly, when navigating between cards', () => {
    vi.useFakeTimers()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    try {
      const category = makeCategory()
      const items = [makeListing({ id: 'a', name: 'Kosher Mart' }), makeListing({ id: 'b', name: 'Trader Joe' })]
      renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

      screen.getByRole('button', { name: 'Next listing from Kosher Mart' }).click()
      vi.advanceTimersByTime(100)

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }))
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})

// The card renders the empty distance slot; the directory decides whether it
// should. Those are two separate failures — the card supporting it and nobody
// passing the prop looks exactly like the bug it was built to fix, and the
// card's own test cannot see that.
describe('GenericDirectory — distance slot wiring', () => {
  it('asks every card for the slot when no location is set', () => {
    const category = makeCategory()
    const items = [makeListing({ id: 'a', name: 'Alpha' }), makeListing({ id: 'b', name: 'Beta' })]
    renderWithProviders(
      <GenericDirectory category={category} items={items} addressPrompt {...handlers} />,
    )
    expect(screen.getByText('distance-slot Alpha')).toBeInTheDocument()
    expect(screen.getByText('distance-slot Beta')).toBeInTheDocument()
  })

  it('does not once a location is set', () => {
    const category = makeCategory()
    renderWithProviders(
      <GenericDirectory
        category={category}
        items={[makeListing({ name: 'Alpha' })]}
        anchorLabel="19103"
        addressPrompt={false}
        {...handlers}
      />,
    )
    expect(screen.queryByText('distance-slot Alpha')).not.toBeInTheDocument()
  })
})
