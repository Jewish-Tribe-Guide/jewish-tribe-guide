// @vitest-environment jsdom
import { Activity, forwardRef, useContext, useImperativeHandle, useState, type Ref } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { resolveCapabilities } from '@/lib/categories'
import { resetMockIntersectionObserver, setAllIntersecting } from '@/test/intersectionObserverMock'
import type { DirectoryResource } from '@/types'
import { TellAboutContext } from './tellAbout'
import { didArriveViaBackForward } from '@/lib/backForwardNavigation'
import { ForcedViewport } from '@/lib/useIsMobile'
import { ScreenHeaderProvider, useScreenHeader } from '@/lib/headerVisibility'
import { useNextMinyan as useNextMinyanInColumn } from './nextMinyans'
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
vi.mock('./GenericListingCard', async () => {
  const { useNextMinyan } = await import('./nextMinyans')
  return {
  // A real forwardRef + useImperativeHandle open()/close(), same shape as
  // the real GenericListingCardHandle — needed so the reopenItemId→open()
  // wiring (GenericDirectory's own cardRefs.current.get(id)?.open()) is
  // actually exercisable here, not silently swallowed by a ref-less mock.
  GenericListingCard: forwardRef(function GenericListingCard(
    {
      item,
      defaultExpanded,
      onEdit,
      onNavigate,
      onExpandedChange,
      found,
      place,
      omitKey,
      flagUnconfirmed,
      likes,
      look,
    }: {
      item: DirectoryResource
      defaultExpanded?: boolean
      onEdit: () => void
      onNavigate?: (direction: 1 | -1) => void
      onExpandedChange?: (expanded: boolean) => void
      found?: { items: { tag: string }[]; fields: { label: string }[] } | null
      place?: string | null
      omitKey?: string | null
      flagUnconfirmed?: boolean
      likes?: number
      look?: string
    },
    ref: Ref<{
      open: () => void
      close: () => void
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
    }))
    return (
      <div>
        <span>{item.name}</span>
        <NextMinyanNote id={item.id} name={item.name} />
        {item.milesFromAddress != null && <span>{item.name} is {item.milesFromAddress} mi</span>}
        {expanded && <span>Expanded {item.name}</span>}
        {place !== undefined && <span>{item.name} is in {place ?? 'nowhere'}</span>}
        {omitKey && <span>{item.name} leaves out {omitKey}</span>}
        {flagUnconfirmed && <span>{item.name} may say unconfirmed</span>}
        {likes !== undefined && <span>{item.name} shows {likes} likes</span>}
        <span>{item.name} looks like {look}</span>
        {found && <span>found on {item.name}: {[...found.items.map((m) => m.tag), ...found.fields.map((f) => f.label)].join(', ')}</span>}
        <button onClick={onEdit}>Edit {item.name}</button>
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
  }
  function NextMinyanNote({ id, name }: { id: string; name: string }) {
    const next = useNextMinyan(id)
    return next ? <span>next minyan at {name}: {next.text}</span> : null
  }
})

// The listing's Suggest an edit (ListingEditBar), opening the box the page
// offers, with its own editor for "Edit the details myself".
const columnEdit = vi.fn()
function ColumnTell({ item }: { item: DirectoryResource }) {
  const tell = useContext(TellAboutContext)
  return tell ? <button onClick={() => tell(item, () => columnEdit(item.id))}>{`Suggest an edit to ${item.name}`}</button> : null
}

function ColumnMinyan({ id, name }: { id: string; name: string }) {
  const next = useNextMinyanInColumn(id)
  return next ? <p>column minyan at {name}: {next.text}</p> : null
}

// The listing a desktop visitor opens takes the list's column. What it shows
// is ListingView's (tested there); here, only what it's told and what its
// buttons do to the list.
vi.mock('./ListingColumn', () => ({
  default: ({
    item,
    backLabel,
    onBack,
    position,
    onStep,
    alone,
    onShowMap,
    found,
    phone,
  }: {
    item: DirectoryResource
    phone?: boolean
    backLabel: string
    onBack: () => void
    position: { index: number; total: number }
    onStep: (d: 1 | -1) => void
    alone: boolean
    onShowMap?: () => void
    found: { items: { tag: string }[] } | null
  }) => (
    <section data-testid="listing-column" aria-label={item.name}>
      <p>
        Column: {item.name}, {position.index + 1} of {position.total}
        {phone ? ', the page' : alone ? ', alone' : ', map beside'}
      </p>
      {found && <p>column found: {found.items.map((m) => m.tag).join(', ')}</p>}
      <ColumnMinyan id={item.id} name={item.name} />
      <ColumnTell item={item} />
      <button onClick={onBack}>{backLabel}</button>
      <button onClick={() => onStep(-1)}>Previous listing</button>
      <button onClick={() => onStep(1)}>Next listing</button>
      {onShowMap && <button onClick={onShowMap}>Show map</button>}
    </section>
  ),
}))


// The map beside the list is real and separately tested (CategoryMap.test);
// here, a stand-in showing what the page hands it, with its pins as
// buttons.
vi.mock('./CategoryMap', async () => {
  const { useSyncExternalStore } = await import('react')
  const actual = await vi.importActual<typeof import('./CategoryMap')>('./CategoryMap')
  return {
    createHighlight: actual.createHighlight,
    useWide: actual.useWide,
    default: function CategoryMap({
      items,
      highlight,
      selectedId,
      onSelect,
      onHide,
      fullMapHref,
    }: {
      items: DirectoryResource[]
      highlight: import('./CategoryMap').Highlight
      selectedId?: string | null
      onSelect: (id: string) => void
      onHide: () => void
      fullMapHref: string
    }) {
      const lit = useSyncExternalStore(highlight.subscribe, highlight.get, () => null)
      return (
        <div data-testid="map-stand-in" data-href={fullMapHref}>
          <span>map shows: {items.map((i) => i.name).join(', ')}</span>
          <span>pin lit: {lit ?? 'none'}</span>
          <span>map on: {selectedId ?? 'nothing'}</span>
          {items.map((i) => (
            <button key={i.id} onClick={() => onSelect(i.id)}>
              pin {i.name}
            </button>
          ))}
          <button onClick={onHide}>Hide map</button>
        </div>
      )
    },
  }
})

afterEach(() => {
  cleanup()
  resetMockIntersectionObserver()
  // Hide map, the split and Cards/List are one browser-wide choice each
  // (useSharedPreference): none carries into the next test.
  localStorage.clear()
})

// Whether today is Yom Tov comes from the zmanim; nothing here needs it.
// Stubbed so a shul list doesn't reach for /api/zmanim.
const zmanimMock = vi.hoisted(() => vi.fn<(coords?: unknown) => { data: null; status: 'loading' }>(() => ({ data: null, status: 'loading' })))
vi.mock('@/lib/useZmanim', () => ({ useZmanim: zmanimMock }))

/** Sort's menu: open it, pick a choice. */
async function chooseSort(user: ReturnType<typeof userEvent.setup>, choice: 'Popularity' | 'Distance') {
  await user.click(screen.getByRole('button', { name: /^Sort/ }))
  await user.click(screen.getByRole('menuitemradio', { name: choice }))
}

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
    // One noun regardless of category — DirectoryHeader used to switch
    // between "places" (has an address) and "listings" (doesn't, e.g.
    // WhatsApp Groups/Networking), which made "place" the odd term out
    // since it doesn't fit an address-less category at all. "Listing" works
    // either way, so it's the one word now, everywhere.
    expect(screen.getByText('2 listings')).toBeInTheDocument()
    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.getByText('Trader Joe')).toBeInTheDocument()
  })

  it('filters the list by search text', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' }), makeListing({ id: 'b', name: 'Trader Joe' })]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.type(screen.getByRole('searchbox'), 'kosher')

    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.queryByText('Trader Joe')).not.toBeInTheDocument()
  })

  // The phrasing a real visitor typed, and a spelling the listing doesn't use:
  // the item is tagged "Chalav". Word-for-word matching found neither.
  it('reads the search as a question, whatever the spelling', async () => {
    const user = userEvent.setup()
    const category = makeCategory({ detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
    const items = [
      makeListing({ id: 'a', name: 'ShopRite', m: ['Chalav Yisroel Milk', 'Challah'] }),
      makeListing({ id: 'b', name: 'Trader Joe', m: ['Challah'] }),
    ]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.type(screen.getByRole('searchbox', { name: 'Search Grocery Stores' }), 'where can I buy cholov yisroel milk')

    expect(screen.getByText('ShopRite')).toBeInTheDocument()
    expect(screen.queryByText('Trader Joe')).not.toBeInTheDocument()
  })

  it('says a search found nothing once, in the box under the search, not again below it (the user, Oct 10)', async () => {
    const user = userEvent.setup()
    const category = makeCategory({ pluralLabel: 'Grocery Stores' })
    const items = [makeListing({ id: 'a', name: 'Kosher Mart' })]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.type(screen.getByRole('searchbox'), 'nonexistent')

    expect(screen.getByTestId('ask-the-group')).toHaveTextContent('Nothing in the guide for “nonexistent”.')
    expect(screen.queryByText('No grocery stores match your search.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear search & filters' })).not.toBeInTheDocument()
    // Nor "0 listings" with Filters and Sort for a list that isn't there.
    expect(screen.queryByTestId('list-heading')).not.toBeInTheDocument()
  })

  describe('the search box: asking comes first', () => {
    const grocery = makeCategory({ detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
    const stores = [
      makeListing({ id: 'a', name: 'ShopRite', m: ['Challah', 'Wine'] }),
      makeListing({ id: 'b', name: 'Trader Joe', m: ['Challah', 'Wine'] }),
      makeListing({ id: 'c', name: 'Acme', m: ['Challah'] }),
    ]

    it('says it searches this category, with no heading and no example searches (the user, Oct 10)', () => {
      renderWithProviders(<GenericDirectory category={grocery} items={stores} {...handlers} />)
      expect(screen.queryByRole('heading', { name: 'Search' })).not.toBeInTheDocument()
      expect(screen.getByRole('searchbox', { name: 'Search Grocery Stores' })).toHaveAttribute('placeholder', 'Ask for any item or store')
      expect(screen.getByText('in Grocery Stores')).toBeInTheDocument()
      expect(screen.queryByText('Try')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'challah' })).not.toBeInTheDocument()
    })

    it('answers what is typed', async () => {
      const user = userEvent.setup()
      renderWithProviders(<GenericDirectory category={grocery} items={stores} {...handlers} />)
      await user.type(screen.getByRole('searchbox'), 'challah')
      expect(screen.getByRole('status')).toHaveTextContent(/challah/i)
    })

    it('shares an answer as the question naming this category, with the answer in the message (agreed Oct 1)', async () => {
      const shareFn = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, share: shareFn })
      try {
        const user = userEvent.setup()
        renderWithProviders(<GenericDirectory category={grocery} items={stores} {...handlers} />)
        await user.type(screen.getByRole('searchbox'), 'challah')
        await user.click(screen.getByRole('button', { name: 'Share this answer' }))
        const asked = `${grocery.label.toLowerCase()} challah`
        expect(shareFn).toHaveBeenCalledWith({
          title: asked,
          text: 'Where can I get challah? 3 places have Challah.',
          url: `${window.location.origin}/test-community/ask/${asked.replace(/ /g, '-')}`,
        })
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('found nothing: asks the group, as the home search does, and nothing else', async () => {
      const user = userEvent.setup()
      renderWithProviders(<GenericDirectory category={grocery} items={stores} {...handlers} />)
      await user.type(screen.getByRole('searchbox'), 'rugelach')
      const card = within(screen.getByTestId('ask-the-group'))
      expect(card.getByText('Nothing in the guide for “rugelach”.')).toBeInTheDocument()
      expect(card.getByRole('button', { name: 'Ask in a WhatsApp group' })).toBeInTheDocument()
      expect(card.queryByRole('button', { name: /Know where to find it/ })).not.toBeInTheDocument()
    })

    it('shows an answer only after a search: nothing sits under the box unasked', () => {
      renderWithProviders(<GenericDirectory category={grocery} items={stores} {...handlers} />)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('no longer shows the old "you can just ask" tip', () => {
      renderWithProviders(<GenericDirectory category={grocery} items={stores} {...handlers} />)
      expect(screen.queryByText(/you can just ask/i)).not.toBeInTheDocument()
    })
  })

  it('shows a plain "none listed" empty state (no clear button) when there are simply no items', () => {
    const category = makeCategory({ pluralLabel: 'Grocery Stores' })
    renderWithProviders(<GenericDirectory category={category} items={[]} {...handlers} />)

    expect(screen.getByText('No grocery stores listed yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear search & filters' })).not.toBeInTheDocument()
  })

  it('opens the same box as the “+” from the empty state', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const category = makeCategory({ label: 'Grocery Store' })
    renderWithProviders(<GenericDirectory category={category} items={[]} {...handlers} onAdd={onAdd} />)

    await user.click(screen.getByRole('button', { name: /Add grocery store/ }))
    expect(await screen.findByRole('dialog', { name: 'Add or update a place' })).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  // The floating Add button (Gmail-compose-style) — the category page's
  // only Add control now, on every viewport. `desktop:hidden` (jsdom never
  // applies CSS anyway, so this can't be caught by rendering behavior) used
  // to gate it to mobile only; asserting it out of the className is the
  // regression check for that, now that desktop shares this same button
  // instead of DirectoryHeader's old toolbar "Add".
  // Since Oct 5 the "+" opens "Saw something? Tell us"; filling it in
  // yourself is "Find the place" inside it, adding to this category.
  it('has a floating Add button, visible on every viewport, that opens the box, adding to this category', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const category = makeCategory({
      label: 'Grocery Store',
      upvotesEnabled: true,
      detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
    })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} onAdd={onAdd} />)

    const floatingAdd = screen.getByRole('button', { name: 'Add' })
    expect(floatingAdd.className).not.toContain('desktop:hidden')
    await user.click(floatingAdd)
    await user.click(await screen.findByRole('button', { name: 'Fill it in yourself' }))
    await user.click(screen.getByRole('button', { name: 'Not on Google? Fill it in yourself' }))
    expect(screen.getByRole('dialog', { name: 'Add to Grocery Stores' })).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
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

    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  // Agreed Oct 5: Add stays on a listing. The page's floating "+" steps
  // aside while one is open (on a phone the listing's own row passes under
  // it as the sheet scrolls, and it covered the listing's overflow); the
  // listing's row has its own "+" instead, from the page (TellAboutContext).
  it('steps the page’s Add aside over a listing open on a phone, where its own row has the “+”', async () => {
    const item = makeListing({ name: 'Trader Joe’s' })
    // reopenItemId drives GenericDirectory's own cardRefs.get(id).open(),
    // which fires onExpandedChange — the same path a real click takes,
    // without needing the stubbed card to grow a toggle of its own.
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericDirectory category={makeCategory()} items={[item]} {...handlers} reopenItemId={item.id} />
      </ForcedViewport>,
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument())
  })

  // Oct 6: on desktop the listing's own row is at the foot of a long
  // listing, out of sight, and the user couldn't find Add. Nothing passes
  // under the floating one there, so it stays, for adding anything; the
  // listing is Suggest an edit's, which opens the box about it.
  it('keeps the page’s Add over a listing open on desktop; Suggest an edit opens the box about the listing', async () => {
    handlers.onEdit.mockClear()
    columnEdit.mockClear()
    const item = makeListing({ name: 'Trader Joe’s' })
    renderWithProviders(
      <ForcedViewport isMobile={false}>
        <GenericDirectory category={makeCategory()} items={[item]} {...handlers} reopenItemId={item.id} />
      </ForcedViewport>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('dialog', { name: 'Add or update a place' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest an edit to Trader Joe’s' }))
    expect(await screen.findByRole('dialog', { name: 'Update Trader Joe’s' })).toBeInTheDocument()
    // From a listing, editing it yourself, not adding a place: the
    // listing's own editor, in place, never the page's form.
    expect(screen.queryByRole('button', { name: 'Fill it in yourself' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit it yourself' }))
    expect(columnEdit).toHaveBeenCalledWith(item.id)
    expect(handlers.onEdit).not.toHaveBeenCalled()
  })

  it('shows the floating Add button when no listing is open', () => {
    renderWithProviders(<GenericDirectory category={makeCategory()} items={[makeListing()]} {...handlers} />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('opens the box from Suggest an edit in a category that takes edits but no additions, and not in one that takes neither', () => {
    const item = makeListing({ name: 'Trader Joe’s' })
    const caps = (c: object) => makeCategory({ capabilities: { ...resolveCapabilities(undefined), ...c } })
    renderWithProviders(<GenericDirectory category={caps({ add: false })} items={[item]} {...handlers} reopenItemId={item.id} />)
    expect(screen.getByRole('button', { name: 'Suggest an edit to Trader Joe’s' })).toBeInTheDocument()
    cleanup()
    renderWithProviders(<GenericDirectory category={caps({ add: false, edit: false })} items={[item]} {...handlers} reopenItemId={item.id} />)
    expect(screen.queryByRole('button', { name: 'Suggest an edit to Trader Joe’s' })).not.toBeInTheDocument()
  })

  // A bare icon circle is a mobile convention people already have a
  // reflex for; desktop doesn't have that reflex, so it gets the same
  // "Add a listing" wording made visible instead of relying only on the
  // aria-label. `desktop:inline` on the label span (jsdom never applies
  // CSS, so this is asserted out of the className, same as the
  // desktop:hidden check above) is what makes it show up there but not on
  // mobile, where it would just be redundant with the shape.
  it('shows the "Add" label visibly for desktop, not just as an aria-label', () => {
    renderWithProviders(<GenericDirectory category={makeCategory()} items={[makeListing()]} {...handlers} />)

    const label = screen.getByText('Add', { selector: 'span' })
    expect(label.className).toContain('desktop:inline')
    expect(label.className).toContain('hidden')
  })

  // Regression coverage for DirectoryHeader's old desktop-only toolbar "Add"
  // button, removed once the floating button above started covering desktop
  // too — the two used to coexist (one per viewport), so this guards against
  // it quietly coming back alongside the floating one.
  it('has no separate DirectoryHeader toolbar Add button any more', () => {
    const category = makeCategory({ label: 'Grocery Store' })
    renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)

    // One "Add", and it's the floating one (named "Add" too since Oct 5).
    const adds = screen.getAllByRole('button', { name: /^Add$/ })
    expect(adds).toHaveLength(1)
    expect(adds[0].className).toContain('fixed')
  })

  it('wires a card\'s Edit callback back to the directory\'s own props', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const category = makeCategory()
    const item = makeListing({ id: 'a', name: 'Kosher Mart' })
    renderWithProviders(<GenericDirectory category={category} items={[item]} {...handlers} onEdit={onEdit} />)

    await user.click(screen.getByRole('button', { name: 'Edit Kosher Mart' }))
    expect(onEdit).toHaveBeenCalledWith(item)
  })

  it('a filterable boolean field narrows the list when switched on in the Filters sheet', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
    })
    const items = [
      { ...makeListing({ id: 'a', name: 'Kosher Mart' }), isKosher: true },
      { ...makeListing({ id: 'b', name: 'Regular Mart' }), isKosher: false },
    ] as unknown as DirectoryResource[]
    renderWithProviders(<GenericDirectory category={category} items={items} {...handlers} />)

    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(screen.getByRole('switch', { name: 'Kosher' }))

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

    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('button', { name: 'italian' }))

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
      expect(screen.getByRole('searchbox')).toHaveValue('')
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

      expect(screen.getByRole('searchbox')).toHaveValue('kosher')
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

      await user.type(screen.getByRole('searchbox'), 'kosher')
      expect(screen.getByRole('searchbox')).toHaveValue('kosher')
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

      expect(screen.getByRole('searchbox')).toHaveValue('')
      expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
      expect(screen.getByText('Regular Mart')).toBeInTheDocument()
      expect(onParamsChange).toHaveBeenCalledWith(
        expect.objectContaining({ q: null, f_isKosher: null }),
        { replace: true },
      )
    })
  })

  describe('Sort: Popularity or Distance', () => {
    const sortShows = () => screen.getByTestId('sort-shown').textContent
    it('opens the location picker instead of switching to Distance when nothing is anchored yet', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ upvotesEnabled: true })
      const openLocation = vi.fn()
      document.addEventListener('jpc:open-location', openLocation)
      renderWithProviders(<GenericDirectory category={category} items={[makeListing()]} {...handlers} />)

      await chooseSort(user, 'Distance')

      expect(openLocation).toHaveBeenCalledTimes(1)
      expect(sortShows()).toBe('Popularity')
      document.removeEventListener('jpc:open-location', openLocation)
    })

    it('switches to Distance when an anchor is already set', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ upvotesEnabled: true })
      renderWithProviders(
        <GenericDirectory category={category} items={[makeListing()]} anchorLabel="123 Main St" {...handlers} />,
      )

      expect(sortShows()).toBe('Distance')
      await chooseSort(user, 'Popularity')
      expect(sortShows()).toBe('Popularity')
      await chooseSort(user, 'Distance')
      expect(sortShows()).toBe('Distance')
    })

    it('a search asking for the nearest puts them first, whatever the Sort says', async () => {
      // Reported Sep 29: "restaurant near me" came back by popularity.
      const user = userEvent.setup()
      const category = makeCategory({ upvotesEnabled: true })
      const items = [
        makeListing({ id: 'far', name: 'Kosher Far', upvotes: 9, milesFromAddress: 5 }),
        makeListing({ id: 'near', name: 'Kosher Near', upvotes: 0, milesFromAddress: 0.5 }),
      ]
      renderWithProviders(<GenericDirectory category={category} items={items} anchorLabel="123 Main St" {...handlers} />)
      await chooseSort(user, 'Popularity')
      const order = () => screen.getAllByText(/^Kosher (Far|Near)$/).map((e) => e.textContent)
      await user.type(screen.getByRole('searchbox'), 'kosher ')
      expect(order()).toEqual(['Kosher Far', 'Kosher Near'])
      await user.type(screen.getByRole('searchbox'), 'near me')
      expect(order()).toEqual(['Kosher Near', 'Kosher Far'])
    })

    // Oct 10: the order typed in the search shows on the Sort button, and
    // picking the other order there takes those words out of the box.
    it('a search asking for an order shows it on Sort, and picking the other takes the words out', async () => {
      const user = userEvent.setup()
      const category = makeCategory({ upvotesEnabled: true })
      const items = [
        makeListing({ id: 'far', name: 'Kosher Far', upvotes: 9, milesFromAddress: 5 }),
        makeListing({ id: 'near', name: 'Kosher Near', upvotes: 0, milesFromAddress: 0.5 }),
      ]
      renderWithProviders(<GenericDirectory category={category} items={items} anchorLabel="123 Main St" {...handlers} />)
      const order = () => screen.getAllByText(/^Kosher (Far|Near)$/).map((e) => e.textContent)
      const box = screen.getByRole('searchbox')
      expect(sortShows()).toBe('Distance')

      await user.type(box, 'best kosher')
      expect(sortShows()).toBe('Popularity')
      expect(order()).toEqual(['Kosher Far', 'Kosher Near'])
      await chooseSort(user, 'Distance')
      expect(box).toHaveValue('kosher')
      expect(sortShows()).toBe('Distance')
      expect(order()).toEqual(['Kosher Near', 'Kosher Far'])

      await chooseSort(user, 'Popularity')
      await user.clear(box)
      await user.type(box, 'closest kosher')
      expect(sortShows()).toBe('Distance')
      await chooseSort(user, 'Popularity')
      expect(box).toHaveValue('kosher')
      expect(sortShows()).toBe('Popularity')
    })

    it('has no Sort where there is only one way to sort (likes off)', () => {
      renderWithProviders(<GenericDirectory category={makeCategory()} items={[makeListing()]} {...handlers} />)
      expect(screen.queryByRole('button', { name: /^Sort/ })).not.toBeInTheDocument()
    })
  })

  // Step 4 (agreed Oct 1): "All davening times" and `?davening=1` (the
  // home page's link) open the Minyanim view, every minyan by time, in place
  // of the list, where they used to open the week's times in a dialog.
  const shulCategory = () => makeCategory({ detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
  const shulItem = () =>
    ({ ...makeListing(), minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'], time: '7:00 AM' }] }) as unknown as DirectoryResource

  it('opens the Minyanim view from “Minyanim by time”, in place of the list, with its way back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={shulCategory()} items={[shulItem()]} {...handlers} />)

    await user.click(screen.getAllByRole('button', { name: /Minyanim by time/ })[0])

    expect(await screen.findByTestId('minyanim-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Minyanim by time' })).toBeInTheDocument()
  })

  it('opens on the Minyanim view on arrival when openMinyanimView is set (?davening=1)', async () => {
    renderWithProviders(<GenericDirectory category={shulCategory()} items={[shulItem()]} openMinyanimView {...handlers} />)

    expect(await screen.findByTestId('minyanim-view')).toBeInTheDocument()
  })

  it('an ordinary visit opens on the shuls', () => {
    renderWithProviders(<GenericDirectory category={shulCategory()} items={[shulItem()]} {...handlers} />)

    expect(screen.queryByTestId('minyanim-view')).not.toBeInTheDocument()
    // No Synagogues / Minyanim toggle any more (Oct 6): one row is the way in.
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByTestId('next-minyan')).toHaveAccessibleName(/^Minyanim by time/)
  })

  // `?day=` from the home page's link: that day's tab, when it's one of
  // the days shown; a piece that isn't a weekday drops out.
  it('arrives on the day the link names', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T09:00:00-04:00')) // a Monday
    try {
      renderWithProviders(<GenericDirectory category={shulCategory()} items={[shulItem()]} openMinyanimView initialDaveningDay="tue,holiday" {...handlers} />)
      expect(await screen.findByRole('tab', { selected: true })).toHaveTextContent(/^Tue/)
      cleanup()
      renderWithProviders(<GenericDirectory category={shulCategory()} items={[shulItem()]} openMinyanimView initialDaveningDay="nonsense" {...handlers} />)
      expect(await screen.findByRole('tab', { selected: true })).toHaveTextContent(/^Today/)
    } finally {
      vi.useRealTimers()
    }
  })

  // Reported live, of the dialog this replaces: leaving it left
  // `?davening=1` in the URL, so a reload reopened it. Back to the shuls
  // clears `?davening` and `?day`.
  it('clears ?davening and ?day from the URL when going back to the shuls', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    renderWithProviders(
      <GenericDirectory category={shulCategory()} items={[shulItem()]} openMinyanimView initialDaveningDay="tue" {...handlers} onParamsChange={onParamsChange} />,
    )
    expect(onParamsChange).not.toHaveBeenCalled()

    await user.click(within(screen.getByTestId('directory-up')).getByRole('button'))

    expect(onParamsChange).toHaveBeenCalledWith({ davening: null, day: null }, { replace: true })
  })

  it('adds ?davening=1 to the URL when the view is opened from the page itself, not just on arrival', async () => {
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

    await user.click(screen.getAllByRole('button', { name: /Minyanim by time/ })[0])

    // A step Back undoes (Oct 6), not a replaced address.
    expect(onParamsChange).toHaveBeenCalledWith({ davening: '1' }, { step: 'minyanim' })
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
    //
    // Only a category without a map has the sticky bar: where the map sits
    // beside the list, the map stays in view instead (see "the map beside
    // the list" below).
    const category = makeCategory({ hasAddress: true, capabilities: { ...resolveCapabilities(), map: false } })
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

// Same one-way-in problem the Minyanim view's own `davening`/`day` sync
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

    // A step on a computer, where it has the page (Oct 6); see the desktop
    // describe below.
    expect(onParamsChange).toHaveBeenCalledWith({ item: 'a' }, { step: 'listing' })
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

    expect(onParamsChange).toHaveBeenCalledWith({ item: null, match: null }, { replace: true })
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

// Above the list is for asking; the list's own heading is for arranging it:
// how many, then Filters (one sheet holding every filter) and Sort, the same
// place on every category page.
describe('GenericDirectory — the list heading', () => {
  const food = makeCategory({
    upvotesEnabled: true,
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours', filterable: true },
      { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', filterable: true },
      {
        key: 't',
        label: 'Food type',
        type: 'select',
        filterable: true,
        options: [
          { value: 'Meat', label: 'Meat' },
          { value: 'Other', label: 'Other' },
          { value: 'Dairy', label: 'Dairy' },
        ],
      },
    ],
  })
  const items = [
    { ...makeListing({ id: 'a', name: 'Grill' }), t: 'Meat', shabbatFriendly: true },
    { ...makeListing({ id: 'b', name: 'Cafe' }), t: 'Dairy' },
    { ...makeListing({ id: 'c', name: 'Truck' }), t: 'Other' },
  ] as unknown as DirectoryResource[]

  it('says how many, with Filters and Sort beside it', () => {
    renderWithProviders(<GenericDirectory category={food} items={items} {...handlers} />)
    const heading = within(screen.getByTestId('list-heading'))
    expect(heading.getByRole('heading', { name: '3 listings' })).toBeInTheDocument()
    expect(heading.getByRole('button', { name: /^Filters/ })).toBeInTheDocument()
    expect(heading.getByRole('button', { name: 'Sort Popularity' })).toBeInTheDocument()
  })

  it('puts the category’s own link (“Other Mikvahs”) after the last row, not in the heading', () => {
    const mikvahs = { ...food, externalLink: { label: 'Other Mikvahs', url: 'https://mikvah.org/directory' } }
    renderWithProviders(<GenericDirectory category={mikvahs} items={items} {...handlers} />)
    const link = screen.getByRole('link', { name: /Other Mikvahs/ })
    expect(within(screen.getByTestId('list-heading')).queryByRole('link')).not.toBeInTheDocument()
    const lastRow = screen.getByText('Truck')
    expect(lastRow.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(link).toHaveAttribute('href', 'https://mikvah.org/directory')
  })

  it('keeps that link under an empty list, where it’s most wanted', () => {
    const mikvahs = { ...food, externalLink: { label: 'Other Mikvahs', url: 'https://mikvah.org/directory' } }
    renderWithProviders(<GenericDirectory category={mikvahs} items={[]} {...handlers} />)
    expect(screen.getByRole('link', { name: /Other Mikvahs/ })).toBeInTheDocument()
  })

  it('opens one sheet holding every filter: Open now, each yes/no, each pick-list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={items} {...handlers} />)
    await user.click(screen.getByRole('button', { name: /^Filters/ }))

    const sheet = within(screen.getByRole('dialog', { name: 'Filters' }))
    expect(sheet.getByRole('switch', { name: 'Open now' })).toHaveAttribute('aria-checked', 'false')
    expect(sheet.getByRole('switch', { name: 'Shabbat friendly' })).toBeInTheDocument()
    // Alphabetical, "Other" last, whatever order the admin entered them in.
    expect(within(sheet.getByRole('group', { name: 'Food type' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Dairy',
      'Meat',
      'Other',
    ])

    await user.click(sheet.getByRole('button', { name: 'Meat' }))
    expect(sheet.getByRole('button', { name: 'Meat' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Cafe')).not.toBeInTheDocument()

    await user.click(sheet.getByRole('button', { name: 'Show 1 listing' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('shows no chip line: Filters turns solid with how many are on, and the sheet switches them off (the user, Oct 10)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={items} {...handlers} />)
    expect(screen.getByRole('button', { name: /^Filters/ })).not.toHaveClass('bg-primary')
    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(screen.getByRole('switch', { name: 'Shabbat friendly' }))
    await user.click(screen.getByRole('button', { name: 'Show 1 listing' }))

    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument()
    const filters = screen.getByRole('button', { name: /^Filters\s*1$/ })
    expect(filters).toHaveClass('bg-primary')
    await user.click(filters)
    await user.click(screen.getByRole('switch', { name: 'Shabbat friendly', checked: true }))
    await user.click(screen.getByRole('button', { name: 'Show 3 listings' }))
    expect(screen.getByText('Cafe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Filters$/ })).not.toHaveClass('bg-primary')
  })

  it('adds no Open now switch once something is typed: Open now lives in Filters (the user, Oct 10)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={items} {...handlers} />)
    await user.type(screen.getByRole('searchbox'), 'grill')

    expect(within(screen.getByTestId('list-heading')).queryByRole('button', { name: 'Open now' })).not.toBeInTheDocument()
  })

  it('counts a word the search reads as a filter, shows it ticked in Filters, and unticking it takes the word out (the user, Oct 10)', async () => {
    const user = userEvent.setup()
    const taught = { ...food, askWords: [{ word: 'dairy', field: 't', value: 'Dairy' }] }
    renderWithProviders(<GenericDirectory category={taught} items={items} {...handlers} />)
    await user.type(screen.getByRole('searchbox'), 'Dairy places')

    expect(within(screen.getByTestId('list-heading')).getByRole('heading', { name: '1 listing' })).toBeInTheDocument()
    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Filters\s*1$/ }))
    await user.click(screen.getByRole('button', { name: 'Dairy', pressed: true }))
    expect(screen.getByRole('searchbox')).toHaveValue('places')
    expect(screen.getByRole('button', { name: 'Dairy', pressed: false })).toBeInTheDocument()
  })

  it('counts "open now" typed as Open now, on in Filters, and switching it off there takes the words out (the user, Oct 10)', async () => {
    const user = userEvent.setup()
    const allDay = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '00:00', close: '23:59' }]))
    const open = [{ ...makeListing({ id: 'g', name: 'Grill' }), hours: allDay, t: 'Meat' }] as unknown as DirectoryResource[]
    renderWithProviders(<GenericDirectory category={food} items={open} {...handlers} />)
    await user.type(screen.getByRole('searchbox'), 'grill open now')

    await user.click(screen.getByRole('button', { name: /^Filters\s*1$/ }))
    await user.click(screen.getByRole('switch', { name: 'Open now', checked: true }))
    expect(screen.getByRole('searchbox')).toHaveValue('grill')
    expect(screen.getByRole('switch', { name: 'Open now', checked: false })).toBeInTheDocument()
  })

  it('says so when the filters hide everything the search found, and clears just the filters', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={items} {...handlers} />)
    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    await user.click(screen.getByRole('button', { name: 'Show 1 listing' }))
    await user.type(screen.getByRole('searchbox'), 'grill')

    expect(screen.getByText('1 match your search, but none with these filters.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByText('Grill')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('grill')
  })

  it('keeps the line Clear all sits on before anything is on, so switching one on moves nothing', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={items} {...handlers} />)
    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    const clearAll = screen.getByRole('button', { name: 'Clear all' })
    expect(clearAll.parentElement).toHaveClass('invisible')

    await user.click(screen.getByRole('switch', { name: 'Open now' }))
    expect(clearAll.parentElement).not.toHaveClass('invisible')
    await user.click(clearAll)
    expect(screen.getByRole('switch', { name: 'Open now' })).toHaveAttribute('aria-checked', 'false')
  })

  it('has no Filters where the category keeps nothing to filter on', () => {
    renderWithProviders(<GenericDirectory category={makeCategory()} items={[makeListing()]} {...handlers} />)
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('list-heading')).getByRole('heading', { name: '1 listing' })).toBeInTheDocument()
  })
})

// Each category can split its list one way, chosen in the admin's editor
// (CategoryConfig.groupBy; the rules themselves are in listGroups.test.ts).
describe('GenericDirectory — groups', () => {
  afterEach(() => {
    localStorage.clear()
  })

  const hotels = makeCategory({
    id: 'hotel',
    groupBy: { kind: 'field', key: 'shabbatFriendly' },
    detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', filterable: true }],
  })
  const hotelItems = [
    makeListing({ id: 'a', category: 'hotel', name: 'Cambria', shabbatFriendly: true }),
    makeListing({ id: 'b', category: 'hotel', name: 'Marriott' }),
    makeListing({ id: 'c', category: 'hotel', name: 'Loews' }),
  ]

  it('makes the first group’s heading the list’s own, and heads each group after it', () => {
    renderWithProviders(<GenericDirectory category={hotels} items={hotelItems} {...handlers} />)
    const heading = within(screen.getByTestId('list-heading'))
    expect(heading.getByRole('heading', { name: 'Shabbat friendly · 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Doesn’t say · 2' })).toBeInTheDocument()
    expect(screen.getByTestId('list-heading')).toHaveAttribute('data-total', '3')
  })

  it('shows a search’s results as one list, not in groups', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={hotels} items={hotelItems} {...handlers} />)
    await user.type(screen.getByRole('searchbox'), 'marriott')
    expect(screen.queryByRole('heading', { name: /Doesn’t say/ })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('list-heading')).getByRole('heading', { name: '1 listing' })).toBeInTheDocument()
  })

  it('is one list when the category isn’t grouped', () => {
    renderWithProviders(<GenericDirectory category={{ ...hotels, groupBy: undefined }} items={hotelItems} {...handlers} />)
    expect(within(screen.getByTestId('list-heading')).getByRole('heading', { name: '3 listings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Doesn’t say/ })).not.toBeInTheDocument()
  })

  describe('closed groups (a pick-list: shuls by denomination)', () => {
    const shuls = makeCategory({
      id: 'synagogue',
      groupBy: { kind: 'field', key: 'denomination' },
      detailFields: [
        {
          key: 'denomination',
          label: 'Denomination',
          type: 'select',
          filterable: true,
          options: [
            { value: 'Orthodox', label: 'Orthodox' },
            { value: 'Reform', label: 'Reform' },
          ],
        },
      ],
    })
    const shulItems = [
      makeListing({ id: 'a', name: 'Mekor', denomination: 'Orthodox', milesFromCenter: 0.2 }),
      makeListing({ id: 'b', name: 'Vilna', denomination: 'Orthodox', milesFromCenter: 1 }),
      makeListing({ id: 'c', name: 'Rodeph', denomination: 'Reform', milesFromCenter: 0.8 }),
    ]
    const line = (name: RegExp) => screen.getByRole('button', { name })

    it('starts every group closed: one line each with its count and nearest place', () => {
      renderWithProviders(<GenericDirectory category={shuls} items={shulItems} {...handlers} />)
      expect(within(screen.getByTestId('list-heading')).getByRole('heading', { name: 'By denomination · 3 listings' })).toBeInTheDocument()
      expect(line(/^Orthodox · 2/)).toHaveAttribute('aria-expanded', 'false')
      expect(line(/^Orthodox · 2/)).toHaveTextContent('Nearest: Mekor · 0.2 mi')
      expect(screen.getByText('Mekor')).not.toBeVisible()
    })

    // Oct 6: a group opens in place, so its chevron points down, then up;
    // pointing right is for a row that goes to another page.
    it('points its chevron down while closed and up once open', async () => {
      const user = userEvent.setup()
      renderWithProviders(<GenericDirectory category={shuls} items={shulItems} {...handlers} />)
      const chevron = () => line(/^Reform · 1/).querySelector('svg')!
      expect(chevron()).toHaveClass('rotate-90')
      await user.click(line(/^Reform · 1/))
      expect(chevron()).toHaveClass('-rotate-90')
    })

    it('opens a group on a tap, and this browser remembers it next time', async () => {
      const user = userEvent.setup()
      const { unmount } = renderWithProviders(<GenericDirectory category={shuls} items={shulItems} {...handlers} />)
      await user.click(line(/^Reform · 1/))
      expect(line(/^Reform · 1/)).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Rodeph')).toBeVisible()
      expect(screen.getByText('Mekor')).not.toBeVisible()
      unmount()

      renderWithProviders(<GenericDirectory category={shuls} items={shulItems} {...handlers} />)
      expect(line(/^Reform · 1/)).toHaveAttribute('aria-expanded', 'true')
      expect(line(/^Orthodox · 2/)).toHaveAttribute('aria-expanded', 'false')
    })

    it('opens every group with a match while a filter is on, without remembering it', async () => {
      const user = userEvent.setup()
      renderWithProviders(<GenericDirectory category={shuls} items={shulItems} {...handlers} />)
      await user.click(screen.getByRole('button', { name: /^Filters/ }))
      await user.click(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('button', { name: 'Orthodox' }))
      await user.click(screen.getByRole('button', { name: 'Show 2 listings' }))

      expect(line(/^Orthodox · 2/)).toHaveAttribute('aria-expanded', 'true')
      expect(screen.queryByRole('button', { name: /^Reform/ })).not.toBeInTheDocument()
      expect(localStorage.getItem('jpc:open-groups:test-community:synagogue')).toBe('[]')
    })

    it('opens the group of a listing arriving open from a link', () => {
      renderWithProviders(
        <ForcedViewport isMobile>
          <GenericDirectory category={shuls} items={shulItems} {...handlers} reopenItemId="c" />
        </ForcedViewport>,
      )
      expect(line(/^Reform · 1/)).toHaveAttribute('aria-expanded', 'true')
      expect(line(/^Orthodox · 2/)).toHaveAttribute('aria-expanded', 'false')
    })

    it('steps next/previous through what’s on screen, skipping closed groups', async () => {
      const user = userEvent.setup()
      const many = [...shulItems, makeListing({ id: 'd', name: 'Kol Tzedek', denomination: 'Reform', milesFromCenter: 3 })]
      renderWithProviders(
        <ForcedViewport isMobile>
          <GenericDirectory category={shuls} items={many} {...handlers} reopenItemId="d" />
        </ForcedViewport>,
      )
      // With no location the list is alphabetical: Kol Tzedek, Mekor,
      // Rodeph, Vilna. Only Reform is open, so next from Kol Tzedek is
      // Rodeph, skipping Mekor in the closed Orthodox group.
      await user.click(screen.getByRole('button', { name: 'Next listing from Kol Tzedek' }))
      expect(screen.getByText('Expanded Rodeph')).toBeInTheDocument()
      expect(screen.queryByText('Expanded Mekor')).not.toBeInTheDocument()
    })
  })
})

// What each row says is listingRow.ts's (tested there); the page decides the
// three things that need the whole list.
describe('GenericDirectory — what the rows are told', () => {
  it('gives each row where it is: the town its address names, measured against the whole list', () => {
    const items = [
      makeListing({ id: 'a', name: 'ShopRite', address: '1 Main St, Cherry Hill Township, NJ 08002, USA', geo: { lat: 39.93, lng: -75.01 } }),
      makeListing({ id: 'b', name: 'Corner Store', address: '' }),
    ]
    renderWithProviders(<GenericDirectory category={makeCategory()} items={items} {...handlers} />)
    expect(screen.getByText('ShopRite is in Cherry Hill')).toBeInTheDocument()
    expect(screen.getByText('Corner Store is in nowhere')).toBeInTheDocument()
  })

  it('tells rows to leave out what their group heading says, but not in search results', async () => {
    const user = userEvent.setup()
    const shuls = makeCategory({
      id: 'synagogue',
      groupBy: { kind: 'field', key: 'denomination' },
      detailFields: [{ key: 'denomination', label: 'Denomination', type: 'select', filterable: true, options: [] }],
    })
    const items = [makeListing({ id: 'a', category: 'synagogue', name: 'Rodeph', denomination: 'Reform' })]
    renderWithProviders(<GenericDirectory category={shuls} items={items} {...handlers} />)
    expect(screen.getByText('Rodeph leaves out denomination')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'rodeph')
    expect(screen.queryByText('Rodeph leaves out denomination')).not.toBeInTheDocument()
  })

  it('shows likes on rows only while the list is sorted by them', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <GenericDirectory category={makeCategory({ upvotesEnabled: true })} items={[makeListing({ id: 'a', name: 'Goldie', upvotes: 4 })]} anchorLabel="HUP" {...handlers} />,
    )
    // With a location, the list starts sorted by distance.
    expect(screen.queryByText('Goldie shows 4 likes')).not.toBeInTheDocument()
    await chooseSort(user, 'Popularity')
    expect(screen.getByText('Goldie shows 4 likes')).toBeInTheDocument()
  })

  // Cards or one flat list, tried on the preview (RowLookSwitch).
  describe('the Cards / List switch', () => {
    const items = [makeListing({ id: 'a', name: 'Goldie' }), makeListing({ id: 'b', name: 'Kosher Mart' })]
    afterEach(() => localStorage.clear())

    it('starts on cards, and List turns every row into one flat list, remembered', async () => {
      const user = userEvent.setup()
      renderWithProviders(<GenericDirectory category={makeCategory()} items={items} {...handlers} />)
      const cards = screen.getByRole('button', { name: 'Cards' })
      expect(cards).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Goldie looks like cards')).toBeInTheDocument()
      expect(screen.queryByTestId('flat-list')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'List' }))
      expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Goldie looks like list')).toBeInTheDocument()
      expect(screen.getByText('Kosher Mart looks like list')).toBeInTheDocument()
      expect(within(screen.getByTestId('flat-list')).getByText('Goldie')).toBeInTheDocument()

      cleanup()
      renderWithProviders(<GenericDirectory category={makeCategory()} items={items} {...handlers} />)
      expect(await screen.findByText('Goldie looks like list')).toBeInTheDocument()
    })

    it('isn’t there on an empty list', () => {
      renderWithProviders(<GenericDirectory category={makeCategory()} items={[]} {...handlers} />)
      expect(screen.queryByRole('group', { name: /Row look/ })).not.toBeInTheDocument()
    })
  })

  // For "Until 4 PM, before candles" (see listingRowFacts): only where the
  // category keeps hours, so a page of WhatsApp groups fetches nothing.
  it('asks for tonight’s candle lighting only where the category keeps hours', () => {
    zmanimMock.mockClear()
    const { unmount } = renderWithProviders(<GenericDirectory category={makeCategory({ detailFields: [] })} items={[makeListing()]} {...handlers} />)
    expect(zmanimMock.mock.calls.every(([coords]) => coords === null)).toBe(true)
    unmount()

    zmanimMock.mockClear()
    const food = makeCategory({ detailFields: [{ key: 'hours', label: 'Hours', type: 'hours', filterable: true }] })
    renderWithProviders(<GenericDirectory category={food} items={[makeListing()]} {...handlers} />)
    expect(zmanimMock.mock.calls.some(([coords]) => coords && typeof coords === 'object' && 'lat' in coords)).toBe(true)
  })

  it('lets rows say "not confirmed" only where most of the list is vouched for', () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const mostly = [
      makeListing({ id: 'a', name: 'A', confirmedAt: recent }),
      makeListing({ id: 'b', name: 'B', googleSyncedAt: recent }),
      makeListing({ id: 'c', name: 'C' }),
    ]
    const { unmount } = renderWithProviders(<GenericDirectory category={makeCategory()} items={mostly} {...handlers} />)
    expect(screen.getByText('C may say unconfirmed')).toBeInTheDocument()
    unmount()

    const hardly = [makeListing({ id: 'a', name: 'A', confirmedAt: recent }), makeListing({ id: 'b', name: 'B' }), makeListing({ id: 'c', name: 'C' })]
    renderWithProviders(<GenericDirectory category={makeCategory()} items={hardly} {...handlers} />)
    expect(screen.queryByText('C may say unconfirmed')).not.toBeInTheDocument()
  })
})

// With no location set, a line says where the list's distances are from,
// with "Use my location" — on phones at the very top of the page, on
// desktop under the title (DirectoryHeader). jsdom applies no breakpoint
// CSS, so both copies render; this checks the phone one's position.
describe('GenericDirectory — where distances are from', () => {
  it('puts the phone copy first on the page, and the desktop copy under the title', () => {
    const { container } = renderWithProviders(
      <GenericDirectory category={makeCategory()} items={[makeListing()]} addressPrompt {...handlers} />,
    )

    expect(screen.getAllByRole('button', { name: 'Use my location' })).toHaveLength(2)
    const first = container.firstElementChild!.firstElementChild as HTMLElement
    expect(first).toHaveClass('desktop:hidden')
    expect(within(first).getByRole('button', { name: 'Use my location' })).toBeInTheDocument()
  })

  it('opens the location picker', async () => {
    const user = userEvent.setup()
    const opened = vi.fn()
    document.addEventListener('jpc:open-location', opened)
    renderWithProviders(<GenericDirectory category={makeCategory()} items={[makeListing()]} addressPrompt {...handlers} />)

    await user.click(screen.getAllByRole('button', { name: 'Use my location' })[0])
    expect(opened).toHaveBeenCalledTimes(1)
    document.removeEventListener('jpc:open-location', opened)
  })

  it('says nothing once a location is set', () => {
    renderWithProviders(
      <GenericDirectory category={makeCategory()} items={[makeListing()]} addressPrompt anchorLabel="19103" {...handlers} />,
    )

    expect(screen.queryByRole('button', { name: 'Use my location' })).not.toBeInTheDocument()
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

// What a search matched on a listing, for the card to say why it's there
// and the listing to mark it once opened (see SearchFound).
describe('GenericDirectory — what a search matched', () => {
  const grocery = makeCategory({ id: 'grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
  const cheesy = makeListing({ id: 'tj', name: "Trader Joe's", category: 'grocery', m: ['Challah', 'Cheddar Cheese'] })
  const plain = makeListing({ id: 'ac', name: 'ACME', category: 'grocery', m: ['Challah'] })

  it("gives each match on this page's own search what it matched", () => {
    renderWithProviders(<GenericDirectory category={grocery} items={[cheesy, plain]} {...handlers} initialSearch="cheese" />)
    expect(screen.getByText("found on Trader Joe's: Cheddar Cheese")).toBeInTheDocument()
  })

  it('marks what the home search matched in the listing it opened, without filtering the list', () => {
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericDirectory category={grocery} items={[cheesy, plain]} {...handlers} reopenItemId="tj" reopenMatch="cheese" />
      </ForcedViewport>,
    )
    expect(screen.getByText("found on Trader Joe's: Cheddar Cheese")).toBeInTheDocument()
    expect(screen.getByText('ACME')).toBeInTheDocument()
  })

  it('stops marking it once that listing is closed, and clears ?match', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericDirectory
          category={grocery}
          items={[cheesy, plain]}
          {...handlers}
          reopenItemId="tj"
          reopenMatch="cheese"
          onParamsChange={onParamsChange}
        />
      </ForcedViewport>,
    )
    await user.click(screen.getByRole('button', { name: "Collapse Trader Joe's" }))
    expect(screen.queryByText(/found on Trader Joe's/)).not.toBeInTheDocument()
    expect(onParamsChange).toHaveBeenCalledWith({ item: null, match: null }, { replace: true })
  })
})

describe('GenericDirectory — neighborhoods', () => {
  it("keeps this page's search to the neighborhood it names", () => {
    const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues' })
    const near = makeListing({ id: 'm', name: 'Mekor Habracha', category: 'synagogue', geo: { lat: 39.9494, lng: -75.1661 } })
    const far = makeListing({ id: 'x', name: 'Far Shul', category: 'synagogue', geo: { lat: 40.1, lng: -75.0 } })
    renderWithProviders(<GenericDirectory category={shuls} items={[near, far]} {...handlers} initialSearch="in center city" />, {
      community: { slug: 'philly' },
    })
    expect(screen.getByText('Mekor Habracha')).toBeInTheDocument()
    expect(screen.queryByText('Far Shul')).not.toBeInTheDocument()
  })
})

// Each shul row says its next minyan. Worked out once for the list by
// NextMinyans (see nextMinyanByShul's own tests for the rules); this checks
// the directory hands it to the right rows, and only on a shul page.
describe('GenericDirectory — the question card', () => {
  const food = makeCategory({
    id: 'restaurant',
    questionCard: { kind: 'field', key: 't' },
    detailFields: [
      {
        key: 't',
        label: 'Food Type',
        type: 'select',
        filterable: true,
        options: [
          { value: 'Meat', label: 'Meat' },
          { value: 'Dairy', label: 'Dairy' },
        ],
      },
    ],
  })
  const places = (n: number) => Array.from({ length: n }, (_, i) => makeListing({ id: `p${i + 1}`, name: `Place ${i + 1}`, category: 'restaurant' }))
  // What comes just before the card, in the page's order.
  const before = () => {
    const card = screen.getByTestId('question-card')
    const names = screen.getAllByText(/^Place \d+$/)
    return names.filter((n) => n.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).map((n) => n.textContent)
  }
  afterEach(() => localStorage.clear())

  // Decided Oct 4, built Oct 6: right under the place it asks about. It sat
  // after the fifth place, whichever place it asked about.
  it('sits right under the place it asks about', () => {
    const rows = places(8).map((p, i) => (i < 3 ? { ...p, t: 'Meat' } : p))
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    expect(screen.getByTestId('question-card')).toHaveTextContent(/Place 4 · [^:]+: meat or dairy/)
    expect(before()).toEqual(['Place 1', 'Place 2', 'Place 3', 'Place 4'])
  })

  it('moves under the next place it asks about', async () => {
    const user = userEvent.setup()
    // Places 4 and 7 don't say; the rest do.
    const rows = places(8).map((p, i) => (i === 3 || i === 6 ? p : { ...p, t: 'Meat' }))
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    await user.click(within(screen.getByTestId('question-card')).getByRole('button', { name: 'Not sure' }))
    expect(screen.getByTestId('question-card')).toHaveTextContent(/Place 7 · [^:]+: meat or dairy/)
    expect(before()).toEqual(['Place 1', 'Place 2', 'Place 3', 'Place 4', 'Place 5', 'Place 6', 'Place 7'])
  })

  it('stays under the place it’s thanking for until Next question', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    try {
      renderWithProviders(<GenericDirectory category={food} items={places(4)} {...handlers} />)
      await user.click(within(screen.getByTestId('question-card')).getByRole('button', { name: 'Meat' }))
      await screen.findByText(/Thanks!/)
      expect(before()).toEqual(['Place 1'])
      await user.click(screen.getByRole('button', { name: 'Next question' }))
      expect(before()).toEqual(['Place 1', 'Place 2'])
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('isn’t among a search’s results', async () => {
    const user = userEvent.setup()
    const zebra = places(8).map((p) => ({ ...p, name: `${p.name} Zebra` }))
    renderWithProviders(<GenericDirectory category={food} items={zebra} {...handlers} />, { content: { categories: [food] } })
    await user.type(screen.getByRole('searchbox'), 'zebra')
    // The search found them all: the card is left out, not the list.
    expect(screen.getByText('Place 8 Zebra')).toBeInTheDocument()
    expect(screen.queryByTestId('question-card')).not.toBeInTheDocument()
  })

  it('isn’t there when the category asks nothing', () => {
    renderWithProviders(<GenericDirectory category={{ ...food, questionCard: undefined }} items={places(8)} {...handlers} />)
    expect(screen.queryByTestId('question-card')).not.toBeInTheDocument()
  })

  it('comes after the group lines while every closed group is shut', () => {
    const byType = { ...food, questionCard: { kind: 'confirm' }, groupBy: { kind: 'field', key: 't' } }
    const rows = places(3).map((p, i) => ({ ...p, t: i === 0 ? 'Meat' : 'Dairy' }))
    renderWithProviders(<GenericDirectory category={byType} items={rows} {...handlers} />)
    const card = screen.getByTestId('question-card')
    const lastLine = screen.getByRole('button', { name: /^Meat/ })
    expect(lastLine.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Asked about the first place in the list's order, closed groups or not.
    expect(screen.getByText(/^Place 1( · [^:]+)?: is everything here still right\?$/)).toBeInTheDocument()
  })
})

describe('GenericDirectory — the map beside the list', () => {
  const food = makeCategory({
    id: 'restaurant',
    detailFields: [{ key: 'kosher', label: 'Kosher', type: 'boolean', filterable: true }],
  })
  const rows = [
    { ...makeListing({ id: 'a', name: 'Alpha Grill', category: 'restaurant' }), kosher: true },
    makeListing({ id: 'b', name: 'Beta Cafe', category: 'restaurant' }),
  ] as DirectoryResource[]
  afterEach(() => localStorage.clear())

  it('sits beside the list where the category has a map, with the list’s heading atop the list, not in a sticky bar', () => {
    const { container } = renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    expect(screen.getByText('map shows: Alpha Grill, Beta Cafe')).toBeInTheDocument()
    // The heading comes after the search and before the first row, and
    // nothing above the list sticks: the map stays in view instead.
    const heading = screen.getByTestId('list-heading')
    expect(heading.compareDocumentPosition(screen.getByText('Alpha Grill')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.closest('[class*="lg:sticky"]')).toBeNull()
    expect(screen.getByTestId('map-stand-in').closest('[class*="lg:sticky"]')).not.toBeNull()
    expect(container.querySelectorAll('[class*="lg:sticky"]')).toHaveLength(2) // the map, and the line beside it
  })

  it('has a line between list and map to resize them, only while the map is beside the list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    const line = screen.getByRole('separator', { name: 'Resize the list and the map' })
    expect(line.previousElementSibling).toContainElement(screen.getByText('Alpha Grill'))
    expect(line.nextElementSibling).toContainElement(screen.getByTestId('map-stand-in'))
    expect(line.parentElement!.style.gridTemplateColumns).toBe('clamp(420px, calc((100% - 32px) * 0.5), calc(100% - 392px)) 32px minmax(360px, 1fr)')
    // Dragged all the way over, the map hides, as Hide map does.
    line.parentElement!.getBoundingClientRect = () => ({ left: 0, width: 1120, top: 0, height: 700, right: 1120, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(line, { button: 0, clientX: 560, pointerId: 1 })
    fireEvent.pointerMove(line, { clientX: 1100, pointerId: 1 })
    fireEvent.pointerUp(line, { pointerId: 1 })
    expect(screen.queryByTestId('map-stand-in')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show map' }))
    await user.click(screen.getByRole('button', { name: 'Hide map' }))
    expect(screen.queryByRole('separator', { name: 'Resize the list and the map' })).not.toBeInTheDocument()
  })

  // Pages visited earlier stay alive for Back: one hidden on Food must be
  // hidden on the Grocery page kept from before too.
  it('hides the map on every category page at once, including ones kept for Back', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <GenericDirectory category={food} items={rows} {...handlers} />
        <GenericDirectory category={{ ...food, id: 'grocery' }} items={rows} {...handlers} />
      </>,
    )
    expect(screen.getAllByTestId('map-stand-in')).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: 'Hide map' })[0])
    expect(screen.queryByTestId('map-stand-in')).not.toBeInTheDocument()
  })

  it('isn’t there for a category without a map, which keeps its sticky bar', () => {
    const noMap = { ...food, capabilities: { ...resolveCapabilities(), map: false } }
    renderWithProviders(<GenericDirectory category={noMap} items={rows} {...handlers} />)
    expect(screen.queryByTestId('map-stand-in')).not.toBeInTheDocument()
    expect(screen.getByTestId('list-heading').closest('[class*="lg:sticky"]')).not.toBeNull()
    cleanup()
    renderWithProviders(<GenericDirectory category={{ ...food, hasAddress: false }} items={rows} {...handlers} />)
    expect(screen.queryByTestId('map-stand-in')).not.toBeInTheDocument()
  })

  it('shows only what the list shows: the filters’ and the search’s places', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} initialFilters={{ f_kosher: '1' }} {...handlers} />, {
      content: { categories: [food] },
    })
    expect(screen.getByText('map shows: Alpha Grill')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(screen.getByRole('switch', { name: /Kosher/, checked: true }))
    await user.click(screen.getByRole('button', { name: /^Show/ }))
    await user.type(screen.getByRole('searchbox'), 'beta')
    expect(screen.getByText('map shows: Beta Cafe')).toBeInTheDocument()
  })

  it('opens the full Map page on the same category, search and filters', () => {
    renderWithProviders(<GenericDirectory category={food} items={rows} initialFilters={{ f_kosher: '1' }} {...handlers} />)
    const href = screen.getByTestId('map-stand-in').getAttribute('data-href')!
    const url = new URL(href, 'http://x')
    expect(url.pathname).toMatch(/\/map$/)
    expect(url.searchParams.get('cat')).toBe('restaurant')
    expect(url.searchParams.get('is')).toBe('kosher')
  })

  it('lights a row’s pin while the pointer is on the row', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    await user.hover(screen.getByText('Beta Cafe'))
    expect(screen.getByText('pin lit: b')).toBeInTheDocument()
    await user.unhover(screen.getByText('Beta Cafe'))
    expect(screen.getByText('pin lit: none')).toBeInTheDocument()
  })

  it('on the Minyanim view, a minyan lights its shul’s pin the same way', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T11:00:00-04:00')) // a Monday morning
    try {
      const shuls = makeCategory({ id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
      const mekor = makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue', minyanim: [{ id: 'm', tefillah: 'mincha', days: ['mon'], time: '1:30pm' }] })
      const user = userEvent.setup()
      renderWithProviders(<GenericDirectory category={shuls} items={[mekor]} openMinyanimView {...handlers} />, { content: { categories: [shuls] } })
      const [row] = await within(await screen.findByTestId('minyanim-rows')).findAllByRole('listitem')
      await user.hover(row)
      expect(screen.getByText('pin lit: mekor')).toBeInTheDocument()
      await user.unhover(row)
      expect(screen.getByText('pin lit: none')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('finds a pin’s row: outlines it, and opens the closed group it’s in', async () => {
    const user = userEvent.setup()
    const grouped = makeCategory({
      id: 'synagogue',
      groupBy: { kind: 'field', key: 'd' },
      detailFields: [{ key: 'd', label: 'Denomination', type: 'select', filterable: true, options: [] }],
    })
    const shuls = [
      { ...makeListing({ id: 'a', name: 'Alpha Shul', category: 'synagogue' }), d: 'Orthodox' },
      { ...makeListing({ id: 'b', name: 'Beta Shul', category: 'synagogue' }), d: 'Reform' },
    ] as DirectoryResource[]
    renderWithProviders(<GenericDirectory category={grouped} items={shuls} {...handlers} />)
    const reform = screen.getByRole('button', { name: /^Reform/ })
    expect(reform).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getByRole('button', { name: 'pin Beta Shul' }))
    expect(reform).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Beta Shul').closest('[class*="ring-2"]')).not.toBeNull()
  })

  it('hides when asked, remembers it, and comes back from "Show map" in the heading', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    await user.click(screen.getByRole('button', { name: 'Hide map' }))
    expect(screen.queryByTestId('map-stand-in')).not.toBeInTheDocument()

    cleanup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    expect(screen.queryByTestId('map-stand-in')).not.toBeInTheDocument()
    await user.click(within(screen.getByTestId('list-heading')).getByRole('button', { name: /Show map/ }))
    expect(screen.getByTestId('map-stand-in')).toBeInTheDocument()
  })
})

describe('GenericDirectory — each shul’s next minyan', () => {
  const shulCategory = makeCategory({ id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
  const shul = (id: string, name: string, time: string) =>
    makeListing({ id, name, category: 'synagogue', minyanim: [{ id: 'm', tefillah: 'mincha', days: ['mon'], time }] })

  afterEach(() => vi.useRealTimers())

  it('shows each shul’s own next minyan on its row', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T11:00:00-04:00')) // a Monday morning in Philadelphia
    renderWithProviders(
      <GenericDirectory category={shulCategory} items={[shul('a', 'Alpha Shul', '1:30pm'), shul('b', 'Beta Shul', '6:45pm')]} {...handlers} />,
      { content: { categories: [shulCategory] } },
    )

    expect(screen.getByText('next minyan at Alpha Shul: Mincha 1:30 PM')).toBeInTheDocument()
    expect(screen.getByText('next minyan at Beta Shul: Mincha 6:45 PM')).toBeInTheDocument()
  })

  // The listing opened beside the list says its shul's next minyan too, and
  // its nearby shuls theirs: the column sits inside the same provider.
  it('gives the opened listing, in the column, its shul’s next minyan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T11:00:00-04:00'))
    renderWithProviders(
      <GenericDirectory category={shulCategory} items={[shul('a', 'Alpha Shul', '1:30pm'), shul('b', 'Beta Shul', '6:45pm')]} {...handlers} />,
      { content: { categories: [shulCategory] } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand Beta Shul' }))
    expect(await screen.findByText('column minyan at Beta Shul: Mincha 6:45 PM')).toBeInTheDocument()
  })

  it('a shul’s special schedule replaces its regular times on the days it covers (step 4)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T11:00:00-04:00')) // Monday Sep 28, Chol HaMoed
    const posted = {
      ...shul('a', 'Alpha Shul', '1:30pm'),
      minyanim_schedules: [
        {
          id: 's',
          name: 'Sukkos 5787',
          from: '2026-09-26',
          to: '2026-10-04',
          mode: 'replace',
          minyanim: [{ id: 'x', tefillah: 'mincha', on: ['2026-09-28'], time: '6:05pm' }],
        },
      ],
    }
    renderWithProviders(<GenericDirectory category={shulCategory} items={[posted, shul('b', 'Beta Shul', '6:45pm')]} {...handlers} />, {
      content: { categories: [shulCategory] },
    })

    expect(screen.getByText('next minyan at Alpha Shul: Mincha 6:05 PM')).toBeInTheDocument()
    expect(screen.getByTestId('next-minyan')).toHaveTextContent('Next 6:05 PM · Alpha Shul')
  })

  it('says a shul with no times at all has none listed', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T11:00:00-04:00'))
    const bare = makeListing({ id: 'c', name: 'Gamma Shul', category: 'synagogue' })
    renderWithProviders(<GenericDirectory category={shulCategory} items={[shul('a', 'Alpha Shul', '1:30pm'), bare]} {...handlers} />, {
      content: { categories: [shulCategory] },
    })

    expect(screen.getByText('next minyan at Gamma Shul: No davening times listed')).toBeInTheDocument()
  })

  describe('the Next minyan card', () => {
    // A Monday at 5 PM in Philadelphia.
    const fivePm = () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-28T17:00:00-04:00'))
    }
    const shuls = () => [
      { ...shul('far', 'Aleph Shul', '6:20pm'), milesFromCenter: 8.2, confirmedAt: '2026-09-01' },
      { ...shul('near', 'Mekor Habracha', '6:20pm'), milesFromCenter: 0.21 },
      { ...shul('mid', 'Lower Merion Synagogue', '6:25pm'), milesFromCenter: 5.1, confirmedAt: '2026-09-01' },
    ]
    const row = () => screen.getByTestId('next-minyan')

    // Oct 6: one row, “Minyanim by time”, the soonest under it; on the same
    // minute the nearer shul.
    it('says the soonest minyan, the nearer shul on the same minute, with its distance', () => {
      fivePm()
      renderWithProviders(<GenericDirectory category={shulCategory} items={shuls()} {...handlers} />, { content: { categories: [shulCategory] } })

      expect(row()).toHaveTextContent('Minyanim by timeNext 6:20 PM · Mekor Habracha, 0.2 mi')
    })

    it('is one button that opens every minyan by time, and the list heading doesn’t repeat it', async () => {
      fivePm()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderWithProviders(<GenericDirectory category={shulCategory} items={shuls()} {...handlers} />, { content: { categories: [shulCategory] } })

      expect(within(screen.getByTestId('list-heading')).queryByRole('button', { name: /Minyanim by time/ })).not.toBeInTheDocument()
      await user.click(row())
      expect(screen.getByTestId('minyanim-view')).toBeInTheDocument()
      // The row goes: the view's own answer says what's next.
      expect(screen.queryByTestId('next-minyan')).not.toBeInTheDocument()
      expect(within(screen.getByTestId('minyanim-rows')).getAllByRole('link').map((a) => a.textContent)).toEqual([
        '6:20 PMMekor HabrachaMincha · 0.2 mi',
        '6:20 PMAleph ShulMincha · 8.2 mi',
        '6:25 PMLower Merion SynagogueMincha · 5.1 mi',
      ])
    })

    it('goes once anything is typed, and “Minyanim by time” goes to the list heading', async () => {
      fivePm()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderWithProviders(<GenericDirectory category={shulCategory} items={shuls()} {...handlers} />, { content: { categories: [shulCategory] } })

      await user.type(screen.getByRole('searchbox'), 'mincha')
      expect(screen.queryByTestId('next-minyan')).not.toBeInTheDocument()
      expect(within(screen.getByTestId('list-heading')).getByRole('button', { name: /Minyanim by time/ })).toBeInTheDocument()
    })

    it('follows the list’s filters', () => {
      fivePm()
      const withEruv = makeCategory({
        id: 'synagogue',
        detailFields: [
          { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
          { key: 'eruv', label: 'In the eruv', type: 'boolean', filterable: true },
        ],
      })
      const items = shuls().map((s) => ({ ...s, eruv: s.id === 'mid' }))
      renderWithProviders(<GenericDirectory category={withEruv} items={items} initialFilters={{ f_eruv: '1' }} {...handlers} />, {
        content: { categories: [withEruv] },
      })

      expect(row()).toHaveTextContent('Next 6:25 PM · Lower Merion Synagogue, 5.1 mi')
    })

    it('names the nearest of the minyanim within 15 minutes of the soonest, not one a minute sooner 8 miles out', () => {
      fivePm()
      const items = [
        { ...shul('far', 'Congregation Sons of Israel', '6:19pm'), milesFromCenter: 8.2 },
        { ...shul('near', 'Mekor Habracha', '6:20pm'), milesFromCenter: 0.2 },
        { ...shul('later', 'Closest Shul', '6:40pm'), milesFromCenter: 0.1 },
      ]
      renderWithProviders(<GenericDirectory category={shulCategory} items={items} {...handlers} />, { content: { categories: [shulCategory] } })

      expect(row()).toHaveTextContent('Next 6:20 PM · Mekor Habracha, 0.2 mi')
    })

    it('on a Friday afternoon, says Friday night', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-09T13:30:00-04:00')) // Fri Oct 9
      const friday = [{ ...makeListing({ id: 'sh', name: 'Society Hill Synagogue', category: 'synagogue', minyanim: [{ id: 'k', tefillah: 'kabbalas_shabbos', days: ['fri'], time: '5:30pm' }] }), milesFromCenter: 1 }]
      renderWithProviders(<GenericDirectory category={shulCategory} items={friday} {...handlers} />, { content: { categories: [shulCategory] } })

      expect(row()).toHaveTextContent('Friday night 5:30 PM · Society Hill Synagogue, 1 mi')
    })

    it('goes when no shul the filters leave keeps times, and “Minyanim by time” goes to the list heading', () => {
      fivePm()
      const withEruv = makeCategory({
        id: 'synagogue',
        detailFields: [
          { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
          { key: 'eruv', label: 'In the eruv', type: 'boolean', filterable: true },
        ],
      })
      const bare = { ...makeListing({ id: 'bare', name: 'No Times Shul', category: 'synagogue' }), eruv: true }
      renderWithProviders(<GenericDirectory category={withEruv} items={[...shuls(), bare]} initialFilters={{ f_eruv: '1' }} {...handlers} />, {
        content: { categories: [withEruv] },
      })

      expect(screen.queryByTestId('next-minyan')).not.toBeInTheDocument()
      expect(within(screen.getByTestId('list-heading')).getByRole('button', { name: /Minyanim by time/ })).toBeInTheDocument()
    })

    it('isn’t on a page without minyanim', () => {
      renderWithProviders(<GenericDirectory category={makeCategory()} items={[makeListing({ name: 'Acme' })]} {...handlers} />)
      expect(screen.queryByTestId('next-minyan')).not.toBeInTheDocument()
    })
  })

  it('works nothing out for a category without minyanim', () => {
    const minyanim = [{ id: 'm', tefillah: 'mincha', days: ['mon'], time: '1:30pm' }]
    renderWithProviders(<GenericDirectory category={makeCategory()} items={[makeListing({ name: 'Acme', minyanim })]} {...handlers} />)

    expect(screen.queryByText(/next minyan at/)).not.toBeInTheDocument()
  })
})

// On desktop an opened listing takes the list's column, and the map stays
// beside it on that place (agreed Sep 30; it was a dialog over both). The
// list stays mounted underneath, hidden, so Back finds it as it was.
describe('GenericDirectory — a listing opened on desktop', () => {
  const food = makeCategory({ id: 'restaurant', pluralLabel: 'Food' })
  const rows = [
    makeListing({ id: 'a', name: 'Alpha Grill', category: 'restaurant' }),
    makeListing({ id: 'b', name: 'Beta Cafe', category: 'restaurant' }),
    makeListing({ id: 'c', name: 'Gamma Deli', category: 'restaurant' }),
  ] as DirectoryResource[]
  afterEach(() => localStorage.clear())

  it('takes the list’s column, with the map beside it on that place', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    await user.click(screen.getByRole('button', { name: 'Expand Beta Cafe' }))

    expect(screen.getByText('Column: Beta Cafe, 2 of 3, map beside')).toBeInTheDocument()
    expect(screen.getByText('map on: b')).toBeInTheDocument()
    // The list and its heading are hidden, not gone.
    expect(screen.getByText('Alpha Grill')).not.toBeVisible()
    expect(screen.getByTestId('list-heading')).not.toBeVisible()
  })

  it('steps through the list from the column, and Back brings the list back as it was', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} onParamsChange={onParamsChange} />)
    await user.click(screen.getByRole('button', { name: 'Expand Beta Cafe' }))
    await user.click(screen.getByRole('button', { name: 'Next listing' }))
    expect(screen.getByText('Column: Gamma Deli, 3 of 3, map beside')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.queryByTestId('listing-column')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha Grill')).toBeVisible()
    expect(screen.getByText('map on: nothing')).toBeInTheDocument()
    expect(onParamsChange).toHaveBeenLastCalledWith({ item: null, match: null }, { replace: true })
  })

  // Oct 6, B: the list's own top (the title, the search, its examples)
  // stayed above the listing, and pushed it halfway down the screen.
  it('has the top of the page: no search or examples above it, just its way back; they return with the list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    expect(screen.getByRole('searchbox')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Expand Beta Cafe' }))

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    // The title stays for a screen reader only; the way back says where.
    expect(screen.getByRole('heading', { level: 1, name: 'Food' })).toHaveAttribute('class', 'sr-only')
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByRole('searchbox')).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'Food' })).toHaveClass('desktop:not-sr-only')
  })

  // Oct 6: it has the page, so it's a step the browser's Back undoes. It
  // replaced the address, so Back left the category. Stepping ‹ › replaces,
  // so Back doesn't walk back through every listing read.
  it('opening one is a step Back undoes; stepping to the next isn’t; its own back takes the step', async () => {
    const user = userEvent.setup()
    const onParamsChange = vi.fn()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    try {
      renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} onParamsChange={onParamsChange} />)
      await user.click(screen.getByRole('button', { name: 'Expand Beta Cafe' }))
      expect(onParamsChange).toHaveBeenLastCalledWith({ item: 'b' }, { step: 'listing' })
      await user.click(screen.getByRole('button', { name: 'Next listing' }))
      expect(onParamsChange).toHaveBeenLastCalledWith({ item: 'c' }, { replace: true })

      // The browser's Back: the address no longer names a listing.
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      expect(screen.queryByTestId('listing-column')).not.toBeInTheDocument()
      expect(screen.getByText('Alpha Grill')).toBeVisible()

      // Its own back, when the step is there to take, takes it.
      await user.click(screen.getByRole('button', { name: 'Expand Alpha Grill' }))
      window.history.replaceState({ step: 'listing' }, '')
      await user.click(screen.getByRole('button', { name: 'Food' }))
      expect(back).toHaveBeenCalledTimes(1)
    } finally {
      back.mockRestore()
      window.history.replaceState(null, '')
    }
  })

  it('a pin on the map opens its listing in the column', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    await user.click(screen.getByRole('button', { name: 'Expand Alpha Grill' }))
    await user.click(screen.getByRole('button', { name: 'pin Gamma Deli' }))
    expect(screen.getByText('Column: Gamma Deli, 3 of 3, map beside')).toBeInTheDocument()
  })

  it('stands alone with the map hidden, and can bring it back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GenericDirectory category={food} items={rows} {...handlers} />)
    await user.click(screen.getByRole('button', { name: 'Hide map' }))
    await user.click(screen.getByRole('button', { name: 'Expand Alpha Grill' }))
    expect(screen.getByText('Column: Alpha Grill, 1 of 3, alone')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('listing-column')).getByRole('button', { name: 'Show map' }))
    expect(screen.getByText('Column: Alpha Grill, 1 of 3, map beside')).toBeInTheDocument()
  })

  it('stands alone where the category has no map, with no Show map', async () => {
    const user = userEvent.setup()
    const groups = makeCategory({ id: 'whatsapp', pluralLabel: 'WhatsApp Groups', hasAddress: false })
    renderWithProviders(<GenericDirectory category={groups} items={rows} {...handlers} />)
    await user.click(screen.getByRole('button', { name: 'Expand Alpha Grill' }))
    expect(screen.getByText('Column: Alpha Grill, 1 of 3, alone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show map' })).not.toBeInTheDocument()
  })

  it('opens there straight from a link, with what the home search matched', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
    const tj = makeListing({ id: 'tj', name: "Trader Joe's", category: 'grocery', m: ['Cheddar Cheese'] })
    renderWithProviders(<GenericDirectory category={grocery} items={[tj]} {...handlers} reopenItemId="tj" reopenMatch="cheese" />)
    expect(screen.getByText("Column: Trader Joe's, 1 of 1, map beside")).toBeInTheDocument()
    expect(screen.getByText('column found: Cheddar Cheese')).toBeInTheDocument()
  })

  it('isn’t there on a phone: the listing opens in its sheet over the list', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericDirectory category={food} items={rows} {...handlers} />
      </ForcedViewport>,
    )
    await user.click(screen.getByRole('button', { name: 'Expand Beta Cafe' }))
    expect(screen.queryByTestId('listing-column')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha Grill')).toBeVisible()
  })
})

// A listing someone arrives at from its own link (/philly/food/judah-…) is,
// on a phone, a page of its own, not a sheet over a list they never saw
// (agreed Sep 30). Opened from the list, it's the sheet as always.
describe('GenericDirectory — a listing’s own link, on a phone', () => {
  const food = makeCategory({ id: 'restaurant', pluralLabel: 'Food' })
  const rows = [
    makeListing({ id: 'a', name: 'Alpha Grill', category: 'restaurant' }),
    makeListing({ id: 'b', name: 'Beta Cafe', category: 'restaurant' }),
  ] as DirectoryResource[]
  const phone = (ui: React.ReactElement) => renderWithProviders(<ForcedViewport isMobile>{ui}</ForcedViewport>)

  it('is the page, with the list out of the way', () => {
    phone(<GenericDirectory category={food} items={rows} {...handlers} reopenItemId="b" linkedItemId="b" />)
    expect(screen.getByText(/Column: Beta Cafe, 2 of 2, the page/)).toBeInTheDocument()
    expect(screen.getByText('Alpha Grill')).not.toBeVisible()
    expect(screen.getByRole('searchbox', { hidden: true })).not.toBeVisible()
  })

  it('a ?item= reopening is the sheet over the list, as before', () => {
    phone(<GenericDirectory category={food} items={rows} {...handlers} reopenItemId="b" />)
    expect(screen.queryByTestId('listing-column')).not.toBeInTheDocument()
    expect(screen.getByText('Expanded Beta Cafe')).toBeInTheDocument()
    expect(screen.getByText('Alpha Grill')).toBeVisible()
  })

  it('closing it goes to the list, at the category’s own address, and listings then open as sheets', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/test-community/restaurant/beta-cafe-b')
    phone(<GenericDirectory category={food} items={rows} {...handlers} reopenItemId="b" linkedItemId="b" />)
    await user.click(screen.getByRole('button', { name: 'Food' }))

    expect(screen.queryByTestId('listing-column')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha Grill')).toBeVisible()
    expect(window.location.pathname).toBe('/test-community/restaurant')

    await user.click(screen.getByRole('button', { name: 'Expand Alpha Grill' }))
    expect(screen.queryByTestId('listing-column')).not.toBeInTheDocument()
  })
})

// The Minyanim tab (the user's notes 4 and 6, agreed Oct 2, and a bug found
// the same day): its own search that stays on it, and switching tabs from
// an open synagogue.
describe('GenericDirectory — the Minyanim tab', () => {
  const shulCat = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
  const mekor = makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue', minyanim: [{ id: 'm', tefillah: 'maariv', days: ['mon'], time: '7:45pm' }] })
  const aleph = makeListing({ id: 'aleph', name: 'Aleph Shul', category: 'synagogue', minyanim: [{ id: 'a', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }] })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T11:00:00-04:00')) // a Monday morning
  })
  afterEach(() => vi.useRealTimers())

  it('has its own search, “in Minyanim”, and typing stays on the minyanim', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<GenericDirectory category={shulCat} items={[mekor, aleph]} openMinyanimView {...handlers} />, { content: { categories: [shulCat] } })
    expect(screen.getByRole('searchbox', { name: 'Search Minyanim' })).toHaveAttribute('placeholder', 'Ask: mincha tonight')
    await user.type(screen.getByRole('searchbox'), 'maariv')
    // It used to drop back to the list of shuls.
    expect(screen.getByTestId('minyanim-view')).toBeInTheDocument()
    expect(within(screen.getByTestId('minyanim-rows')).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('Mekor Habracha')])
  })

  it('the Synagogues tab doesn’t offer the davening searches', () => {
    renderWithProviders(<GenericDirectory category={shulCat} items={[mekor, aleph]} {...handlers} />, { content: { categories: [shulCat] } })
    expect(screen.getByRole('searchbox', { name: 'Search Synagogues' })).toBeInTheDocument()
    expect(screen.queryByText('shacharis tomorrow')).not.toBeInTheDocument()
  })

  it('“‹ Synagogues” goes back from the Minyanim view to the list of shuls', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onParamsChange = vi.fn()
    renderWithProviders(<GenericDirectory category={shulCat} items={[mekor, aleph]} openMinyanimView {...handlers} onParamsChange={onParamsChange} />, { content: { categories: [shulCat] } })
    expect(screen.getByTestId('minyanim-view')).toBeVisible()
    await user.click(within(screen.getByTestId('directory-up')).getByRole('button', { name: 'Synagogues' }))
    expect(screen.queryByTestId('minyanim-view')).not.toBeInTheDocument()
    expect(screen.getByText('Aleph Shul')).toBeVisible()
  })

  // Oct 6: the view said "Synagogues" three times on a computer (the page
  // title, "‹ Synagogues", then a bigger "Minyanim by time"), and on a phone
  // had a second back under the header's.
  it('on a computer, Synagogues once: a small “‹ Synagogues” over the title, which is the view’s', () => {
    renderWithProviders(<GenericDirectory category={shulCat} items={[mekor, aleph]} openMinyanimView {...handlers} />, { content: { categories: [shulCat] } })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Minyanim by time')
    expect(within(screen.getByTestId('directory-up')).getByRole('button')).toHaveTextContent('Synagogues')
    expect(screen.getAllByRole('button', { name: /Synagogues/ })).toHaveLength(1)
    expect(screen.queryAllByRole('heading', { name: 'Minyanim by time' })).toHaveLength(1)
  })

  function HeaderProbe() {
    const header = useScreenHeader()
    return header && <button data-testid="header-back" onClick={header.onBack}>‹ {header.title}</button>
  }

  it('on a phone, the header names it and its ‹ goes to Synagogues; no second back under it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(
      <ScreenHeaderProvider>
        <ForcedViewport isMobile>
          <GenericDirectory category={shulCat} items={[mekor, aleph]} {...handlers} />
        </ForcedViewport>
        <HeaderProbe />
      </ScreenHeaderProvider>,
      { content: { categories: [shulCat] } },
    )
    expect(screen.getByTestId('header-back')).toHaveTextContent('‹ Synagogues')
    await user.click(screen.getByTestId('next-minyan'))
    expect(screen.getByTestId('header-back')).toHaveTextContent('‹ Minyanim by time')
    expect(screen.queryByRole('button', { name: /Synagogues/ })).not.toBeInTheDocument()

    await user.click(screen.getByTestId('header-back'))
    expect(screen.queryByTestId('minyanim-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('header-back')).toHaveTextContent('‹ Synagogues')
  })

  // It replaced the address, so Back (a phone's swipe) left Synagogues.
  it('opened from the page, it’s a step Back undoes, and its own back takes that step', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onParamsChange = vi.fn()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    try {
      renderWithProviders(<GenericDirectory category={shulCat} items={[mekor, aleph]} {...handlers} onParamsChange={onParamsChange} />, { content: { categories: [shulCat] } })
      await user.click(screen.getByTestId('next-minyan'))
      expect(onParamsChange).toHaveBeenLastCalledWith({ davening: '1' }, { step: 'minyanim' })

      // The browser's Back: the address no longer has ?davening.
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      expect(screen.queryByTestId('minyanim-view')).not.toBeInTheDocument()
      expect(screen.getByText('Aleph Shul')).toBeVisible()

      // Its own back, when the step is there to take, takes it.
      await user.click(screen.getByTestId('next-minyan'))
      window.history.replaceState({ step: 'minyanim' }, '')
      await user.click(within(screen.getByTestId('directory-up')).getByRole('button'))
      expect(back).toHaveBeenCalledTimes(1)
    } finally {
      back.mockRestore()
      window.history.replaceState(null, '')
    }
  })
})

