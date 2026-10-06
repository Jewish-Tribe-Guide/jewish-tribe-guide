// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import DaveningCard from './DaveningCard'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
// This week, as the calendar has it: Chol HaMoed Thursday, Hoshana Rabbah
// Friday, Shemini Atzeres on Shabbos, Simchas Torah Sunday.
vi.mock('@/lib/useZmanim', () => ({
  useZmanim: () => ({
    status: 'ready',
    data: {
      isYomTov: false,
      daysThrough: '2026-10-07',
      days: [
        { date: '2026-10-01', yomTov: false, cholHamoed: true, name: 'Chol HaMoed', festival: 'Sukkos' },
        { date: '2026-10-02', yomTov: false, cholHamoed: true, name: 'Hoshana Rabbah', festival: 'Sukkos' },
        { date: '2026-10-03', yomTov: true, cholHamoed: false, name: 'Shemini Atzeres', festival: 'Sukkos' },
        { date: '2026-10-04', yomTov: true, cholHamoed: false, name: 'Simchas Torah', festival: 'Sukkos' },
      ],
    },
  }),
}))

afterEach(() => cleanup())

const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const minyanim = [
  { id: 'r1', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '7:00am' },
  { id: 'r2', tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '7:45pm' },
]
const sukkos = {
  id: 's1',
  name: 'Sukkos 5787',
  from: '2026-09-26',
  to: '2026-10-04',
  mode: 'replace',
  minyanim: [
    { id: 'a', tefillah: 'shacharis', on: ['chol_hamoed'], time: '6:45am' },
    { id: 'b', tefillah: 'mincha_maariv', on: ['chol_hamoed'], time: '6:30pm' },
    { id: 'c', tefillah: 'shacharis', on: ['yom_tov'], time: '9:00am', notes: 'Yizkor on Shemini Atzeres' },
  ],
}

describe('a shul’s card over Yom Tov (step 4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T17:30:00-04:00')) // Thu Oct 1, 5:30 PM, Chol HaMoed
  })
  afterEach(() => vi.useRealTimers())

  it('with its schedule: a box of the schedule’s times, saying whose and until when, the usual times folded under it', () => {
    const shul = makeListing({ id: 'k', name: 'Mekor Habracha', category: 'synagogue', minyanim, minyanim_schedules: [sukkos] })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} schedules={[sukkos]} category={shuls} />, { content: { categories: [shuls] } })
    const box = screen.getByTestId('davening-special-box')
    expect(within(box).getByRole('heading', { name: 'Sukkos 5787' })).toBeInTheDocument()
    expect(within(box).getByTestId('davening-special')).toHaveTextContent('In place of their usual times until Sun Oct 4')
    expect(box).toHaveTextContent('Mincha & Maariv6:30 PM')
    expect(within(box).getByTestId('davening-special-all')).toHaveTextContent('Yom Tov daysShacharis9 AM · Yizkor on Shemini Atzeres')
    // The usual weekday times, folded: not 7:45 PM until asked.
    const folded = screen.getByTestId('davening-folded')
    expect(folded).toHaveTextContent('Usual weekday timesNot now: the Sukkos 5787 times above replace them')
    expect(screen.getByTestId('listing-davening')).not.toHaveTextContent('7:45 PM')
    fireEvent.click(folded)
    expect(screen.getByTestId('davening-weekday')).toHaveTextContent('7:45 PM')
  })

  it('without one: the regular times, marked “may not apply”, and a way to add them', () => {
    const shul = makeListing({ id: 'k', name: 'Kesher Israel', category: 'synagogue', minyanim })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} category={shuls} />, { content: { categories: [shuls] } })
    const note = screen.getByTestId('davening-not-posted')
    expect(note).toHaveTextContent('Sukkos times not posted')
    expect(note).toHaveTextContent('These are their usual times. They may not apply during Sukkos.')
    expect(within(note).getByRole('button', { name: 'Know their Sukkos times? Add them' })).toBeInTheDocument()
    expect(screen.getByTestId('listing-davening')).toHaveTextContent('7:45 PM')
  })

  it('no way to add them where edits are off', () => {
    const closed = makeCategory({ ...shuls, capabilities: { add: true, report: true, directorySearch: true, map: true, edit: false } })
    const shul = makeListing({ id: 'k', name: 'Kesher Israel', category: 'synagogue', minyanim })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} category={closed} />, { content: { categories: [closed] } })
    expect(within(screen.getByTestId('davening-not-posted')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('any day: “Update their times” opens the paste / photo / one time choice, and isn’t there where edits are off', () => {
    vi.setSystemTime(new Date('2026-10-06T09:00:00-04:00'))
    const shul = makeListing({ id: 'k', name: 'Kesher Israel', category: 'synagogue', minyanim })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} category={shuls} />, { content: { categories: [shuls] } })
    fireEvent.click(screen.getByRole('button', { name: 'Update their times' }))
    const box = screen.getByTestId('update-times')
    expect(within(box).getByRole('button', { name: /Paste their message/ })).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: /Add a photo or PDF/ })).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: /Or add one time/ })).toBeInTheDocument()
    cleanup()
    const closed = makeCategory({ ...shuls, capabilities: { add: true, report: true, directorySearch: true, map: true, edit: false } })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} category={closed} />, { content: { categories: [closed] } })
    expect(screen.queryByRole('button', { name: 'Update their times' })).not.toBeInTheDocument()
  })

  it('after the festival: plainly the regular times', () => {
    vi.setSystemTime(new Date('2026-10-06T09:00:00-04:00'))
    const shul = makeListing({ id: 'k', name: 'Kesher Israel', category: 'synagogue', minyanim, minyanim_schedules: [sukkos] })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} schedules={[sukkos]} category={shuls} />, { content: { categories: [shuls] } })
    expect(screen.queryByTestId('davening-not-posted')).not.toBeInTheDocument()
    expect(screen.queryByTestId('davening-special')).not.toBeInTheDocument()
  })
})

// Oct 6: “Davening times” becomes the shul's usual times in two boxes: the
// week as one small table, today marked, and Shabbos in the order it
// happens; Shabbos first from Thursday evening. Production's times.
describe('a shul’s usual times, two boxes (Oct 6)', () => {
  afterEach(() => vi.useRealTimers())
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
  }
  const lowerMerion = [
    { id: 'a', tefillah: 'shacharis', days: ['sun'], time: '7:30am' },
    { id: 'b', tefillah: 'shacharis', days: ['sun'], time: '8:30am' },
    { id: 'c', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
    { id: 'd', tefillah: 'shacharis', days: ['tue', 'wed', 'fri'], time: '7:00am' },
    { id: 'e', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '8:00am' },
    { id: 'f', tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '10 min before Sunset', anchor: 'sunset', offsetMinutes: -10 },
  ]
  const mekor = [
    { id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
    { id: 'b', tefillah: 'mincha_maariv', days: ['sat'], time: '30 min before Sunset', anchor: 'sunset', offsetMinutes: -30 },
    { id: 'c', tefillah: 'mincha', days: ['sat'], time: '12:20pm', season: 'winter', notes: 'following Kiddush' },
    { id: 'd', tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0, notAfter: '7:00 PM' },
    { id: 'e', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
  ]
  const rodeph = [
    { id: 'a', tefillah: 'shacharis', days: ['sat'], time: '10:45am', notes: 'Ends at 12:15pm' },
    { id: 'b', tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm', notes: 'Ends at 7:30pm' },
  ]
  const show = (times: unknown[]) => {
    const shul = makeListing({ id: 'k', name: 'Shul', category: 'synagogue', minyanim: times })
    renderWithProviders(<DaveningCard item={shul} minyanim={times} category={shuls} />, { content: { categories: [shuls] } })
  }
  const boxes = () => [...screen.getByTestId('listing-davening').querySelectorAll('[data-testid="davening-weekday"], [data-testid="davening-shabbos"]')].map((e) => e.getAttribute('data-testid'))

  it('the week as one table, days with the same times on one row, today marked; Shabbos not listed, said so, with Add', () => {
    at('2026-10-06T17:30:00-04:00') // Tue
    show(lowerMerion)
    const table = screen.getByTestId('davening-week-table')
    expect([...table.querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual([
      'Sun7:30, 8:30 AM10 min before sunset',
      'Mon, Thu6:45, 8 AM10 min before sunset',
      'Tue, WedToday7, 8 AM10 min before sunset',
      'Fri7, 8 AM—',
    ])
    expect(table.querySelector('[data-today]')).toHaveTextContent(/^Tue, Wed/)
    // No more switching between today-and-tomorrow and the week.
    expect(screen.queryByRole('button', { name: /The whole week|Today and tomorrow/ })).not.toBeInTheDocument()
    const shabbos = screen.getByTestId('davening-shabbos')
    expect(shabbos).toHaveTextContent('Usual Shabbos timesTheir Shabbos times aren’t listed yet. If you’ve davened there, add them.')
    fireEvent.click(within(shabbos).getByRole('button', { name: 'Add their Shabbos times' }))
    expect(screen.getByTestId('update-times')).toBeInTheDocument()
  })

  it('Shabbos in the order it happens, written as the shul gives it, this season’s; first from Thursday evening', () => {
    at('2026-10-08T19:00:00-04:00') // Thu, 7 PM
    show(mekor)
    expect(boxes()).toEqual(['davening-shabbos', 'davening-weekday'])
    expect([...screen.getByTestId('davening-shabbos-lines').children].map((l) => l.textContent)).toEqual([
      'Friday nightMincha & Maariv at candle lighting, never after 7 PM',
      'Shabbos morningShacharis 9:15 AM',
      'AfternoonMincha & Maariv 30 min before sunset',
    ])
    expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('In winter, also Mincha 12:20 PM, following Kiddush.')
    cleanup()
    at('2026-10-06T17:30:00-04:00') // Tue: the week first
    show(mekor)
    expect(boxes()).toEqual(['davening-weekday', 'davening-shabbos'])
  })

  it('a Shabbos-only shul: one box, notes as “Until”, and “No weekday minyan listed”', () => {
    at('2026-10-06T17:30:00-04:00')
    show(rodeph)
    expect(screen.queryByTestId('davening-weekday')).not.toBeInTheDocument()
    expect(screen.getByTestId('davening-shabbos-lines')).toHaveTextContent('Friday nightKabbalas Shabbos 6 PMUntil 7:30 PMShabbos morningShacharis 10:45 AMUntil 12:15 PM')
    expect(screen.getByTestId('davening-no-weekday')).toHaveTextContent('No weekday minyan listed. Add one')
  })
})
