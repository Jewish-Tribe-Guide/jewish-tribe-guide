// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import FeedbackScreen from './FeedbackScreen'
import AboutDocument from '@/components/pages/AboutDocument'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { ForcedViewport } from '@/lib/useIsMobile'
import { ScreenHeaderProvider, useScreenHeader } from '@/lib/headerVisibility'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/feedback',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

// Stands in for SiteHeader: shows whatever the screen asked the header to say.
function HeaderProbe() {
  const header = useScreenHeader()
  if (!header) return null
  // A tab's page: its name, with no Back.
  if (!header.onBack) return <p data-testid="header-tab">{header.title}</p>
  return <button data-testid="header-back" onClick={header.onBack}>‹ {header.title}</button>
}

const noFeedbackTab = SITE_SETTINGS_DEFAULTS.mobileTabs!.filter((t) => t.target !== 'feedback')

function renderScreen(isMobile: boolean, mobileTabs = noFeedbackTab, email: string | null = null) {
  return renderWithProviders(
    <ScreenHeaderProvider>
      <ForcedViewport isMobile={isMobile}>
        <FeedbackScreen email={email} />
      </ForcedViewport>
      <HeaderProbe />
    </ScreenHeaderProvider>,
    { content: { settings: { ...SITE_SETTINGS_DEFAULTS, mobileTabs } } },
  )
}

describe('FeedbackScreen — on a phone it is a drill-down, like About and Privacy', () => {
  it('names itself in the header, and the header goes home', () => {
    renderScreen(true)
    expect(screen.getByTestId('header-back')).toHaveTextContent('‹ Feedback')
    screen.getByTestId('header-back').click()
    expect(mockRouter.push).toHaveBeenCalledWith('/test-community', expect.anything())
  })

  it('keeps its heading for screen readers only, so the title is not shown twice', () => {
    renderScreen(true)
    expect(screen.getByRole('heading', { level: 1, name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).toHaveClass('sr-only')
  })

  // Nov 16 (the user): a tab's page names itself in the header, in the tab
  // bar's word for it, with no Back; its own heading is for a screen reader.
  it('as a tab, names itself in the header with no Back, in the tab’s own word', () => {
    renderScreen(true, SITE_SETTINGS_DEFAULTS.mobileTabs!.map((t) => (t.target === 'feedback' ? { ...t, label: 'Notes' } : t)))
    expect(screen.queryByTestId('header-back')).not.toBeInTheDocument()
    expect(screen.getByTestId('header-tab')).toHaveTextContent(/^Notes$/)
    expect(screen.getByRole('heading', { level: 1, name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).toHaveClass('sr-only')
  })

  it('leaves the desktop header alone (nothing to go back to there)', () => {
    renderScreen(false)
    expect(screen.queryByTestId('header-back')).not.toBeInTheDocument()
  })
})

// The classes that decide how wide a column comes out: its max width and
// its side gutters, at every breakpoint.
const widthClasses = (el: Element) =>
  [...el.classList].filter((c) => /^(?:[a-z]+:)?(?:max-w-|px-|mx-)/.test(c)).sort()

describe('FeedbackScreen — the same box as About and Privacy', () => {
  it('sits in the same column as the pages, and its card fills it', () => {
    const { container } = renderScreen(true)
    const feedbackMain = container.querySelector('main')!
    cleanup()
    const page = renderWithProviders(<ScreenHeaderProvider><AboutDocument title="About" body="<p>x</p>" /></ScreenHeaderProvider>)
    const pageMain = page.container.querySelector('main')!

    expect(widthClasses(feedbackMain)).toEqual(widthClasses(pageMain))
    // Nothing inside narrows it again (the card used to stop at max-w-md).
    expect(feedbackMain.querySelector('[class*="max-w-"]')).toBeNull()
  })

  it('has no line telling people to use the listing buttons instead', () => {
    renderScreen(true)
    expect(screen.queryByText(/handled fastest/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your note')).toBeInTheDocument()
  })
})

// Oct 15: on a desktop, /feedback is reached by a typed or shared link (the
// footer and the More menu open a dialog over the page being read). It used to
// answer with that dialog over an empty <main>; now it's a page, like About
// and Privacy — since Nov 15 (board Feedback) with their photo header too.
describe('FeedbackScreen — on a desktop it is a page', () => {
  it('is the form, not a dialog, with its title on the photo', () => {
    renderScreen(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('category-hero')).getAllByRole('heading', { level: 1 })[0]).toHaveTextContent(SITE_SETTINGS_DEFAULTS.feedbackHeading)
    expect(within(screen.getByRole('main')).getByLabelText('Your note')).toBeInTheDocument()
  })

  it('in the same column as About and Privacy', () => {
    const { container } = renderScreen(false)
    const feedbackMain = container.querySelector('main')!
    cleanup()
    const page = renderWithProviders(<ScreenHeaderProvider><AboutDocument title="About" body="<p>x</p>" /></ScreenHeaderProvider>)
    expect(widthClasses(feedbackMain)).toEqual(widthClasses(page.container.querySelector('main')!))
  })
})

// Board Feedback (Nov 15): "Know something we don't?" first, so a fix to a
// place goes into the + Add box where an admin can approve it.
describe('FeedbackScreen — Tell us first, then the note', () => {
  it('puts the Tell us card before the form', () => {
    renderScreen(true)
    const card = screen.getByRole('button', { name: /Know something we don’t\?/ })
    const form = screen.getByLabelText('Your note')
    expect(card.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('on a computer, puts the card to the right of the form, under “About a place”', () => {
    renderScreen(false)
    const side = screen.getByRole('button', { name: /Know something we don’t\?/ }).parentElement!
    expect(side).toHaveClass('desktop:col-start-2')
    expect(within(side).getByText('About a place')).toHaveClass('hidden', 'desktop:block')
  })

  it('gives the address About gives, on a computer, and nothing when there is none', () => {
    renderScreen(false, noFeedbackTab, 'hi@guide.org')
    expect(screen.getByRole('link', { name: /hi@guide\.org/ })).toHaveAttribute('href', 'mailto:hi@guide.org?subject=Feedback')
    expect(screen.getByRole('link', { name: /hi@guide\.org/ })).toHaveClass('hidden', 'desktop:flex')
    cleanup()
    renderScreen(false)
    expect(screen.queryByText('Rather email?')).not.toBeInTheDocument()
  })
})
