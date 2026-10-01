// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import MinyanimView from './MinyanimView'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/synagogue',
  useSearchParams: () => new URLSearchParams(),
}))

// This week, as the calendar has it.
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

const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const regular = [
  { id: 'r1', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '7:00am' },
  { id: 'r2', tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '7:45pm' },
  { id: 'r3', tefillah: 'shacharis', days: ['sat'], time: '9:30am' },
]
const sukkos = {
  id: 's1',
  name: 'Sukkos 5787',
  from: '2026-09-26',
  to: '2026-10-04',
  mode: 'replace',
  minyanim: [
    { id: 'a', tefillah: 'mincha_maariv', on: ['chol_hamoed'], time: '6:30pm' },
    { id: 'b', tefillah: 'shacharis', on: ['yom_tov'], time: '9:00am', notes: 'Yizkor about 10:45' },
  ],
}
const mekor = makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue', minyanim: regular, minyanim_schedules: [sukkos], milesFromCenter: 1.3 })
const kesher = makeListing({ id: 'kesher', name: 'Kesher Israel', category: 'synagogue', minyanim: regular, milesFromCenter: 2.4 })
const view = () => renderWithProviders(<MinyanimView items={[mekor, kesher]} categoryId="synagogue" />, { content: { categories: [shuls] } })

describe('the Minyanim view (step 4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T17:30:00-04:00')) // Thu, Chol HaMoed, 5:30 PM
  })
  afterEach(() => vi.useRealTimers())

  it('names the days ahead for what they are', () => {
    view()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['TodayChol HaMoed', 'FriHoshana Rabbah', 'ShabbosShemini Atzeres', 'SunSimchas Torah'])
  })

  it('today: the next minyan first, then each with whose times they are; earlier ones folded', () => {
    view()
    expect(screen.getByTestId('minyanim-answer')).toHaveTextContent('Next: Mincha & Maariv 6:30 PM at Mekor Habracha, 1.3 mi, its Sukkos times.')
    expect(screen.getByText(/1 of 2 shuls/)).toBeInTheDocument()
    const rows = within(screen.getByTestId('minyanim-rows')).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['6:30 PMMekor HabrachaMincha & Maariv · 1.3 mi✓ Sukkos times', '7:45 PMKesher IsraelMaariv · 2.4 mi⚠ Regular times · Sukkos not posted'])
    // Kesher's 7 AM Shacharis has passed; Mekor's regular 7 AM is replaced.
    fireEvent.click(screen.getByRole('button', { name: /Earlier today · 1/ }))
    expect(screen.getByText('7 AM')).toBeInTheDocument()
  })

  it('a Yom Tov: posted times listed; the regular times of shuls that haven’t posted folded into one note', () => {
    view()
    fireEvent.click(screen.getByRole('tab', { name: /Shabbos/ }))
    const rows = within(screen.getByTestId('minyanim-rows')).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['9 AMMekor HabrachaShacharis · Yizkor about 10:45 · 1.3 mi✓ Sukkos times'])
    const note = screen.getByTestId('minyanim-not-posted')
    expect(note).toHaveTextContent('Not posted for Shemini Atzeres · 1 shul')
    expect(note).toHaveTextContent('Their regular times may not apply. Kesher Israel')
    expect(note).not.toHaveTextContent('9:30')
    // With nothing posted at all, the answer says so, rather than "nothing".
    cleanup()
    renderWithProviders(<MinyanimView items={[kesher]} categoryId="synagogue" />, { content: { categories: [shuls] } })
    fireEvent.click(screen.getByRole('tab', { name: /Shabbos/ }))
    expect(screen.getByTestId('minyanim-answer')).toHaveTextContent('No shul has posted Shemini Atzeres times yet. The regular times of 1 shul are below, and may not apply.')
    const again = screen.getByTestId('minyanim-not-posted')
    fireEvent.click(within(again).getByRole('button', { name: 'Their regular times' }))
    expect(again).toHaveTextContent('9:30 AMKesher Israel')
  })

  it('folded regular times open on asking', () => {
    view()
    fireEvent.click(screen.getByRole('tab', { name: /Shabbos/ }))
    const note = screen.getByTestId('minyanim-not-posted')
    fireEvent.click(within(note).getByRole('button', { name: 'Their regular times' }))
    expect(note).toHaveTextContent('9:30 AMKesher Israel')
  })

  it('each minyan opens its shul’s own page', () => {
    view()
    expect(within(screen.getByTestId('minyanim-rows')).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringMatching(/^\/[^/]+\/synagogue\/mekor-habracha/))
  })
})
