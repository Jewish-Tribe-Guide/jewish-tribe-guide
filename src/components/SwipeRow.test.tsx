// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import SwipeRow, { SwipeRowGroup, type SwipeAction } from './SwipeRow'

// The TOUCH path — the one used on a phone. It had no unit tests at all
// while it lived inside the map's NearbyList (whose tests cover only the
// desktop trackpad path, and still do), so these are the first. The global
// vitest.setup.ts matchMedia stub reports no hover capability, which is what
// puts a row on this path.
//
// The clock is frozen, and every drag advances it explicitly. SwipeRow's
// flick rule reads event timeStamps, which jsdom takes from Date.now() in
// whole milliseconds; left to the real clock, two events usually share a
// millisecond (no velocity) but occasionally don't, and a drag meant to be
// slow becomes a flick. Each test says how fast its drag is instead.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function makeActions(name: string, overrides: Partial<Record<SwipeAction['id'], Partial<SwipeAction>>> = {}) {
  const save = vi.fn()
  const share = vi.fn()
  const actions: SwipeAction[] = [
    // Save first on purpose — SwipeRow must still put it at the row's edge.
    { id: 'save', label: 'Save', ariaLabel: `Save ${name}`, active: false, onSelect: save, ...overrides.save },
    { id: 'share', label: 'Share', ariaLabel: `Share ${name}`, active: false, onSelect: share, ...overrides.share },
  ]
  return { actions, save, share }
}

function Row({ name, actions, enabled, onTap }: { name: string; actions: SwipeAction[]; enabled?: boolean; onTap?: () => void }) {
  return (
    <SwipeRow rowId={name} actions={actions} enabled={enabled} contentClassName="bg-white" onContentClick={onTap}>
      <span>{name}</span>
    </SwipeRow>
  )
}

const contentOf = (name: string) => screen.getByText(name).parentElement as HTMLElement

/** A horizontal drag of `dx` px that takes `ms` to happen, then releases. */
function drag(el: HTMLElement, dx: number, { ms = 300, dy = 0 }: { ms?: number; dy?: number } = {}) {
  fireEvent.pointerDown(el, { pointerType: 'touch', clientX: 300, clientY: 100 })
  vi.setSystemTime(Date.now() + ms)
  fireEvent.pointerMove(el, { pointerType: 'touch', clientX: 300 + dx, clientY: 100 + dy })
  fireEvent.pointerUp(el, { pointerType: 'touch', clientX: 300 + dx, clientY: 100 + dy })
}

/** A real tap: the finger goes down and comes up in place, then the click.
 *  NOT a bare click — a tap's pointerdown is what clears the "that was a
 *  drag" flag the opening swipe left behind, and a test that skips it never
 *  reaches the rule for tapping an open row at all. One was first written
 *  that way and passed with that rule deleted. */
function tap(el: HTMLElement) {
  fireEvent.pointerDown(el, { pointerType: 'touch', clientX: 300, clientY: 100 })
  fireEvent.pointerUp(el, { pointerType: 'touch', clientX: 300, clientY: 100 })
  fireEvent.click(el)
}

const isOpen = (name: string) => contentOf(name).style.transform === 'translateX(-104px)'

describe('SwipeRow — touch', () => {
  // 40% of the 104px strip is ~42px (Oct 16: 30% was "too aggressive" on
  // the map's list). Still well short of half: the "needs too big a swipe"
  // complaint the 30% was first tuned for.
  it('opens once a slow drag travels 40% of the strip, short of half', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -46)

    expect(isOpen('Goldi')).toBe(true)
    expect(screen.getByRole('button', { name: 'Save Goldi' })).toBeInTheDocument()
  })

  // 35px opened at 30%.
  it('springs back from a slow drag short of that, rather than half-opening', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -35)

    expect(contentOf('Goldi').style.transform).toBe('')
    expect(screen.queryByRole('button', { name: 'Save Goldi' })).not.toBeInTheDocument()
  })

  // The other half of why iMessage/Mail feel quick: a short, fast flick is
  // a deliberate swipe, not an aborted one. 32px over 10ms.
  it('opens on a quick flick, even one short of the threshold', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -32, { ms: 10 })

    expect(isOpen('Goldi')).toBe(true)
  })

  // Oct 16: a fast 20px twitch while scrolling opened the row.
  it('does not open on a fast twitch that goes nowhere', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -20, { ms: 10 })

    expect(contentOf('Goldi').style.transform).toBe('')
  })

  it('closes an open row on a quick flick back', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -60)
    expect(isOpen('Goldi')).toBe(true)

    drag(contentOf('Goldi'), 32, { ms: 10 })
    expect(contentOf('Goldi').style.transform).toBe('')
  })

  // The row sits in a scrolling list, so a mostly-vertical drag must stay a
  // scroll: it never claims the gesture, even past the 10px activation.
  it('ignores a mostly-vertical drag so the list can still scroll', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -30, { dy: 90 })

    expect(contentOf('Goldi').style.transform).toBe('')
  })

  // Oct 16: a diagonal scroll, a little more sideways than down, opened
  // rows on the map's list. Now it has to be clearly sideways.
  it('ignores a diagonal drag only a little more sideways than up or down', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -60, { dy: 45 })

    expect(contentOf('Goldi').style.transform).toBe('')
  })

  // Once a drag is horizontal, an ancestor with its own vertical drag (the
  // map sheet) must not see it — or one swipe would open the row AND nudge
  // the sheet. A vertical drag still reaches it.
  it('keeps a horizontal drag from an ancestor, but not a vertical one', () => {
    const onAncestorMove = vi.fn()
    render(
      <div onPointerMove={onAncestorMove}>
        <Row name="Goldi" actions={makeActions('Goldi').actions} />
      </div>,
    )
    drag(contentOf('Goldi'), -60)
    expect(onAncestorMove).not.toHaveBeenCalled()

    drag(contentOf('Goldi'), -10, { dy: 80 })
    expect(onAncestorMove).toHaveBeenCalled()
  })
})

// Oct 16: the row's pressed look flashed as a swipe began. Like a phone's
// own lists, it waits for a finger at rest.
describe('SwipeRow — pressed, on a touch screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  })
  const pressed = () => contentOf('Goldi').hasAttribute('data-pressed')

  it('looks pressed once a finger rests on it, and lets go on lifting', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    fireEvent.pointerDown(contentOf('Goldi'), { pointerType: 'touch', clientX: 300, clientY: 100 })
    expect(pressed(), 'not the instant it touches').toBe(false)
    act(() => vi.advanceTimersByTime(120))
    expect(pressed()).toBe(true)
    fireEvent.pointerUp(contentOf('Goldi'), { pointerType: 'touch', clientX: 300, clientY: 100 })
    expect(pressed()).toBe(false)
  })

  it('never looks pressed for a swipe or a scroll', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    for (const [dx, dy] of [[-30, 0], [0, 30]]) {
      fireEvent.pointerDown(contentOf('Goldi'), { pointerType: 'touch', clientX: 300, clientY: 100 })
      act(() => vi.advanceTimersByTime(40))
      fireEvent.pointerMove(contentOf('Goldi'), { pointerType: 'touch', clientX: 300 + dx, clientY: 100 + dy })
      act(() => vi.advanceTimersByTime(200))
      expect(pressed()).toBe(false)
      fireEvent.pointerUp(contentOf('Goldi'), { pointerType: 'touch', clientX: 300 + dx, clientY: 100 + dy })
    }
  })
})

describe('SwipeRow — what the swipe reveals', () => {
  // An always-mounted strip behind an opaque row is invisible, but its
  // buttons stay in the tab order and the accessibility tree — controls a
  // keyboard or screen-reader visitor would land on and nobody can see. The
  // map list shipped that way until it moved onto this component.
  it('keeps its actions out of the page until the row is swiped', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    expect(screen.queryByRole('button', { name: 'Save Goldi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share Goldi' })).not.toBeInTheDocument()
  })

  // Even translateX(0) makes the row its own stacking context, which traps
  // the category card's cert-badge tooltip under the next card in the list.
  it('sets no transform on the row at rest', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    expect(contentOf('Goldi').style.transform).toBe('')
  })

  // Save stays at the row's edge — the first thing a small swipe reveals,
  // and where muscle memory from the map list expects it — whatever order
  // a caller happens to pass them in.
  it('puts Save at the row edge and Share beside it', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -60)

    const labels = screen.getAllByRole('button', { name: /Goldi$/ }).map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Share Goldi', 'Save Goldi'])
  })

  it('closes after Save, but stays open after Share so its "Copied!" can be read', () => {
    const { actions, save, share } = makeActions('Goldi')
    render(<Row name="Goldi" actions={actions} />)

    drag(contentOf('Goldi'), -60)
    fireEvent.click(screen.getByRole('button', { name: 'Share Goldi' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect(isOpen('Goldi')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Save Goldi' }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(contentOf('Goldi').style.transform).toBe('')
  })
})

describe('SwipeRow — taps', () => {
  it('lets an ordinary tap through to the row', () => {
    const onTap = vi.fn()
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} onTap={onTap} />)
    tap(contentOf('Goldi'))

    expect(onTap).toHaveBeenCalledTimes(1)
  })

  // A short horizontal drag can still end in a click (a phone only
  // suppresses the click once the finger moves further than this). Without
  // swallowing it, a swipe that sprang back would also open the listing.
  it('swallows the click a short, sprung-back drag ends with', () => {
    const onTap = vi.fn()
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} onTap={onTap} />)
    drag(contentOf('Goldi'), -20)
    fireEvent.click(contentOf('Goldi'))

    expect(onTap).not.toHaveBeenCalled()
  })

  // The same "first tap puts it away" rule any open menu follows.
  it('closes an open row on the next tap, instead of passing the tap on', () => {
    const onTap = vi.fn()
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} onTap={onTap} />)
    drag(contentOf('Goldi'), -60)
    tap(contentOf('Goldi'))

    expect(onTap).not.toHaveBeenCalled()
    expect(contentOf('Goldi').style.transform).toBe('')
  })
})

describe('SwipeRow — groups and switching it off', () => {
  // Same as iOS Mail: opening a second row snaps the first shut.
  it('keeps only one row in a group open at a time', () => {
    render(
      <SwipeRowGroup>
        <Row name="Goldi" actions={makeActions('Goldi').actions} />
        <Row name="Acme" actions={makeActions('Acme').actions} />
      </SwipeRowGroup>,
    )
    drag(contentOf('Goldi'), -60)
    expect(isOpen('Goldi')).toBe(true)

    drag(contentOf('Acme'), -60)
    expect(isOpen('Acme')).toBe(true)
    expect(contentOf('Goldi').style.transform).toBe('')
    expect(screen.queryByRole('button', { name: 'Save Goldi' })).not.toBeInTheDocument()
  })

  // As iPhone lists do (the user, Oct 16): with a row open, a tap on
  // another row only puts the open one away; the next tap is a tap.
  it('a tap on another row closes the open one, and does only that', () => {
    const onGoldi = vi.fn()
    const onAcme = vi.fn()
    render(
      <SwipeRowGroup>
        <Row name="Goldi" actions={makeActions('Goldi').actions} onTap={onGoldi} />
        <Row name="Acme" actions={makeActions('Acme').actions} onTap={onAcme} />
      </SwipeRowGroup>,
    )
    drag(contentOf('Goldi'), -60)
    expect(isOpen('Goldi')).toBe(true)

    tap(contentOf('Acme'))
    expect(contentOf('Goldi').style.transform, 'the open row is put away').toBe('')
    expect(onAcme, 'and the tap opened nothing').not.toHaveBeenCalled()

    tap(contentOf('Acme'))
    expect(onAcme, 'the next tap is a tap').toHaveBeenCalledTimes(1)
    expect(onGoldi).not.toHaveBeenCalled()
  })

  it('a touch that starts a scroll elsewhere closes the open row', () => {
    const onAcme = vi.fn()
    render(
      <SwipeRowGroup>
        <Row name="Goldi" actions={makeActions('Goldi').actions} />
        <Row name="Acme" actions={makeActions('Acme').actions} onTap={onAcme} />
      </SwipeRowGroup>,
    )
    drag(contentOf('Goldi'), -60)
    fireEvent.pointerDown(contentOf('Acme'), { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerMove(contentOf('Acme'), { pointerType: 'touch', clientX: 300, clientY: 160 })
    fireEvent.pointerCancel(contentOf('Acme'), { pointerType: 'touch' })
    expect(contentOf('Goldi').style.transform).toBe('')

    // The scroll leaves nothing behind: the next tap on that row is a tap.
    tap(contentOf('Acme'))
    expect(onAcme).toHaveBeenCalledTimes(1)
  })

  // As a phone's list does: a scroll that starts on the open row puts it
  // away too, whether the row sees the finger move or the browser takes the
  // touch for its scroll first.
  it('a scroll that starts on the open row closes it', () => {
    render(
      <SwipeRowGroup>
        <Row name="Goldi" actions={makeActions('Goldi').actions} />
      </SwipeRowGroup>,
    )
    drag(contentOf('Goldi'), -60)
    fireEvent.pointerDown(contentOf('Goldi'), { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerMove(contentOf('Goldi'), { pointerType: 'touch', clientX: 302, clientY: 130 })
    expect(contentOf('Goldi').style.transform).toBe('')

    drag(contentOf('Goldi'), -60)
    expect(isOpen('Goldi')).toBe(true)
    fireEvent.pointerDown(contentOf('Goldi'), { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerCancel(contentOf('Goldi'), { pointerType: 'touch' })
    expect(contentOf('Goldi').style.transform, 'the browser took it').toBe('')
  })

  it('a tap outside the list closes the open row, and still does what it does', () => {
    const onButton = vi.fn()
    render(
      <>
        <SwipeRowGroup>
          <Row name="Goldi" actions={makeActions('Goldi').actions} />
        </SwipeRowGroup>
        <button type="button" onClick={onButton}>Map</button>
      </>,
    )
    drag(contentOf('Goldi'), -60)
    tap(screen.getByRole('button', { name: 'Map' }))

    expect(contentOf('Goldi').style.transform).toBe('')
    expect(onButton).toHaveBeenCalledTimes(1)
  })

  // For a surface that reveals these another way (the category card's
  // desktop hover row) or a row with nothing to act on (a hospital).
  it('does nothing when disabled, and lets taps straight through', () => {
    const onTap = vi.fn()
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} enabled={false} onTap={onTap} />)
    drag(contentOf('Goldi'), -60)

    expect(contentOf('Goldi').style.transform).toBe('')
    expect(screen.queryByRole('button', { name: 'Save Goldi' })).not.toBeInTheDocument()
    tap(contentOf('Goldi'))
    expect(onTap).toHaveBeenCalled()
  })
})

// A computer's swipe is a trackpad's (the wheel), and the same things put
// an open row away as on a phone (the user, Oct 16): a click on another row
// (which does only that), a click elsewhere, and a scroll.
describe('SwipeRow — on a computer, anything else puts an open row away', () => {
  const touchMatchMedia = window.matchMedia
  beforeEach(() => {
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
  })
  afterEach(() => {
    window.matchMedia = touchMatchMedia
  })

  /** A trackpad swipe open, then the 150ms pause that settles it. Each
   *  gesture starts after a gap, as a real one would. */
  async function swipeOpen(name: string) {
    vi.setSystemTime(Date.now() + 1000)
    fireEvent.wheel(contentOf(name), { deltaX: 100, deltaY: 0 })
    await act(() => new Promise((r) => setTimeout(r, 200)))
    vi.setSystemTime(Date.now() + 1000)
    expect(isOpen(name), `${name} opens`).toBe(true)
  }

  function click(el: HTMLElement) {
    fireEvent.pointerDown(el, { pointerType: 'mouse', button: 0 })
    fireEvent.pointerUp(el, { pointerType: 'mouse', button: 0 })
    fireEvent.click(el)
  }

  function List({ onGoldi, onAcme, onButton }: { onGoldi?: () => void; onAcme?: () => void; onButton?: () => void }) {
    return (
      <>
        <SwipeRowGroup>
          <Row name="Goldi" actions={makeActions('Goldi').actions} onTap={onGoldi} />
          <Row name="Acme" actions={makeActions('Acme').actions} onTap={onAcme} />
        </SwipeRowGroup>
        <button type="button" onClick={onButton}>Map</button>
      </>
    )
  }

  it('a click on the open row closes it, and opens nothing', async () => {
    const onGoldi = vi.fn()
    render(<List onGoldi={onGoldi} />)
    await swipeOpen('Goldi')
    click(contentOf('Goldi'))
    expect(contentOf('Goldi').style.transform).toBe('')
    expect(onGoldi).not.toHaveBeenCalled()
  })

  it('a click on another row closes the open one, and does only that', async () => {
    const onAcme = vi.fn()
    render(<List onAcme={onAcme} />)
    await swipeOpen('Goldi')

    click(contentOf('Acme'))
    expect(contentOf('Goldi').style.transform, 'the open row is put away').toBe('')
    expect(onAcme, 'and the click opened nothing').not.toHaveBeenCalled()

    click(contentOf('Acme'))
    expect(onAcme, 'the next click is a click').toHaveBeenCalledTimes(1)
  })

  it('a click outside the list closes the open row, and still does what it does', async () => {
    const onButton = vi.fn()
    render(<List onButton={onButton} />)
    await swipeOpen('Goldi')
    click(screen.getByRole('button', { name: 'Map' }))
    expect(contentOf('Goldi').style.transform).toBe('')
    expect(onButton).toHaveBeenCalledTimes(1)
  })

  it('a scroll closes the open row, over another row or over itself', async () => {
    render(<List />)
    await swipeOpen('Goldi')
    fireEvent.wheel(contentOf('Acme'), { deltaX: 0, deltaY: 40 })
    expect(contentOf('Goldi').style.transform).toBe('')

    await swipeOpen('Goldi')
    fireEvent.wheel(contentOf('Goldi'), { deltaX: 1, deltaY: 12 })
    expect(contentOf('Goldi').style.transform).toBe('')
  })

  // Only a scroll: a sideways swipe elsewhere, or a few pixels of drift,
  // leaves it open.
  it('a sideways swipe or a twitch is not a scroll', async () => {
    render(<List />)
    await swipeOpen('Goldi')
    fireEvent.wheel(screen.getByRole('button', { name: 'Map' }), { deltaX: 40, deltaY: 6 })
    fireEvent.wheel(screen.getByRole('button', { name: 'Map' }), { deltaX: 30, deltaY: 6 })
    vi.setSystemTime(Date.now() + 1000)
    fireEvent.wheel(screen.getByRole('button', { name: 'Map' }), { deltaX: 0, deltaY: 3 })
    expect(isOpen('Goldi')).toBe(true)
  })
})
