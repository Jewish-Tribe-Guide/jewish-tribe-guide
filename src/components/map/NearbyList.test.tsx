// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { PinnedProvider } from '@/lib/pinnedContext'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { MapPoint } from './ResourceMap'
import NearbyList from './NearbyList'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// hoverCapable's `(hover: hover) and (pointer: fine)` query — the global
// vitest.setup.ts stub always reports `matches: false` (its own default is
// tuned for useIsMobile's SSR-safe fallback), which would put these rows on
// the touch drag path instead of the desktop wheel path this file tests.
window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function makePoint(overrides: Partial<MapPoint & { filterId: string }> = {}) {
  return {
    id: 'listing-1',
    filterId: 'grocery',
    lat: 0,
    lng: 0,
    name: 'Test Grocery',
    color: '#000',
    ...overrides,
  }
}

function renderRow(point = makePoint()) {
  renderWithProviders(
    <PinnedProvider>
      <NearbyList points={[point]} userLocation={null} onViewListing={vi.fn()} />
    </PinnedProvider>,
  )
  const pinButton = screen.getByRole('button', { name: /Pin Test Grocery/ })
  // The row's outer wrapper — the ancestor common to both the content row
  // and the revealed Pin/Share strip, and (per the fix under test) where the
  // wheel listener actually lives now.
  const wrapper = pinButton.closest('div.relative.overflow-hidden') as HTMLElement
  const content = wrapper.lastElementChild as HTMLElement
  return { pinButton, wrapper, content }
}

// A trackpad swipe has no discrete "end" the way a touch release does — the
// row treats a 150ms gap since the last wheel tick as the gesture finishing
// (see NearbyList's own wheelSettleTimer comment).
async function settle() {
  await new Promise((r) => setTimeout(r, 200))
}

describe('NearbyList row swipe (desktop trackpad)', () => {
  it('opens on a leftward swipe, revealing the Pin/Share strip', async () => {
    const { content } = renderRow()
    expect(content.style.transform).toBe('translateX(0px)')

    fireEvent.wheel(content, { deltaX: 100, deltaY: 0 })
    await settle()

    expect(content.style.transform).toBe('translateX(-168px)')
  })

  // The bug this guards: the wheel listener used to live on the content row
  // only, which had already slid REVEAL_WIDTH out from under the cursor once
  // open — a closing swipe starting with the pointer over the now-revealed
  // Pin button landed on that button (no wheel listener of its own) and did
  // nothing at all. Moving the listener to the row's outer wrapper (which
  // spans the revealed strip too, regardless of the content's own transform)
  // is what makes this pass.
  it('closes on a rightward swipe even when it starts over the revealed Pin button', async () => {
    const { pinButton, content } = renderRow()

    fireEvent.wheel(content, { deltaX: 100, deltaY: 0 })
    await settle()
    expect(content.style.transform).toBe('translateX(-168px)')

    fireEvent.wheel(pinButton, { deltaX: -100, deltaY: 0 })
    await settle()

    expect(content.style.transform).toBe('translateX(0px)')
  })

  // A row's own `pinned` badge is driven by the `points` prop its parent
  // passes in (ResourceMapView recomputes that from PinnedContext) — not
  // something NearbyList re-derives for itself mid-render — so this checks
  // the actual persisted effect of the click (localStorage, via
  // PinnedProvider) rather than an aria-label this component doesn't own.
  it('still lets a plain click on the Pin button toggle pinning', () => {
    const { pinButton } = renderRow()

    fireEvent.click(pinButton)

    expect(localStorage.getItem('jpc:pinned-listings')).toContain('listing-1')
  })
})
