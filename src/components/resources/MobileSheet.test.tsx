// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileSheet from './MobileSheet'

afterEach(cleanup)

// Mirrors the component's own SNAP_DURATION_MS — not imported since it isn't
// exported (an internal implementation detail), but the closing-animation
// timer test below needs to know it to assert the unmount timing precisely.
const SNAP_DURATION_MS = 280

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

  // Regression coverage for a real, measured bug (not just "poofs away" — see
  // the next test for that one): in the real caller (FindResources),
  // `onClose` doesn't just flip a local boolean — it's goToCategoryList,
  // which pushes a URL change and only comes back around to actually update
  // this component's `isOpen` PROP once that navigation's own re-render
  // lands. Waiting for that round trip before starting the exit transition
  // meant the sheet visibly sat there, fully open, for however long the
  // round trip took — confirmed live as the sheet's own transform still
  // reading unchanged 150ms after tapping Close. A plain `vi.fn()` for
  // `onClose` reproduces the same shape here: it never touches `isOpen` at
  // all, so if this component were still waiting on that prop, it would
  // still show `translateY(0)` after being clicked. It shouldn't — the exit
  // animation has to start from the click itself, not from a prop the
  // caller may take a while to come back around on.
  it('starts sliding closed immediately when dismissed, without waiting for the caller to update the isOpen prop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn() // deliberately never flips `isOpen` — see doc above
    const { container } = render(
      <MobileSheet isOpen onClose={onClose} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )
    const sheet = container.querySelector('[role="dialog"]') as HTMLElement

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sheet.style.transform).toBe('translateY(100%)')
  })

  // Regression coverage for "poofs away" instead of sliding down: this used
  // to unmount the instant `isOpen` went false, well before any exit
  // transition could be seen. Now it stays mounted, translated off-screen
  // via a transition, until a timer matching that transition's own duration
  // unmounts it — see the component's own Phase doc for why a plain
  // isOpen boolean couldn't do this.
  it('slides down over a moment when closed, instead of vanishing the instant isOpen goes false', () => {
    // try/finally: a failed assertion here must not leave fake timers
    // active for whichever test runs next in this file — that's exactly
    // what happened once already (an assertion failure skipped the
    // useRealTimers() call below, and the next test hung for a full 5s
    // waiting on a real timer that fake-timer mode was intercepting).
    vi.useFakeTimers()
    try {
      const { container, rerender } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit">
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = () => container.querySelector('[role="dialog"]') as HTMLElement | null
      expect(sheet()?.style.transform).toBe('translateY(0)')

      rerender(
        <MobileSheet isOpen={false} onClose={vi.fn()} title="Suggest an edit">
          <p>form contents</p>
        </MobileSheet>,
      )
      // Still on screen right after isOpen flips, now sliding down.
      expect(sheet()).not.toBeNull()
      expect(sheet()?.style.transform).toBe('translateY(100%)')

      act(() => { vi.advanceTimersByTime(SNAP_DURATION_MS - 1) })
      expect(sheet()).not.toBeNull()

      act(() => { vi.advanceTimersByTime(1) })
      expect(sheet()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
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

    // The actual gap request #2 closed: pulling down on the FORM itself,
    // once it's already scrolled to the top (jsdom's scrollTop is always 0,
    // same state as a real form that fits without scrolling, or one already
    // scrolled all the way up), used to just rubber-band the content in
    // place — visually read as "the page" moving. It should hand off to the
    // sheet instead, the same way the map's own list already does.
    it('pulling down on the content once at the scroll top drags the sheet down, instead of the content trying to scroll/bounce on its own', () => {
      let fakeNow = 0
      const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow)

      const { container } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const content = screen.getByText('form contents').parentElement as HTMLElement

      fireEvent.pointerDown(content, { clientY: 300 })
      fakeNow = 50
      // A small initial move down is the handoff itself — the sheet doesn't
      // move yet on this same event, same as the handle's own drag start.
      fireEvent.pointerMove(content, { clientY: 310 })
      fakeNow = 250
      // 100px more over 200ms — comfortably under FLING_VELOCITY, so this
      // settles on its own merits rather than getting nudged by a flick.
      fireEvent.pointerMove(content, { clientY: 410 })
      expect(Number.parseInt(sheet.style.height)).toBe(HALF_PX - 100)

      fireEvent.pointerUp(content, { clientY: 410 })
      nowSpy.mockRestore()
      // Settled well above the dismiss threshold — snaps back to half rather
      // than closing, same resolution the handle's own drag would reach.
      expect(sheet.style.height).toBe(`${HALF_PX}px`)
    })

    // Scrolling DOWN through the content (finger moving up, away from the
    // top) is an ordinary scroll, not a handoff — only a drag that's already
    // AT the top and continues pulling further down should ever reach the
    // sheet.
    it('scrolling the content away from the top does not resize the sheet', () => {
      const { container } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const content = screen.getByText('form contents').parentElement as HTMLElement

      fireEvent.pointerDown(content, { clientY: 400 })
      fireEvent.pointerMove(content, { clientY: 300 }) // finger moves up — scrolls the content down, not the sheet
      fireEvent.pointerUp(content, { clientY: 300 })

      expect(sheet.style.height).toBe(`${HALF_PX}px`)
    })

    // Once the content is already scrolled away from the top, pulling down
    // scrolls it back toward the top first — it should NOT jump straight to
    // resizing the sheet just because the drag direction is downward.
    it('pulling down while the content is scrolled away from the top scrolls it, rather than resizing the sheet', () => {
      const { container } = render(
        <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const content = screen.getByText('form contents').parentElement as HTMLElement
      content.scrollTop = 50 // not at the top yet

      fireEvent.pointerDown(content, { clientY: 300 })
      fireEvent.pointerMove(content, { clientY: 340 }) // pulls down 40px, well short of the 50px still separating it from the top
      fireEvent.pointerUp(content, { clientY: 340 })

      expect(sheet.style.height).toBe(`${HALF_PX}px`)
      expect(content.scrollTop).toBe(10)
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

    // Regression coverage for the actual complaint: dismissing mid-drag used
    // to snap the sheet's height back up to `half` (its last real snap
    // point) and only THEN start a separate transform-based slide away —
    // a visible double-motion, not the single continuous shrink a drag
    // release should read as. Height is the only mechanism now (see
    // currentHeight's own doc), so a dismiss should continue shrinking
    // from wherever the drag already had it, straight to 0 — never back up
    // to 384 (half) first.
    it('dismissing mid-drag shrinks straight from wherever the drag left it, not back up to half height first', () => {
      const onClose = vi.fn()
      const { container } = render(
        <MobileSheet isOpen onClose={onClose} title="Suggest an edit" draggable>
          <p>form contents</p>
        </MobileSheet>,
      )
      const sheet = container.querySelector('[role="dialog"]') as HTMLElement
      const handle = screen.getByRole('button', { name: 'Drag to resize' })

      // half (384) down to 100px — well past the dismiss threshold (192).
      fireEvent.pointerDown(handle, { clientY: 500 })
      fireEvent.pointerMove(handle, { clientY: 784 })
      fireEvent.pointerUp(handle, { clientY: 784 })

      expect(onClose).toHaveBeenCalledTimes(1)
      // The CSS transition then carries it the rest of the way down from
      // whatever height this is — never all the way back up to 384 first.
      expect(sheet.style.height).toBe('0px')
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
