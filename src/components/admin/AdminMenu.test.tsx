// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AdminMenu } from './AdminUI'
import { CLICK_AFTER_RELEASE_MS } from '@/lib/swallowClick'

afterEach(cleanup)

// Real bug, Nov 4: with a menu open, tapping elsewhere closed it and also
// clicked what was underneath (a To do or Places row opened).
function setup() {
  const underneath = vi.fn()
  render(
    <>
      <AdminMenu
        name="Sort"
        value="old"
        options={[
          { value: 'old', label: 'Oldest first' },
          { value: 'new', label: 'Newest first' },
        ]}
        onChange={() => {}}
      />
      <button onClick={underneath}>A row</button>
    </>,
  )
  return { underneath }
}

function tap(el: Element) {
  fireEvent.pointerDown(el)
  fireEvent.pointerUp(el)
  fireEvent.click(el)
}

describe('AdminMenu, a press outside', () => {
  it('closes the menu without clicking what is under it', async () => {
    const { underneath } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    tap(screen.getByText('A row'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(underneath).not.toHaveBeenCalled()

    // The swallow is for that one press only.
    await new Promise((r) => setTimeout(r, 0))
    tap(screen.getByText('A row'))
    expect(underneath).toHaveBeenCalledTimes(1)
  })

  // Still on a real iPhone, Nov 5: there the click comes a moment after the
  // finger lifts, by which time the swallow had already ended.
  it('swallows a click that comes a while after the finger lifts', async () => {
    const { underneath } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    const row = screen.getByText('A row')
    fireEvent.pointerDown(row)
    fireEvent.pointerUp(row)
    await new Promise((r) => setTimeout(r, 300))
    fireEvent.click(row)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(underneath).not.toHaveBeenCalled()

    // A press with no click after it leaves the next tap alone once it's over.
    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    fireEvent.pointerDown(row)
    fireEvent.pointerUp(row)
    await new Promise((r) => setTimeout(r, CLICK_AFTER_RELEASE_MS + 50))
    tap(row)
    expect(underneath).toHaveBeenCalledTimes(1)
  })

  it('leaves the next click alone when the press became a scroll', async () => {
    const { underneath } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    const row = screen.getByText('A row')
    fireEvent.pointerDown(row)
    fireEvent.pointerCancel(row)
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.click(row)
    expect(underneath).toHaveBeenCalledTimes(1)
  })

  it('a pick inside still works', () => {
    const onChange = vi.fn()
    render(<AdminMenu name="Sort" value="old" options={[{ value: 'old', label: 'Oldest first' }, { value: 'new', label: 'Newest first' }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    tap(screen.getByRole('menuitemradio', { name: 'Newest first' }))
    expect(onChange).toHaveBeenCalledWith('new')
  })
})
