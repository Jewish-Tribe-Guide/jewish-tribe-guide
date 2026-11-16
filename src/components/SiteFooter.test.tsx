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
