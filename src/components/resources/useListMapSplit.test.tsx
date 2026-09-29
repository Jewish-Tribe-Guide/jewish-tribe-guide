// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { clampShare, splitColumns, useListMapSplit } from './useListMapSplit'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** List, line, map, as GenericDirectory lays them out, `width` px wide. */
function Split({ width = 1120 }: { width?: number }) {
  const { gridRef, gridStyle, handleProps } = useListMapSplit()
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
