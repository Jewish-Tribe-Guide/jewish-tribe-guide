// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { ForcedViewport } from '@/lib/useIsMobile'
import { GenericListingCard, MOBILE_PANEL_TRANSITION_MS, type GenericListingCardHandle } from './GenericListingCard'

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

  // The kebab/toggle group is absolutely positioned (right-0, top-1/2
  // -translate-y-1/2) against the relative wrapper spanning the whole
  // pre-badge-divider block, not just the icon/name/address row it used to
  // share a flex row with — self-centering WITHIN that row (an earlier,
  // narrower fix) only matched the row's own short height, and still
  // pinned the kebab near the top of a taller card once a header text
  // field or an upvote/distance row added real height below it. Centering
  // against the CARD's real header height needed pulling it out of normal
  // flex flow entirely, not just changing its align-self — see that
  // group's own comment for the fuller reasoning, and this component's
  // Storybook-free live-verification notes in the commit that introduced
  // this for the getBoundingClientRect check that actually caught the gap
  // a self-center-only fix left behind.
  it('positions the kebab absolutely, centered against the full pre-badge block', () => {
    renderWithProviders(
      <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )

    const kebab = screen.getByRole('button', { name: /more actions for/i })
    const positioned = kebab.closest('div[class*="absolute"]')
    expect(positioned).not.toBeNull()
    expect(positioned).toHaveClass('absolute', 'right-1', 'top-1/2', '-translate-y-1/2')

    // Its positioning context (the nearest `relative` ancestor an absolute
    // child measures against) is the wrapper spanning the icon/name row AND
    // the rows below it, not the narrow icon/name row alone — that's the
    // actual "the whole card" the kebab centers against now.
    expect(positioned!.parentElement).toHaveClass('relative', 'pr-8')
  })

  // The outside click that dismisses the kebab almost always lands ON this
  // row (it's most of the visible card) — without something to stop it,
  // that same tap also silently expanded the card in the same motion.
  // Confirmed live before this landed (getBoundingClientRect + aria-expanded
  // before/after showed it flipping to true on the dismiss tap itself).
  // Two fix attempts came before the one this now tests: a capture-phase
  // stopPropagation inside ListingActionsMenu (worked here, not on real
  // iPhones), then a per-card suppression ref/shared module keyed off
  // ListingActionsMenu's own onOutsideDismiss callback (worked, but every
  // new caller — the map's background tap, a directory's Add button — needed
  // its own bespoke wiring, and some never got it). ListingActionsMenu now
  // owns this itself with a real, invisible backdrop covering the whole
  // viewport while the menu is open (see its own top-of-file doc) — this
  // test clicks that backdrop directly (by test id, not the row), since in
  // jsdom (no real hit-testing from screen position) that's what actually
  // receives an outside tap now; a real browser routes the same tap there
  // by ordinary z-order, whatever it looks like it landed on.
  it('does not expand the card on the same tap that dismisses its kebab menu', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { name: /more actions for/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByTestId('listing-actions-backdrop'))
    const toggle = screen.getByRole('button', { name: /show details for/i })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // A later, genuinely separate tap on the row must still work.
    const row = toggle.closest('div[class*="cursor-pointer"]')!
    await user.click(row)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  // Same failure mode as the test above, but across two different cards —
  // the popup is portaled (see ListingActionsMenu's own doc), so an outside
  // tap dismissing card A's menu could land anywhere on the page, including
  // card B's own row. The backdrop fixes this the same way as the same-card
  // case: card B is never involved in the click at all (the backdrop
  // belongs to card A's own React tree and stops its own propagation — see
  // ListingActionsMenu's own doc), so this is really confirming there's
  // nothing card-specific left to keep in sync between the two cases any
  // more, not a separate mechanism.
  it("does not expand a different card on the tap that dismisses another card's kebab menu", async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const itemA = makeListing({ id: 'listing-a', name: 'Card A' })
    const itemB = makeListing({ id: 'listing-b', name: 'Card B' })
    renderWithProviders(
      <>
        <GenericListingCard item={itemA} category={category} upvotes={false} count={0} {...requiredHandlers} />
        <GenericListingCard item={itemB} category={category} upvotes={false} count={0} {...requiredHandlers} />
      </>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for card a/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByTestId('listing-actions-backdrop'))
    const toggleB = screen.getByRole('button', { name: /show details for card b/i })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(toggleB).toHaveAttribute('aria-expanded', 'false')

    // A later, genuinely separate tap on card B must still work.
    const rowB = toggleB.closest('div[class*="cursor-pointer"]')!
    await user.click(rowB)
    expect(toggleB).toHaveAttribute('aria-expanded', 'true')
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
      expect(description).toHaveStyle({ WebkitLineClamp: '3', display: '-webkit-box' })
      expect(description).not.toHaveClass('truncate')
    }
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
  it('shows the full address and an Edit button once expanded, when the category allows editing', async () => {
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ address: '1 Main St, Philadelphia, PA 19104' })
    renderWithProviders(
      <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />,
    )

    await user.click(screen.getByRole('button', { name: /show details for/i }))

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
})

// ── The collapsed row's actions kebab (Pin/Share/I'm here — see
// ListingActionsMenu.tsx) and the layout change that made room for it: the
// upvote/distance stat moved from a mobile-only corner column into the same
// pl-[52px] row desktop already used, freeing the corner for the kebab on
// both platforms. ──────────────────────────────────────────────────────────
describe('GenericListingCard — actions menu corner', () => {
  it('renders the actions kebab on desktop, in the collapsed row', () => {
    renderWithProviders(
      <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />,
    )
    expect(screen.getByRole('button', { name: /more actions for/i })).toBeInTheDocument()
  })

  it('renders the actions kebab on mobile too, in the same collapsed row', () => {
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />
      </ForcedViewport>,
    )
    expect(screen.getByRole('button', { name: /more actions for/i })).toBeInTheDocument()
  })
})

// The chevron used to be the only visible signal that this row expands at
// all on mobile (no hover state exists there to hint at it another way).
// Removing it (see the toggle button's own comment) meant the mobile panel
// itself had to take over that job by animating open instead of popping in
// silently — these two things ship together, not independently.
describe('GenericListingCard — mobile accordion animation', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders no visible chevron svg any more, on either breakpoint', () => {
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericListingCard item={makeListing()} category={makeCategory()} upvotes={false} count={0} {...requiredHandlers} />
      </ForcedViewport>,
    )
    const toggle = screen.getByRole('button', { name: /show details for/i })
    expect(toggle.querySelector('svg')).not.toBeInTheDocument()
  })

  it('keeps the panel mounted through its close transition, then removes it', () => {
    vi.useFakeTimers()
    const category = makeCategory()
    const item = makeListing()
    renderWithProviders(
      <ForcedViewport isMobile>
        <GenericListingCard item={item} category={category} upvotes={false} count={0} {...requiredHandlers} />
      </ForcedViewport>,
    )

    const toggle = screen.getByRole('button', { name: /show details for/i })
    act(() => fireEvent.click(toggle))
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()

    const collapseToggle = screen.getByRole('button', { name: /hide details for/i })
    act(() => fireEvent.click(collapseToggle))
    // Still in the DOM immediately after collapsing starts — an instant
    // unmount here is exactly the silent pop this animation replaced.
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(MOBILE_PANEL_TRANSITION_MS))
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })
})
