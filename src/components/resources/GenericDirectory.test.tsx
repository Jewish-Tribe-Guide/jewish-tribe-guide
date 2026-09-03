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
    showDistanceSlot,
  }: {
    item: DirectoryResource
    onEdit: () => void
    onReport: () => void
    onTagClick: (t: string) => void
    onFilterBool: (key: string) => void
    showDistanceSlot?: boolean
  }) => (
    <div>
      <span>{item.name}</span>
      {showDistanceSlot && <span>distance-slot {item.name}</span>}
      <button onClick={onEdit}>Edit {item.name}</button>
      <button onClick={onReport}>Report {item.name}</button>
      <button onClick={() => onTagClick('cheese')}>tag {item.name}</button>
      <button onClick={() => onFilterBool('isKosher')}>card-filter {item.name}</button>
    </div>
  ),
}))

// DaveningTimesModal pulls in its own heavy davening-time rendering — out of
// scope here, GenericDirectory only cares whether it opens, not what's in it.
vi.mock('@/components/synagogues/DaveningTimesModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>davening modal open</div> : null),
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

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
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

  it('shows a Map button and calls onViewMap with the current search when a Map pseudo-category exists', async () => {
    const user = userEvent.setup()
    const onViewMap = vi.fn()
    const category = makeCategory({ hasAddress: true })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} onViewMap={onViewMap} />, {
      content: { categories: [category, makeCategory({ id: 'map', kind: 'map' })] },
    })

    await user.type(screen.getByPlaceholderText('Search…'), 'mart')
    await user.click(screen.getAllByRole('button', { name: /Map/ })[0])

    expect(onViewMap).toHaveBeenCalledWith('mart', expect.objectContaining({ bool: [], select: {} }))
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
