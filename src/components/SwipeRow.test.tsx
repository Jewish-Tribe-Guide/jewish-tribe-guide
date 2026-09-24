// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  const pin = vi.fn()
  const share = vi.fn()
  const actions: SwipeAction[] = [
    // Pin first on purpose — SwipeRow must still put it at the row's edge.
    { id: 'pin', label: 'Pin', ariaLabel: `Pin ${name}`, active: false, onSelect: pin, ...overrides.pin },
    { id: 'share', label: 'Share', ariaLabel: `Share ${name}`, active: false, onSelect: share, ...overrides.share },
  ]
  return { actions, pin, share }
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
  // 30% of the 104px strip is ~31px. 40px sits between that and half the
  // strip, so this fails against a half-width threshold — the "needs too
  // big a swipe" complaint the 30% was tuned to fix.
  it('opens once a slow drag travels 30% of the strip, well short of half', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -40)

    expect(isOpen('Goldi')).toBe(true)
    expect(screen.getByRole('button', { name: 'Pin Goldi' })).toBeInTheDocument()
  })

  it('springs back from a slow drag short of that, rather than half-opening', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -20)

    expect(contentOf('Goldi').style.transform).toBe('')
    expect(screen.queryByRole('button', { name: 'Pin Goldi' })).not.toBeInTheDocument()
  })

  // The other half of why iMessage/Mail feel quick: a short, fast flick is
  // a deliberate swipe, not an aborted one. The same 20px as the test above,
  // over 10ms instead of 300ms.
  it('opens on a quick flick, even one short of the threshold', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -20, { ms: 10 })

    expect(isOpen('Goldi')).toBe(true)
  })

  it('closes an open row on a quick flick back', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -60)
    expect(isOpen('Goldi')).toBe(true)

    drag(contentOf('Goldi'), 20, { ms: 10 })
    expect(contentOf('Goldi').style.transform).toBe('')
  })

  // The row sits in a scrolling list, so a mostly-vertical drag must stay a
  // scroll: it never claims the gesture, even past the 8px activation.
  it('ignores a mostly-vertical drag so the list can still scroll', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -30, { dy: 90 })

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

describe('SwipeRow — what the swipe reveals', () => {
  // An always-mounted strip behind an opaque row is invisible, but its
  // buttons stay in the tab order and the accessibility tree — controls a
  // keyboard or screen-reader visitor would land on and nobody can see. The
  // map list shipped that way until it moved onto this component.
  it('keeps its actions out of the page until the row is swiped', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    expect(screen.queryByRole('button', { name: 'Pin Goldi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share Goldi' })).not.toBeInTheDocument()
  })

  // Even translateX(0) makes the row its own stacking context, which traps
  // the category card's cert-badge tooltip under the next card in the list.
  it('sets no transform on the row at rest', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    expect(contentOf('Goldi').style.transform).toBe('')
  })

  // Pin stays at the row's edge — the first thing a small swipe reveals,
  // and where muscle memory from the map list expects it — whatever order
  // a caller happens to pass them in.
  it('puts Pin at the row edge and Share beside it', () => {
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} />)
    drag(contentOf('Goldi'), -60)

    const labels = screen.getAllByRole('button', { name: /Goldi$/ }).map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Share Goldi', 'Pin Goldi'])
  })

  it('closes after Pin, but stays open after Share so its "Copied!" can be read', () => {
    const { actions, pin, share } = makeActions('Goldi')
    render(<Row name="Goldi" actions={actions} />)

    drag(contentOf('Goldi'), -60)
    fireEvent.click(screen.getByRole('button', { name: 'Share Goldi' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect(isOpen('Goldi')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Pin Goldi' }))
    expect(pin).toHaveBeenCalledTimes(1)
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
    expect(screen.queryByRole('button', { name: 'Pin Goldi' })).not.toBeInTheDocument()
  })

  // For a surface that reveals these another way (the category card's
  // desktop hover row) or a row with nothing to act on (a hospital).
  it('does nothing when disabled, and lets taps straight through', () => {
    const onTap = vi.fn()
    render(<Row name="Goldi" actions={makeActions('Goldi').actions} enabled={false} onTap={onTap} />)
    drag(contentOf('Goldi'), -60)

    expect(contentOf('Goldi').style.transform).toBe('')
    expect(screen.queryByRole('button', { name: 'Pin Goldi' })).not.toBeInTheDocument()
    tap(contentOf('Goldi'))
    expect(onTap).toHaveBeenCalled()
  })
})
