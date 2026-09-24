// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ForcedViewport } from '@/lib/useIsMobile'
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

// ListingEditor is covered by its own test file; rendering it for real pulls
// in the Google Maps address widget and Turnstile, which this file has no
// need to exercise. The stub proves the host swaps to it, in place, with the
// right listing — and, where the host passes one, that Send goes into the
// host's floating slot.
vi.mock('./ListingEditor', async () => {
  const { createPortal } = await import('react-dom')
  return {
    default: ({
      item,
      onClose,
      onRemovalOpenChange,
      sendSlot,
      titleSlot,
    }: {
      item: { name: string }
      onClose: () => void
      onRemovalOpenChange?: (open: boolean) => void
      sendSlot?: HTMLElement | null
      titleSlot?: HTMLElement | null
    }) => (
      <div>
        <p>ListingEditor stub — item={item.name}</p>
        <button onClick={onClose}>stub cancel</button>
        {/* Stands in for the editor's Request removal link, for tests that
            prove the HOST's title reacts to it. */}
        <button onClick={() => onRemovalOpenChange?.(true)}>stub open removal</button>
        {sendSlot && createPortal(<button>stub send</button>, sendSlot)}
        {titleSlot && createPortal(<h2>stub title</h2>, titleSlot)}
      </div>
    ),
  }
})

afterEach(() => {
  // Pinned state lives in localStorage, and a test that throws before its own
  // cleanup used to poison every test after it — a listing silently pinned
  // turns "Pin" into "Pinned" and adds a second 📌 to the card, which reads
  // as half a dozen unrelated failures somewhere far away. Cleared here so a
  // failure stays where it happened.
  localStorage.clear()
  cleanup()
  // The Edit-history-push tests below leave real entries behind — jsdom's
  // History is a live, module-level object, not reset between tests — so
  // one test's pushState can't leak into the next one's own assertions.
  // Same reset MapPlaceDetail.test.tsx uses for its identical pattern.
  window.history.replaceState(null, '')
})

const requiredHandlers = {
  onVote: vi.fn(),
  onTagClick: vi.fn(),
  onFilterOpen: vi.fn(),
  onFilterBool: vi.fn(),
  onFilterSelect: vi.fn(),
  onEdit: vi.fn(),
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
    const toggle = screen.getByRole('button', { name: /show details for/i })
    await user.click(toggle)

    expect(screen.getByRole('button', { name: /hide details for/i })).toBeInTheDocument()
  })

  // The outer card wrapper stretches to match its row-mates in the desktop
  // grid (CSS Grid's default row-stretch — see the wrapper's own h-full
  // comment), but a plain block child doesn't inherit that automatically.
  // Without h-full on this inner row too, a card shorter than its tallest
  // neighbor left a dead strip at the card's own bottom — inside the visible
  // border, past where this div's content ended — with no onClick and no
  // hover state, which is what read as "the whole card isn't clickable."
  it('the clickable row stretches to fill the card (h-full), not just its own content', () => {
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    const toggle = screen.getByRole('button', { name: /show details for/i })
    const row = toggle.closest('div[class*="cursor-pointer"]')
    expect(row).not.toBeNull()
    expect(row).toHaveClass('h-full')
  })

  // The corner group is absolutely positioned (right-1, top-1/2
  // -translate-y-1/2) against the relative wrapper spanning the whole
  // pre-badge-divider block, not just the icon/name/address row it used to
  // share a flex row with — self-centering WITHIN that row only matched the
  // row's own short height, and still pinned the group near the top of a
  // taller card once a header text field or an upvote/distance row added
  // real height below it. That reasoning outlived the kebab: the group still
  // holds the invisible toggle and, on desktop, the hover-revealed Pin and
  // Share, and it still has to sit at the card's true vertical middle.
  // What DID change is the wrapper's `pr-8` — the reserve existed to keep
  // the name clear of the kebab, and with the kebab gone the name takes
  // those 32px back (346px -> 378px on a real card at phone width).
  it('centers the corner group against the full pre-badge block, with no reserve left for a kebab', () => {
    renderWithProviders(
      <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )

    const toggle = screen.getByRole('button', { name: /show details for Goldi Market/i })
    const positioned = toggle.closest('div[class*="absolute"]')
    expect(positioned).not.toBeNull()
    expect(positioned).toHaveClass('absolute', 'right-1', 'top-1/2', '-translate-y-1/2')

    const wrapper = positioned!.parentElement!
    expect(wrapper).toHaveClass('relative')
    expect(wrapper.className).not.toContain('pr-8')
  })

  // The two tests that used to sit here — "a tap dismissing the kebab must
  // not also expand the card", on this card and on a neighbouring one — are
  // gone with the kebab itself. The behaviour they guarded is not: it belongs
  // to the invisible backdrop every popup of listing actions uses, and it is
  // covered where it lives now (ListingActionsFan.test.tsx, "closes on an
  // outside tap, via its invisible backdrop" and the test below it — ported
  // there when the kebab's own file was deleted). Deleted rather than
  // rewritten because a card with no kebab cannot exercise any of it.

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
    expect(screen.getByRole('button', { name: /show details for/i })).toBeInTheDocument()
  })

  // PinnedBadge on the avatar — same treatment NearbyList's own left icon
  // gets (see that file's identical test).
  it('shows a pin badge on the avatar only once the listing is pinned', () => {
    localStorage.setItem('jpc:pinned-listings', JSON.stringify([{ id: 'listing-1', categoryId: 'grocery' }]))
    const category = makeCategory({ id: 'grocery' })
    const item = makeListing({ id: 'listing-1', name: 'Acme Grocery' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.getByText('📌')).toBeInTheDocument()
    localStorage.clear()
  })

  it('shows no pin badge for an unpinned listing', () => {
    const category = makeCategory()
    const item = makeListing({ name: 'Acme Grocery' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.queryByText('📌')).not.toBeInTheDocument()
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
      expect(description).toHaveStyle({ WebkitLineClamp: '2', display: '-webkit-box' })
      expect(description).not.toHaveClass('truncate')
    }
  })

  // Regression: a no-address category (WhatsApp Groups, Networking) used to
  // render this same mobile preview as every other category — but those
  // listings are just a name plus a website, so the free-form description is
  // usually the longest thing on the card, and on a single-column mobile
  // list that meant one listing's card dwarfed its neighbors instead of
  // letting a visitor scan names quickly. Desktop keeps it (a multi-column
  // grid doesn't have that problem), so this only asserts mobile's copy is
  // gone — not the desktop one.
  it('does not render the mobile description preview for a category with no address', () => {
    const category = makeCategory({
      hasAddress: false,
      detailFields: [{ key: 'd', label: 'Description', type: 'textarea', showInHeader: true }],
    })
    const item = makeListing({ d: 'A network of young leaders and philanthropists giving back as they build connections and community.' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    // Exactly one copy now (desktop's), not the usual two.
    expect(screen.getAllByText(/A network of young leaders/)).toHaveLength(1)
  })

  // Regression: mobile used to render this description AFTER the upvote/
  // distance row instead of before it, unlike desktop (whose own copy of
  // this field sits inside the name column, ahead of that row entirely) —
  // so mobile visitors saw popularity/distance outrank the description.
  it('renders the mobile-only description before the upvote/distance row, matching desktop\'s own order', () => {
    const category = makeCategory({
      detailFields: [{ key: 'note', label: 'Note', type: 'text', showInHeader: true }],
      upvotesEnabled: true,
    })
    const item = makeListing({ note: 'Sit-down glatt kosher steakhouse' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes count={0} {...requiredHandlers} />,
    )

    // Not `[class*="pl-[52px]"]` alone — the mobile description paragraph
    // itself also carries that class (it's indented to match), so that
    // selector matches it first regardless of order. mt-1.5 + justify-start
    // together are unique to the upvote/distance row.
    const mobileDescription = document.querySelector('p.desktop\\:hidden.truncate')!
    const upvoteRow = document.querySelector('div[class*="mt-1.5"][class*="justify-start"]')!
    expect(mobileDescription.compareDocumentPosition(upvoteRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// The row-alignment handle GenericDirectory uses to measure each card's
// content height and set two independent invisible spacers — one above the
// upvote/distance row, one above the badge row — see GenericListingCardHandle's
// own doc for why this is two segments rather than one shared spacer: it's
// what makes the popularity/distance LINE itself land at the same height
// across a row of cards, not just the badges further down. An earlier
// heuristic (reserving 2-line name height category-wide) reserved a visible
// gap between the NAME and ADDRESS on every card in a category, not just the
// row that actually needed it — that's gone.
describe('GenericListingCard — row-alignment handle', () => {
  it('measureUpvoteRowOffset reads the real gap between the card root and the upvote/distance row', () => {
    const ref = createRef<GenericListingCardHandle>()
    const category = makeCategory({ upvotesEnabled: true })
    const item = makeListing({ name: 'Acme' })
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes count={0} {...requiredHandlers} />,
    )

    // jsdom lays out everything at 0×0 (no real geometry engine), so the
    // meaningful assertion here isn't a specific pixel value — it's that
    // the handle actually returns a number instead of null, i.e. it found
    // both the card root and a real upvote/distance row to measure between.
    // A category with nothing there (see the next test) is what null is for.
    expect(ref.current?.measureUpvoteRowOffset()).not.toBeNull()
  })

  it('measureUpvoteRowOffset is null when there is no upvote/distance row', () => {
    const ref = createRef<GenericListingCardHandle>()
    const category = makeCategory({ upvotesEnabled: false })
    const item = makeListing({ name: 'Acme' })
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(ref.current?.measureUpvoteRowOffset()).toBeNull()
  })

  it('measureBadgeGap reads the gap to the badge row, falling back to the card root when there is no upvote row', () => {
    const ref = createRef<GenericListingCardHandle>()
    const category = makeCategory({
      detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
      upvotesEnabled: false,
    })
    const item = makeListing({ name: 'Acme', isKosher: true })
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(ref.current?.measureBadgeGap()).not.toBeNull()
  })

  it('measureBadgeGap is null when there is no badge row to align', () => {
    const ref = createRef<GenericListingCardHandle>()
    // No hours/filterable fields and upvotes off — nothing to put in the
    // badge row (see badgeRow's own gating further up this file).
    const category = makeCategory({ detailFields: [], upvotesEnabled: false })
    const item = makeListing({ name: 'Acme' })
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(ref.current?.measureBadgeGap()).toBeNull()
  })

  it("setUpvoteSpacerHeight sets the spacer directly above the upvote/distance row, clamped at 0", () => {
    const ref = createRef<GenericListingCardHandle>()
    const category = makeCategory({ upvotesEnabled: true })
    const item = makeListing({ name: 'Acme' })
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes count={0} {...requiredHandlers} />,
    )

    // The spacer is the aria-hidden div immediately before the upvote row's
    // own container — there's nothing else in the card carrying that exact
    // pairing to identify it by.
    const upvoteRow = document.querySelector('[class*="pl-[52px]"]')
    const spacer = upvoteRow?.previousElementSibling

    act(() => ref.current?.setUpvoteSpacerHeight(24))
    expect(spacer).toHaveStyle({ height: '24px' })

    act(() => ref.current?.setUpvoteSpacerHeight(-5))
    expect(spacer).toHaveStyle({ height: '0px' })
  })

  it("setBadgeSpacerHeight sets the spacer directly above the badge row, clamped at 0", () => {
    const ref = createRef<GenericListingCardHandle>()
    const category = makeCategory({
      detailFields: [{ key: 'isKosher', label: 'Kosher', type: 'boolean', filterable: true }],
    })
    const item = makeListing({ name: 'Acme', isKosher: true })
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    // The spacer is the aria-hidden div immediately before the badge row's
    // own border-t container — there's nothing else in the card carrying
    // that exact pairing to identify it by.
    const badgeContainer = document.querySelector('.border-t.border-slate-100')
    const spacer = badgeContainer?.previousElementSibling

    act(() => ref.current?.setBadgeSpacerHeight(24))
    expect(spacer).toHaveStyle({ height: '24px' })

    act(() => ref.current?.setBadgeSpacerHeight(-5))
    expect(spacer).toHaveStyle({ height: '0px' })
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

    await user.click(screen.getByRole('button', { name: /show details for/i }))

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

  // Tags fields store a second array alongside the plain key — the `_sometimes`
  // companion (TagsInput's green/amber toggle) — and PlaceDetailBody already
  // shows those as real items, in their own section, rather than hiding them.
  // The count used to only read the plain key, so a listing with sometimes-
  // kosher items undercounted them right out of the badge.
  it('counts the "_sometimes" companion array too', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'items', label: 'Kosher items available', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' },
      ],
    })
    const item = makeListing({ items: ['Milk', 'Bread'], items_sometimes: ['Cheese'] })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    expect(screen.getByText(chipText('3 kosher items'))).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: /show details for/i }))

    expect(screen.queryByText('Kosher')).not.toBeInTheDocument()
  })
})

describe('GenericListingCard — expanded', () => {
  it('shows the full address, and an Edit item in the dialog\'s own kebab, once expanded', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ address: '1 Main St, Philadelphia, PA 19104' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { name: /show details for/i }))

    expect(screen.getByText('1 Main St, Philadelphia, PA 19104')).toBeInTheDocument()
    // The dialog carries no kebab of its own any more. It used to hold
    // exactly one row — Edit — which is the whole reason this moved: people
    // open a kebab looking for Share and Save, never for "I can change
    // this." Edit is a labelled bar below the dialog now (ListingEditBar),
    // and the only kebab left in the DOM is the collapsed row's, behind the
    // backdrop. Scoped with `within` so this can't accidentally pass on it.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /more actions for/i })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Suggest an edit' })).toBeInTheDocument()
  })

  // Desktop's Edit/Report used to close this dialog and hand off to a
  // separate ActionDialog (a 448px card replaced by a differently-sized
  // 576px form dialog, no shared backdrop — confirmed live to read as a
  // completely different popup appearing, not a continuation of the one
  // already open). Swaps THIS dialog's own content in place instead, same
  // pattern MapPlaceDetail's own formOpen already uses — see
  // ListingDetailModal's own doc. ActionDialog still exists, just not for
  // this entry point: only for a deep link or a search result's own
  // Edit/Report button, which have no open dialog to morph from.
  it('swaps the dialog\'s own content to the edit form — not a separate dialog — when the kebab\'s Edit item is clicked', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suggest an edit' }))

    expect(screen.getByText('ListingEditor stub — item=Goldi Market')).toBeInTheDocument()
    // Not bubbled — this dialog handled it itself.
    expect(requiredHandlers.onEdit).not.toHaveBeenCalled()
    // Still the SAME dialog, not a second one stacked or swapped in.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Suggest an edit' })).toBeInTheDocument()
  })

  // Send floats under the dialog, in the spot the "Suggest an edit" pill
  // held: outside the scrolling card, so a long listing can't scroll it
  // away, but inside the dialog, so assistive tech still reaches it.
  it('floats the editor\'s Send under the dialog, where the edit pill was', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suggest an edit' }))

    const sendButton = within(dialog).getByRole('button', { name: 'stub send' })
    const card = screen.getByText('ListingEditor stub — item=Goldi Market').closest('.dialog-in')!
    expect(card).not.toContainElement(sendButton)
  })

  // The header band beside Back would otherwise be empty while editing;
  // the editor's title goes there, between Back and Close.
  it('puts the editor\'s title in the dialog header, between Back and Close', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suggest an edit' }))

    const header = within(dialog).getByRole('button', { name: 'Back' }).closest('.border-b')!
    expect(within(header as HTMLElement).getByRole('heading', { name: 'stub title' })).toBeInTheDocument()
    expect(within(header as HTMLElement).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  // Removal is a step of its own, with no Cancel: Back and Escape step out
  // of it into the edit, not out of editing. Its own history entry is what
  // makes the browser's Back do the same.
  it('steps back from the removal screen to the edit, with Back or Escape', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suggest an edit' }))
    const push = vi.spyOn(window.history, 'pushState')
    await user.click(screen.getByRole('button', { name: 'stub open removal' }))
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ detailModalForm: 'edit', detailModalRemoval: true }), '')

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.keyboard('{Escape}')
    expect(back).toHaveBeenCalledTimes(2)
    // What that Back delivers: the edit's own entry.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { detailModalForm: 'edit' } }))
    })
    expect(screen.getByRole('dialog', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByText('ListingEditor stub — item=Goldi Market')).toBeInTheDocument()
    push.mockRestore()
    back.mockRestore()
  })

  // The dialog's accessible name follows the editor into its removal
  // panel, reported via onRemovalOpenChange.
  it('the dialog’s own name becomes "Request removal of {name}" once the editor reports the removal panel is open', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suggest an edit' }))
    expect(screen.getByRole('dialog', { name: 'Suggest an edit' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'stub open removal' }))

    expect(screen.getByRole('dialog', { name: 'Request removal of Goldi Market' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Suggest an edit' })).not.toBeInTheDocument()
  })

  // ── The edit bar ──────────────────────────────────────────────────────
  // Repeated feedback was that the site doesn't look editable. Both of the
  // ways in were things a visitor is trained to ignore: a kebab, which says
  // "overflow," and FreshnessFooter's 12px grey "Suggest a correction" link,
  // which sat at the same weight as the timestamp beside it. These assert
  // the replacement is a real, labelled control on BOTH surfaces — the point
  // is its prominence, so "reachable somehow" is not what's being checked.
  it('offers a labelled "Suggest an edit" bar in the expanded dialog, which swaps to the edit form', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suggest an edit' }))
    expect(screen.getByText('ListingEditor stub — item=Goldi Market')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Suggest an edit' })).toBeInTheDocument()
  })

  // In place, the way the desktop dialog and the map do it: the sheet stays
  // the same sheet and its content becomes the form, rather than closing
  // and handing off to FindResources' separate Edit sheet.
  it('offers the same bar in the mobile listing sheet, which swaps the sheet to the edit form', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />
      </ForcedViewport>,
    )
    const sheet = screen.getByRole('dialog', { name: 'Goldi Market' })
    await user.click(within(sheet).getByRole('button', { name: 'Suggest an edit' }))

    expect(within(sheet).getByText('ListingEditor stub — item=Goldi Market')).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  // The quiet link is deliberately gone from both directory surfaces now
  // that the bar carries this job — two doors to the same form, one of them
  // near-invisible, is the duplication the bar was built to end. The
  // freshness STATUS stays: "Still right?" is its own one-tap contribution.
  // (The map's place panel dropped it too once it got the bar, and
  // FreshnessFooter no longer has the link at all.)
  it('drops the quiet "Suggest a correction" link from both surfaces, keeping the freshness line', async () => {
    renderWithProviders(
      <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )
    expect(screen.queryByRole('button', { name: 'Suggest a correction' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /still right|mark as current/i })).toBeInTheDocument()
  })

  // A category that can't be edited loses the pill and KEEPS the overflow.
  // This test used to assert only the first half, and so certified a real
  // regression: the bar was gated on edit wholesale, and the overflow is the
  // only home Set-as-location has, and the only route to Pin/Share a
  // keyboard or screen reader can reach — the card's swipe and hover-reveal
  // are pointer-only precisely because this exists. Both surfaces, since
  // they gate independently (MapPlaceDetail in the mobile sheet,
  // ListingDetailModal on desktop).
  for (const [surface, isMobile] of [['mobile sheet', true], ['desktop dialog', false]] as const) {
    it(`keeps the overflow, without the pill, when the category cannot be edited (${surface})`, async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <ForcedViewport isMobile={isMobile}>
          <GenericListingCard
            item={makeListing({ name: 'Goldi Market' })}
            category={makeCategory({ capabilities: { add: true, edit: false, report: true, directorySearch: true, map: true } })}
            upvotes={false}
            count={0}
            defaultExpanded
            {...requiredHandlers}
          />
        </ForcedViewport>,
      )
      await Promise.resolve()
      expect(screen.queryByRole('button', { name: 'Suggest an edit' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
      expect(screen.getByRole('menuitem', { name: 'Share' })).toBeInTheDocument()
    })
  }

  // Removal is requested at the foot of the edit form (RemovalRequest), not
  // from a Report row, so nothing in the expanded dialog offers one — and
  // the dialog has no kebab left to offer it from either.
  it('the expanded dialog offers the edit bar, no kebab and no Report', async () => {
    renderWithProviders(
      <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /more actions for/i })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /report/i })).not.toBeInTheDocument()
  })

  // Regression coverage for the actual reason this exists: with no way
  // back, editing from here would have no way out except the Close button
  // (which the old behavior also had, but at the cost of losing your place
  // in the directory — this doesn't). See MapPlaceDetail's own identical
  // Back-button coverage, same reasoning.
  it('shows a Back button once the edit form is open, and it returns to the detail view via history.back()', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing()
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suggest an edit' }))

    await user.click(screen.getByRole('button', { name: /^back$/i }))
    expect(backSpy).toHaveBeenCalled()
  })

  it('pushes a history entry when Edit opens, so a swipe-back returns to the detail view instead of closing the dialog entirely', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing()
    const pushSpy = vi.spyOn(window.history, 'pushState')
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} defaultExpanded {...requiredHandlers} />,
    )

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Suggest an edit' }))

    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ detailModalForm: 'edit' }), '')
  })

  // onExpandedChange — lets GenericDirectory keep ?item=<id> in sync with
  // whichever card is open (see that component's own doc on why this is
  // called directly rather than via a useEffect watching `expanded`).
  it('calls onExpandedChange(true) then onExpandedChange(false) as the row is clicked open and closed', async () => {
    const user = userEvent.setup()
    const onExpandedChange = vi.fn()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} onExpandedChange={onExpandedChange} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { name: /show details for/i }))
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)

    await user.click(screen.getByRole('button', { name: /hide details for/i }))
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })

  it('calls onExpandedChange via the imperative open()/close() handle', () => {
    const ref = createRef<GenericListingCardHandle>()
    const onExpandedChange = vi.fn()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard ref={ref} item={item} category={category} upvotes={false} count={0} onExpandedChange={onExpandedChange} {...requiredHandlers} />,
    )

    act(() => ref.current?.open())
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)

    act(() => ref.current?.close())
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })

  it('calls onExpandedChange(false) when the desktop dialog is closed via its own Close button', async () => {
    const user = userEvent.setup()
    const onExpandedChange = vi.fn()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} defaultExpanded onExpandedChange={onExpandedChange} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onExpandedChange).toHaveBeenCalledWith(false)
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

    await user.click(screen.getByRole('button', { name: /show details for/i }))
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

    await user.click(screen.getByRole('button', { name: /show details for/i }))

    expect(screen.getByRole('button', { name: 'Previous listing' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next listing' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next listing' }))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  // Was `fixed left-4`/`fixed right-4` — pinned to the viewport's own edges
  // regardless of how far that left them from the dialog card itself (which
  // tops out at max-w-md and sits centered, so on a wide screen the arrows
  // ended up hundreds of pixels away). They're flex siblings of the card
  // now, inside the same centered row, so they land right next to it at any
  // viewport width instead.
  it('sits as a flex sibling of the dialog card, not pinned to the viewport edge', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} onNavigate={vi.fn()} hasPrev hasNext {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { name: /show details for/i }))

    const prevButton = screen.getByRole('button', { name: 'Previous listing' })
    expect(prevButton).not.toHaveClass('fixed')
    expect(prevButton.parentElement).toBe(screen.getByRole('dialog').parentElement)
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
    // One copy — mobile and desktop now share the same row (see
    // renderUpvoteDistanceContent's own doc on why the mobile-only stacked
    // corner version was removed: it needed to make room for the kebab menu).
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
    expect(screen.getByRole('button', { name: /show details for/i })).toBeInTheDocument()

    document.removeEventListener('jpc:open-location', opened)
  })

  // The resolved distance is a chip too now, not plain text — see
  // renderUpvoteDistanceContent's own comment on why: a row with one
  // clickable pill next to one plain fact read as lopsided, and made the
  // empty-state chip's own clickability less obvious by contrast.
  it('also opens the location picker by tapping the resolved distance, once one is shown', async () => {
    const user = userEvent.setup()
    const opened = vi.fn()
    document.addEventListener('jpc:open-location', opened)

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

    await user.click(screen.getByRole('button', { name: /change your location/i }))

    expect(opened).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /show details for/i })).toBeInTheDocument()

    document.removeEventListener('jpc:open-location', opened)
  })
})

// ── The collapsed row's actions ──────────────────────────────────────────
// These used to live in a kebab in the card's corner. The kebab is gone:
// people open a ⋯ expecting Share and Save, never expecting to author
// anything, which is exactly why Edit spent so long invisible in there.
// Pin and Share are reached by swiping the row on mobile and by hovering it
// on desktop; Edit and Set-as-location live below an opened listing (the
// edit bar and its fan). Both card routes are SHORTCUTS — the fan is where
// every visitor can reach these, which is what makes it safe for the card's
// own copies to be invisible until asked for.
describe('GenericListingCard — collapsed row actions', () => {
  it('no longer renders a kebab on either viewport', () => {
    renderWithProviders(
      <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )
    expect(screen.queryByRole('button', { name: /more actions for/i })).not.toBeInTheDocument()
    cleanup()

    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />
      </ForcedViewport>,
    )
    expect(screen.queryByRole('button', { name: /more actions for/i })).not.toBeInTheDocument()
  })

  // Hover can't be simulated meaningfully in jsdom (no layout, no real
  // pointer), so this asserts the mechanism and, more importantly, the
  // decision underneath it: these are a POINTER-ONLY shortcut.
  //
  // The first version made them focusable and revealed them on focus-within,
  // reasoning that keyboard parity was the accessible choice. Measured on a
  // real directory page it was the opposite — `opacity-0` removes an element
  // from neither the tab order nor the accessibility tree, so a twenty-card
  // list gained forty extra tab stops and forty announcements for controls
  // nobody can see. Pin and Share stay reachable for everyone in the fan
  // below an opened listing (ListingActionsFan), which is the same route
  // that makes the touch-only swipe acceptable.
  it('keeps the desktop hover actions out of the tab order and the a11y tree', () => {
    renderWithProviders(
      <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )

    // Not queryable by role at all — that IS the assertion.
    expect(screen.queryByRole('button', { name: 'Pin Goldi Market' })).not.toBeInTheDocument()

    const reveal = document.querySelector('[aria-hidden="true"][class*="group-hover/row:opacity-100"]')
    expect(reveal).not.toBeNull()
    const buttons = reveal!.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    buttons.forEach((b) => expect(b).toHaveAttribute('tabindex', '-1'))
    expect([...buttons].map((b) => b.getAttribute('aria-label'))).toEqual(['Pin Goldi Market', 'Share Goldi Market'])
  })

  // Set-as-location re-sorts the whole directory — a deliberate act, not a
  // scanning one — so it is deliberately NOT one of the card's two.
  it('keeps Set as location off the card, where only scanning actions belong', () => {
    renderWithProviders(
      <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )
    expect(screen.queryByRole('button', { name: /set as location/i })).not.toBeInTheDocument()
  })

  // This assertion used to read `expect(toggle.className).toContain(
  // 'pointer-events-none')`, and it is worth saying why it is gone rather
  // than just deleting it. The toggle carries no icon and no onClick — it
  // exists so a keyboard or screen-reader visitor has a real control to
  // activate — and once the kebab's `pr-8` reserve came off, making it
  // transparent to pointers looked like a free win: a click landing on an
  // invisible spacer would fall through to the name beneath.
  //
  // It was not free, and the test could not have told us. With pointer
  // events off, hit-testing at the button's own centre returns the
  // absolutely-positioned group around it, so the button stopped being
  // clickable as itself — five listing-detail e2e tests that open a listing
  // by clicking `Show details for ...` failed on it, across both viewports.
  // The old test asserted the CSS class that WAS the bug, so it passed the
  // whole time: jsdom loads no stylesheet, so nothing here can observe a
  // computed `pointer-events` or a hit test, and a class-name assertion is
  // not a substitute for either. Pointer-clickability is covered where it
  // is real, in e2e/listing-detail.spec.ts.
  //
  // What this file CAN still guarantee is the part that made the button
  // worth keeping: it is in the DOM, it is reachable by keyboard, and it
  // reports its state.
  it('keeps the invisible toggle in the DOM, keyboard-reachable and stateful', () => {
    renderWithProviders(
      <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )
    const toggle = screen.getByRole('button', { name: /show details for Goldi Market/i })
    expect(toggle).not.toHaveAttribute('tabindex', '-1')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

// ── Swipe to reveal, on mobile ───────────────────────────────────────────
// A gesture is invisible and unreachable by keyboard, so everything here is
// a SHORTCUT: Pin and Share are also in the fan below an opened listing,
// which is the route that works for everyone. The gesture itself is
// SwipeRow, shared with the map's nearby list, and its own rules are tested
// there (SwipeRow.test.tsx). These check the card's side: that it's wired
// in, on mobile only, and that a swipe never also counts as opening the card.
describe('GenericListingCard — swipe actions', () => {
  function renderRow() {
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />
      </ForcedViewport>,
    )
    return screen.getByRole('button', { name: /show details for Goldi Market/i }).closest('div[class*="cursor-pointer"]')!
  }

  // SwipeRow treats a fast release as a flick and commits it regardless of
  // distance, reading each event's timeStamp — which jsdom takes from
  // Date.now() in whole milliseconds. Fired back to back, two events usually
  // share a millisecond (no velocity), but not always: one tick apart turns
  // any drag into a flick, and a drag meant to spring back opens instead.
  // So the clock is frozen here, and every drag takes a deliberate 300ms —
  // unmistakably slow — instead of whatever the machine happened to allow.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function drag(row: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: from.x, clientY: from.y })
    vi.setSystemTime(Date.now() + 300)
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: to.x, clientY: to.y })
    fireEvent.pointerUp(row, { pointerType: 'touch', clientX: to.x, clientY: to.y })
  }

  it('reveals Pin and Share when dragged far enough left', () => {
    const row = renderRow()
    drag(row, { x: 300, y: 100 }, { x: 180, y: 100 })

    expect(screen.getByRole('button', { name: 'Pin Goldi Market' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share Goldi Market' })).toBeInTheDocument()
  })

  // Releasing past the threshold settles at the panels' FULL width, not
  // wherever the finger happened to stop — a row resting at some arbitrary
  // offset leaves the panels partly clipped and reads as broken.
  it('snaps open to the actions\' full width on release, not to where the drag ended', () => {
    const row = renderRow()
    drag(row, { x: 300, y: 100 }, { x: 180, y: 100 })

    // Two 52px actions — the same strip the map's nearby list reveals.
    expect(row.getAttribute('style')).toContain('translateX(-104px)')
  })

  it('springs back when the drag stops short, rather than half-opening', () => {
    const row = renderRow()
    drag(row, { x: 300, y: 100 }, { x: 280, y: 100 })

    expect(screen.queryByRole('button', { name: 'Pin Goldi Market' })).not.toBeInTheDocument()
  })

  // The row sits in a scrolling list. A drag that is mostly vertical has to
  // stay a scroll — ties go to vertical on purpose, because a scroll that
  // fails is far more annoying than a swipe that fails.
  it('ignores a mostly-vertical drag so the list can still scroll', () => {
    const row = renderRow()
    drag(row, { x: 300, y: 100 }, { x: 240, y: 260 })

    expect(screen.queryByRole('button', { name: 'Pin Goldi Market' })).not.toBeInTheDocument()
  })

  // iOS treats a drag from the left screen edge as "go back", and this app is
  // an installed PWA, so that gesture is live. Competing with it would mean
  // losing sometimes and, worse, winning sometimes.
  // A drag ends by dispatching a click. Without swallowing it, a swipe would
  // also expand the card underneath in the same motion.
  //
  // The drag here is deliberately SHORT — below the commit threshold, so the
  // row springs back shut. A long drag cannot test this: it leaves the panels
  // open, and the click then hits the "tap dismisses the panels" branch,
  // which returns early for its own reasons. Written the obvious way first,
  // this test passed with the guard deleted; only the springs-back case
  // actually isolates it.
  it('does not expand the card on the click ending a drag that sprang back', () => {
    const row = renderRow()
    drag(row, { x: 300, y: 100 }, { x: 275, y: 100 })
    fireEvent.click(row)

    expect(screen.queryByRole('button', { name: 'Pin Goldi Market' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show details for Goldi Market/i })).toHaveAttribute('aria-expanded', 'false')
  })

  // Once the actions are up, the next tap on the row puts them away — the
  // same "first tap dismisses" rule any open menu follows — instead of
  // expanding the card. One tap, not a synthetic post-drag click plus a tap:
  // a phone only turns a touch into a click when it barely moved, so a swipe
  // long enough to open the row ends with no click at all.
  it('closes the actions on the next tap, without expanding', () => {
    const row = renderRow()
    drag(row, { x: 300, y: 100 }, { x: 180, y: 100 })
    expect(screen.getByRole('button', { name: 'Pin Goldi Market' })).toBeInTheDocument()
    // A real tap, pointerdown first — see SwipeRow.test.tsx's tap() for why
    // a bare click can't reach the rule this checks.
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 200, clientY: 100 })
    fireEvent.pointerUp(row, { pointerType: 'touch', clientX: 200, clientY: 100 })
    fireEvent.click(row)

    expect(screen.queryByRole('button', { name: 'Pin Goldi Market' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show details for Goldi Market/i })).toHaveAttribute('aria-expanded', 'false')
  })

  // Desktop reveals the same two actions by hovering the row instead.
  it('has no swipe on desktop, which has the hover row instead', () => {
    renderWithProviders(
      <ForcedViewport isMobile={false}>
        <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />
      </ForcedViewport>,
    )
    const row = screen.getByRole('button', { name: /show details for Goldi Market/i }).closest('div[class*="cursor-pointer"]')!
    drag(row, { x: 300, y: 100 }, { x: 180, y: 100 })

    expect(row.getAttribute('style') ?? '').not.toContain('translateX')
  })
})

describe('GenericListingCard — mobile listing sheet', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  function renderMobile(props: Partial<React.ComponentProps<typeof GenericListingCard>> = {}) {
    return renderWithProviders(
      <ForcedViewport isMobile>
        <GenericListingCard item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} {...props} />
      </ForcedViewport>,
    )
  }

  // The chevron used to be the only visible signal that this row opens at
  // all on mobile (no hover state exists there to hint at it); the sheet
  // sliding up on the tap is that signal now.
  it('renders no visible chevron svg any more', () => {
    renderMobile()
    const toggle = screen.getByRole('button', { name: /show details for/i })
    expect(toggle.querySelector('svg')).not.toBeInTheDocument()
  })

  // A tap opens a sheet over the list rather than expanding the row inline.
  // The sheet is the Add/Edit one; what's inside is the map's listing view.
  it('opens the listing in a sheet over the list, not inline', async () => {
    const user = userEvent.setup()
    const onExpandedChange = vi.fn()
    renderMobile({ onExpandedChange })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show details for Goldi Market/i }))
    const sheet = screen.getByRole('dialog', { name: 'Goldi Market' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(within(sheet).getByRole('button', { name: /^mark as current$/i })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)
  })

  // No title row and no "Back to list": the name, at the top of the
  // listing's own view, is the title, and the list is the page behind.
  // One heading means MobileSheet's header didn't come back alongside it.
  it('has the listing name as its only title, and no Back to list', () => {
    renderMobile({ defaultExpanded: true })
    const sheet = screen.getByRole('dialog', { name: 'Goldi Market' })
    const headings = within(sheet).getAllByRole('heading')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Goldi Market')
    expect(within(sheet).queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument()
  })

  // Tapping the dimmed list closes it, like Add and Edit — and it stays on
  // screen long enough to animate away rather than vanishing on the tap.
  it('closes on a tap on the dimmed list, animating out before it unmounts', () => {
    vi.useFakeTimers()
    const onExpandedChange = vi.fn()
    renderMobile({ defaultExpanded: true, onExpandedChange })
    const backdrop = screen.getByRole('dialog', { name: 'Goldi Market' }).parentElement!

    act(() => void fireEvent.click(backdrop))
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('dialog', { name: 'Goldi Market' })).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(300))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // A tag narrows the list behind the sheet, so the sheet gets out of the
  // way first — filtering out of sight would look like the tap did nothing.
  it('closes itself before applying a tag filter to the list behind it', async () => {
    const user = userEvent.setup()
    const onTagClick = vi.fn()
    const onExpandedChange = vi.fn()
    renderMobile({
      defaultExpanded: true,
      onTagClick,
      onExpandedChange,
      category: makeCategory({ detailFields: [{ key: 'items', label: 'Kosher items available', type: 'tags' }] }),
      item: makeListing({ name: 'Goldi Market', items: ['Challah'] }),
    })
    await user.click(within(screen.getByRole('dialog', { name: 'Goldi Market' })).getByRole('button', { name: 'Challah' }))

    expect(onTagClick).toHaveBeenCalledWith('Challah')
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })
})
