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

  it('shows the Clock/Relative toggle only for a relative-eligible tefillah (kabbalas_shabbos/mincha/maariv/mincha_maariv)', () => {
    render(<MinyanimInput value={[row({ tefillah: 'shacharis' })]} onChange={vi.fn()} />)
    expect(screen.queryByText('Sunset/Havdalah…')).not.toBeInTheDocument()

    cleanup()
    render(<MinyanimInput value={[row({ tefillah: 'mincha' })]} onChange={vi.fn()} />)
    expect(screen.getByText('Sunset/Havdalah…')).toBeInTheDocument()

    // Kabbalas Shabbos is commonly set relative to candle-lighting/sunset,
    // same as Mincha/Maariv — unlike Shacharis, which is always a clock
    // time in practice.
    cleanup()
    render(<MinyanimInput value={[row({ tefillah: 'kabbalas_shabbos' })]} onChange={vi.fn()} />)
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

  // ── Earliest/latest limits ──────────────────────────────────────────────
  //
  // The shtiebel case: Kabbalas Shabbos at candle lighting, never before
  // 5:00pm and never after 7:00pm.

  it('offers the limits only on a relative row, and only once expanded', async () => {
    const user = userEvent.setup()
    render(<MinyanimInput value={[row({ tefillah: 'mincha' })]} onChange={vi.fn()} />)

    // Clock mode: nothing on offer — a fixed time has nothing to clamp.
    expect(screen.queryByText('+ Add earliest/latest limits')).not.toBeInTheDocument()

    await user.click(screen.getByText('Sunset/Havdalah…'))
    expect(screen.queryByLabelText('Earliest time')).not.toBeInTheDocument()

    await user.click(screen.getByText('+ Add earliest/latest limits'))
    expect(screen.getByLabelText('Earliest time')).toBeInTheDocument()
    expect(screen.getByLabelText('Latest time')).toBeInTheDocument()
  })

  it('folds a window into the generated time text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MinyanimInput value={[row({ tefillah: 'kabbalas_shabbos' })]} onChange={onChange} />)

    await user.click(screen.getByText('Sunset/Havdalah…'))
    await user.selectOptions(screen.getByDisplayValue('Sunset'), 'candle_lighting')
    await user.click(screen.getByText('+ Add earliest/latest limits'))

    await user.type(screen.getByLabelText('Earliest time'), '17:00')
    await user.type(screen.getByLabelText('Latest time'), '19:00')

    const last = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(last[0]).toMatchObject({
      anchor: 'candle_lighting',
      notBefore: '17:00',
      notAfter: '19:00',
      time: 'At Candle Lighting (between 5:00 PM and 7:00 PM)',
    })
  })

  // Regression: formatAnchorRule rebuilds `time` wholesale, so an offset edit
  // that forgot to pass the bounds silently dropped the window from the text
  // while leaving the fields set — the row would then read as unbounded
  // everywhere the app shows `time`, including the moderation diff.
  it('keeps the window in the text when the offset is edited afterwards', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MinyanimInput
        value={[
          row({
            tefillah: 'kabbalas_shabbos',
            anchor: 'candle_lighting',
            offsetMinutes: 0,
            notBefore: '17:00',
            notAfter: '19:00',
            time: 'At Candle Lighting (between 5:00 PM and 7:00 PM)',
          }),
        ]}
        onChange={onChange}
      />,
    )

    const offsetInput = screen.getByLabelText('Offset in minutes')
    await user.clear(offsetInput)
    await user.type(offsetInput, '10')

    const last = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(last[0]).toMatchObject({
      offsetMinutes: -10,
      notBefore: '17:00',
      notAfter: '19:00',
      time: '10 min before Candle Lighting (between 5:00 PM and 7:00 PM)',
    })
  })

  it('opens already-expanded for a row that has a stored limit', () => {
    render(
      <MinyanimInput
        value={[row({ tefillah: 'mincha', anchor: 'sunset', offsetMinutes: 0, notAfter: '19:00' })]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Latest time')).toBeInTheDocument()
  })

  it('clears both bounds and the text when the limits are removed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MinyanimInput
        value={[
          row({
            tefillah: 'mincha',
            anchor: 'sunset',
            offsetMinutes: 0,
            notBefore: '17:00',
            notAfter: '19:00',
            time: 'At Sunset (between 5:00 PM and 7:00 PM)',
          }),
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByText('Remove limits'))

    const last = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(last[0]).toMatchObject({ notBefore: undefined, notAfter: undefined, time: 'At Sunset' })
  })

  it('drops the bounds when the row goes back to a fixed clock time', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MinyanimInput
        value={[
          row({
            tefillah: 'mincha',
            time: '5:15pm',
          }),
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByText('Sunset/Havdalah…'))
    await user.click(screen.getByText('+ Add earliest/latest limits'))
    await user.type(screen.getByLabelText('Latest time'), '19:00')
    await user.click(screen.getByText('Clock time'))

    const last = onChange.mock.calls.at(-1)![0] as Minyan[]
    expect(last[0]).toMatchObject({ time: '5:15pm', notBefore: undefined, notAfter: undefined })
  })

  it('renders a label when provided', () => {
    render(<MinyanimInput label="Minyan Schedule" value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Minyan Schedule')).toBeInTheDocument()
  })
})
