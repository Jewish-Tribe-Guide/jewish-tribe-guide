// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { LocationProvider } from '@/lib/locationContext'
import { mockRouter, resetMockRouter } from '@/test/nextNavigationMock'
import SlugScreen from './SlugScreen'

// SlugScreen calls useLocation() directly (for `anchor`), which throws
// outside a LocationProvider — same reasoning as Landing.test.tsx's own
// wrapper.
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/grocery',
  useSearchParams: () => new URLSearchParams(),
}))

// The content FindResourcesConnected/FindResources would render (listings,
// filters, ResourceLoader, ...) isn't this test's concern — only whether
// SlugScreen's own <main> remounts per slug is. Stubbed to keep this test
// from also having to satisfy their own dependencies.
vi.mock('@/components/FindResourcesConnected', () => ({
  default: () => <div>FindResourcesConnected stub</div>,
}))
vi.mock('@/components/FindResources', () => ({
  default: () => <div>FindResources stub</div>,
}))

afterEach(() => {
  cleanup()
  resetMockRouter()
})

function renderSlug(slug: string) {
  return renderWithProviders(
    <LocationProvider>
      <SlugScreen slug={slug} kind="category" listings={[]} />
    </LocationProvider>,
  )
}

describe('SlugScreen', () => {
  // This <main> carries a mount-triggered fadeIn animation (see its own
  // comment) so switching categories reads as new content appearing, not a
  // static page overwriting itself. A CSS animation only fires on mount, and
  // SlugScreen is the SAME component instance across every category/form —
  // switching slugs is normally just a prop change, not a remount — so this
  // only works because <main> carries `key={slug}`. If that key is ever
  // dropped (e.g. "simplified" away), this regresses silently: the fade
  // would only ever play once, on this screen's very first visit.
  it('remounts <main> when the slug changes, so the fade-in can replay', () => {
    const { rerenderWithProviders } = renderSlug('grocery')
    const firstMain = document.querySelector('main')
    expect(firstMain).not.toBeNull()

    // Same slug, e.g. a listings refresh — must NOT remount (would otherwise
    // drop in-progress state elsewhere in the tree on every render).
    rerenderWithProviders(
      <LocationProvider>
        <SlugScreen slug="grocery" kind="category" listings={[]} />
      </LocationProvider>,
    )
    expect(document.querySelector('main')).toBe(firstMain)

    // A different category — must remount.
    rerenderWithProviders(
      <LocationProvider>
        <SlugScreen slug="restaurant" kind="category" listings={[]} />
      </LocationProvider>,
    )
    expect(document.querySelector('main')).not.toBe(firstMain)
  })
})
