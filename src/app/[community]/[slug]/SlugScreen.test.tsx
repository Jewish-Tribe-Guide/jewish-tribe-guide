// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
// from also having to satisfy their own dependencies. The stub does call the
// real onUp prop it's handed, though — that's how the "back arrow" test below
// exercises SlugScreen's own wiring of it without needing GenericDirectory's
// real header-back-button machinery (useSetScreenHeader/SiteHeader) in
// scope, matching FindResourcesConnected.test.tsx's own reasoning for
// keeping this narrowly about what SlugScreen itself does with its props.
vi.mock('@/components/FindResourcesConnected', () => ({
  default: ({ onUp }: { onUp: () => void }) => (
    <div>
      FindResourcesConnected stub
      <button onClick={onUp}>Up</button>
    </div>
  ),
}))
vi.mock('@/components/FindResources', () => ({
  default: () => <div>FindResources stub</div>,
}))

// useIsMobile() reads this to decide whether the back arrow's nav-back tag
// is worth sending — see navTransitions.ts's own doc. Defaults to "mobile"
// here since that's the case most of this file's tests care about; the one
// test that needs the opposite overrides it for just that test.
function mockViewport(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  resetMockRouter()
})

beforeEach(() => {
  mockViewport(true)
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

  // The category directory's own back arrow (GenericDirectory's onUp,
  // ultimately this) requests the mobile directional slide specifically —
  // see goHome's own comment on why that's NOT the default for every way of
  // reaching home. This would silently regress to a plain goHome() (no
  // slide ever, on any device) if someone simplified this call site without
  // noticing why the option is there.
  it('tags its back arrow with nav-back when going home', async () => {
    const user = userEvent.setup()
    renderSlug('grocery')

    await user.click(screen.getByRole('button', { name: 'Up' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/test-community', { transitionTypes: ['nav-back'] })
  })

  // The regression this guards: nav-back used to be decided by
  // useNavTransitionProps() reading useIsMobile() at the DESTINATION
  // (Landing)'s own mount, which starts false and only corrects after an
  // effect — wrong at the exact moment a fresh mount needs it. Moved to be
  // checked here instead (SlugScreen is already mounted and stable by the
  // time "Up" is clicked), so this asserts the desktop half directly: no
  // tag at all, not just one that happens not to animate.
  it('does not tag its back arrow on desktop', async () => {
    mockViewport(false)
    const user = userEvent.setup()
    renderSlug('grocery')

    await user.click(screen.getByRole('button', { name: 'Up' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/test-community', { transitionTypes: undefined })
  })
})
