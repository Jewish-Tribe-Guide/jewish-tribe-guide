// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileSheet from './MobileSheet'

afterEach(cleanup)

describe('MobileSheet', () => {
  it('renders nothing when closed', () => {
    render(
      <MobileSheet isOpen={false} onClose={vi.fn()} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title and children when open', () => {
    render(
      <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByText('form contents')).toBeInTheDocument()
  })

  it('closes on the header close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MobileSheet isOpen onClose={onClose} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click, but not on a click inside the sheet', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MobileSheet isOpen onClose={onClose} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MobileSheet isOpen onClose={onClose} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders no drag handle unless draggable is set', () => {
    render(
      <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )
    expect(screen.queryByRole('button', { name: 'Drag to resize' })).not.toBeInTheDocument()
  })

  describe('draggable', () => {
    // jsdom's window.innerHeight is 768 — heights.half = round(768*0.5) =
    // 384, heights.full = round(768*0.85) = 653 (see the component's own
    // HALF_FRACTION/FULL_FRACTION).
    const HALF_PX = 384
    const FULL_PX = 653

    it('opens at the half snap point', () => {
      const { container } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      expect(sheet.style.height).toBe(`${HALF_PX}px`)
    })

    it('tapping the handle (no movement) toggles between half and full', () => {
      const { container } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const handle = screen.getByRole('button', { name: 'Drag to resize' })

      fireEvent.pointerDown(handle, { clientY: 100 })
      fireEvent.pointerUp(handle, { clientY: 100 })
      expect(sheet.style.height).toBe(`${FULL_PX}px`)

      fireEvent.pointerDown(handle, { clientY: 100 })
      fireEvent.pointerUp(handle, { clientY: 100 })
      expect(sheet.style.height).toBe(`${HALF_PX}px`)
    })

    // Regression coverage for the actual reason this exists: a plain
    // fixed-height sheet (what this was before) has no way to get more
    // room for a long form short of scrolling within it. Dragging the
    // handle up should grow the sheet past `half`.
    it('dragging the handle up grows the sheet toward full', () => {
      const { container } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const handle = screen.getByRole('button', { name: 'Drag to resize' })

      fireEvent.pointerDown(handle, { clientY: 500 })
      fireEvent.pointerMove(handle, { clientY: 300 }) // finger moves up 200px — sheet grows
      expect(Number.parseInt(sheet.style.height)).toBe(HALF_PX + 200)

      fireEvent.pointerUp(handle, { clientY: 300 })
      // Settled above the half/full midpoint — snaps the rest of the way to full.
      expect(sheet.style.height).toBe(`${FULL_PX}px`)
    })

    // The actual gap this whole widening closes: a bare handle bar is a
    // real but small target, noticeably smaller than what the map's own
    // sheet feels like to grab (it gets "grab anywhere" from a scrolled-to-
    // top list handing its own drag off to the sheet, not from a bigger
    // handle there either — see onHandlePointerDown's own doc). Dragging
    // from the title text itself — not the handle — should work exactly
    // the same way.
    it('dragging from the header title (not just the handle) also resizes the sheet', () => {
      const { container } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const titleText = screen.getByText('Suggest an edit')

      fireEvent.pointerDown(titleText, { clientY: 500 })
      fireEvent.pointerMove(titleText, { clientY: 300 })
      expect(Number.parseInt(sheet.style.height)).toBe(HALF_PX + 200)

      fireEvent.pointerUp(titleText, { clientY: 300 })
      expect(sheet.style.height).toBe(`${FULL_PX}px`)
    })

    // Widening the drag surface to the whole header must not swallow the
    // close button sitting inside it — onHandlePointerDown bails out by
    // target specifically so a tap there still closes the sheet instead of
    // starting a (zero-movement) drag underneath it.
    it('the close button inside the draggable header still closes the sheet, not just resizes it', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(
        <MobileSheet isOpen onClose={onClose} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )

      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('dragging the handle down past the dismiss threshold closes the sheet', () => {
      const onClose = vi.fn()
      render(
        <MobileSheet isOpen onClose={onClose} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const handle = screen.getByRole('button', { name: 'Drag to resize' })

      // half (384) down past DISMISS_FRACTION (0.5 of half = 192).
      fireEvent.pointerDown(handle, { clientY: 500 })
      fireEvent.pointerMove(handle, { clientY: 700 })
      fireEvent.pointerUp(handle, { clientY: 700 })

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('a small drag that stays above the dismiss threshold snaps back instead of closing', () => {
      // Real elapsed time between two synchronous fireEvent calls is near
      // zero, which would read a small pixel delta as an enormous px/ms
      // velocity and trigger the SAME fling-detection path a genuine fast
      // flick does — this test is specifically about a slow drag staying
      // under that threshold, so it needs a realistic time gap between the
      // down and move events.
      //
      // A plain `mockReturnValueOnce` queue (MobileNearbySheet's own tests'
      // approach) isn't reliable here: React's Scheduler also reads
      // performance.now() internally during render/commit, and can consume
      // queued values before this component's own drag handlers ever run,
      // desyncing which call gets which number. A mutable "current time"
      // the mock always reads from isn't order-sensitive the same way — any
      // extra calls in between just read whatever it's currently set to,
      // and only advancing it right before firing each event controls the
      // one thing this test actually needs: the gap our own two calls see.
      let fakeNow = 0
      const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow)

      const onClose = vi.fn()
      const { container } = render(
        <MobileSheet isOpen onClose={onClose} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const handle = screen.getByRole('button', { name: 'Drag to resize' })

      fireEvent.pointerDown(handle, { clientY: 500 })
      fakeNow = 200 // 50px over 200ms — well under FLING_VELOCITY
      fireEvent.pointerMove(handle, { clientY: 550 }) // down 50px — nowhere near the dismiss threshold
      fireEvent.pointerUp(handle, { clientY: 550 })

      nowSpy.mockRestore()
      expect(onClose).not.toHaveBeenCalled()
      expect(sheet.style.height).toBe(`${HALF_PX}px`)
    })

    // Same reasoning as MobileNearbySheet's own pointerCancel coverage: the
    // browser can take a touch over mid-gesture (most commonly an edge
    // swipe recognized as its own back-navigation) — that should drop the
    // drag, not resolve it into a dismiss the visitor never actually
    // completed.
    it('a pointer cancel drops the drag without dismissing or changing the snap point', () => {
      const onClose = vi.fn()
      const { container } = render(
        <MobileSheet isOpen onClose={onClose} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const handle = screen.getByRole('button', { name: 'Drag to resize' })

      fireEvent.pointerDown(handle, { clientY: 500 })
      fireEvent.pointerMove(handle, { clientY: 750 }) // well past the dismiss threshold, mid-drag
      fireEvent.pointerCancel(handle)

      expect(onClose).not.toHaveBeenCalled()
      expect(sheet.style.height).toBe(`${HALF_PX}px`)
    })

    it('resets to the half snap point the next time it opens, not wherever a previous open left it', () => {
      const { container, rerender } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = () => container.querySelector('[role="dialog"]') as HTMLElement
      const handle = () => screen.getByRole('button', { name: 'Drag to resize' })

      fireEvent.pointerDown(handle(), { clientY: 100 })
      fireEvent.pointerUp(handle(), { clientY: 100 })
      expect(sheet().style.height).toBe(`${FULL_PX}px`)

      rerender(
        <MobileSheet isOpen={false} onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      rerender(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )

      expect(sheet().style.height).toBe(`${HALF_PX}px`)
    })
  })
})
