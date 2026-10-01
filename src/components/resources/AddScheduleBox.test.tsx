// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeListing } from '@/test/providerFixtures'
import AddScheduleBox from './AddScheduleBox'

vi.mock('./useListingSubmit', () => ({ TURNSTILE_ACTIVE: false }))
afterEach(() => cleanup())

const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const shul = makeListing({ id: ID, name: 'Kesher Israel', category: 'synagogue' })
const festivals = [
  {
    festival: 'Sukkos',
    name: 'Sukkos 5787',
    from: '2026-09-26',
    to: '2026-10-04',
    days: [
      { date: '2026-09-26', yomTov: true, cholHamoed: false, name: 'Sukkos', festival: 'Sukkos' },
      { date: '2026-10-04', yomTov: true, cholHamoed: false, name: 'Simchas Torah', festival: 'Sukkos' },
    ],
  },
]
const reading = {
  ok: true,
  schedule: {
    id: 's',
    name: 'Sukkos 5787',
    from: '2026-09-26',
    to: '2026-10-04',
    mode: 'replace',
    minyanim: [
      { id: 'a', tefillah: 'shacharis', on: ['2026-09-26'], time: '9:00am' },
      { id: 'b', tefillah: 'other', on: ['2026-10-04'], time: '7:30pm', notes: 'Hakafos' },
    ],
  },
  times: [
    { id: 'a', tefillah: 'shacharis', on: ['2026-09-26'], time: '9:00am', quote: 'Shacharis 9:00', checked: true },
    { id: 'b', tefillah: 'other', on: ['2026-10-04'], time: '7:30pm', notes: 'Hakafos', quote: 'Hakafos after Maariv 7:30', checked: true, unsure: 'Whether 7:30 is Maariv or Hakafos.' },
  ],
  missing: 'No Mincha times for Simchas Torah.',
  sourceUrl: null,
}
const MESSAGE = 'Yom Tov: Shacharis 9:00\nSimchas Torah: Hakafos after Maariv 7:30'

describe('Add them: paste their message (step 4)', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url)
      if (u === '/api/festivals') return new Response(JSON.stringify({ ok: true, festivals }))
      if (u === '/api/schedule/read') return new Response(JSON.stringify(reading))
      return new Response(JSON.stringify({ ok: true }))
    })
  })
  afterEach(() => fetchMock.mockRestore())

  it('reads it into times to check, each under its own words, the unclear one flagged, then sends it with the message', async () => {
    const onSent = vi.fn()
    render(<AddScheduleBox item={shul} festival="Sukkos" onSent={onSent} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Paste their message/ }))
    fireEvent.change(screen.getByLabelText('Their message'), { target: { value: MESSAGE } })
    fireEvent.click(screen.getByRole('button', { name: 'Read the times' }))

    const read = await screen.findByTestId('schedule-read')
    expect(read).toHaveTextContent('What you pasted')
    expect(read).toHaveTextContent('No Mincha times for Simchas Torah. Those days show “not posted”, not a guess.')
    const sources = screen.getAllByTestId('schedule-row-source').map((p) => p.textContent)
    expect(sources).toEqual(['From “Shacharis 9:00”', 'From “Hakafos after Maariv 7:30”Check: Whether 7:30 is Maariv or Hakafos.'])
    const [, form] = fetchMock.mock.calls.find(([u]: [unknown]) => String(u) === '/api/schedule/read')!
    expect((form!.body as FormData).get('text')).toBe(MESSAGE)
    expect((form!.body as FormData).get('festival')).toBe('Sukkos')

    // The person settles the flagged one: it's Maariv.
    const rows = screen.getAllByTestId('schedule-row')
    fireEvent.change(within(rows[1]).getByLabelText('Tefillah'), { target: { value: 'maariv' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send for a check' }))
    await vi.waitFor(() => expect(onSent).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(url).toBe(`/api/resource/${ID}/schedule`)
    const sent = JSON.parse(String(init!.body))
    expect(sent.source).toBe(MESSAGE)
    expect(sent.schedule.minyanim.map((x: { tefillah: string; time: string }) => [x.tefillah, x.time])).toEqual([
      ['shacharis', '9:00am'],
      ['maariv', '7:30pm'],
    ])
  })

  it('where reading isn’t available, straight to typing them in', async () => {
    fetchMock.mockImplementation(async (url: unknown) =>
      String(url) === '/api/festivals'
        ? new Response(JSON.stringify({ ok: true, festivals }))
        : new Response(JSON.stringify({ ok: false, code: 'off', error: 'Reading a schedule isn’t available here. Type the times in instead.' }), { status: 503 }),
    )
    render(<AddScheduleBox item={shul} festival="Sukkos" onSent={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Paste their message/ }))
    fireEvent.change(screen.getByLabelText('Their message'), { target: { value: MESSAGE } })
    fireEvent.click(screen.getByRole('button', { name: 'Read the times' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Type the times in instead.')
    expect(await screen.findByTestId('schedule-form')).toBeInTheDocument()
  })
})
