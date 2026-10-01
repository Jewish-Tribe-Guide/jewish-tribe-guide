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

  it('with its schedule: the schedule’s times, saying whose and until when, and all of them a tap away', () => {
    const shul = makeListing({ id: 'k', name: 'Mekor Habracha', category: 'synagogue', minyanim, minyanim_schedules: [sukkos] })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} schedules={[sukkos]} category={shuls} />, { content: { categories: [shuls] } })
    const card = screen.getByTestId('listing-davening')
    expect(within(card).getByTestId('davening-special')).toHaveTextContent('Sukkos 5787 · in place of the regular times until Sun Oct 4')
    expect(card).toHaveTextContent('Mincha & Maariv6:30 PM')
    expect(card).not.toHaveTextContent('7:45 PM')
    fireEvent.click(within(card).getByRole('button', { name: /All Sukkos times/ }))
    expect(within(card).getByTestId('davening-special-all')).toHaveTextContent('Yom Tov daysShacharis9:00am · Yizkor on Shemini Atzeres')
  })

  it('without one: the regular times, marked “may not apply”, and a way to add them', () => {
    const shul = makeListing({ id: 'k', name: 'Kesher Israel', category: 'synagogue', minyanim })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} category={shuls} />, { content: { categories: [shuls] } })
    const note = screen.getByTestId('davening-not-posted')
    expect(note).toHaveTextContent('Sukkos times not posted')
    expect(note).toHaveTextContent('These are the regular times. They may not apply during Sukkos.')
    expect(within(note).getByRole('button', { name: 'Know their Sukkos times? Add them' })).toBeInTheDocument()
    expect(screen.getByTestId('listing-davening')).toHaveTextContent('7:45 PM')
  })

  it('no way to add them where edits are off', () => {
    const closed = makeCategory({ ...shuls, capabilities: { add: true, report: true, directorySearch: true, map: true, edit: false } })
    const shul = makeListing({ id: 'k', name: 'Kesher Israel', category: 'synagogue', minyanim })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} category={closed} />, { content: { categories: [closed] } })
    expect(within(screen.getByTestId('davening-not-posted')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('after the festival: plainly the regular times', () => {
    vi.setSystemTime(new Date('2026-10-06T09:00:00-04:00'))
    const shul = makeListing({ id: 'k', name: 'Kesher Israel', category: 'synagogue', minyanim, minyanim_schedules: [sukkos] })
    renderWithProviders(<DaveningCard item={shul} minyanim={minyanim} schedules={[sukkos]} category={shuls} />, { content: { categories: [shuls] } })
    expect(screen.queryByTestId('davening-not-posted')).not.toBeInTheDocument()
    expect(screen.queryByTestId('davening-special')).not.toBeInTheDocument()
  })
})
