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
