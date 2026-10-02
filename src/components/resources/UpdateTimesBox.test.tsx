// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeListing } from '@/test/providerFixtures'
import type { Minyan } from '@/lib/davening'
import { compareTimes, type ReadRegularTime, type RegularReading } from '@/lib/scheduleUpdate'
import UpdateTimesBox from './UpdateTimesBox'

vi.mock('./useListingSubmit', () => ({ TURNSTILE_ACTIVE: false }))
afterEach(() => cleanup())

const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const shul = makeListing({ id: ID, name: 'Mekor Habracha', category: 'synagogue' })
// Mekor Habracha's times as the guide has them.
const MEKOR: Minyan[] = [
  { id: 'm1', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
  { id: 'm2', tefillah: 'mincha_maariv', days: ['sat'], time: '30 min before Sunset', anchor: 'sunset', offsetMinutes: -30 },
  { id: 'm3', tefillah: 'mincha', days: ['sat'], time: '12:20pm', notes: 'Winter only- following Kiddush' },
  { id: 'm4', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', notes: 'Summer only' },
  { id: 'm5', tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0, notes: 'Winter only' },
]
const t = (x: Partial<ReadRegularTime> & Pick<ReadRegularTime, 'tefillah' | 'time'>): ReadRegularTime => ({ id: Math.random().toString(36), days: [], quote: 'q', checked: true, ...x })
const WINTER: RegularReading = {
  kind: 'schedule',
  complete: true,
  season: 'winter',
  title: 'Winter Schedule',
  startsOn: '2026-11-01',
  from: null,
  to: null,
  times: [
    t({ tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0 }),
    t({ tefillah: 'shacharis', days: ['sat'], time: '9:00am' }),
    t({ tefillah: 'mincha_maariv', days: ['sat'], time: '30 min before Sunset', anchor: 'sunset', offsetMinutes: -30 }),
    t({ tefillah: 'shacharis', days: ['sun'], time: '8:30am' }),
  ],
}
const BEREISHIS: RegularReading = {
  kind: 'week',
  complete: true,
  season: null,
  title: 'Shabbos Bereishis',
  startsOn: null,
  from: '2026-10-09',
  to: '2026-10-10',
  times: [
    t({ tefillah: 'mincha_maariv', date: '2026-10-09', time: '6:12pm' }),
    t({ tefillah: 'shacharis', date: '2026-10-10', time: '9:00am' }),
    t({ tefillah: 'mincha_maariv', date: '2026-10-10', time: '5:59pm' }),
  ],
}
const ZMANIM = { '2026-10-09': { sunset: 1110, candleLighting: 1092 }, '2026-10-10': { sunset: 1109 } }
const MESSAGE = 'Mekor Habracha – Winter Schedule\nShabbos: Shacharis 9:00am'

function setup(update: ReturnType<typeof compareTimes>) {
  const calls: { url: string; body: unknown }[] = []
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = String(url)
    calls.push({ url: u, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
    if (u === '/api/schedule/read') return new Response(JSON.stringify({ ok: true, update, sourceUrl: null }))
    return new Response(JSON.stringify({ ok: true }))
  })
  const onSent = vi.fn()
  render(<UpdateTimesBox item={shul} minyanim={MEKOR} onSent={onSent} onClose={() => {}} />)
  return { calls, fetchMock, onSent }
}

async function paste() {
  fireEvent.click(screen.getByRole('button', { name: /Paste their message/ }))
  fireEvent.change(screen.getByLabelText('Their message'), { target: { value: MESSAGE } })
  fireEvent.click(screen.getByRole('button', { name: 'Read the times' }))
  return screen.findByTestId('times-result')
}

const day = (heading: string) => screen.getAllByTestId('result-day').find((d) => d.textContent?.startsWith(heading.toUpperCase()) || within(d).queryByText(heading))!

describe('Update their times', () => {
  let restore: (() => void) | null = null
  beforeEach(() => (restore = null))
  afterEach(() => restore?.())

  it('a whole schedule: their week as it will show, each change marked, then Send with the message', async () => {
    const { calls, fetchMock, onSent } = setup(compareTimes(MEKOR, WINTER, { season: 'summer' }))
    restore = () => fetchMock.mockRestore()
    const result = await paste()
    expect(within(result).getByText('Mekor Habracha’s winter times, from Sun Nov 1')).toBeTruthy()
    expect(calls[0].body).toBeInstanceOf(FormData)
    expect((calls[0].body as FormData).get('kind')).toBe('regular')

    // Shabbos: 9:15 crossed out beside 9:00; 12:20 coming off, with Keep.
    const shabbos = day('Shabbos')
    expect(within(shabbos).getByText('9:15 AM').className).toContain('line-through')
    expect(within(shabbos).getByText('9 AM')).toBeTruthy()
    const gone = shabbos.querySelector('[data-status="gone"]')!
    expect(gone.textContent).toContain('Mincha · 12:20 PM')
    // Sunday's is new.
    expect(within(day('Sunday')).getByText('New')).toBeTruthy()
    // The summer time isn't on the screen; it stays as it is.
    expect(screen.queryByText('7 PM')).toBeNull()
    expect(screen.getByText('Their summer times stay as they are.')).toBeTruthy()

    fireEvent.click(within(gone as HTMLElement).getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledWith('sent'))
    const sent = calls.find((c) => c.url === `/api/resource/${ID}/times`)!.body as { update: { rows: { time: string; keep?: boolean }[] }; source: string }
    expect(sent.source).toBe(MESSAGE)
    expect(sent.update.rows.find((r) => r.time === '12:20pm')?.keep).toBe(true)
  })

  it('one Shabbos: matched clock times shown plainly, the changed one can become their usual time', async () => {
    const { calls, fetchMock } = setup(compareTimes(MEKOR, BEREISHIS, { season: 'summer', zmanim: ZMANIM }))
    restore = () => fetchMock.mockRestore()
    await paste()
    expect(screen.getByText('Mekor Habracha, Fri Oct 9 – Sat Oct 10')).toBeTruthy()
    expect(screen.getByText(/Other weeks stay as they are/)).toBeTruthy()
    expect(within(day('Friday · Oct 9')).getByText('6:12 PM')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Their usual time now? Change it every week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/times'))).toBe(true))
    const sent = calls.find((c) => c.url.endsWith('/times'))!.body as { update: { rows: { status: string; everyWeek?: boolean }[] } }
    expect(sent.update.rows.find((r) => r.status === 'changed')?.everyWeek).toBe(true)
  })

  it('tap a time to fix it: it shows as a change from what the shul had', async () => {
    const { fetchMock } = setup(compareTimes(MEKOR, WINTER, { season: 'summer' }))
    restore = () => fetchMock.mockRestore()
    await paste()
    fireEvent.click(screen.getByRole('button', { name: /Mincha & Maariv, 30 min before Sunset/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clock time' }))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '4:30pm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    const row = day('Shabbos').querySelectorAll('[data-status="changed"]')[1]
    expect(row.textContent).toContain('30 min before Sunset')
    expect(row.textContent).toContain('4:30 PM')
  })

  it('or add one time: their times as they are, and a time added there', async () => {
    const { calls, fetchMock } = setup(compareTimes(MEKOR, WINTER, { season: 'summer' }))
    restore = () => fetchMock.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: /Or add one time/ }))
    const editor = screen.getByTestId('row-editor')
    fireEvent.change(within(editor).getByLabelText('Day'), { target: { value: 'sun' } })
    fireEvent.change(within(editor).getByLabelText('Time'), { target: { value: '8:30am' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Done' }))
    expect(within(day('Sunday')).getByText('New')).toBeTruthy()
    // Every season's times are there, nothing coming off.
    expect(screen.getByText('7 PM')).toBeTruthy()
    expect(document.querySelector('[data-status="gone"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/times'))).toBe(true))
    expect(calls.some((c) => c.url === '/api/schedule/read')).toBe(false)
  })

  it('a message with nothing new says so, and confirms the times instead', async () => {
    const same = { ...BEREISHIS, complete: false, times: [BEREISHIS.times[0]] }
    const { calls, fetchMock, onSent } = setup(compareTimes(MEKOR, same, { season: 'summer', zmanim: ZMANIM }))
    restore = () => fetchMock.mockRestore()
    await paste()
    expect(screen.getByText('Everything matches what the guide has.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mark them confirmed' }))
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledWith('confirmed'))
    expect(calls.some((c) => c.url === `/api/resource/${ID}/confirm`)).toBe(true)
  })
})
