// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { PinnedProvider } from '@/lib/pinnedContext'
import { CATEGORY_CAPABILITY_DEFAULTS } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import MapPlaceDetail from './MapPlaceDetail'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/map',
  useSearchParams: () => new URLSearchParams(),
}))

// ListingForm/ReportListing are the same forms the category directory's own
// Edit/Report use (see GenericListingCard) — already covered by their own
// test files. Stubbed here to just prove MapPlaceDetail swaps to the right
// one with the right listing, not to re-exercise their internals (which
// pull in the real Google Maps address widget, Turnstile, etc.).
vi.mock('@/components/resources/ListingForm', () => ({
  default: ({
    mode,
    existing,
    onUp,
    embedded,
    onRemovalOpenChange,
  }: {
    mode: string
    existing?: DirectoryResource
    onUp: () => void
    embedded?: boolean
    onRemovalOpenChange?: (open: boolean) => void
  }) => (
    <div>
      <p>ListingForm stub — mode={mode}, existing={existing?.name}{embedded ? ' (embedded)' : ''}</p>
      <button onClick={onUp}>stub cancel</button>
      {/* Stands in for ListingForm's own Request removal trigger — see the
          dedicated test below and ListingForm's own file for the real one. */}
      <button onClick={() => onRemovalOpenChange?.(true)}>stub open removal</button>
    </div>
  ),
}))
afterEach(() => {
  cleanup()
  // The push/pop history tests leave real entries behind (jsdom's History
  // is a live, module-level object, not reset between tests) — back to a
  // clean slate so one test's pushState can't leak into the next one's
  // "was anything pushed" assertions.
  window.history.replaceState(null, '')
})

describe('MapPlaceDetail', () => {
  it('links the name to the listing\'s own canonical category-page URL', () => {
    const category = makeCategory({ id: 'grocery', label: 'Grocery Store' })
    const item = makeListing({ id: 'abc123def456', name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
      { community: { slug: 'test-community' } },
    )

    const link = screen.getByRole('link', { name: 'Goldi Market' })
    expect(link).toHaveAttribute('href', '/test-community/grocery/goldi-market-abc123')
  })

  // Regression: the header avatar used to overlay a small category-glyph
  // badge on its own corner whenever a real photo was showing (see git
  // history) — removed at the user's request, so a photo avatar here now
  // renders as a plain circle with nothing else drawn on top of it.
  it('shows the photo avatar with no category-glyph corner badge on top of it', () => {
    const category = makeCategory({ id: 'grocery', label: 'Grocery Store' })
    const item = makeListing({ name: 'Goldi Market', photo: 'https://example.com/goldi.jpg' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    // Not getByRole('img') — CategoryIcon's photo has alt="" (decorative),
    // which drops it from the accessibility tree's img role entirely.
    expect(document.querySelector('img')).toBeInTheDocument()
    expect(document.querySelector('[class*="-right-1.5"][class*="-top-1.5"]')).not.toBeInTheDocument()
  })




  it('pushes a history entry when Edit opens, so a swipe-back returns here instead of leaving the map', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const pushSpy = vi.spyOn(window.history, 'pushState')

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Suggest an edit' }))

    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ mapSheetForm: 'edit' }), '')
  })

  it('returns to the place detail (not the list, not off the map) when a swipe-back fires while the edit form is open', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Suggest an edit' }))
    expect(screen.getByText(/ListingForm stub/)).toBeInTheDocument()

    // Simulates what a real swipe-back/browser-back delivers: a popstate
    // whose state no longer carries mapSheetForm, because history.back()
    // popped past the entry openEdit pushed.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })

    expect(screen.queryByText(/ListingForm stub/)).not.toBeInTheDocument()
    expect(screen.getByText('Is this info current?')).toBeInTheDocument()
  })

  it('closes the edit form via history.back(), not a direct state reset, so cancelling and swiping back behave identically', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Suggest an edit' }))
    await user.click(screen.getByRole('button', { name: 'stub cancel' }))

    expect(backSpy).toHaveBeenCalled()
    // Mocked no-op above, so no popstate actually fired — the form staying
    // put confirms the component didn't ALSO reset its own state directly,
    // only delegated to the browser.
    expect(screen.getByText(/ListingForm stub/)).toBeInTheDocument()
  })

  // ── The edit bar ───────────────────────────────────────────────────────

  // Where Edit, Pin, Share and Set as location live now: one "Suggest an
  // edit" bar at the end of the panel, with the other three in its overflow.
  // They used to sit behind a kebab next to the name, which people open
  // expecting Share and never expecting to author anything — plus a quiet
  // grey "Suggest a correction" link in the footer, now gone.
  it('offers Suggest an edit and the overflow, with no kebab and no quiet correction link', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    expect(screen.getByRole('button', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suggest a correction' })).not.toBeInTheDocument()
    // The freshness STATUS stays: it's a contribution of its own.
    expect(screen.getByText('Is this info current?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeInTheDocument()
    // Removal is requested at the foot of the edit form, not from here.
    expect(screen.queryByRole('menuitem', { name: /report|remov/i })).not.toBeInTheDocument()
  })

  // Part of the listing, the way it closes the directory's dropdown: the
  // last thing in the content, after the freshness line, so it scrolls with
  // the place rather than sitting docked over it (which phase 3 did).
  it('ends the content with the bar, after the freshness line', () => {
    const { container } = renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )
    const content = container.firstElementChild as HTMLElement
    const last = content.lastElementChild as HTMLElement
    expect(last).toContainElement(screen.getByRole('button', { name: 'Suggest an edit' }))
    expect(last).toContainElement(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    const freshness = screen.getByText('Is this info current?')
    expect(freshness.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // The bar is the last thing in the listing, so whoever taps it is usually
  // scrolled to the bottom, and the parent's scroll region stays mounted
  // when the form replaces the listing. Without a reset, the form opens at
  // that depth with its Back and title out of view; closing it has the same
  // problem the other way.
  it('scrolls the parent region back to the top when the form opens and closes', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const writes: number[] = []
    renderWithProviders(
      <PinnedProvider>
        <div
          data-testid="region"
          style={{ overflowY: 'auto' }}
          ref={(el) => {
            // jsdom has no layout, so its own scrollTop setter does nothing.
            if (el) Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => writes.at(-1) ?? 0, set: (v: number) => writes.push(v) })
          }}
        >
          <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={() => {}} />
        </div>
      </PinnedProvider>,
    )
    writes.length = 0
    screen.getByTestId('region').scrollTop = 480

    await user.click(screen.getByRole('button', { name: 'Suggest an edit' }))
    expect(writes.at(-1)).toBe(0)

    screen.getByTestId('region').scrollTop = 480
    // What a swipe-back or the form's own Back delivers (see above).
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })
    expect(screen.queryByRole('heading', { name: 'Suggest an edit' })).not.toBeInTheDocument()
    expect(writes.at(-1)).toBe(0)
  })

  // Pin, Share and Set as location have no other home on the map now, and
  // none of them is a contribution — so a category with editing off keeps
  // them, and loses only the pill.
  it('keeps the overflow, without the pill, when the category cannot be edited', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail
          item={makeListing({ name: 'Goldi Market' })}
          category={makeCategory({ capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, edit: false, report: false } })}
          color="#000"
          onBack={() => {}}
        />
      </PinnedProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Suggest an edit' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeInTheDocument()
  })

  // The overflow's captions are white with a text shadow, written for a dark
  // ground. The map has no scrim, so its overflow must use `stack`, which
  // brings its own — the desktop default would put them on a live map.
  // Asserted here, not just in ListingActionsFan's tests, because what can
  // break is the THREADING: MapPlaceDetail -> ListingEditBar -> the fan.
  it('opens its overflow in the stack placement, even on desktop', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Actions for Goldi Market' }))
    const menu = screen.getByRole('menu')
    expect(menu.style.right).not.toBe('')
    expect(menu.style.bottom).not.toBe('')
    expect(menu.style.top).toBe('')
  })
})
