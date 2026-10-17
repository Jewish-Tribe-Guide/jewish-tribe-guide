// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { PinnedProvider } from '@/lib/pinnedContext'
import { CATEGORY_CAPABILITY_DEFAULTS } from '@/lib/categories'
import MapPlaceDetail from './MapPlaceDetail'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/map',
  useSearchParams: () => new URLSearchParams(),
}))

// ListingEditor is covered by its own test file; rendering it for real pulls
// in the Google Maps address widget and Turnstile, which this file has no
// need to exercise. The stub proves the host swaps to it, in place, with the
// right listing — and, where the host passes one, that Send goes into the
// host's floating slot.
vi.mock('@/components/resources/ListingEditor', async () => {
  const { createPortal } = await import('react-dom')
  return {
    default: ({
      item,
      onClose,
      onRemovalOpenChange,
      removalOpen,
      onStep,
      onHasChanges,
      sendSlot,
      titleSlot,
    }: {
      item: { name: string }
      onClose: () => void
      onRemovalOpenChange?: (open: boolean) => void
      removalOpen?: boolean
      onStep?: (step: { title: string; back: () => void } | null) => void
      onHasChanges?: (has: boolean) => void
      sendSlot?: HTMLElement | null
      titleSlot?: HTMLElement | null
    }) => (
      <div>
        <p>ListingEditor stub — item={item.name}</p>
        {removalOpen && <p>stub editor: removal</p>}
        {/* Stands in for opening one of the editor's rows. */}
        <button onClick={() => onStep?.({ title: 'Kosher', back: () => onStep(null) })}>stub open row</button>
        <button onClick={onClose}>stub cancel</button>
        {/* Stands in for typing something into it. */}
        <button onClick={() => onHasChanges?.(true)}>stub type</button>
        {/* Stands in for the editor's Request removal link, for tests that
            prove the HOST's title reacts to it. */}
        <button onClick={() => onRemovalOpenChange?.(true)}>stub open removal</button>
        {sendSlot && createPortal(<button>stub send</button>, sendSlot)}
        {titleSlot && createPortal(<h2>stub title</h2>, titleSlot)}
      </div>
    ),
  }
})
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

    await user.click(screen.getByRole('button', { name: 'Edit listing' }))

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

    await user.click(screen.getByRole('button', { name: 'Edit listing' }))
    expect(screen.getByText(/ListingEditor stub/)).toBeInTheDocument()

    // Simulates what a real swipe-back/browser-back delivers: a popstate
    // whose state no longer carries mapSheetForm, because history.back()
    // popped past the entry openEdit pushed.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })

    expect(screen.queryByText(/ListingEditor stub/)).not.toBeInTheDocument()
    expect(screen.getByTestId('listing-view')).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Edit listing' }))
    await user.click(screen.getByRole('button', { name: 'stub cancel' }))

    expect(backSpy).toHaveBeenCalled()
    // Mocked no-op above, so no popstate actually fired — the form staying
    // put confirms the component didn't ALSO reset its own state directly,
    // only delegated to the browser.
    expect(screen.getByText(/ListingEditor stub/)).toBeInTheDocument()
  })

  // ── The edit bar ───────────────────────────────────────────────────────

  // Where Edit, Share and Set as location live now: one "Edit listing"
  // bar at the end of the panel, with Set as location in its overflow, and
  // Save at the top beside the thumbs-up (Oct 14).
  // They used to sit behind a kebab next to the name, which people open
  // expecting Share and never expecting to author anything — plus a quiet
  // grey "Suggest a correction" link in the footer, now gone.
  it('offers Edit listing and Request removal, with no ••• menu, no kebab and no quiet correction link', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    expect(screen.getByRole('button', { name: 'Edit listing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suggest a correction' })).not.toBeInTheDocument()

    // Share is one of the listing's own buttons, beside Directions and Call,
    // and Save is the bookmark at the top — which is why the ••• fan that
    // used to hold them, and Request removal, is gone (Oct 15).
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Goldi Market' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actions for Goldi Market' })).not.toBeInTheDocument()
    // Request removal opens its own screen, with the listing behind it.
    await user.click(screen.getByRole('button', { name: 'Request removal' }))
    expect(await screen.findByText('stub editor: removal')).toBeInTheDocument()
  })

  // Part of the listing, not docked over it (which phase 3 did): the last
  // thing about the place, after the dated line. Only the places nearby
  // come after it, and the map passes none.
  it('ends the content with the bar', () => {
    const { container } = renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )
    const view = container.querySelector('[data-testid="listing-view"]') as HTMLElement
    const last = view.lastElementChild as HTMLElement
    expect(last).toContainElement(screen.getByRole('button', { name: 'Edit listing' }))
    expect(last).toContainElement(screen.getByRole('button', { name: 'Request removal' }))
    // Its own block now: the dated strip it used to end is gone (Oct 6).
    expect(last).toHaveAttribute('data-testid', 'listing-foot')
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

    await user.click(screen.getByRole('button', { name: 'Edit listing' }))
    expect(writes.at(-1)).toBe(0)

    screen.getByTestId('region').scrollTop = 480
    // What a swipe-back or the form's own Back delivers (see above).
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })
    expect(screen.queryByRole('heading', { name: 'Edit listing' })).not.toBeInTheDocument()
    expect(writes.at(-1)).toBe(0)
  })

  // Oct 15: the phone sheet's way back to the list is the chevron alone,
  // like the editor's ‹ in the same spot, not "‹ Back to list" in words.
  it('goes back to the list with a chevron alone, named for screen readers', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const onBack = vi.fn()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={onBack} />
      </PinnedProvider>,
    )
    const back = screen.getByRole('button', { name: 'Back to list' })
    expect(back).toHaveTextContent(/^$/)
    expect(screen.queryByText('Back to list')).not.toBeInTheDocument()
    await user.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // The row Back sits in carries the editor's title too, as the desktop
  // dialog's header does.
  it('puts the editor\'s title in the same row as Back', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" />
      </PinnedProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Edit listing' }))
    // A chevron alone, named for screen readers only.
    expect(screen.getByRole('button', { name: 'Back' })).toHaveTextContent(/^$/)
    const row = screen.getByRole('button', { name: 'Back' }).closest('.grid') as HTMLElement
    expect(within(row).getByRole('heading', { name: 'stub title' })).toBeInTheDocument()
  })

  // Removal has no Cancel, so Back has to step out of it into the edit —
  // and a history entry of its own makes the phone's back swipe do the same.
  it('steps back from the removal screen to the edit, not out of editing', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" />
      </PinnedProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Edit listing' }))
    const push = vi.spyOn(window.history, 'pushState')
    await user.click(screen.getByRole('button', { name: 'stub open removal' }))
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ mapSheetForm: 'edit', mapSheetRemoval: true }), '')

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(back).toHaveBeenCalledTimes(1)
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { mapSheetForm: 'edit' } }))
    })
    expect(screen.getByText(/ListingEditor stub/)).toBeInTheDocument()
    push.mockRestore()
    back.mockRestore()
  })

  // A row of the editor open (Oct 11): Back closes the row, and the editor
  // stays; it doesn't step out of editing or touch the history.
  it('steps back out of an open row of the editor, not out of editing', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" />
      </PinnedProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Edit listing' }))
    await user.click(screen.getByRole('button', { name: 'stub open row' }))
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(back).not.toHaveBeenCalled()
    expect(screen.getByText(/ListingEditor stub/)).toBeInTheDocument()
    // The row closed, so the next Back leaves the editor.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(back).toHaveBeenCalledTimes(1)
    back.mockRestore()
  })

  // The desktop map's sidebar (Oct 15): its search box's ← is the editor's
  // way back, so the editor's own ‹ is left out, and the host hears how to
  // step back, what to call it, and whether anything typed would be lost.
  it('hands its way back to a host that draws it (onEditor), and leaves out its own ‹', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const onEditor = vi.fn()
    const last = () => onEditor.mock.calls.at(-1)?.[0] as { back: () => void; label: string; changed: boolean } | null
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onEditor={onEditor} />
      </PinnedProvider>,
    )
    expect(last() ?? null).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Edit listing' }))
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(last()).toMatchObject({ label: 'Back to listing', changed: false })

    await user.click(screen.getByRole('button', { name: 'stub type' }))
    expect(last()).toMatchObject({ changed: true })

    // A row open, it's a step inside the edit; back closes the row.
    await user.click(screen.getByRole('button', { name: 'stub open row' }))
    expect(last()).toMatchObject({ label: 'Back' })
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    act(() => last()!.back())
    expect(historyBack).not.toHaveBeenCalled()
    expect(last()).toMatchObject({ label: 'Back to listing' })

    // From the edit itself, out to the listing.
    act(() => last()!.back())
    expect(historyBack).toHaveBeenCalledTimes(1)
    historyBack.mockRestore()
  })

  // Save, Share and Set as location aren't contributions — so a category
  // with editing off keeps them, and loses only the pill.
  it('keeps Save, without the pill, when the category cannot be edited', async () => {
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
    expect(screen.queryByRole('button', { name: 'Edit listing' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Goldi Market' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  // Oct 15: a recommendation is worth giving wherever the place was found.
  // The map passes no `upvote` of its own, so the detail supplies one, on
  // the directory's gate: the category's setting and the site's.
  it('offers Recommend on the map where the category takes upvotes, and not otherwise', () => {
    const render = (upvotesEnabled: boolean) =>
      renderWithProviders(
        <PinnedProvider>
          <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory({ upvotesEnabled })} color="#000" onBack={() => {}} />
        </PinnedProvider>,
      )
    render(true)
    expect(screen.getByRole('button', { name: /^Recommend Goldi Market/ })).toBeInTheDocument()
    cleanup()
    render(false)
    expect(screen.getByRole('button', { name: 'Edit listing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Recommend/ })).not.toBeInTheDocument()
  })

  // The directory's sheet passes its own (wired to re-sort its list), or
  // null where the category has upvotes off; either is used as given.
  it('uses the host’s upvote, or none, when one is passed', () => {
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory({ upvotesEnabled: true })} color="#000" upvote={null} />
      </PinnedProvider>,
    )
    expect(screen.queryByRole('button', { name: /^Recommend/ })).not.toBeInTheDocument()
  })
})
