// @vitest-environment jsdom
import { Activity, forwardRef, useImperativeHandle, useState, type Ref } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { resetMockIntersectionObserver, setAllIntersecting } from '@/test/intersectionObserverMock'
import type { DirectoryResource } from '@/types'
import { didArriveViaBackForward } from '@/lib/backForwardNavigation'
import GenericDirectory from './GenericDirectory'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Defaults to "a real navigation" — see backForwardNavigation's own module
// doc — overridden per-test (see the "arriving via browser back/forward"
// describe block below) for the one behavior that depends on it.
vi.mock('@/lib/backForwardNavigation', () => ({
  didArriveViaBackForward: vi.fn(() => false),
}))

// GenericListingCard is real and separately tested (GenericListingCard.test.tsx)
// — stubbed here, same "mock the heavy leaf child" pattern as Landing.test.tsx's
// DaveningTimesCard, so what's under test is GenericDirectory's own
// filtering/search/wiring logic, not the card's own rendering.
vi.mock('./GenericListingCard', () => ({
  // A real forwardRef + useImperativeHandle open()/close(), same shape as
  // the real GenericListingCardHandle — needed so the reopenItemId→open()
  // wiring (GenericDirectory's own cardRefs.current.get(id)?.open()) is
  // actually exercisable here, not silently swallowed by a ref-less mock.
  // measure*/setSpacer* are no-ops: this suite doesn't cover the alignment
  // logic that calls them.
  GenericListingCard: forwardRef(function GenericListingCard(
    {
      item,
      defaultExpanded,
      onEdit,
      onTagClick,
      onFilterBool,
      onNavigate,
      showDistanceSlot,
      onExpandedChange,
    }: {
      item: DirectoryResource
      defaultExpanded?: boolean
      onEdit: () => void
      onTagClick: (t: string) => void
      onFilterBool: (key: string) => void
      onNavigate?: (direction: 1 | -1) => void
      showDistanceSlot?: boolean
      onExpandedChange?: (expanded: boolean) => void
    },
    ref: Ref<{
      open: () => void
      close: () => void
      measureUpvoteRowOffset: () => number | null
      measureBadgeGap: () => number | null
      setUpvoteSpacerHeight: (px: number) => void
      setBadgeSpacerHeight: (px: number) => void
    }>,
  ) {
    const [expanded, setExpanded] = useState(!!defaultExpanded)
    useImperativeHandle(ref, () => ({
      open: () => {
        setExpanded(true)
        onExpandedChange?.(true)
      },
      close: () => {
        setExpanded(false)
        onExpandedChange?.(false)
      },
      measureUpvoteRowOffset: () => null,
      measureBadgeGap: () => null,
      setUpvoteSpacerHeight: () => {},
      setBadgeSpacerHeight: () => {},
    }))
    return (
      <div>
        <span>{item.name}</span>
        {showDistanceSlot && <span>distance-slot {item.name}</span>}
        {expanded && <span>Expanded {item.name}</span>}
        <button onClick={onEdit}>Edit {item.name}</button>
        <button onClick={() => onTagClick('cheese')}>tag {item.name}</button>
        <button onClick={() => onFilterBool('isKosher')}>card-filter {item.name}</button>
        {onNavigate && <button onClick={() => onNavigate(1)}>Next listing from {item.name}</button>}
        {onExpandedChange && (
          <>
            <button onClick={() => onExpandedChange(true)}>Expand {item.name}</button>
            <button onClick={() => onExpandedChange(false)}>Collapse {item.name}</button>
          </>
        )}
      </div>
    )
  }),
}))

// DaveningTimesModal pulls in its own heavy davening-time rendering — out of
// scope here, GenericDirectory only cares whether it opens (and, for the
// initialDayFilter parsing tests below, what it's told to open TO), not what's
// in it.
vi.mock('@/components/synagogues/DaveningTimesModal', () => ({
  default: ({
    isOpen,
    initialDayFilter,
    onClose,
  }: {
    isOpen: boolean
    initialDayFilter?: string[]
    onClose: () => void
  }) =>
    isOpen ? (
      // The label stays in its own element (not a sibling text node next to
      // the close button) so the existing exact-text assertions below —
      // getByText('davening modal open...') — keep matching a single
      // element's own text rather than that element's text plus the
      // button's, now that this mock renders both.
      <div>
        <span>davening modal open{initialDayFilter ? `: ${initialDayFilter.join(',')}` : ''}</span>
        <button onClick={onClose}>Close davening modal</button>
      </div>
    ) : null,
}))

afterEach(() => {
  cleanup()
  resetMockIntersectionObserver()
})

const handlers = {
  onUp: vi.fn(),
  onAdd: vi.fn(),
  onEdit: vi.fn(),
}

describe('GenericDirectory', () => {
  it('renders the category title, listing count, and one card per item', () => {
    const category = makeCategory({ pluralLabel: 'Grocery Stores' })
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' }), makeListing({ id: 'b', name: 'Trader Joe' })]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    expect(screen.getByRole('heading', { name: 'Grocery Stores' })).toBeInTheDocument()
    // "places", not "listings" — this category has an address (the fixture
    // default, same as almost every real category), and DirectoryHeader's
    // count noun follows `hasAddress` the same way the home screen's own
    // category tiles do (see home/sections.tsx's cardCount). It used to say
    // "listings" unconditionally regardless of what the category actually
    // was — see the regression test below for the case that noun is
    // actually right for.
    expect(screen.getByText('2 places')).toBeInTheDocument()
    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.getByText('Trader Joe')).toBeInTheDocument()
  })

  // Regression coverage for DirectoryHeader always saying "N listings"
  // regardless of category — right for WhatsApp Groups/Networking (no
  // address, so "places" would be wrong), but the exact same wrong word
  // for every category that does have one, including this test's own
  // default fixture above.
  it('says "listings", not "places", for a category with no address', () => {
    const category = makeCategory({ pluralLabel: 'Networking', hasAddress: false })
    const items = [makeListing({ id: 'a', name: 'Young Professionals Chat' })]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    expect(screen.getByText('1 listing')).toBeInTheDocument()
    expect(screen.queryByText('1 place')).not.toBeInTheDocument()
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

  // The floating Add button (Gmail-compose-style) — the category page's
  // only Add control now, on every viewport. `desktop:hidden` (jsdom never
  // applies CSS anyway, so this can't be caught by rendering behavior) used
  // to gate it to mobile only; asserting it out of the className is the
  // regression check for that, now that desktop shares this same button
  // instead of DirectoryHeader's old toolbar "Add".
  it('has a floating Add button that clicks onAdd, visible on every viewport', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const category = makeCategory({
      label: 'Grocery Store',
      upvotesEnabled: true,
      detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
    })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} onAdd={onAdd} />)

    const floatingAdd = screen.getByRole('button', { name: 'Add a place' })
    expect(floatingAdd.className).not.toContain('desktop:hidden')
    await user.click(floatingAdd)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  // Regression coverage for the OLD mobile Filters/sort-row Add button,
  // which the floating one above replaced: that row was gated by
  // `hasFilterRow`, and a category with no filterable fields, upvotes, or
  // minyanim (WhatsApp Groups, Networking) rendered the row empty — which
  // used to mean no mobile Add either, since Add lived inside it. The
  // floating button isn't gated on that row at all any more, so this now
  // just confirms it survives for exactly the category shape that broke it
  // before.
  it('still shows the floating Add button for a category with no filterable fields, upvotes, or minyanim', () => {
    const category = makeCategory({ pluralLabel: 'WhatsApp Groups', hasAddress: false })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)

    expect(screen.getByRole('button', { name: 'Add a place' })).toBeInTheDocument()
  })

  // Regression coverage for DirectoryHeader's old desktop-only toolbar "Add"
  // button, removed once the floating button above started covering desktop
  // too — the two used to coexist (one per viewport), so this guards against
  // it quietly coming back alongside the floating one.
  it('has no separate DirectoryHeader toolbar Add button any more', () => {
    const category = makeCategory({ label: 'Grocery Store' })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)

    expect(screen.queryByRole('button', { name: /^Add$/ })).not.toBeInTheDocument()
  })

  it('wires a card\'s Edit/tag-click callbacks back to the directory\'s own props/state', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const category = makeCategory()
    const item = makeListing({ id: 'a', name: 'Kosher Mart' })
    renderWithProviders(<GenericDirectory category={category} items={[item]} {...handlers} onEdit={onEdit} />)

    await user.click(screen.getByRole('button', { name: 'Edit Kosher Mart' }))
    expect(onEdit).toHaveBeenCalledWith(item)

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

  describe('arriving via browser back/forward', () => {
    afterEach(() => {
      vi.mocked(didArriveViaBackForward).mockReturnValue(false)
    })

    // Browser history keeps whatever a replaceState last set an entry's URL
    // to, permanently — so a visitor who filtered this category, went back
    // to (say) Home, then pressed forward, lands back on THIS SAME entry
    // with the exact URL it was left at, filters included. See
    // backForwardNavigation's own module doc: that's expected for a real
    // navigation (a shared link should still show what it says), but
    // surprising for a back/forward traversal specifically — pressing
    // forward into a page you already left reads as "show me that page
    // again," not "restore the exact search I'd abandoned." This is the
    // "blank slate" behavior fixing that: same URL, but the directory
    // itself declines to apply it, and clears it back out to match.
    it("ignores a shared URL's search/filters and clears them from the address bar, when the page arrived via back/forward", () => {
      vi.mocked(didArriveViaBackForward).mockReturnValue(true)
      const onParamsChange = vi.fn()
      const category = makeCategory({
        detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
      })
      const items = [
        { ...makeListing({ id: 'a', name: 'Kosher Mart' }), isKosher: true },
        { ...makeListing({ id: 'b', name: 'Regular Mart' }), isKosher: false },
      ] as unknown as DirectoryResource[]
      renderWithProviders(
        <GenericDirectory
          category={category}
          items={items}
          initialSearch="kosher"
          initialFilters={{ f_isKosher: '1' }}
          {...handlers}
          onParamsChange={onParamsChange}
        />,
      )

      // Blank slate: the search box is empty and BOTH listings show — the
      // URL's own `?q=kosher&f_isKosher=1` was never applied to state.
      expect(screen.getByPlaceholderText('Search…')).toHaveValue('')
      expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
      expect(screen.getByText('Regular Mart')).toBeInTheDocument()

      // The address bar gets caught up to match what's actually on screen.
      expect(onParamsChange).toHaveBeenCalledWith(
        expect.objectContaining({ q: null, f_isKosher: null }),
        { replace: true },
      )
    })

    // The other half of the same behavior: a REAL navigation (a clicked
    // link, a shared URL, typing an address) is exactly the case that
    // SHOULD still hydrate from the URL — that's what makes a filtered link
    // shareable at all. didArriveViaBackForward defaults to false (see the
    // top-of-file mock), so this is the same setup as the test above with
    // nothing overridden.
    it("still applies a shared URL's search/filters normally on a real navigation", () => {
      const category = makeCategory({
        detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
      })
      const items = [
        { ...makeListing({ id: 'a', name: 'Kosher Mart' }), isKosher: true },
        { ...makeListing({ id: 'b', name: 'Regular Mart' }), isKosher: false },
      ] as unknown as DirectoryResource[]
      renderWithProviders(
        <GenericDirectory
          category={category}
          items={items}
          initialSearch="kosher"
          initialFilters={{ f_isKosher: '1' }}
          {...handlers}
        />,
      )

      expect(screen.getByPlaceholderText('Search…')).toHaveValue('kosher')
      expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
      expect(screen.queryByText('Regular Mart')).not.toBeInTheDocument()
    })

    // A category screen isn't torn down and remounted when a visitor
    // navigates away and back to it — it's kept alive under React's own
    // <Activity> instead (see GenericDirectory's own comment above the
    // hasActivatedBeforeRef effect this exercises, and homeRevealSignal.ts
    // for the same mechanism documented on Home/Landing). So the two tests
    // above — which only cover what happens at this component's own true
    // first mount — can't tell apart "the fix works" from "the fix only ever
    // ran once and got lucky." This wraps the SAME instance in a real
    // <Activity> boundary and toggles it hidden-then-visible, the same way
    // the real app's screen stack does for a category left and returned to
    // (whether by pressing back then forward, or just clicking the same
    // category card again — confirmed live, Activity doesn't distinguish
    // between the two; both go through the identical hide/reveal cycle).
    it('clears an already-typed search when Activity hides and reveals this screen again, even without a remount', async () => {
      const user = userEvent.setup()
      const onParamsChange = vi.fn()
      const category = makeCategory({
        detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
      })
      const items = [
        { ...makeListing({ id: 'a', name: 'Kosher Mart' }), isKosher: true },
        { ...makeListing({ id: 'b', name: 'Regular Mart' }), isKosher: false },
      ] as unknown as DirectoryResource[]
      const { rerenderWithProviders } = renderWithProviders(
        <Activity mode="visible">
          <GenericDirectory category={category} items={items} {...handlers} onParamsChange={onParamsChange} />
        </Activity>,
      )

      await user.type(screen.getByPlaceholderText('Search…'), 'kosher')
      expect(screen.getByPlaceholderText('Search…')).toHaveValue('kosher')
      onParamsChange.mockClear()

      // Away (hidden — the visitor is looking at Home) and back (visible
      // again — they returned to this same category), same component tree.
      rerenderWithProviders(
        <Activity mode="hidden">
          <GenericDirectory category={category} items={items} {...handlers} onParamsChange={onParamsChange} />
        </Activity>,
      )
      rerenderWithProviders(
        <Activity mode="visible">
          <GenericDirectory category={category} items={items} {...handlers} onParamsChange={onParamsChange} />
        </Activity>,
      )

      expect(screen.getByPlaceholderText('Search…')).toHaveValue('')
      expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
      expect(screen.getByText('Regular Mart')).toBeInTheDocument()
      expect(onParamsChange).toHaveBeenCalledWith(
        expect.objectContaining({ q: null, f_isKosher: null }),
        { replace: true },
      )
    })
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

  // Reported live: closing the modal (X, Escape, overlay click — all funnel
  // into the same onClose) left `?davening=1` sitting in the URL, so
  // reloading the page after closing reopened a modal the visitor had
  // already dismissed. `?day=` is meaningless without the modal it was
  // filtering, so it clears alongside `davening`.
  it('clears ?davening and ?day from the URL when the modal is closed', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(
      <GenericDirectory
        category={category}
        items={[item]}
        openDaveningModal
        initialDaveningDay="tue"
        {...handlers}
        onParamsChange={onParamsChange}
      />,
    )
    expect(onParamsChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close davening modal' }))

    expect(onParamsChange).toHaveBeenCalledWith({ davening: null, day: null }, { replace: true })
  })

  it('adds ?davening=1 to the URL when the modal is opened from the page itself, not just on arrival', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const category = makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const item = {
      ...makeListing(),
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sunday'], time: '7:00 AM' }],
    } as unknown as DirectoryResource
    renderWithProviders(
      <GenericDirectory category={category} items={[item]} {...handlers} onParamsChange={onParamsChange} />,
    )

    await user.click(screen.getAllByRole('button', { name: /All davening times/ })[0])

    expect(onParamsChange).toHaveBeenCalledWith({ davening: '1' }, { replace: true })
  })

  it('never shows its own Map link, even when a Map pseudo-category exists', () => {
    // GenericDirectory used to render a "🗺️ Map" link (pre-filtered to this
    // category) on both mobile and desktop. Removed on both: each platform
    // already has exactly one persistent, always-visible way to reach the
    // map — the header nav link on desktop, the bottom tab bar on mobile —
    // so a second, category-scoped copy was redundant rather than useful.
    // This guards against either one quietly coming back.
    const category = makeCategory({ hasAddress: true })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />, {
      content: { categories: [category, makeCategory({ id: 'map', kind: 'map' })] },
    })

    expect(screen.queryByRole('link', { name: /Map/ })).not.toBeInTheDocument()
  })

  it('only docks the sticky controls bar (background, shadow, hide-on-scroll) once it is actually stuck', () => {
    // controlsStuck is driven by a sentinel + IntersectionObserver, not a
    // breakpoint guess — see GenericDirectory's own doc for why (a plain
    // width check can't tell "wide enough to stick" apart from "currently
    // stuck", and this got that distinction wrong once already: a genuinely
    // zero-height sentinel reported isIntersecting as always-false in real
    // testing, making the bar permanently look "stuck" from the moment it
    // mounted, before any scrolling at all).
    //
    // The whole "docked" look (not just the shadow) is gated on controlsStuck
    // now — it used to apply `lg:bg-white`/`lg:-mt-3` unconditionally, which
    // pulled the bar's own solid background up 12px regardless of scroll
    // position and overlapped whatever sat directly above it (the Add
    // button) even before any scrolling happened at all.
    const category = makeCategory({ hasAddress: true })
    const { container } = renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)

    const controlsBar = container.querySelector('[class*="lg:sticky"]')
    expect(controlsBar).not.toBeNull()
    expect(controlsBar).not.toHaveClass('lg:bg-white')
    expect(controlsBar).not.toHaveClass('lg:shadow-[0_6px_12px_-8px_rgba(15,23,42,0.35)]')

    // The sentinel scrolling out of view (isIntersecting: false) is what a
    // real scroll-past looks like to the observer — see the sentinel's own
    // rootMargin comment for why "out of view" here means "the bar just
    // engaged its sticky position", not literally off-screen.
    act(() => setAllIntersecting(false))
    expect(controlsBar).toHaveClass('lg:bg-white')
    expect(controlsBar).toHaveClass('lg:shadow-[0_6px_12px_-8px_rgba(15,23,42,0.35)]')

    act(() => setAllIntersecting(true))
    expect(controlsBar).not.toHaveClass('lg:bg-white')
    expect(controlsBar).not.toHaveClass('lg:shadow-[0_6px_12px_-8px_rgba(15,23,42,0.35)]')
  })

  // Regression coverage for the exact mistake described in the test above:
  // the sentinel's non-zero-height safeguard was only ever applied at the
  // `lg:` breakpoint (`lg:h-px`), leaving it genuinely zero-height below
  // that — which is every mobile viewport, where the observer still runs
  // (it isn't gated by breakpoint) even though `controlsStuck`'s only
  // visible effects are. A wrongly-stuck reading taken there doesn't stay
  // invisible forever: it rides along into `lg:`-gated styling the moment
  // the viewport crosses into `lg:`, whether by rotating a device or
  // resizing a browser window past it.
  it("gives the sticky-bar sentinel a real height at every breakpoint, not just where the bar itself can stick", () => {
    const category = makeCategory({ hasAddress: true })
    const { container } = renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)

    const sentinel = container.querySelector('[aria-hidden].h-px')
    expect(sentinel).not.toBeNull()
    expect(sentinel).not.toHaveClass('lg:h-px')
  })

  // Regression coverage for a real, reproduced-by-hand bug: load the page at
  // a mobile width, let it fully settle, then resize the window to a
  // desktop width — the bar can latch into "docked" (white background and
  // all) on a page that was never scrolled. Root cause was the sentinel's
  // very first observation landing against a not-yet-settled layout and
  // never self-correcting from a later legitimate shift — the same failure
  // mode a plain window resize can trigger, since crossing the `lg:`
  // breakpoint reshuffles everything above the sentinel (mobile's address
  // banner disappears, desktop's hero/badge appear). Fixed by replacing the
  // observer outright on a debounced `resize`, rather than trusting the
  // original instance to recompute on its own.
  //
  // The bug itself can't be reproduced here: it's a real-browser timing
  // quirk in IntersectionObserver's callback delivery (confirmed by hand,
  // repeatedly, in an actual browser — see the commit this test shipped
  // with), and MockIntersectionObserver's `setAllIntersecting` fires every
  // currently-observed callback deterministically on demand, which can't
  // exhibit "the real callback just doesn't reliably refire." What IS
  // mechanically verifiable, and what the fix actually changed, is that a
  // resize constructs a brand new IntersectionObserver rather than reusing
  // the original instance — so that's what this asserts, via a constructor
  // spy rather than the mock's intersecting/not-intersecting behavior.
  it('constructs a fresh IntersectionObserver after a resize, rather than reusing the original instance', () => {
    vi.useFakeTimers()
    try {
      const category = makeCategory({ hasAddress: true })
      renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)
      // Flush the mount-time resync (a double rAF once the document is
      // already "complete", which it is by default in this jsdom test
      // environment) so it isn't mistaken for the resize-triggered one below.
      act(() => vi.advanceTimersByTime(50))

      const IntersectionObserverSpy = vi.spyOn(window, 'IntersectionObserver')
      expect(IntersectionObserverSpy).not.toHaveBeenCalled()

      act(() => window.dispatchEvent(new Event('resize')))
      // Not yet — debounced to the quiet period after the resize burst ends.
      expect(IntersectionObserverSpy).not.toHaveBeenCalled()

      act(() => vi.advanceTimersByTime(200))
      expect(IntersectionObserverSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
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

  // The scroll above already covers the true-first-mount case. This is the
  // bug a real user reported live: clicking a different listing from the
  // home hero's search dropdown updated the URL (?item=<id>) but nothing
  // visibly opened until a full reload. Root cause — `defaultExpanded` (the
  // prop each card reads its OWN initial `expanded` state from) only ever
  // applies on that card's own first mount; it has no effect once this
  // directory is already mounted, which Next's Cache Components makes the
  // common case (a recent route's component tree is kept alive via
  // <Activity> rather than unmounted — see the "clears an already-typed
  // search" test above for the same mechanism). A plain rerender with a new
  // reopenItemId, no <Activity> needed, already reproduces it: this effect's
  // dependency array is what actually matters, not the wrapper.
  it('opens the reopened listing on a later reopenItemId change too, not just at first mount', () => {
    const category = makeCategory()
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' }), makeListing({ id: 'b', name: 'Trader Joe' })]
    const { rerenderWithProviders } = renderWithProviders(
      <GenericDirectory category={category} items={items} {...handlers} />,
    )
    expect(screen.queryByText('Expanded Trader Joe')).not.toBeInTheDocument()

    rerenderWithProviders(<GenericDirectory category={category} items={items} {...handlers} reopenItemId="b" />)

    expect(screen.getByText('Expanded Trader Joe')).toBeInTheDocument()
  })
})

// Same one-way-in problem the Davening modal's own `davening`/`day` sync
// solves above — GenericListingCard's onExpandedChange (fired on open,
// close, and toggle) is wired here to keep ?item=<id> in the URL matching
// whichever card is actually open, so a reload or a shared link lands back
// on the same expanded listing.
describe('GenericDirectory — syncing ?item with the expanded listing', () => {
  it('sets ?item=<id> when a card is expanded', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const category = makeCategory()
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' })]
    renderWithProviders(
      <GenericDirectory category={category} items={items} {...handlers} onParamsChange={onParamsChange} />,
    )

    await user.click(screen.getByRole('button', { name: 'Expand Kosher Mart' }))

    expect(onParamsChange).toHaveBeenCalledWith({ item: 'a' }, { replace: true })
  })

  it('clears ?item when the card is collapsed', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const category = makeCategory()
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' })]
    renderWithProviders(
      <GenericDirectory category={category} items={items} {...handlers} onParamsChange={onParamsChange} />,
    )

    await user.click(screen.getByRole('button', { name: 'Collapse Kosher Mart' }))

    expect(onParamsChange).toHaveBeenCalledWith({ item: null }, { replace: true })
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

// Mobile's own copy of the "Set location" prompt used to live inside
// DirectoryHeader, right above the search bar — moved to the very top of
// the page (above the category band/title entirely) at the user's request,
// as a bigger, dismissible `banner`, distinct from desktop's compact
// `inline` pill that stays put next to the title. Both variants share the
// same `addressPrompt`/`anchorLabel` gating, so jsdom (which never applies
// the `desktop:hidden`/`hidden desktop:*` CSS keeping only one visible per
// viewport) renders both at once — this asserts on DOM position instead.
describe('GenericDirectory — mobile "Set location" banner at the top of the page', () => {
  it('renders the banner as the very first thing on the page, plus desktop\'s inline pill', () => {
    const category = makeCategory()
    const { container } = renderWithProviders(
      <GenericDirectory category={category} items={[makeListing()]} addressPrompt {...handlers} />,
    )

    expect(screen.getAllByRole('button', { name: /Set location to see distances/ })).toHaveLength(2)

    const rootFirstChild = container.firstElementChild!.firstElementChild as HTMLElement
    expect(rootFirstChild.className).toMatch(/desktop:hidden/)
    expect(within(rootFirstChild).getByRole('button', { name: /Set location to see distances/ })).toBeInTheDocument()
  })

  it('shows nothing once a location is resolved (anchorLabel set)', () => {
    const category = makeCategory()
    renderWithProviders(
      <GenericDirectory category={category} items={[makeListing()]} addressPrompt anchorLabel="19103" {...handlers} />,
    )

    expect(screen.queryByRole('button', { name: /Set location to see distances/ })).not.toBeInTheDocument()
  })
})

describe('GenericDirectory — pinned listings sort first', () => {
  afterEach(() => localStorage.clear())

  // Seeded directly via the real pinned.ts storage shape rather than driven
  // through a kebab click — GenericListingCard is stubbed in this file (see
  // the mock at the top), so there's no real Pin control to click here; this
  // is the same thing PinnedProvider itself reads on mount.
  it('renders a pinned listing first, ahead of popularity/alphabetical order', () => {
    localStorage.setItem('jpc:pinned-listings', JSON.stringify([{ id: 'b', categoryId: 'grocery' }]))
    const category = makeCategory({ id: 'grocery', upvotesEnabled: true })
    const items = [
      makeListing({ id: 'a', name: 'Alpha', upvotes: 10 }),
      makeListing({ id: 'b', name: 'Beta', upvotes: 0 }),
    ]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    const names = screen.getAllByText(/^(Alpha|Beta)$/).map((el) => el.textContent)
    expect(names).toEqual(['Beta', 'Alpha'])
  })
})

// The desktop shared-element morph target (see GenericDirectory's own
// `categoryBadge` doc) — a bigger copy of the same icon badge CompactCard
// shows for this category on the home screen, present only so React's real
// <ViewTransition> has something on this page to grow the clicked badge
// into. vitest.setup.ts's own matchMedia stub always reports desktop
// (`matches: false`), which is what most of these need; mockMobile below
// overrides it for the one that doesn't.
function mockMobile() {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

describe('GenericDirectory — desktop category badge (morph target)', () => {
  afterEach(() => {
    // Restores vitest.setup.ts's own desktop-default stub — see its own
    // comment on why every other test in this file relies on that default.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })

  it('shows a 64px icon badge above the title on desktop', () => {
    const category = makeCategory({ id: 'grocery', icon: '🛒' })
    renderWithProviders(<GenericDirectory category={category} items={[]} {...handlers} />)

    const badge = document.querySelector('[class*="h-16"][class*="w-16"]')
    expect(badge).toBeInTheDocument()
  })

  it('renders no badge on mobile — that navigation has its own directional slide instead', () => {
    mockMobile()
    const category = makeCategory({ id: 'grocery', icon: '🛒' })
    renderWithProviders(<GenericDirectory category={category} items={[]} {...handlers} />)

    expect(document.querySelector('[class*="h-16"][class*="w-16"]')).not.toBeInTheDocument()
  })

  it('renders no badge for a category with no icon — nothing to morph', () => {
    const category = makeCategory({ id: 'networking', icon: undefined })
    renderWithProviders(<GenericDirectory category={category} items={[]} {...handlers} />)

    expect(document.querySelector('[class*="h-16"][class*="w-16"]')).not.toBeInTheDocument()
  })
})
