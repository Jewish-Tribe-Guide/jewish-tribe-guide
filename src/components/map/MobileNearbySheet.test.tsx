// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { MapPoint } from './ResourceMap'
import type { DirectoryResource } from '@/types'
import MobileNearbySheet, { type MobileNearbySheetHandle } from './MobileNearbySheet'

type Point = MapPoint & { filterId: string; raw?: DirectoryResource }

// NearbyList/MapPlaceDetail are covered by their own tests. Stubbed here so
// this file exercises only what's actually MobileNearbySheet's own job: the
// selected-place state machine and the history push/pop wired around it —
// see selectPlace/clearSelection's own comments for why that exists (a
// swipe-back on the real place detail used to leave the map screen
// entirely, for lack of any history entry to pop instead).
vi.mock('./NearbyList', () => ({
  default: ({ points, onSelectPlace }: { points: Point[]; onSelectPlace?: (p: Point) => void }) => (
    <div>
      {points.map((p) => (
        <button key={p.id} onClick={() => onSelectPlace?.(p)}>
          select {p.name}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('./MapPlaceDetail', () => ({
  default: ({ item, onBack }: { item: Point; onBack: () => void }) => (
    <div>
      <p>detail for {item.name}</p>
      <button onClick={onBack}>Back to list</button>
    </div>
  ),
}))

const category = makeCategory({ id: 'grocery' })
const point: Point = {
  id: 'p1',
  lat: 0,
  lng: 0,
  name: 'Goldi Market',
  color: '#000',
  filterId: 'grocery',
  raw: makeListing({ id: 'p1', name: 'Goldi Market' }),
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // jsdom's History is a live, module-level object — reset so one test's
  // pushed entries can't leak into the next one's assertions.
  window.history.replaceState(null, '')
})

describe('MobileNearbySheet', () => {
  it('pushes a history entry the first time a place is selected, so a swipe-back returns to the list', async () => {
    const user = userEvent.setup()
    const pushSpy = vi.spyOn(window.history, 'pushState')

    render(<MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />)

    await user.click(screen.getByRole('button', { name: /select Goldi Market/ }))

    expect(screen.getByText('detail for Goldi Market')).toBeInTheDocument()
    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ mapSheetOpen: true }), '')
  })

  it('does not push a second entry when switching to a different place while one is already open', async () => {
    const user = userEvent.setup()
    const point2: Point = { ...point, id: 'p2', name: 'Second Place', raw: makeListing({ id: 'p2', name: 'Second Place' }) }
    const pushSpy = vi.spyOn(window.history, 'pushState')
    // A second selection while one's already open happens via a pin tap on
    // the map, not a list row (the list isn't even on screen once a place's
    // detail has replaced it) — that path is MobileNearbySheetHandle's
    // imperative selectPoint, same one ResourceMapView's onSelectPoint calls.
    const ref = createRef<MobileNearbySheetHandle>()

    render(
      <MobileNearbySheet
        ref={ref}
        points={[point, point2]}
        userLocation={null}
        categories={[category]}
        containerHeight={600}
      />,
    )

    await user.click(screen.getByRole('button', { name: /select Goldi Market/ }))
    expect(pushSpy).toHaveBeenCalledTimes(1)

    // Switching selection isn't "going deeper" — one swipe-back should still
    // land on the list, not need a second swipe per place visited.
    act(() => ref.current!.selectPoint(point2))
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText('detail for Second Place')).toBeInTheDocument()
  })

  it('returns to the list (not the home screen) when a swipe-back fires while a place is selected', async () => {
    const user = userEvent.setup()

    render(<MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />)

    await user.click(screen.getByRole('button', { name: /select Goldi Market/ }))
    expect(screen.getByText('detail for Goldi Market')).toBeInTheDocument()

    // Simulates what a real swipe-back/browser-back delivers: a popstate
    // whose state no longer carries mapSheetOpen.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })

    expect(screen.queryByText('detail for Goldi Market')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /select Goldi Market/ })).toBeInTheDocument()
  })

  it('does not commit a snap-point change when a drag is cancelled (e.g. an edge-swipe taken over for back-navigation) instead of released', () => {
    const { container } = render(
      <MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />,
    )
    const content = container.querySelector('.overscroll-contain')!

    // A real release with this much vertical movement WOULD change the snap
    // point (see the sibling "release" test below) — this is the same drag,
    // interrupted by a cancel instead of a pointerup. Before the fix,
    // onPointerCancel was wired to the exact same handler as onPointerUp, so
    // the interrupted drag still got resolved into a snap change here —
    // which is what made a swiped-away edit sheet land at a different
    // height than a plain "Back to list" tap leaves it at.
    fireEvent.pointerDown(content, { clientY: 400 })
    fireEvent.pointerMove(content, { clientY: 100 })
    fireEvent.pointerCancel(content)

    expect(screen.getByRole('button', { name: 'Expand nearby list' })).toBeInTheDocument()
  })

  it('for comparison: the same drag, released instead of cancelled, does commit a snap-point change', () => {
    const { container } = render(
      <MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />,
    )
    const content = container.querySelector('.overscroll-contain')!

    fireEvent.pointerDown(content, { clientY: 400 })
    fireEvent.pointerMove(content, { clientY: 100 })
    fireEvent.pointerUp(content)

    expect(screen.getByRole('button', { name: 'Drag to resize nearby list' })).toBeInTheDocument()
  })

  // Google Maps' bottom sheet: once the sheet is fully expanded, the list
  // scrolls normally — but drag past the top of the list (nowhere left to
  // scroll) and the SAME continuous gesture hands off into dragging the
  // sheet back down, instead of the drag just doing nothing once scrollTop
  // bottoms out at 0. See onContentPointerDown/onContentPointerMove's own
  // comments for the mechanism.
  it('at "full", dragging down past the top of the list hands off into collapsing the sheet', () => {
    const { container } = render(
      <MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />,
    )
    const handle = () => screen.getByRole('button', { name: /nearby list/i })
    // peek -> half -> full: two taps (no vertical movement = a tap, which
    // cycles the sheet forward one snap point per press).
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })

    const sheet = container.firstElementChild as HTMLElement
    expect(sheet.style.height).toBe('524px') // heights.full = containerHeight(600) - TOP_INSET_PX(76)

    const content = container.querySelector('.overscroll-contain')!
    // jsdom's scrollTop is always 0 — the same state as a real list already
    // scrolled to its top, which is exactly the case this handoff exists for.
    fireEvent.pointerDown(content, { clientY: 200 })
    fireEvent.pointerMove(content, { clientY: 210 }) // arms the handoff (>3px down while at the top)
    fireEvent.pointerMove(content, { clientY: 500 }) // now active — drags the sheet itself
    fireEvent.pointerUp(content, { clientY: 500 })

    expect(sheet.style.height).not.toBe('524px')
  })

  // Real bug: the handoff above used to check the finger's position against
  // where THIS TOUCH started, not its most recent direction — fine for a
  // single straight downward drag, wrong for the much more common real
  // gesture of scrolling down, then back up past the top, all without
  // lifting the finger. The finger has to physically re-cross its own
  // starting point before a startY-relative check can ever go negative, so
  // the sheet kept acting like it was still trying to scroll past the top
  // even once scrollTop had already hit 0 and the finger was clearly moving
  // down again.
  it('at "full", scrolling down then back up past the top in one continuous gesture still hands off — not just a straight drag from the start', () => {
    const { container } = render(
      <MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />,
    )
    const handle = () => screen.getByRole('button', { name: /nearby list/i })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })

    const sheet = container.firstElementChild as HTMLElement
    const content = container.querySelector('.overscroll-contain')!

    fireEvent.pointerDown(content, { clientY: 300 })
    // Scrolls the list further down (finger moves up, scrollTop grows).
    content.scrollTop = 200
    fireEvent.pointerMove(content, { clientY: 250 })
    // Same touch reverses and scrolls back up to the top — scrollTop
    // returns to 0 — then keeps moving the same direction. The finger
    // (260, then 280) never re-crosses where the touch started (300), so a
    // check against the touch's own start point would never fire here —
    // and resolveSnap's own "round back to full unless you've dragged far
    // enough" behavior on release would make even a late activation look
    // identical to no activation by the time the gesture ends, so this
    // reads the height mid-drag (before release) instead of the settled
    // snap, which is the only place the delay this bug caused is visible.
    content.scrollTop = 0
    fireEvent.pointerMove(content, { clientY: 260 }) // at the top, moving down — should arm the handoff right here
    fireEvent.pointerMove(content, { clientY: 280 }) // a further small move down — should already be dragging the sheet

    expect(sheet.style.height).not.toBe('524px')

    fireEvent.pointerUp(content, { clientY: 280 })
  })

  // The list's own scrolling is now driven by hand (contentRef.scrollTop)
  // instead of the browser's native touch-action: pan-y panning — see
  // onContentPointerMove's own comment for why (native panning's elastic
  // bounce at the top raced against, and could visually beat, the boundary
  // handoff above, however correct its own logic was).
  it('at "full", scrolling within the list (not at the boundary) drives scrollTop by hand', () => {
    const { container } = render(
      <MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />,
    )
    const handle = () => screen.getByRole('button', { name: /nearby list/i })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })

    const content = container.querySelector('.overscroll-contain')! as HTMLElement
    content.scrollTop = 100 // already partway down the list, nowhere near the top boundary

    fireEvent.pointerDown(content, { clientY: 500 })
    fireEvent.pointerMove(content, { clientY: 400 }) // finger moves up 100px — scrolls further down the list

    expect(content.scrollTop).toBe(200)
  })

  // Driving scrollTop by hand loses the free momentum native panning
  // provided — without coasting it ourselves, a fast flick through the list
  // would stop dead the instant the finger lifts instead of continuing to
  // glide, a real regression relative to how this felt before.
  it('coasts the list after a fast release instead of stopping dead the instant the finger lifts', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { container } = render(
      <MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />,
    )
    const handle = () => screen.getByRole('button', { name: /nearby list/i })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })

    const content = container.querySelector('.overscroll-contain')! as HTMLElement
    content.scrollTop = 100
    // jsdom has no real layout, so scrollHeight/clientHeight default to 0 —
    // set explicitly so the list has room to coast into rather than being
    // clamped at its own (zero-sized) bounds immediately.
    Object.defineProperty(content, 'scrollHeight', { value: 5000, configurable: true })
    Object.defineProperty(content, 'clientHeight', { value: 500, configurable: true })

    // Controlled performance.now() rather than relying on real wall-clock
    // gaps between synchronous fireEvent calls — jsdom's own clock is coarse
    // enough that two calls this close together can read identical
    // millisecond values, which would make the computed velocity (and so
    // whether momentum starts at all) flaky. 100px in 100ms is a fast,
    // unambiguous flick relative to MOMENTUM_MIN_VELOCITY. (fireEvent's own
    // `timeStamp` init property is a no-op here — jsdom's Event.timeStamp
    // has no setter — which is exactly why the component reads
    // performance.now() directly instead; see startDrag's own comment.)
    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValueOnce(0) // startDrag, on pointerdown
    fireEvent.pointerDown(content, { clientY: 500 })
    nowSpy.mockReturnValueOnce(100) // trackDrag, on the move below
    fireEvent.pointerMove(content, { clientY: 400 })
    // A 3rd queued value: startMomentum reads performance.now() once more of
    // its own, inside this same pointerup, to seed its step loop's clock.
    nowSpy.mockReturnValueOnce(100)
    fireEvent.pointerUp(content, { clientY: 400 })
    nowSpy.mockRestore()

    expect(rafSpy).toHaveBeenCalled()
    const scrollTopAfterRelease = content.scrollTop

    // Manually pump one animation frame with a plain, deterministic
    // timestamp — a real browser would call this on its own (jsdom never
    // fires requestAnimationFrame callbacks by itself), and 16ms after the
    // startMomentum call above's own clock read (100) is one realistic frame.
    const frame = rafCallbacks[rafCallbacks.length - 1]!
    frame(116)

    expect(content.scrollTop).toBeGreaterThan(scrollTopAfterRelease)

    vi.unstubAllGlobals()
  })

  // Real bug: velocity used to come from just the two most recent samples.
  // A real flick's very last pointermove before release is often a tiny
  // "settling" motion (or just close together in time) that doesn't reflect
  // how fast the finger was actually moving — so a genuinely fast flick
  // could compute as a near-zero final-sample velocity and never trigger the
  // momentum coast, which is exactly what "can't scroll fast" feels like:
  // the drag itself tracks the finger fine, it's the release that goes dead.
  it('a fast flick still coasts even when the very last recorded movement was tiny', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { container } = render(
      <MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />,
    )
    const handle = () => screen.getByRole('button', { name: /nearby list/i })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })
    fireEvent.pointerDown(handle(), { clientY: 100 })
    fireEvent.pointerUp(handle(), { clientY: 100 })

    const content = container.querySelector('.overscroll-contain')! as HTMLElement
    content.scrollTop = 200
    Object.defineProperty(content, 'scrollHeight', { value: 5000, configurable: true })
    Object.defineProperty(content, 'clientHeight', { value: 500, configurable: true })

    const nowSpy = vi.spyOn(performance, 'now')
    // Overall: 150.1px in 80ms ≈ 1.9 px/ms — a fast flick by any measure.
    // But that LAST move alone is 0.1px in 10ms = 0.01 px/ms, below
    // MOMENTUM_MIN_VELOCITY (0.02) on its own — a single-sample velocity
    // would read this release as too slow to coast at all.
    nowSpy.mockReturnValueOnce(0)
    fireEvent.pointerDown(content, { clientY: 600 })
    nowSpy.mockReturnValueOnce(40)
    fireEvent.pointerMove(content, { clientY: 500 })
    nowSpy.mockReturnValueOnce(70)
    fireEvent.pointerMove(content, { clientY: 450 })
    nowSpy.mockReturnValueOnce(80)
    fireEvent.pointerMove(content, { clientY: 449.9 })
    nowSpy.mockReturnValueOnce(80) // startMomentum's own internal clock read
    fireEvent.pointerUp(content, { clientY: 449.9 })
    nowSpy.mockRestore()

    expect(rafSpy).toHaveBeenCalled()
    const scrollTopAfterRelease = content.scrollTop
    const frame = rafCallbacks[rafCallbacks.length - 1]!
    frame(96) // 16ms after startMomentum's own clock read (80)

    expect(content.scrollTop).toBeGreaterThan(scrollTopAfterRelease)

    vi.unstubAllGlobals()
  })

  it('closes via history.back(), not a direct state reset, when "Back to list" is tapped', async () => {
    const user = userEvent.setup()
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    render(<MobileNearbySheet points={[point]} userLocation={null} categories={[category]} containerHeight={600} />)

    await user.click(screen.getByRole('button', { name: /select Goldi Market/ }))
    await user.click(screen.getByRole('button', { name: 'Back to list' }))

    expect(backSpy).toHaveBeenCalled()
    // Mocked no-op above, so no popstate actually fired — the detail
    // staying put confirms deselectPoint delegated to the browser instead
    // of also clearing its own state directly.
    expect(screen.getByText('detail for Goldi Market')).toBeInTheDocument()
  })
})
