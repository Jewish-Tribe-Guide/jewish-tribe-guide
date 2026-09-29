// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { clampShare, splitColumns, useListMapSplit } from './useListMapSplit'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** List, line, map, as GenericDirectory lays them out, `width` px wide. */
function Split({ width = 1120, onHideMap }: { width?: number; onHideMap?: () => void }) {
  const { gridRef, gridStyle, handleProps } = useListMapSplit({ onHideMap })
  return (
    <div
      ref={(el) => {
        gridRef.current = el
        if (el) el.getBoundingClientRect = () => ({ left: 100, width, top: 0, height: 700, right: 100 + width, bottom: 700, x: 100, y: 0, toJSON: () => ({}) })
      }}
      data-testid="grid"
      style={gridStyle}
    >
      <div />
      <div {...handleProps} />
      <div />
    </div>
  )
}

const handle = () => screen.getByRole('separator', { name: 'Resize the list and the map' })
const columns = () => screen.getByTestId('grid').style.gridTemplateColumns

describe('clampShare', () => {
  it('keeps the list 420px or wider and the map 360px or wider', () => {
    expect(clampShare(0.1, 1088)).toBeCloseTo(420 / 1088)
    expect(clampShare(0.9, 1088)).toBeCloseTo(1 - 360 / 1088)
    expect(clampShare(0.6, 1088)).toBe(0.6)
  })

  it('stays within a quarter and three quarters before there’s a width', () => {
    expect(clampShare(0.1, 0)).toBe(0.25)
    expect(clampShare(0.9, 0)).toBe(0.75)
  })

  it('writes the columns with those minimums, whatever the screen', () => {
    expect(splitColumns(0.6)).toBe('minmax(420px, 0.6fr) 32px minmax(360px, 0.4fr)')
  })
})

describe('useListMapSplit', () => {
  it('starts half and half, and dragging the line moves it and is remembered', () => {
    render(<Split />)
    expect(handle()).toHaveAttribute('aria-valuenow', '50')
    expect(columns()).toBe(splitColumns(0.5))

    // The line's middle to 700px along a 1120px grid starting at 100px:
    // (700 - 100 - 16) / 1088 of the width.
    fireEvent.pointerDown(handle(), { button: 0, clientX: 660, pointerId: 1 })
    fireEvent.pointerMove(handle(), { clientX: 700, pointerId: 1 })
    expect(columns()).toBe(splitColumns(584 / 1088))
    fireEvent.pointerUp(handle(), { clientX: 700, pointerId: 1 })
    expect(handle()).toHaveAttribute('aria-valuenow', '54')
    expect(localStorage.getItem('jpc:list-share')).toBe('0.537')

    cleanup()
    render(<Split />)
    expect(handle()).toHaveAttribute('aria-valuenow', '54')
  })

  it('stops where the map would get too small', () => {
    render(<Split />)
    fireEvent.pointerDown(handle(), { button: 0, clientX: 660, pointerId: 1 })
    fireEvent.pointerMove(handle(), { clientX: 5000, pointerId: 1 })
    fireEvent.pointerUp(handle(), { pointerId: 1 })
    expect(Number(localStorage.getItem('jpc:list-share'))).toBeCloseTo(1 - 360 / 1088, 3)
  })

  it('goes back to where it was when the browser takes the gesture over', () => {
    render(<Split />)
    fireEvent.pointerDown(handle(), { button: 0, clientX: 660, pointerId: 1 })
    fireEvent.pointerMove(handle(), { clientX: 800, pointerId: 1 })
    fireEvent.pointerCancel(handle(), { pointerId: 1 })
    expect(columns()).toBe(splitColumns(0.5))
    expect(localStorage.getItem('jpc:list-share')).toBeNull()
  })

  it('moves with the arrow keys; Enter and a double-click put it back to half and half', () => {
    render(<Split />)
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    expect(handle()).toHaveAttribute('aria-valuenow', '56')
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    expect(handle()).toHaveAttribute('aria-valuenow', '53')
    fireEvent.keyDown(handle(), { key: 'Enter' })
    expect(handle()).toHaveAttribute('aria-valuenow', '50')
    expect(localStorage.getItem('jpc:list-share')).toBeNull()

    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    fireEvent.doubleClick(handle())
    expect(handle()).toHaveAttribute('aria-valuenow', '50')
    expect(columns()).toBe(splitColumns(0.5))
  })

  // The grid starts at 100px and is 1120 wide: the map is at its smallest
  // (360px) with the line's middle at 100 + 1088 - 360 + 16 = 844px, and
  // hides once the line is 120px past that.
  describe('dragged far enough the map’s way', () => {
    const grid = () => screen.getByTestId('grid')
    const dragTo = (x: number) => {
      fireEvent.pointerDown(handle(), { button: 0, clientX: 660, pointerId: 1 })
      fireEvent.pointerMove(handle(), { clientX: x, pointerId: 1 })
    }

    it('dims the map while there, and letting go hides it, keeping the split for when it’s back', () => {
      const onHideMap = vi.fn()
      localStorage.setItem('jpc:list-share', '0.55')
      render(<Split onHideMap={onHideMap} />)
      dragTo(1000)
      expect(grid()).toHaveAttribute('data-snap', 'map')
      fireEvent.pointerUp(handle(), { pointerId: 1 })
      expect(onHideMap).toHaveBeenCalledTimes(1)
      expect(grid()).not.toHaveAttribute('data-snap')
      expect(localStorage.getItem('jpc:list-share')).toBe('0.55')
      expect(columns()).toBe(splitColumns(0.55))
    })

    it('takes a clear push: just past the map’s smallest only resizes', () => {
      const onHideMap = vi.fn()
      render(<Split onHideMap={onHideMap} />)
      dragTo(940)
      expect(grid()).not.toHaveAttribute('data-snap')
      fireEvent.pointerUp(handle(), { pointerId: 1 })
      expect(onHideMap).not.toHaveBeenCalled()
      expect(Number(localStorage.getItem('jpc:list-share'))).toBeCloseTo(1 - 360 / 1088, 3)
    })

    it('changes its mind when dragged back, and a cancelled drag leaves nothing behind', () => {
      const onHideMap = vi.fn()
      render(<Split onHideMap={onHideMap} />)
      dragTo(1000)
      fireEvent.pointerMove(handle(), { clientX: 700, pointerId: 1 })
      expect(grid()).not.toHaveAttribute('data-snap')
      fireEvent.pointerMove(handle(), { clientX: 1000, pointerId: 1 })
      fireEvent.pointerCancel(handle(), { pointerId: 1 })
      expect(grid()).not.toHaveAttribute('data-snap')
      expect(onHideMap).not.toHaveBeenCalled()
    })
  })

  it('is the same on every page showing it', () => {
    render(
      <>
        <Split />
        <Split />
      </>,
    )
    const [first, second] = screen.getAllByRole('separator')
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(second).toHaveAttribute('aria-valuenow', '53')
  })
})
