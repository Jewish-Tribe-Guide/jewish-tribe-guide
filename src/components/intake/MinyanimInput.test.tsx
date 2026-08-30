// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Minyan } from '@/lib/davening'
import MinyanimInput from './MinyanimInput'

afterEach(() => {
  cleanup()
})

function row(overrides: Partial<Minyan> = {}): Minyan {
  return { id: 'row-1', tefillah: 'shacharis', days: [], time: '7:00am', ...overrides }
}

describe('MinyanimInput', () => {
  it('shows the empty state and adds a fresh row on "+ Add minyan"', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[]} onChange={onChange} />)

    expect(screen.getByText('No minyanim added yet.')).toBeInTheDocument()

    await user.click(screen.getByText('+ Add minyan'))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ tefillah: 'shacharis', days: [], time: '' }),
    ])
  })

  it('treats a non-Minyan[] value (e.g. legacy free-text) as empty rather than crashing', () => {
    render(<MinyanimInput value="7:00am daily" onChange={vi.fn()} />)
    expect(screen.getByText('No minyanim added yet.')).toBeInTheDocument()
  })

  it('backfills a missing id so rows are independently editable', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // No `id` on the stored row (predates the field).
    render(<MinyanimInput value={[{ tefillah: 'shacharis', days: [], time: '7:00am' }]} onChange={onChange} />)

    await user.click(screen.getByLabelText('Remove minyan'))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('deduplicates two rows that coincidentally share an id, so editing one never silently edits the other', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MinyanimInput
        value={[
          { id: 'dup', tefillah: 'shacharis', days: [], time: '7:00am' },
          { id: 'dup', tefillah: 'mincha', days: [], time: '5:00pm' },
        ]}
        onChange={onChange}
      />,
    )

    const removeButtons = screen.getAllByLabelText('Remove minyan')
    expect(removeButtons).toHaveLength(2)

    await user.click(removeButtons[0])

    // Only the first row (now uniquely id'd) should be gone — the second survives.
    const remaining = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(remaining).toHaveLength(1)
    expect(remaining[0].tefillah).toBe('mincha')
  })

  it('toggling a day chip adds/removes it from the row', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[row()]} onChange={onChange} />)

    await user.click(screen.getByRole('checkbox', { name: 'Mon' }))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ days: ['mon'] })])

    await user.click(screen.getByRole('checkbox', { name: 'Mon' }))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ days: [] })])
  })

  it('editing the notes field updates the row, clearing to undefined rather than an empty string', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[row()]} onChange={onChange} />)

    const notesInput = screen.getByPlaceholderText('Notes (optional)')
    await user.type(notesInput, 'x')
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ notes: 'x' })])

    await user.clear(notesInput)
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ notes: undefined })])
  })

  it('shows the Clock/Relative toggle only for a relative-eligible tefillah (mincha/maariv/mincha_maariv)', () => {
    render(<MinyanimInput value={[row({ tefillah: 'shacharis' })]} onChange={vi.fn()} />)
    expect(screen.queryByText('Sunset/Havdalah…')).not.toBeInTheDocument()

    cleanup()
    render(<MinyanimInput value={[row({ tefillah: 'mincha' })]} onChange={vi.fn()} />)
    expect(screen.getByText('Sunset/Havdalah…')).toBeInTheDocument()
  })

  it('switching to Relative mode computes offsetMinutes and the display time from anchor + direction', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[row({ tefillah: 'mincha' })]} onChange={onChange} />)

    await user.click(screen.getByText('Sunset/Havdalah…'))

    const lastCall = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(lastCall[0].anchor).toBe('sunset')
    expect(lastCall[0].offsetMinutes === 0).toBe(true) // may be -0, which === 0 is still true for
    expect(lastCall[0].time).toBe('At Sunset')
  })

  it('a "before" offset is stored as a negative number; "after" as positive', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[row({ tefillah: 'mincha' })]} onChange={onChange} />)
    await user.click(screen.getByText('Sunset/Havdalah…'))

    const offsetInput = screen.getByLabelText('Offset in minutes')
    await user.clear(offsetInput)
    await user.type(offsetInput, '20')

    let lastCall = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(lastCall[0]).toMatchObject({ offsetMinutes: -20, time: '20 min before Sunset' })

    const directionSelect = screen.getByDisplayValue('before')
    await user.selectOptions(directionSelect, 'after')

    lastCall = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(lastCall[0]).toMatchObject({ offsetMinutes: 20, time: '20 min after Sunset' })
  })

  it('switching back to Clock time restores the clock value it had before going relative', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[row({ tefillah: 'mincha', time: '5:15pm' })]} onChange={onChange} />)

    await user.click(screen.getByText('Sunset/Havdalah…'))
    await user.click(screen.getByText('Clock time'))

    const lastCall = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(lastCall[0]).toMatchObject({ time: '5:15pm', anchor: undefined, offsetMinutes: undefined })
  })

  it('picking a non-relative-eligible tefillah on an already-relative row drops it back to clock mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MinyanimInput
        value={[row({ tefillah: 'mincha', anchor: 'sunset', offsetMinutes: -10, time: '10 min before Sunset' })]}
        onChange={onChange}
      />,
    )

    const tefillahSelect = screen.getByDisplayValue('Mincha')
    await user.selectOptions(tefillahSelect, 'shacharis')

    const lastCall = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(lastCall[0].tefillah).toBe('shacharis')
    expect(lastCall[0].anchor).toBeUndefined()
  })

  it('removing a row removes only that row, leaving others untouched', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MinyanimInput
        value={[row({ id: 'a', tefillah: 'shacharis' }), row({ id: 'b', tefillah: 'maariv' })]}
        onChange={onChange}
      />,
    )

    const removeButtons = screen.getAllByLabelText('Remove minyan')
    await user.click(removeButtons[0])

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })])
  })

  // Season as a field rather than prose in Notes, which is where "Winter only"
  // has always been typed and where nothing could act on it. The changeover
  // itself is never asked for — it's derived from the community timezone (see
  // lib/season.ts) — so this is the only input a shul ever gives.
  it('sets a season on a row, and clears it back to all year', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[row({ id: 'a', tefillah: 'maariv' })]} onChange={onChange} />)

    await user.selectOptions(screen.getByLabelText('Season'), 'winter')
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ season: 'winter' })])

    onChange.mockClear()
    render(<MinyanimInput value={[row({ id: 'a', tefillah: 'maariv', season: 'winter' })]} onChange={onChange} />)
    await user.selectOptions(screen.getAllByLabelText('Season')[1], '')
    // Absent, not the empty string — "all year" is the absence of a season.
    expect(onChange.mock.calls.at(-1)![0][0].season).toBeUndefined()
  })

  it('renders a label when provided', () => {
    render(<MinyanimInput label="Minyan Schedule" value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Minyan Schedule')).toBeInTheDocument()
  })
})
