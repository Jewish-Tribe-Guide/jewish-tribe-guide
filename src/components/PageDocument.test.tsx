// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
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

  it('keeps the h1, hidden on a phone (the header says it) and shown on desktop', () => {
    renderPage()
    const h1 = screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })
    expect(h1).toHaveClass('sr-only', 'desktop:not-sr-only')
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
