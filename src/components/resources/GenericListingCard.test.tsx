// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { GenericListingCard, type GenericListingCardHandle } from './GenericListingCard'

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

describe('GenericListingCard — showInHeader text/textarea fields', () => {
  // `text` keeps the single-line truncate a header field always had — a
  // short tagline has a sensible one-line-or-nothing shape.
  it('truncates a showInHeader "text" field to one line', () => {
    const category = makeCategory({
      detailFields: [{ key: 'note', label: 'Note', type: 'text', showInHeader: true }],
    })
    const item = makeListing({ note: 'Sit-down glatt kosher steakhouse' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    for (const note of screen.getAllByText('Sit-down glatt kosher steakhouse')) {
      expect(note).toHaveClass('truncate')
    }
  })

  // `textarea` clamps to a few lines instead — a real free-form description
  // (Networking's listings are just a name and a website otherwise) has no
  // sensible one-line-or-nothing shape, and truncating it to one line would
  // cut it off after a handful of words.
  it('clamps a showInHeader "textarea" field to a few lines instead of truncating', () => {
    const category = makeCategory({
      detailFields: [{ key: 'd', label: 'Description', type: 'textarea', showInHeader: true }],
    })
    const item = makeListing({ d: 'A network of young leaders and philanthropists giving back as they build connections and community.' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    // Rendered twice (a desktop version and a mobile twin — see
    // GenericListingCard's own comment on why); both should carry the clamp.
    // Inline style, not a `line-clamp-3` className — see
    // headerTextClampStyle's own comment on why className-based line-clamp
    // silently did nothing here (a `desktop:block`/`desktop:hidden` display
    // utility on the same element won the cascade over line-clamp's own
    // required `display: -webkit-box`).
    for (const description of screen.getAllByText(/A network of young leaders/)) {
      expect(description).toHaveStyle({ WebkitLineClamp: '3', display: '-webkit-box' })
      expect(description).not.toHaveClass('truncate')
    }
  })
})

// The modal replaces GenericListingCard's own collapsed row entirely (the
// card behind it is hidden under the backdrop), so a showInHeader url field
// has to be restated somewhere in the dialog too — this is the "somewhere":
// the same pill, next to the name, the collapsed row already used.
describe('GenericListingCard — desktop modal header url field', () => {
  it('shows a showInHeader url field as a pill next to the name in the dialog, not duplicated in the actions row', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      detailFields: [{ key: 'w', label: 'Website', type: 'url', showInHeader: true }],
    })
    const item = makeListing({ w: 'https://example.com' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { expanded: false }))

    const dialog = screen.getByRole('dialog')
    const websiteLinks = within(dialog).getAllByRole('link', { name: 'Website' })
    expect(websiteLinks).toHaveLength(1)
    expect(websiteLinks[0]).toHaveAttribute('href', 'https://example.com')
  })
})

describe('GenericListingCard — count badge', () => {
  // The count itself is bold (see GenericListingCard's own comment on why —
  // a slate chip is deliberately quiet, but the number needs to stand out as
  // an invitation to expand, not just another static-fact badge), which
  // splits the badge's text across more than one DOM text node. getByText's
  // default exact-string match only ever matches a single node, so it can't
  // find "3 kosher items" as such even though that's what the badge reads —
  // a function matcher against the whole chip's textContent is what Testing
  // Library itself recommends for exactly this "text split across markup"
  // case, rather than reaching for a brittle partial/regex match instead.
  function chipText(text: string) {
    return (_: string, element: Element | null) => element?.tagName === 'SPAN' && element.textContent === text
  }

  it('shows "N {countLabel}s" on the collapsed card for a showCountInHeader tags field', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'items', label: 'Kosher items available', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' },
      ],
    })
    const item = makeListing({ items: ['Milk', 'Bread', 'Cheese'] })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.getByText(chipText('3 kosher items'))).toBeInTheDocument()
  })

  it('uses the singular with exactly one item', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'items', label: 'Kosher items available', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' },
      ],
    })
    const item = makeListing({ items: ['Milk'] })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.getByText(chipText('1 kosher item'))).toBeInTheDocument()
    expect(screen.queryByText(chipText('1 kosher items'))).not.toBeInTheDocument()
  })

  it('falls back to the field\'s own label, lowercased, when countLabel is unset', () => {
    const category = makeCategory({
      detailFields: [{ key: 'items', label: 'Kosher Items', type: 'tags', showCountInHeader: true }],
    })
    const item = makeListing({ items: ['Milk', 'Bread'] })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.getByText(chipText('2 kosher items'))).toBeInTheDocument()
  })

  it('shows nothing extra when the tags field has no items, but keeps the replaced badge', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true },
        {
          key: 'items',
          label: 'Kosher items available',
          type: 'tags',
          showCountInHeader: true,
          countLabel: 'kosher item',
          countReplacesKey: 'isKosher',
        },
      ],
    })
    const item = makeListing({ isKosher: true, items: [] })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.queryByText(/kosher item/)).not.toBeInTheDocument()
    expect(screen.getByText('Kosher')).toBeInTheDocument()
  })

  // A count already says "yes, kosher" — the badge countReplacesKey points
  // at (e.g. a boolean "Kosher" toggle) would just repeat that in a less
  // useful form once there's an actual count to show instead.
  it('replaces the chosen badge with the count once there are items', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true },
        {
          key: 'items',
          label: 'Kosher items available',
          type: 'tags',
          showCountInHeader: true,
          countLabel: 'kosher item',
          countReplacesKey: 'isKosher',
        },
      ],
    })
    const item = makeListing({ isKosher: true, items: ['Milk', 'Bread'] })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.getByText(chipText('2 kosher items'))).toBeInTheDocument()
    expect(screen.queryByText('Kosher')).not.toBeInTheDocument()
  })

  // The replaced badge used to reappear the moment the card expanded — it
  // was excluded from the collapsed row's badges (so the count could take
  // its spot) but not from PlaceDetailBody's hiddenBadgeKeys, which only
  // knew about what the collapsed row was actually showing. Same "12 kosher
  // items already says yes, kosher" reasoning applies whether the card is
  // open or closed.
  it('does not bring the replaced badge back once the card is expanded', async () => {
    const user = userEvent.setup()
    const category = makeCategory({
      detailFields: [
        { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true },
        {
          key: 'items',
          label: 'Kosher items available',
          type: 'tags',
          showCountInHeader: true,
          countLabel: 'kosher item',
          countReplacesKey: 'isKosher',
        },
      ],
    })
    const item = makeListing({ isKosher: true, items: ['Milk', 'Bread'] })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { expanded: false }))

    expect(screen.queryByText('Kosher')).not.toBeInTheDocument()
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

  // Desktop's ListingDetailModal — real here, not mocked, since this is
  // exactly the wiring under test: an arrow key while the dialog is open
  // reaches GenericDirectory's onNavigate through it.
  it('calls onNavigate(1)/onNavigate(-1) on ArrowRight/ArrowLeft while the dialog is open', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} onNavigate={onNavigate} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { expanded: false }))
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowLeft}')

    expect(onNavigate).toHaveBeenNthCalledWith(1, 1)
    expect(onNavigate).toHaveBeenNthCalledWith(2, -1)
  })

  // A visible arrow at either end of the list would look clickable but
  // silently do nothing — this is what's supposed to stop that, not just
  // the boundary check inside GenericDirectory's own navigateFromCard.
  it('disables the Previous/Next buttons per hasPrev/hasNext, and clicking Next calls onNavigate(1)', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard
        item={item}
        category={category}
        upvotes={false}
        count={0}
        onNavigate={onNavigate}
        hasPrev={false}
        hasNext={true}
        {...requiredHandlers}
      />,
    )

    await user.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByRole('button', { name: 'Previous listing' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next listing' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next listing' }))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  // GenericDirectory needs to close THIS card and open a sibling from
  // outside it — the whole reason GenericListingCard exposes a ref handle.
  it('opens and closes via an imperative ref handle', async () => {
    const category = makeCategory()
    const item = makeListing()
    const ref = createRef<GenericListingCardHandle>()
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    act(() => ref.current!.open())
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => ref.current!.close())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
