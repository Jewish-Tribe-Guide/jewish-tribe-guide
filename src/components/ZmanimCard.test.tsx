// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ForcedViewport } from '@/lib/useIsMobile'
import ZmanimCard from './ZmanimCard'

vi.mock('next/navigation', async () => {
  const { mockRouter } = await import('@/test/nextNavigationMock')
  return { useRouter: () => mockRouter, usePathname: () => '/test-community', useSearchParams: () => new URLSearchParams() }
})
vi.mock('@/lib/useZmanim', () => ({ useZmanim: () => ({ data: null, status: 'loading' }) }))
vi.mock('@/components/ZmanimBody', () => ({ default: () => <p>times</p> }))

// The user, Nov 15: the Zmanim page "still has the old layout on desktop",
// the short band with the title under it and a round badge. It has the
// category pages' photo with the title on it now (board H4).
describe('ZmanimCard', () => {
  afterEach(cleanup)
  const show = (isMobile: boolean) =>
    renderWithProviders(
      <ForcedViewport isMobile={isMobile}>
        <ZmanimCard locationLabel="Central Philadelphia" onUp={vi.fn()} title="Candle lighting" icon="candle" color="#7c3aed" bandImageUrl="https://example.com/candles.jpg" />
      </ForcedViewport>,
    )

  it('on a computer: the photo, the title on it and where the times are for; one h1, no badge', () => {
    show(false)
    const hero = screen.getByTestId('category-hero')
    expect(hero.querySelector('img')).not.toBeNull()
    expect(within(hero).getByRole('heading', { level: 1, name: 'Candle lighting' })).not.toHaveClass('sr-only')
    expect(within(hero).getByText('Central Philadelphia')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(document.querySelector('[class*="h-16"][class*="w-16"]')).toBeNull()
    // No search rides up onto it, so no empty strip where one would be.
    expect((hero.firstElementChild as HTMLElement).style.height).toBe('209px')
  })

  it('on a phone: no photo; the title is the site header’s', () => {
    show(true)
    expect(screen.queryByTestId('category-hero')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('times')).toBeInTheDocument()
  })
})
