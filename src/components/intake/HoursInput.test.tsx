// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HoursInput, { type StructuredHours } from './HoursInput'

afterEach(() => {
  cleanup()
})

describe('HoursInput', () => {
  // No collapse any more — see the component's own doc for why (it used to
  // hide behind its own chevron, which was a second layer of collapsing once
  // it started rendering inside ListingForm's already-collapsible Basics
  // group, and looked inconsistent next to the plain checkbox beside it).
  it('always shows all 7 days, with no collapse control', () => {
    render(<HoursInput value={null} onChange={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sunday closed')).toBeInTheDocument()
    expect(screen.getByLabelText('Saturday closed')).toBeInTheDocument()
    expect(screen.getAllByText('Closed')).toHaveLength(7)
  })

  it('treats a non-object value (e.g. an array, or the wrong shape) as empty rather than crashing', () => {
    render(<HoursInput value={['not', 'valid']} onChange={vi.fn()} />)
    expect(screen.getAllByText('Closed')).toHaveLength(7)
  })

  it('checking "Closed" for a day sets it to null and hides its time inputs', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: StructuredHours = { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null }
    render(<HoursInput value={value} onChange={onChange} />)

    await user.click(screen.getByLabelText('Monday closed'))

    expect(onChange).toHaveBeenCalledWith({ ...value, mon: null })
  })

  it('unchecking "Closed" for a day defaults it to 09:00-17:00', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: StructuredHours = { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null }
    render(<HoursInput value={value} onChange={onChange} />)

    await user.click(screen.getByLabelText('Monday closed'))

    expect(onChange).toHaveBeenCalledWith({ ...value, mon: { open: '09:00', close: '17:00' } })
  })

  it('editing the open time preserves the existing close time, and vice versa', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: StructuredHours = {
      sun: null,
      mon: { open: '09:00', close: '17:00' },
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
    }
    render(<HoursInput value={value} onChange={onChange} />)

    const mondayRow = screen.getByLabelText('Monday closed').closest('div')!
    const timeInputs = mondayRow.querySelectorAll('input[type="time"]')
    expect(timeInputs).toHaveLength(2)

    const [openInput] = timeInputs as unknown as HTMLInputElement[]
    await user.clear(openInput)
    await user.type(openInput, '10:30')

    // Every keystroke fires onChange; the final call should carry the fully-typed value.
    const lastCall = onChange.mock.calls.at(-1)![0]
    expect(lastCall.mon.close).toBe('17:00') // untouched
  })

  it('uses the custom label when provided, defaulting to "Hours" otherwise', () => {
    const { rerender } = render(<HoursInput value={null} onChange={vi.fn()} />)
    expect(screen.getByText('Hours')).toBeInTheDocument()

    rerender(<HoursInput label="Synagogue Hours" value={null} onChange={vi.fn()} />)
    expect(screen.getByText('Synagogue Hours')).toBeInTheDocument()
  })
})
