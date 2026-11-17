// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import SiteFooter from './SiteFooter'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

// "Send a note" opened a dialog over the page until Nov 16, when Feedback
// became one page on every screen (the user: "let's do full page").
describe('SiteFooter — Send a note', () => {
  it('is a link to the Feedback page', () => {
    renderWithProviders(<SiteFooter year={2026} />, {
      content: { settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: true } },
    })
    const link = screen.getByRole('link', { name: /Send a note/ })
    expect(link).toHaveAttribute('href', '/test-community/feedback')
  })

  it('is gone when Feedback is turned off', () => {
    renderWithProviders(<SiteFooter year={2026} />, {
      content: { settings: { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: false } },
    })
    expect(screen.queryByRole('link', { name: /Send a note/ })).not.toBeInTheDocument()
  })
})

// "Spot something wrong or missing?" told every visitor the guide was likely
// wrong (a tester, Nov 17), and named Edit and Report links that are gone.
describe('SiteFooter — the contributing line', () => {
  it('invites what people know, and names the buttons a listing has', () => {
    renderWithProviders(<SiteFooter year={2026} />)
    expect(screen.getByText('Know something we don’t?')).toBeInTheDocument()
    expect(screen.queryByText(/wrong or missing/i)).not.toBeInTheDocument()
    const line = screen.getByText(/A person checks each one\./)
    expect(line).toHaveTextContent('Tap Suggest an edit on any listing, or + Add for a new place.')
    expect(line).not.toHaveTextContent(/Report/)
  })
})
