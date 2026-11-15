// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import PageDocument from './PageDocument'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { ScreenHeaderProvider, useScreenHeader } from '@/lib/headerVisibility'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/about',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

function HeaderProbe() {
  const header = useScreenHeader()
  return header && <button data-testid="header-back" onClick={header.onBack}>‹ {header.title}</button>
}

const body = '<p>Why this exists.</p><h2>What we collect</h2><p>Very little.</p><h2>What we don’t</h2><p>Anything else.</p>'

function renderPage(subtitle?: string) {
  return renderWithProviders(
    <ScreenHeaderProvider>
      <PageDocument title="Privacy Policy" subtitle={subtitle} body={body} />
      <HeaderProbe />
    </ScreenHeaderProvider>,
  )
}

describe('PageDocument — About and Privacy', () => {
  it('puts the title in the phone header, with back going home', () => {
    renderPage()
    expect(screen.getByTestId('header-back')).toHaveTextContent('‹ Privacy Policy')
    screen.getByTestId('header-back').click()
    expect(mockRouter.push).toHaveBeenCalledWith('/test-community', expect.anything())
  })

  // Board W11 (the user, Nov 15): a computer's title is on the category
  // pages' photo; a phone's h1 stays, for screen readers only.
  it('puts the title on the photo on a computer, with a hidden h1 for a phone', () => {
    const { container } = renderPage()
    const hero = screen.getByTestId('category-hero')
    expect(within(hero).getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('Privacy Policy')
    const phone = within(screen.getByTestId('page-document')).getByRole('heading', { level: 1, name: 'Privacy Policy' })
    expect(phone).toHaveClass('sr-only', 'desktop:hidden')
    expect(container.querySelector('[data-testid=page-document]')).toHaveClass('desktop:max-w-[760px]')
  })

  it('gives each section its own box, split at the headings', () => {
    const { container } = renderPage()
    const sections = [...container.querySelectorAll('.rich-text > .rich-text-section')]
    expect(sections.map((s) => s.textContent)).toEqual([
      'Why this exists.',
      'What we collectVery little.',
      'What we don’tAnything else.',
    ])
  })

  it('shows the subtitle (Privacy’s “Last updated”)', () => {
    renderPage('Last updated: September 1, 2026')
    expect(screen.getByText('Last updated: September 1, 2026')).toBeInTheDocument()
  })

  it('never renders the body unsanitized', () => {
    const { container } = renderWithProviders(
      <ScreenHeaderProvider>
        <PageDocument title="About" body={'<h2 onclick="x()">Hi</h2><script>alert(1)</script><p>ok</p>'} />
      </ScreenHeaderProvider>,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onclick]')).toBeNull()
  })
})
