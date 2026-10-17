// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import SuggestListingCard from './SuggestListingCard'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

// New card (Phase 6d, docs/desktop-mockup-plan.md) — fixed, non-admin-
// editable copy, and a single action that opens the same ContributePicker
// UpdateListingsCard's own Add button used to (see that component's doc for
// why the action moved here).
describe('SuggestListingCard', () => {
  it('renders its fixed copy', () => {
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })

    expect(screen.getByText('Get involved')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Suggest a Listing' })).toBeInTheDocument()
    expect(screen.getByText('Help keep our community guide accurate and useful.')).toBeInTheDocument()
  })

  it('opens ContributePicker on "Submit a Listing"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Submit a Listing' }))

    expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeInTheDocument()
  })

  // Regression: this photo went out with no unoptimized gate at all, unlike
  // every other hardcoded photo on the home screen (CampaignBannerCard,
  // DaveningTimesCard, HeroHeading) — invisible locally and in a normal
  // deploy, since next/image's own optimizer just did its job. It broke the
  // moment the site's real Image Optimization quota was exhausted: Vercel
  // returned a 402 for this one request (confirmed live) and the card
  // rendered with no photo, with no way to route around it — the
  // NEXT_PUBLIC_IMAGES_UNOPTIMIZED kill switch (see imageHosts.ts) existed
  // for exactly this but this image never checked it.
  it('routes the photo unoptimized once NEXT_PUBLIC_IMAGES_UNOPTIMIZED is set', () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGES_UNOPTIMIZED', '1')
    renderWithProviders(<SuggestListingCard />, { content: { categories: [makeCategory()] } })

    // Unoptimized: the raw Unsplash URL, untouched. Optimized (the default)
    // would instead be routed through /_next/image?url=... — exactly the
    // request Vercel's optimizer 402s once the quota runs out.
    const img = document.querySelector('img')
    expect(img?.getAttribute('src')).toBe(
      'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8c3RvcmV8ZW58MHx8MHx8fDA%3D',
    )
  })
})
