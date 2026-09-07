// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { track } from '@vercel/analytics'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import HeaderNav from './HeaderNav'

// Replaces SectionTabs — see this component's own doc for why. The mega-menu
// behavior (hover/click/focus opens, Escape and focus-out close, a click
// tracks category_opened) is the same contract SectionTabs.test.tsx used to
// cover; what's new here is Map and More, and that this now renders inside
// SiteHeader on every screen rather than only on the home screen.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
const mapCategory = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' })

const foodSection = { id: 'food', kind: 'section' as const, title: 'Food and Hospitality', sortOrder: 1, cardIds: ['grocery'] }
const institutionsSection = { id: 'institutions', kind: 'section' as const, title: 'Jewish Institutions', sortOrder: 2, cardIds: ['synagogue'] }

describe('HeaderNav — Categories', () => {
  it('opens on click and shows every group as its own labeled column', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderNav />, {
      content: { categories: [grocery, synagogue], homeSections: [foodSection, institutionsSection] },
    })

    expect(screen.queryByText('Grocery Stores')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Categories/ }))

    expect(screen.getByText('Food and Hospitality')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Grocery Stores/ })).toHaveAttribute('href', '/test-community/grocery')
    expect(screen.getByText('Jewish Institutions')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Synagogues/ })).toHaveAttribute('href', '/test-community/synagogue')
  })

  it('tracks category_opened with source "header-nav" when a menu item is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderNav />, {
      content: { categories: [grocery], homeSections: [foodSection] },
    })

    await user.click(screen.getByRole('button', { name: /Categories/ }))
    await user.click(screen.getByRole('link', { name: /Grocery Stores/ }))

    expect(vi.mocked(track)).toHaveBeenCalledWith('category_opened', { category: 'grocery', source: 'header-nav' })
  })

  it('opens on hover too, not just a click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderNav />, {
      content: { categories: [grocery], homeSections: [foodSection] },
    })

    await user.hover(screen.getByRole('button', { name: /Categories/ }))
    expect(await screen.findByText('Grocery Stores')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderNav />, {
      content: { categories: [grocery], homeSections: [foodSection] },
    })

    await user.click(screen.getByRole('button', { name: /Categories/ }))
    expect(await screen.findByText('Grocery Stores')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('Grocery Stores')).not.toBeInTheDocument()
  })

  it('renders nothing at all when there are no cards to show', () => {
    renderWithProviders(<HeaderNav />, { content: { categories: [], homeSections: [] } })
    expect(screen.queryByRole('button', { name: /Categories/ })).not.toBeInTheDocument()
  })

  // Was centered under the trigger (left-1/2 -translate-x-1/2) — the
  // Categories button sits close to the page's own left edge (right after
  // the logo/title), so centering a wide panel under it pushed most of it
  // off the left side of the viewport.
  //
  // Anchored to the trigger's left edge by default now, but that alone
  // wasn't enough either: on anything narrower than a full-width desktop
  // window, a panel up to 900px wide could still run past the RIGHT edge
  // from that same flush-left position. It's clamped at runtime instead —
  // measuring the real trigger position and panel width and shifting left
  // only as much as needed to stay on screen — the same "real DOM, not a
  // guessed breakpoint" approach GenericDirectory's own alignRows already
  // uses. jsdom doesn't compute real layout (every rect comes back zero),
  // so that clamping arithmetic has no meaningful coverage here — see
  // e2e/header.spec.ts, which checks it at several real viewport widths
  // against a real browser.
})

describe('HeaderNav — Map', () => {
  it('links to the map when the community has a Map pseudo-category', () => {
    renderWithProviders(<HeaderNav />, { content: { categories: [grocery, mapCategory] } })
    expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/test-community/map')
  })

  it('is absent when the community has no Map pseudo-category', () => {
    renderWithProviders(<HeaderNav />, { content: { categories: [grocery] } })
    expect(screen.queryByRole('link', { name: 'Map' })).not.toBeInTheDocument()
  })
})

describe('HeaderNav — More', () => {
  // Was right-0, sized to the panel's own fixed width rather than to where
  // its trigger sits — "More" is well clear of the viewport's right edge in
  // this nav's layout, so right-anchoring only pulled the panel's left edge
  // back near wherever the Categories panel happens to start instead,
  // making the two look like they opened from the same spot rather than
  // each hanging from its own tab.
  it('anchors the panel to the trigger\'s left edge, not its own right edge', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderNav />, { content: { categories: [grocery] } })

    await user.click(screen.getByRole('button', { name: /More/ }))

    const panel = screen.getByRole('link', { name: 'About' }).closest('.absolute')
    expect(panel).toHaveClass('left-0')
    expect(panel).not.toHaveClass('right-0')
  })

  it('offers About and Privacy as real links, and opens feedback as an in-place modal', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderNav />, {
      content: { categories: [grocery], settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: true } },
    })

    await user.click(screen.getByRole('button', { name: /More/ }))

    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')

    // Opens the same in-place FeedbackForm modal the footer's own
    // FeedbackButton does — not a page navigation, so this component (and
    // everything else on the page) stays mounted underneath it.
    //
    // This menu item is a fixed "Feedback", not settings.feedbackButtonLabel
    // — that's a full sentence meant for SiteFooter's wider button, not this
    // compact dropdown (see HeaderNav's own comment on it).
    expect(screen.queryByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Feedback' }))
    expect(screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).toBeInTheDocument()
  })

  it('hides the feedback item when an admin has turned feedback off', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderNav />, {
      content: { categories: [grocery], settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: false } },
    })

    await user.click(screen.getByRole('button', { name: /More/ }))
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument()
    // About/Privacy are unaffected by that flag.
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument()
  })
})
