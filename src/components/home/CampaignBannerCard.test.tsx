// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CampaignBanner } from '@/lib/campaignBanner'
import CampaignBannerCard from './CampaignBannerCard'

// useCommunitySlug (via useActiveCommunity) pulls in next/navigation's
// useRouter() — same reason Landing.test.tsx/SiteHeader.test.tsx mock this.
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

// Wide enough that "today" (whenever this runs) always falls inside it,
// without needing to fake the clock just to get a banner to render.
function makeBanner(overrides: Partial<CampaignBanner> = {}): CampaignBanner {
  return {
    id: 'sukkah-2026',
    categoryId: 'sukkah',
    title: 'Find a Sukkah Near You',
    subtitle: 'Find open Sukkahs to visit this year',
    startDate: '2000-01-01',
    endDate: '2099-12-31',
    destination: 'map',
    ...overrides,
  }
}

function renderBanner(banner: CampaignBanner = makeBanner()) {
  return renderWithProviders(<CampaignBannerCard />, {
    content: {
      categories: [makeCategory({ id: 'sukkah', pluralLabel: 'Sukkahs' })],
      campaignBanners: [banner],
    },
  })
}

// Phase 4 of the desktop mockup rework (docs/desktop-mockup-plan.md) gave
// the banner a completely separate desktop layout instead of the mobile
// card's vertical one with a few overrides. The one structural difference
// worth locking down: mobile keeps its colored left rail, desktop doesn't
// (it reads as an accent on a narrow vertical card; on the wide horizontal
// desktop block there's no comparable edge for it to sit against).
describe('CampaignBannerCard — mobile vs. desktop layout', () => {
  it('the mobile block has a left colour rail; the desktop block does not', () => {
    const { container } = renderBanner()

    const mobileBlock = container.querySelector('.desktop\\:hidden')
    const desktopBlock = container.querySelector('.desktop\\:flex')
    expect(mobileBlock).not.toBeNull()
    expect(desktopBlock).not.toBeNull()

    // The rail is the aria-hidden div with the gradient-to-b fill.
    expect(mobileBlock!.querySelector('[aria-hidden="true"].bg-gradient-to-b')).not.toBeNull()
    expect(desktopBlock!.querySelector('[aria-hidden="true"].bg-gradient-to-b')).toBeNull()
  })

  it('renders both blocks\' content from the same banner — title/subtitle appear in each', () => {
    const { container } = renderBanner()

    const mobileBlock = container.querySelector('.desktop\\:hidden')!
    const desktopBlock = container.querySelector('.desktop\\:flex')!
    for (const block of [mobileBlock, desktopBlock]) {
      expect(block.textContent).toContain('Find a Sukkah Near You')
      expect(block.textContent).toContain('Find open Sukkahs to visit this year')
    }
  })

  it('renders nothing at all once the linked category is gone', () => {
    const { container } = renderWithProviders(<CampaignBannerCard />, {
      content: { categories: [], campaignBanners: [makeBanner()] },
    })
    expect(container).toBeEmptyDOMElement()
  })
})
