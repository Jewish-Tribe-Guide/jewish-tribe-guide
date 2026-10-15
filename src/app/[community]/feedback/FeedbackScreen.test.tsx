// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import FeedbackScreen from './FeedbackScreen'
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
  return header && <button data-testid="header-back" onClick={header.onBack}>‹ {header.title}</button>
}

const noFeedbackTab = SITE_SETTINGS_DEFAULTS.mobileTabs!.filter((t) => t.target !== 'feedback')

function renderScreen(isMobile: boolean, mobileTabs = noFeedbackTab) {
  return renderWithProviders(
    <ScreenHeaderProvider>
      <ForcedViewport isMobile={isMobile}>
        <FeedbackScreen />
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

  it('stays a top-level screen when an admin has made Feedback a tab', () => {
    renderScreen(true, SITE_SETTINGS_DEFAULTS.mobileTabs!)
    expect(screen.queryByTestId('header-back')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: SITE_SETTINGS_DEFAULTS.feedbackHeading })).not.toHaveClass('sr-only')
  })

  it('leaves the desktop header alone (it is a dialog there)', () => {
    renderScreen(false)
    expect(screen.queryByTestId('header-back')).not.toBeInTheDocument()
  })
})
