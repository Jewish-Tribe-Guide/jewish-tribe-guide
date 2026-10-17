// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import UpdateListingsCard from './UpdateListingsCard'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

const eyebrow = 'Community run'
const heading = 'Kept by the Community'

afterEach(() => cleanup())

// Desktop mockup match (Phase 6, docs/desktop-mockup-plan.md): this card
// went back to being a short statement, not a set of action buttons — the
// Add/Edit/Report actions (and the feedback link that sat beside them) moved
// to the new, dedicated SuggestListingCard beside this one in the same 3-up
// row (see Landing.tsx's own community-row doc, and that component's own
// tests for the picker/feedback coverage this file used to carry).
describe('UpdateListingsCard', () => {
  it('renders the admin-editable eyebrow/heading', () => {
    renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />)

    expect(screen.getByText(eyebrow)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('"Learn More" links to the visiting community\'s own /about', () => {
    renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />)

    const link = screen.getByRole('link', { name: /Learn More/ })
    expect(link).toHaveAttribute('href', '/test-community/about')
  })

  it('has no Add/Edit/Report buttons any more', () => {
    renderWithProviders(<UpdateListingsCard eyebrow={eyebrow} heading={heading} />)

    expect(screen.queryByRole('button', { name: /^Add$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Report$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Send a note/ })).not.toBeInTheDocument()
  })
})
