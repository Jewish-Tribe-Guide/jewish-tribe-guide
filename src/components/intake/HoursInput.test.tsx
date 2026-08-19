// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HoursInput, { type StructuredHours } from './HoursInput'

afterEach(() => {
  cleanup()
})

describe('HoursInput', () => {
  it('starts collapsed and shows no day count when there are no hours set', () => {
    render(<HoursInput value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
    expect(screen.queryByText(/day.*week set/)).not.toBeInTheDocument()
  })

  it('shows a "N days/week set" summary while collapsed, using correct singular/plural', () => {
    const oneDayValue: StructuredHours = { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null }
    render(<HoursInput value={oneDayValue} onChange={vi.fn()} />)
    expect(screen.getByText('1 day/week set')).toBeInTheDocument()

    cleanup()
    const twoDayValue: StructuredHours = {
      sun: null,
      mon: { open: '09:00', close: '17:00' },
      tue: { open: '09:00', close: '17:00' },
      wed: null,
      thu: null,
      fri: null,
      sat: null,
    }
    render(<HoursInput value={twoDayValue} onChange={vi.fn()} />)
    expect(screen.getByText('2 days/week set')).toBeInTheDocument()
  })

  it('treats a non-object value (e.g. an array, or the wrong shape) as empty rather than crashing', () => {
    render(<HoursInput value={['not', 'valid']} onChange={vi.fn()} />)
    expect(screen.queryByText(/day.*week set/)).not.toBeInTheDocument()
  })

  it('auto-opens when hours are pushed in from outside (e.g. a Google Places pre-fill), but not on first render with hours already present', () => {
    const initial: StructuredHours = { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null }
    const { rerender } = render(<HoursInput value={initial} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()

    const filled: StructuredHours = { ...initial, mon: { open: '09:00', close: '17:00' } }
    rerender(<HoursInput value={filled} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
  })

  it('toggles open when the header is clicked, revealing all 7 days', async () => {
    const user = userEvent.setup()
    render(<HoursInput value={null} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button'))

    // Visible day labels are 3-letter abbreviations (space-constrained —
    // see HoursInput's own comment on why); the full name still exists via
    // each checkbox's aria-label, which is what this checks instead of the
    // (now abbreviated) visible text.
    expect(screen.getByLabelText('Sunday closed')).toBeInTheDocument()
    expect(screen.getByLabelText('Saturday closed')).toBeInTheDocument()
    expect(screen.getAllByText('Closed')).toHaveLength(7)
  })

  it('checking "Closed" for a day sets it to null and hides its time inputs', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: StructuredHours = { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null }
    render(<HoursInput value={value} onChange={onChange} />)

    await user.click(screen.getByRole('button')) // expand

    await user.click(screen.getByLabelText('Monday closed'))

    expect(onChange).toHaveBeenCalledWith({ ...value, mon: null })
  })

  it('unchecking "Closed" for a day defaults it to 09:00-17:00', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: StructuredHours = { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null }
    render(<HoursInput value={value} onChange={onChange} />)

    await user.click(screen.getByRole('button')) // expand

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
    await user.click(screen.getByRole('button')) // expand

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
