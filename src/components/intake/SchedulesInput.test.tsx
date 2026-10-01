// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import SchedulesInput from './SchedulesInput'
import type { Festival } from '@/lib/festivals'

afterEach(() => cleanup())

const sukkos: Festival = {
  festival: 'Sukkos',
  name: 'Sukkos 5787',
  from: '2026-09-26',
  to: '2026-10-04',
  days: [
    { date: '2026-09-26', yomTov: true, cholHamoed: false, name: 'Sukkos', festival: 'Sukkos' },
    { date: '2026-09-28', yomTov: false, cholHamoed: true, name: 'Chol HaMoed', festival: 'Sukkos' },
    { date: '2026-10-02', yomTov: false, cholHamoed: true, name: 'Hoshana Rabbah', festival: 'Sukkos' },
    { date: '2026-10-03', yomTov: true, cholHamoed: false, name: 'Shemini Atzeres', festival: 'Sukkos' },
  ],
}

describe('special times for a Yom Tov, typed in (step 4)', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, festivals: [sukkos] })))
  })
  afterEach(() => fetchMock.mockRestore())

  it('starts from the festival: its name and dates filled in, its days to pick from', async () => {
    const onChange = vi.fn()
    render(<SchedulesInput value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Special times for a Yom Tov' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sukkos 5787 · Sep 26 – Oct 4' }))

    const form = screen.getByTestId('schedule-form')
    expect(within(form).getByLabelText('Name')).toHaveValue('Sukkos 5787')
    expect(within(form).getByLabelText('From')).toHaveValue('2026-09-26')
    const row = within(form).getByTestId('schedule-row')
    // Its days, named: Yom Tov days, Chol HaMoed, each date.
    expect(within(row).getByRole('button', { name: 'Yom Tov days' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(row).getByRole('button', { name: 'Fri Oct 2 · Hoshana Rabbah' })).toBeInTheDocument()

    // Not saved until it has a time.
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Sukkos 5787', minyanim: [] })])
    fireEvent.change(within(row).getByLabelText('Time'), { target: { value: '9:00am' } })
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'Sukkos 5787', from: '2026-09-26', to: '2026-10-04', mode: 'replace', minyanim: [expect.objectContaining({ tefillah: 'shacharis', on: ['yom_tov'], time: '9:00am' })] }),
    ])
  })

  it('a time with no day picked isn’t saved', async () => {
    const onChange = vi.fn()
    render(<SchedulesInput value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Special times for a Yom Tov' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sukkos 5787 · Sep 26 – Oct 4' }))
    const row = screen.getByTestId('schedule-row')
    fireEvent.click(within(row).getByRole('button', { name: 'Yom Tov days' }))
    fireEvent.change(within(row).getByLabelText('Time'), { target: { value: '9:00am' } })
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ minyanim: [] })])
  })

  it('in place of the regular times, or as well as them', async () => {
    const onChange = vi.fn()
    render(<SchedulesInput value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Special times for a Yom Tov' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sukkos 5787 · Sep 26 – Oct 4' }))
    fireEvent.click(screen.getByRole('radio', { name: 'As well as them' }))
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ mode: 'add' })])
  })
})
