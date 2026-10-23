// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import DaveningCard from './DaveningCard'
import { TellAboutContext } from './tellAbout'

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
      // Shabbos Bereishis's: when this week becomes the week ahead.
      shabbos: { candleLighting: null, havdalah: { label: 'Havdalah', time: '7:05 PM', iso: '2026-10-10T19:05:00-04:00' } },
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

  // Oct 15, second pass: an empty box keeps its Add (the "+ Add" box, its
  // AI reading a pasted schedule), even with the listing's box editor; only
  // a box with times in it has Edit.
  describe('with the box editor, an empty box still offers its Add, not Edit', () => {
    const withEditor = (times: unknown[]) => {
      const onEditBox = vi.fn()
      const tell = vi.fn()
      const shul = makeListing({ id: 'k', name: 'Shul', category: 'synagogue', minyanim: times })
      renderWithProviders(
        <TellAboutContext.Provider value={tell}>
          <DaveningCard item={shul} minyanim={times} category={shuls} onEditBox={onEditBox} />
        </TellAboutContext.Provider>,
        { content: { categories: [shuls] } },
      )
      return { onEditBox, tell, shul }
    }

    it('Shabbos not listed', () => {
      at('2026-10-06T17:30:00-04:00')
      const { onEditBox, tell, shul } = withEditor(lowerMerion)
      const shabbos = screen.getByTestId('davening-shabbos')
      expect(within(shabbos).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      fireEvent.click(within(shabbos).getByRole('button', { name: 'Add their Shabbos times' }))
      expect(tell).toHaveBeenCalledWith(shul, undefined, { times: true })
      expect(onEditBox).not.toHaveBeenCalled()
      // The full box beside it has Edit.
      expect(within(screen.getByTestId('davening-weekday')).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })

    it('no weekday minyan', () => {
      at('2026-10-06T17:30:00-04:00')
      const { tell } = withEditor(rodeph)
      const line = screen.getByTestId('davening-no-weekday')
      expect(within(line).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      fireEvent.click(within(line).getByRole('button', { name: 'Add one' }))
      expect(tell).toHaveBeenCalledTimes(1)
    })

    it('no times at all', () => {
      at('2026-10-06T17:30:00-04:00')
      const { tell } = withEditor([])
      const none = screen.getByTestId('davening-none')
      expect(within(none).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      fireEvent.click(within(none).getByRole('button', { name: 'Add their times' }))
      expect(tell).toHaveBeenCalledTimes(1)
    })
  })
})

// Oct 6: a shul that sends out its times each week gets “This week’s
// schedule” on top: waiting, with Add, until this week's is in; then the
// times it sent, the usual ones they replace folded under it.
describe('this week’s schedule (Oct 6)', () => {
  afterEach(() => vi.useRealTimers())
  const usual = [
    { id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
    { id: 'b', tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0 },
    { id: 'c', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
  ]
  const weekPost = (name: string, from: string, to: string, extra: object = {}) => ({
    id: name,
    name,
    from,
    to,
    mode: 'replace',
    kind: 'week',
    minyanim: [
      { id: `${name}1`, tefillah: 'mincha_maariv', on: [from], time: '6:10pm' },
      { id: `${name}2`, tefillah: 'shacharis', on: [to], time: '9:00am', notes: 'Kiddush after davening' },
    ],
    ...extra,
  })
  const before = [weekPost('Shabbos Haazinu', '2026-09-25', '2026-09-26'), weekPost('Times for Oct 2 – Oct 3', '2026-10-02', '2026-10-03')]
  const show = (schedules: unknown[], { onEditBox, ...over }: { onEditBox?: () => void } & Record<string, unknown> = {}) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T16:00:00-04:00')) // Thu Oct 8
    const shul = makeListing({ id: 'k', name: 'Mekor Habracha', category: 'synagogue', minyanim: usual, minyanim_schedules: schedules, ...over })
    renderWithProviders(<DaveningCard item={shul} minyanim={usual} schedules={schedules} category={shuls} onEditBox={onEditBox} />, { content: { categories: [shuls] } })
  }

  it('waits for this week’s from a shul that sends one out, with Add opening in the box', () => {
    show(before)
    const box = screen.getByTestId('davening-this-week-waiting')
    expect(box).toHaveTextContent('This week’s scheduleThey send out a schedule each week; this week’s isn’t on the guide yet. Until it is, their usual times are below.')
    expect(box).toHaveTextContent('Paste their email or add a photo; an admin checks it.')
    fireEvent.click(within(box).getByRole('button', { name: 'Add this week’s schedule' }))
    expect(within(box).getByTestId('update-times')).toBeInTheDocument()
    // The usual times stay open below it.
    expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('Shacharis 9:15 AM')
  })

  it('once it’s in: its name and dates, its times day by day, and the usual Shabbos times folded', () => {
    show([...before, weekPost('Shabbos Bereishis', '2026-10-09', '2026-10-10', { postedAt: '2026-10-07T15:00:00.000Z' })])
    expect(screen.queryByTestId('davening-this-week-waiting')).not.toBeInTheDocument()
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).getByTestId('davening-this-week-dates')).toHaveTextContent('Shabbos Bereishis, Oct 9–10')
    expect(within(box).getByTestId('davening-this-week-days')).toHaveTextContent('Fri Oct 9Mincha & Maariv6:10 PMSat Oct 10Shacharis9 AM · Kiddush after davening')
    // It's this week's schedule, not something set against "usual times"
    // (the user, Oct 20).
    expect(box).not.toHaveTextContent(/usual/i)
    expect(screen.getByTestId('davening-folded')).toHaveTextContent('Usual Shabbos timesNot this week: this week’s schedule replaces them')
    // It only covers Shabbos: the weekday times stay as they are.
    expect(screen.getByTestId('davening-weekday')).toHaveTextContent('6:45 AM')
  })

  // Oct 19: "Posted Wed Oct 7 · Update their times" was the only line under
  // it, unlike every other box, and there was no way to edit its times.
  it('ends with the line every box has: who confirmed it, and Edit opening its own times', () => {
    const onEditBox = vi.fn()
    const bereishis = weekPost('Shabbos Bereishis', '2026-10-09', '2026-10-10', { postedAt: '2026-10-07T15:00:00.000Z' })
    // The shul's website gave the week's times, and they agree (Oct 23:
    // that dates this box, sourceConfirm.ts).
    show([...before, bereishis], { onEditBox, sectionConfirmed: { week: '2026-10-07T18:00:00.000Z' }, sectionFrom: { week: { from: 'Mekor Habracha', at: '2026-10-07T18:00:00.000Z' } } })
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).getByTestId('freshness')).toHaveTextContent(/^Confirmed by Mekor Habracha, Oct 7/)
    expect(box).not.toHaveTextContent('Posted')
    expect(within(box).queryByRole('button', { name: 'Update their times' })).not.toBeInTheDocument()
    fireEvent.click(within(box).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', 'Shabbos Bereishis')
  })

  // Oct 19: opened, the usual times stayed open, and read as if current.
  it('the usual times, opened, still say this week’s replace them, and fold again', () => {
    show([...before, weekPost('Shabbos Bereishis', '2026-10-09', '2026-10-10')])
    fireEvent.click(screen.getByTestId('davening-folded'))
    const usual = screen.getByTestId('davening-shabbos')
    expect(usual).toHaveTextContent('Shacharis 9:15 AM')
    expect(within(usual).getByTestId('davening-fold-reason')).toHaveTextContent('Not this week: this week’s schedule replaces them')
    // Grey and faded, still readable: clearly not this week's (Oct 19).
    expect(usual).toHaveAttribute('data-muted', 'true')
    expect(within(usual).getByText('9:15 AM').closest('.opacity-50')).not.toBeNull()
    expect(within(usual).getByTestId('davening-fold-reason').closest('.opacity-50')).toBeNull()
    fireEvent.click(within(usual).getByRole('button', { name: 'Fold Usual Shabbos times' }))
    expect(screen.queryByTestId('davening-shabbos')).not.toBeInTheDocument()
    expect(screen.getByTestId('davening-folded')).toHaveTextContent('Usual Shabbos times')
  })

  // Oct 19: opened by tapping anywhere on it, it closed only by its arrow.
  it('the usual times, opened, fold again from anywhere on their top, as they opened', () => {
    show([...before, weekPost('Shabbos Bereishis', '2026-10-09', '2026-10-10')])
    fireEvent.click(screen.getByTestId('davening-folded'))
    fireEvent.click(within(screen.getByTestId('davening-shabbos')).getByTestId('davening-fold-reason'))
    expect(screen.queryByTestId('davening-shabbos')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('davening-folded'))
    fireEvent.click(within(screen.getByTestId('davening-shabbos')).getByText('Usual Shabbos times'))
    expect(screen.queryByTestId('davening-shabbos')).not.toBeInTheDocument()
  })

  // Oct 19: every usual weekday minyan at Mekor is in its WhatsApp group;
  // the week's box gave the same minyanim without it.
  it('the week’s minyanim keep the usual ones’ sign-up group', () => {
    const group = { link: 'https://chat.whatsapp.com/Mekor' }
    const signUpUsual = [
      ...usual.filter((u) => u.days.includes('sat') || u.days.includes('fri')),
      { id: 'c', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am', signUp: group },
      { id: 'd', tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '15 min before Sunset', anchor: 'sunset', offsetMinutes: -15, season: 'summer', signUp: group },
    ]
    const weekdays = {
      ...weekPost('Shabbat Schedule', '2026-10-04', '2026-10-08'),
      minyanim: [
        { id: 'w1', tefillah: 'shacharis', on: ['2026-10-05', '2026-10-08'], time: '6:45am' },
        { id: 'w2', tefillah: 'mincha_maariv', on: ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'], time: '5:55pm' },
      ],
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T16:00:00-04:00')) // Tue Oct 6
    const shul = makeListing({ id: 'k', name: 'Mekor Habracha', category: 'synagogue', minyanim: signUpUsual, minyanim_schedules: [weekdays] })
    renderWithProviders(<DaveningCard item={shul} minyanim={signUpUsual} schedules={[weekdays]} category={shuls} />, { content: { categories: [shuls] } })
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).getByTestId('sign-up-box')).toHaveTextContent(/^All this week’s times: check the group first/)
    expect(within(box).getByRole('link', { name: 'Say you’re coming' })).toHaveAttribute('href', group.link)
    expect(within(box).queryByTestId('sign-up-time')).not.toBeInTheDocument()
  })

  // Oct 19: Mekor's newsletter week ran Sunday to Friday night, headed
  // "Shabbat Schedule". It was titled for the Shabbos it didn't cover, and
  // folded away (greyed) Shabbos morning's usual time, which still held.
  it('a week of weekdays to Friday night: named by its dates, and Shabbos’s usual times left open', () => {
    const weekdays = {
      ...weekPost('Shabbat Schedule', '2026-10-04', '2026-10-09'),
      minyanim: [
        { id: 'w1', tefillah: 'shacharis', on: ['2026-10-05'], time: '6:50am' },
        { id: 'w2', tefillah: 'kabbalas_shabbos', on: ['2026-10-09'], time: '5:55pm' },
      ],
    }
    show([...before, weekdays])
    expect(screen.getByTestId('davening-this-week-dates')).toHaveTextContent(/^Oct 4–9$/)
    const shabbos = screen.getByTestId('davening-shabbos')
    expect(shabbos).toHaveTextContent('Shacharis 9:15 AM')
    expect(shabbos).not.toHaveAttribute('data-muted')
    // The weekday times it does replace still fold.
    expect(screen.queryByTestId('davening-weekday')).not.toBeInTheDocument()
  })

  // Oct 23: "leaving it out makes it seem like we don't know the schedule
  // this week, but really we know that there is no schedule this week".
  it('their calendar’s week with nothing in it: no minyan this week, said, the usual times folded', () => {
    const onEditBox = vi.fn()
    const none = { ...weekPost('Times for Oct 4 – Oct 10', '2026-10-04', '2026-10-10', { postedBy: 'website', whole: true, postedAt: '2026-10-07T15:00:00.000Z' }), minyanim: [] }
    show([...before, none], { onEditBox })
    expect(screen.queryByTestId('davening-this-week-waiting')).not.toBeInTheDocument()
    const box = screen.getByTestId('davening-no-minyan')
    expect(box).toHaveTextContent('This week’s schedule')
    expect(box).toHaveTextContent('Oct 4–10')
    expect(box).toHaveTextContent('No minyan this week')
    expect(screen.queryByTestId('davening-weekday')).not.toBeInTheDocument()
    expect(screen.queryByTestId('davening-shabbos')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('davening-folded').map((f) => f.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Not this week: no minyan this week')]))
    fireEvent.click(within(box).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', 'Times for Oct 4 – Oct 10')
  })

  it('a shul that has never sent one out just shows its usual times', () => {
    show([])
    expect(screen.queryByTestId('davening-this-week-waiting')).not.toBeInTheDocument()
    expect(screen.queryByTestId('davening-this-week')).not.toBeInTheDocument()
    cleanup()
    // One post isn't a habit.
    show([before[1]])
    expect(screen.queryByTestId('davening-this-week-waiting')).not.toBeInTheDocument()
  })
})

// Oct 20: a calendar's dated service (Rodeph Shalom's Thursday minyan),
// approved, showed only on the day and the day before, in a box of its own;
// the user looked for it in This week's schedule. It's there all week now,
// as well as the usual times.
describe('this week’s one-day additions (Oct 20)', () => {
  afterEach(() => vi.useRealTimers())
  const usual = [
    { id: 'm2', tefillah: 'shacharis', days: ['sat'], time: '10:45am' },
    { id: 'm3', tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm' },
  ]
  const day = (date: string, name: string, extra: object = {}) => ({
    id: date, name, from: date, to: date, mode: 'add', postedBy: 'website',
    minyanim: [{ id: `${date}m`, tefillah: 'shacharis', on: [date], time: '8:10 AM' }], ...extra,
  })
  const thursdays = [day('2026-10-08', 'Thu Oct 8'), day('2026-10-15', 'Thu Oct 15')]
  const show = (at: string, schedules: unknown[]) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(at))
    const shul = makeListing({ id: 'k', name: 'Congregation Rodeph Shalom', category: 'synagogue', minyanim: usual, minyanim_schedules: schedules })
    renderWithProviders(<DaveningCard item={shul} minyanim={usual} schedules={schedules} category={shuls} />, { content: { categories: [shuls] } })
  }

  it('shows this week’s in This week’s schedule, as well as the usual times, days before; not next week’s', () => {
    show('2026-10-06T10:00:00-04:00', thursdays) // Tue Oct 6
    const box = screen.getByTestId('davening-this-week')
    expect(box).toHaveTextContent('This week’s scheduleOct 8Thu Oct 8Shacharis8:10 AM')
    expect(box).not.toHaveTextContent('Oct 15')
    expect(box).not.toHaveTextContent(/usual|in place of/i)
    expect(screen.queryByTestId('davening-special-box')).not.toBeInTheDocument()
    // Nothing of the usual times is folded away.
    expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('Shacharis 10:45 AM')
    expect(screen.queryByTestId('davening-folded')).not.toBeInTheDocument()
  })

  // Oct 23: "on Friday people want to see shabbos as last. But right when
  // shabbos is over we need to show the week's schedule."
  it('on Shabbos, that day’s; after havdalah, the week ahead’s', () => {
    show('2026-10-10T15:00:00-04:00', thursdays) // Sat Oct 10, 3 PM
    expect(screen.queryByTestId('davening-this-week')).not.toBeInTheDocument()
    cleanup()
    show('2026-10-10T19:30:00-04:00', thursdays) // after havdalah
    expect(screen.getByTestId('davening-this-week')).toHaveTextContent('Thu Oct 15Shacharis8:10 AM')
  })

  it('the day before, it stays there rather than in a box of its own', () => {
    show('2026-10-07T10:00:00-04:00', thursdays) // Wed Oct 7
    expect(screen.getByTestId('davening-this-week')).toHaveTextContent('Thu Oct 8Shacharis8:10 AM')
    expect(screen.queryByTestId('davening-special-box')).not.toBeInTheDocument()
  })

  it('leaves a Yom Tov schedule its own box, the same day', () => {
    show('2026-10-01T10:00:00-04:00', [sukkos, day('2026-10-01', 'Thu Oct 1'), day('2026-10-02', 'Fri Oct 2')]) // Chol HaMoed
    expect(screen.getByTestId('davening-special-box')).toHaveTextContent('Sukkos 5787')
    expect(screen.getByTestId('davening-this-week')).toHaveTextContent('Thu Oct 1TodayShacharis8:10 AMFri Oct 2Shacharis8:10 AM')
  })

  // Oct 22: BZBI's week was only its newsletter's "Sat Oct 24", and the box
  // had no line under it: who confirmed it, Edit.
  it('a week of only dated services ends with the line every box has, Edit opening them', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T10:00:00-04:00'))
    const onEditBox = vi.fn()
    const schedules = [day('2026-10-08', 'Thu Oct 8')]
    const shul = makeListing({ id: 'k', name: 'BZBI', category: 'synagogue', minyanim: usual, minyanim_schedules: schedules, sectionConfirmed: { week: '2026-10-05T18:00:00.000Z' }, sectionFrom: { week: { from: 'BZBI', at: '2026-10-05T18:00:00.000Z' } } })
    renderWithProviders(<DaveningCard item={shul} minyanim={usual} schedules={schedules} category={shuls} onEditBox={onEditBox} />, { content: { categories: [shuls] } })
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).getByTestId('freshness')).toHaveTextContent(/^Confirmed by BZBI, Oct 5/)
    fireEvent.click(within(box).getByRole('button', { name: 'Edit' }))
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', '2026-10-08')
  })

  it('keeps an occasion’s name beside its date', () => {
    show('2026-10-06T10:00:00-04:00', [day('2026-10-08', 'Thanksgiving')])
    expect(screen.getByTestId('davening-this-week')).toHaveTextContent('Thanksgiving, Thu Oct 8Shacharis8:10 AM')
  })

  it('with a week the shul sent out: one list, in date order', () => {
    const week = { id: 'w', name: 'Shabbos Bereishis', from: '2026-10-09', to: '2026-10-10', mode: 'replace', kind: 'week', minyanim: [{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-10'], time: '9:00am' }] }
    show('2026-10-06T10:00:00-04:00', [week, ...thursdays])
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).getByTestId('davening-this-week-dates')).toHaveTextContent(/^Oct 8–10$/)
    expect(within(box).getByTestId('davening-this-week-days')).toHaveTextContent(/^Thu Oct 8Shacharis8:10 AMSat Oct 10Shacharis9 AM$/)
    expect(screen.getAllByTestId('davening-this-week')).toHaveLength(1)
  })

  it('a time the week already gives is there once', () => {
    const week = { id: 'w', name: 'Times for Oct 4 – Oct 10', from: '2026-10-04', to: '2026-10-10', mode: 'replace', kind: 'week', postedBy: 'website', minyanim: [{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-08'], time: '8:10am' }] }
    show('2026-10-06T10:00:00-04:00', [week, ...thursdays])
    expect(screen.getByTestId('davening-this-week-days')).toHaveTextContent(/^Thu Oct 8Shacharis8:10 AM$/)
  })
})

// Oct 20: "There's only one schedule for a given week". A newsletter's week
// and one read off the website were two boxes' worth; now one list, the
// newsletter's times on any day both give.
describe('one week, from the newsletter and the website (Oct 20)', () => {
  afterEach(() => vi.useRealTimers())
  const usual = [
    { id: 'u1', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
    { id: 'u2', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu'], time: '6:45am' },
  ]
  const website = {
    id: 'site', name: 'Times for Oct 6 – Oct 10', from: '2026-10-06', to: '2026-10-10', mode: 'replace', kind: 'week', postedBy: 'website',
    minyanim: [
      { id: 's1', tefillah: 'shacharis', on: ['2026-10-06', '2026-10-07'], time: '7:00am' },
      { id: 's2', tefillah: 'shacharis', on: ['2026-10-10'], time: '9:30am' },
    ],
  }
  const newsletter = {
    id: 'news', name: 'Shabbos Bereishis', from: '2026-10-09', to: '2026-10-10', mode: 'replace', kind: 'week',
    minyanim: [
      { id: 'n1', tefillah: 'kabbalas_shabbos', on: ['2026-10-09'], time: '6:10pm' },
      { id: 'n2', tefillah: 'shacharis', on: ['2026-10-10'], time: '9:00am' },
    ],
  }
  const show = (schedules: unknown[], onEditBox?: () => void) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T10:00:00-04:00')) // Tue Oct 6
    const confirmed = { sectionConfirmed: { week: '2026-10-05T18:00:00.000Z' }, sectionFrom: { week: { from: 'Mekor Habracha', at: '2026-10-05T18:00:00.000Z' } } }
    const shul = makeListing({ id: 'k', name: 'Mekor Habracha', category: 'synagogue', minyanim: usual, minyanim_schedules: schedules, ...confirmed })
    renderWithProviders(<DaveningCard item={shul} minyanim={usual} schedules={schedules} category={shuls} onEditBox={onEditBox} />, { content: { categories: [shuls] } })
  }

  it('is one box, day by day, the newsletter’s times on the day both give', () => {
    show([website, newsletter])
    expect(screen.getAllByTestId('davening-this-week')).toHaveLength(1)
    expect(screen.getByTestId('davening-this-week-dates')).toHaveTextContent(/^Oct 6–10$/)
    expect(screen.getByTestId('davening-this-week-days')).toHaveTextContent(
      /^Tue Oct 6TodayShacharis7 AMWed Oct 7Shacharis7 AMFri Oct 9Kabbalas Shabbos6:10 PMSat Oct 10Shacharis9 AM$/,
    )
    expect(screen.getByTestId('davening-this-week')).not.toHaveTextContent(/usual/i)
  })

  it('Edit opens the newsletter’s week', () => {
    const onEditBox = vi.fn()
    show([website, newsletter], onEditBox)
    fireEvent.click(within(screen.getByTestId('davening-this-week')).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', 'news')
  })
})

// Oct 6 (migration 072): each box its own date, and “Update their times”
// beside it, opening in that box. Someone who only davens there on Shabbos
// can vouch for Shabbos without vouching for Shacharis.
describe('a date per box (Oct 6)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  const times = [
    { id: 'a', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
    { id: 'b', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
  ]
  const show = (over: object = {}) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T17:30:00-04:00'))
    const shul = makeListing({ id: '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21', name: 'Mekor Habracha', category: 'synagogue', minyanim: times, ...over })
    renderWithProviders(<DaveningCard item={shul} minyanim={times} category={shuls} />, { content: { categories: [shuls] } })
  }

  it('each box says when its own times were confirmed, the listing’s date where that’s later', () => {
    show({ confirmedAt: '2026-08-20T12:00:00Z', sectionConfirmed: { shabbos: '2026-09-29T12:00:00Z' } })
    expect(screen.getByTestId('davening-weekday')).toHaveTextContent('Weekday times confirmed Aug 20.')
    expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('Shabbos times confirmed by community, Sep 29.')
  })

  it('“Yes” confirms that box’s times alone', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, confirmedAt: '2026-10-06T21:30:00Z' }), { status: 200 }))
    show()
    fireEvent.click(within(screen.getByTestId('davening-shabbos')).getByRole('button', { name: 'Yes' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ section: 'shabbos' })
  })

  it('“Update their times” sits beside the date and opens in that box; there’s no separate button at the end', () => {
    show()
    expect(screen.getAllByRole('button', { name: 'Update their times' })).toHaveLength(2)
    fireEvent.click(within(screen.getByTestId('davening-weekday')).getByRole('button', { name: 'Update their times' }))
    expect(within(screen.getByTestId('davening-weekday')).getByTestId('update-times')).toBeInTheDocument()
    expect(screen.queryByTestId('davening-confirm')).not.toBeInTheDocument()
  })
})

// Oct 6: on a category page, “Update their times” opens the regular “+ Add”
// box about the shul, asking for their schedule: one way to send times
// everywhere. It was a second box, inside the listing's, with a choice to
// make first. Where there's no box (the Map), it still opens in place.
describe('“Update their times” on a category page', () => {
  afterEach(() => vi.useRealTimers())
  const times = [
    { id: 'a', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
    { id: 'b', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
  ]

  it('opens the regular box about the shul, asking for their schedule; nothing opens inside the listing', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T17:30:00-04:00'))
    const tellAbout = vi.fn()
    const shul = makeListing({ id: 'k', name: 'Mekor Habracha', category: 'synagogue', minyanim: times })
    renderWithProviders(
      <TellAboutContext.Provider value={tellAbout}>
        <DaveningCard item={shul} minyanim={times} category={shuls} />
      </TellAboutContext.Provider>,
      { content: { categories: [shuls] } },
    )
    fireEvent.click(within(screen.getByTestId('davening-weekday')).getByRole('button', { name: 'Update their times' }))
    expect(tellAbout).toHaveBeenCalledWith(shul, undefined, { times: true })
    expect(screen.queryByTestId('update-times')).not.toBeInTheDocument()
  })
})

// Oct 16: a minyan that only runs on days enough people sign up in its
// WhatsApp group. Its time is marked where it's shown, and a box under the
// times names it, says the shul's other times are regular, and has one
// button to its group (or someone to text, for an invite-only group).
describe('a minyan that only runs when enough sign up (Oct 16)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T09:00:00-04:00')) // Tue, no festival
  })
  afterEach(() => vi.useRealTimers())
  const show = (times: unknown[]) => {
    const shul = makeListing({ id: 'k', name: 'Center City Beth Am', category: 'synagogue', minyanim: times })
    renderWithProviders(<DaveningCard item={shul} minyanim={times} category={shuls} />, { content: { categories: [shuls] } })
  }
  const lateMaariv = { id: 'l', tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '9:45pm', signUp: { link: 'https://chat.whatsapp.com/Late1' } }

  it('one of several: its time marked, and a box naming it, the rest regular, with its group’s link', () => {
    show([...minyanim, lateMaariv])
    const marked = screen.getAllByTestId('sign-up-time')
    expect(marked.map((m) => m.textContent)).toEqual(['9:45 PM (check group first)', '9:45 PM (check group first)'])
    const box = screen.getByTestId('sign-up-box')
    expect(box).toHaveTextContent('Maariv 9:45 PM: check the group firstIt only runs on days enough people sign up. Their other times are regular.')
    const link = within(box).getByRole('link', { name: 'Say you’re coming' })
    expect(link).toHaveAttribute('href', 'https://chat.whatsapp.com/Late1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('every minyan at the place: the box speaks for the place', () => {
    show([{ ...lateMaariv, days: ['mon', 'tue', 'wed', 'thu', 'fri'], tefillah: 'mincha', time: '1:15pm' }])
    expect(screen.getAllByTestId('sign-up-box'), 'one box, for the place, though Friday’s Mincha is in the Shabbos box').toHaveLength(1)
    expect(screen.getByTestId('sign-up-box')).toHaveTextContent(/^Check the group before you goIt only runs on days enough people sign up\.Say you’re coming$/)
  })

  it('an invite-only group: someone to text, the number written out', () => {
    show([...minyanim, { ...lateMaariv, signUp: { name: 'Moshe', phone: '215-555-0142' } }])
    const box = screen.getByTestId('sign-up-box')
    expect(within(box).getByRole('link', { name: 'Text Moshe to be added' })).toHaveAttribute('href', 'sms:2155550142')
    expect(box).toHaveTextContent('215-555-0142')
  })

  it('a link that isn’t a web link is never a button', () => {
    show([...minyanim, { ...lateMaariv, signUp: { link: 'javascript:alert(1)' } }])
    expect(within(screen.getByTestId('sign-up-box')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('a regular shul has neither', () => {
    show(minyanim)
    expect(screen.queryByTestId('sign-up-box')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sign-up-time')).not.toBeInTheDocument()
  })

  it('on Shabbos, the line carries the mark', () => {
    show([...minyanim, { id: 's', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }, { id: 'h', tefillah: 'shacharis', days: ['sat'], time: '7:30am', signUp: { link: 'https://chat.whatsapp.com/Hash' } }])
    expect(screen.getByTestId('davening-shabbos-lines')).toHaveTextContent('Shacharis 7:30 AMCheck group first')
    expect(within(screen.getByTestId('davening-shabbos')).getByTestId('sign-up-box')).toHaveTextContent('Shacharis 7:30 AM: check the group first')
  })

  // The user, Oct 16: when every minyan in a box of times is one, the box
  // under it says so once, "All weekday times", rather than naming them all
  // again under the table that lists them; and no time is marked.
  it('every minyan in a box of times: “All weekday times”, and none marked', () => {
    const group = { link: 'https://chat.whatsapp.com/Week' }
    show([
      { id: 'a', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '7:00am', signUp: group },
      { id: 'b', tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '7:45pm', signUp: group },
      { id: 'c', tefillah: 'shacharis', days: ['sat'], time: '9:00am' },
    ])
    const week = screen.getByTestId('davening-weekday')
    expect(within(week).getByTestId('sign-up-box')).toHaveTextContent(/^All weekday times: check the group firstThey only run on days enough people sign up\. Their other times are regular\.Say you’re coming$/)
    expect(screen.queryByTestId('sign-up-time')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('davening-shabbos')).queryByTestId('sign-up-box')).not.toBeInTheDocument()
  })

  it('…but each named when they sign up in different groups', () => {
    show([
      { id: 'a', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '7:00am', signUp: { link: 'https://chat.whatsapp.com/One' } },
      { id: 'b', tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '7:45pm', signUp: { link: 'https://chat.whatsapp.com/Two' } },
      { id: 'c', tefillah: 'shacharis', days: ['sat'], time: '9:00am' },
    ])
    expect(screen.getAllByTestId('sign-up-box').map((b) => b.querySelector('p')!.textContent)).toEqual(['Shacharis 7 AM: check the group first', 'Maariv 7:45 PM: check the group first'])
  })
})

// Oct 16: a minyan that meets somewhere, not a shul, is its times and
// nothing else: no asking for Shabbos times an office Mincha won't have.
describe('a minyan that isn’t a shul', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T09:00:00-04:00'))
  })
  afterEach(() => vi.useRealTimers())
  const kind = { key: 'minyanOnly', label: 'Minyan', type: 'boolean' as const, renderAs: 'badge' as const, minyanOnly: true }
  const withKind = makeCategory({ ...shuls, detailFields: [...shuls.detailFields, kind] })
  const mincha = [{ id: 'm', tefillah: 'mincha', days: ['mon', 'tue', 'wed', 'thu'], time: '1:15pm' }]

  it('has no Shabbos box asking for its Shabbos times', () => {
    const office = makeListing({ id: 'mkt', name: 'Market Street Mincha', category: 'synagogue', minyanim: mincha, minyanOnly: true })
    renderWithProviders(<DaveningCard item={office} minyanim={mincha} category={withKind} />, { content: { categories: [withKind] } })
    expect(screen.getByTestId('davening-weekday')).toHaveTextContent('1:15 PM')
    expect(screen.queryByTestId('davening-shabbos')).not.toBeInTheDocument()
  })

  it('a shul with the same times still asks', () => {
    const shul = makeListing({ id: 'beth', name: 'Center City Beth Am', category: 'synagogue', minyanim: mincha })
    renderWithProviders(<DaveningCard item={shul} minyanim={mincha} category={withKind} />, { content: { categories: [withKind] } })
    expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('Their Shabbos times aren’t listed yet.')
  })
})

// The user, Oct 22: Rodeph Shalom's Thursday minyan is on Zoom, and the
// listing never said so. "Join on Zoom" on the minyan's own row.
describe('a minyan people can join from home (Oct 22)', () => {
  const ZOOM = 'https://upenn.zoom.us/j/97084263584'
  const usual = [
    { id: 'k', tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm' },
    { id: 't', tefillah: 'shacharis', days: ['thu'], time: '8:10 AM' },
  ]
  const week = (minyanim: object[]) => ({ id: 'w', name: 'Times for Oct 18 – Oct 24', from: '2026-10-22', to: '2026-10-24', mode: 'replace', kind: 'week', postedBy: 'website', minyanim })
  const show = (times: unknown[], schedules: unknown[] = []) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T07:00:00-04:00')) // Thu Oct 22
    const shul = makeListing({ id: 'rs', name: 'Congregation Rodeph Shalom', category: 'synagogue', minyanim: times, minyanim_schedules: schedules })
    renderWithProviders(<DaveningCard item={shul} minyanim={times} schedules={schedules} category={shuls} />, { content: { categories: [shuls] } })
  }
  afterEach(() => vi.useRealTimers())

  it('this week’s: on the minyan’s row, opening the meeting in a new tab', () => {
    show(usual, [week([{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-22'], time: '8:10am', joinLink: ZOOM }, { id: 'w2', tefillah: 'kabbalas_shabbos', on: ['2026-10-23'], time: '6:00pm' }])])
    const box = screen.getByTestId('davening-this-week')
    const links = within(box).getAllByRole('link', { name: 'Join on Zoom' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', ZOOM)
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(links[0].closest('.grid')).toHaveTextContent('Shacharis8:10 AMJoin on Zoom')
  })

  it('a week that gives the time alone keeps its usual minyan’s link; not a different time that day', () => {
    show([usual[0], { ...usual[1], joinLink: ZOOM }], [week([{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-22'], time: '8:10am' }, { id: 'w3', tefillah: 'shacharis', on: ['2026-10-22'], time: '7:00am' }])])
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).getAllByRole('link', { name: 'Join on Zoom' })).toHaveLength(1)
    expect(within(box).getByRole('link', { name: 'Join on Zoom' }).closest('.grid')).toHaveTextContent('8:10 AM')
  })

  it('in the usual weekday table: under it, naming the minyan; and on a Shabbos line', () => {
    show([{ ...usual[0], joinLink: 'https://www.youtube.com/@rodephshalom/live' }, { ...usual[1], joinLink: ZOOM }])
    expect(within(screen.getByTestId('davening-weekday')).getByRole('link', { name: 'Join Thu Shacharis on Zoom' })).toHaveAttribute('href', ZOOM)
    expect(within(screen.getByTestId('davening-shabbos-lines')).getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/@rodephshalom/live')
  })

  it('a link that isn’t a web link is never a link', () => {
    show([{ ...usual[1], joinLink: 'javascript:alert(1)' }])
    expect(screen.queryByTestId('join-link')).not.toBeInTheDocument()
  })
})
