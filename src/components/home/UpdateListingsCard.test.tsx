// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import UpdateListingsCard from './UpdateListingsCard'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

const eyebrow = 'Community run'
const heading = 'Kept by the Community'

// The "kept by the community" card — Add/Edit/Report. Used to render inside
// HomeBreak, paired with DaveningTimesCard; now a fully standalone card
// (see homeSections.ts's own doc on why the pair split).

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UpdateListingsCard', () => {
  it('renders the admin-editable eyebrow/heading', () => {
    renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />)

    expect(screen.getByText(eyebrow)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  // Was a plain <a href="/feedback">, a real page navigation that left this
  // whole card (and everything else on the page) behind — clicking it
  // should open the same in-place modal SiteFooter's own FeedbackButton
  // does, not send the visitor to a bare page.
  it('opens the feedback form as an in-place modal, not a page navigation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />)

    expect(screen.queryByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Send a note/ }))

    // The card is still in the document underneath the modal — a real
    // navigation would have unmounted it.
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).toBeInTheDocument()
  })

  it('hides the feedback link entirely when an admin has turned feedback off', () => {
    renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />, {
      content: { settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: false } },
    })

    expect(screen.queryByRole('button', { name: /Send a note/ })).not.toBeInTheDocument()
  })

  // Add/Edit/Report replaced the old single "Suggest something" button —
  // a real, named action beats a paragraph pointing at capabilities that
  // live elsewhere, and stays true even unclicked (it's what teaches a
  // visitor who's never opened a category page that the site works this
  // way at all). Add opens ContributePicker (a category search); Edit and
  // Report open EditReportPicker instead (a listing search) — see each
  // component's own tests for what happens after something is picked.
  //
  // The accessible name stays the short word ("Add"/"Edit"/"Report")
  // regardless of the visible label — see ContributeButton's own doc — so
  // this test doesn't need to know or care which one CSS happens to show at
  // jsdom's default (unstyled) width.
  describe('Add / Edit / Report', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })

    it.each([
      ['Add', 'Add a listing'],
      ['Edit', 'Edit a listing'],
      ['Report', 'Report a listing'],
    ])('opens the right picker from the %s button', async (buttonName, pickerTitle) => {
      const user = userEvent.setup()
      renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />, {
        content: { categories: [grocery] },
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: new RegExp(`^${buttonName}$`) }))

      expect(screen.getByRole('dialog', { name: pickerTitle })).toBeInTheDocument()
    })

    // Was a viewport breakpoint (`min-[900px]`) — checked the wrong box,
    // since this card's own width used to be fixed by the 2-up grid it sat
    // in and could be far narrower than the viewport at plenty of real
    // window sizes. A container query measures the card itself instead.
    // jsdom doesn't compute real layout/container queries, so this asserts
    // on the mechanism (both labels present, gated by a `@container`
    // ancestor and `@min-[…]` classes) rather than a resolved visibility —
    // see e2e/home.spec.ts for the real swap against a real browser.
    it('carries both the short and long label, gated by a container query rather than a viewport one', () => {
      renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />, {
        content: { categories: [grocery] },
      })

      const addButton = screen.getByRole('button', { name: 'Add' })
      expect(addButton).toHaveTextContent('Add a place')
      const longSpan = within(addButton).getByText('Add a place')
      const shortSpan = within(addButton).getByText('Add', { selector: 'span' })
      expect(longSpan).toHaveClass('hidden')
      expect(longSpan.className).toMatch(/@min-\[\d+px\]:inline/)
      expect(shortSpan.className).toMatch(/@min-\[\d+px\]:hidden/)
      expect(addButton.closest('.\\@container')).not.toBeNull()
    })
  })
})
