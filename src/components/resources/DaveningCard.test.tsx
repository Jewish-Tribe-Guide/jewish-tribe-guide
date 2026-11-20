// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import DaveningCard from './DaveningCard'
import { TellAboutContext } from './tellAbout'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
// This week's candle lighting, as a test sets it (none unless it does).
const zmanimShabbos = vi.hoisted(() => ({ candleLighting: null as null | { label: string; time: string; iso: string } }))
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
      shabbos: { candleLighting: zmanimShabbos.candleLighting, havdalah: { label: 'Havdalah', time: '7:05 PM', iso: '2026-10-10T19:05:00-04:00' } },
    },
  }),
}))

// This week's zmanim at every shul, as a test sets them (none unless it does).
const zmanAnchors = vi.hoisted(() => ({ value: null as null | { timezone: string; candleLightingIso?: string; havdalahIso?: string; sunsetIso?: string } }))
vi.mock('@/lib/useZmanAnchors', async (original) => {
  const real = await original<typeof import('@/lib/useZmanAnchors')>()
  return { ...real, useZmanAnchors: (coords: ({ lat: number; lng: number } | null | undefined)[]) => (zmanAnchors.value ? Object.fromEntries(coords.flatMap((c) => (c ? [[real.geoKey(c), zmanAnchors.value]] : []))) : {}) }
})

afterEach(() => {
  cleanup()
  zmanAnchors.value = null
})

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
    // Nov 19 (board 5e): the fold is its name; why it's folded is inside.
    expect(folded).toHaveTextContent(/^Usual weekday times$/)
    expect(screen.getByTestId('listing-davening')).not.toHaveTextContent('7:45 PM')
    fireEvent.click(folded)
    expect(screen.getByTestId('davening-weekday')).toHaveTextContent('7:45 PM')
    expect(screen.getByTestId('davening-fold-reason')).toHaveTextContent('Not now: the Sukkos 5787 times above replace them')
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

  // Nov 19: a box missing its times isn't drawn to ask for them (the user:
  // "can't we just not nag"). Adding them is Edit or "+ Add", as anything.
  // Nov 19 (board 7e): a row a day, Sunday to Friday, no longer days with
  // the same times merged ("Mon, Thu").
  it('the week as one table, a row a day, today marked; no Shabbos box asking for Shabbos times', () => {
    at('2026-10-06T17:30:00-04:00') // Tue
    show(lowerMerion)
    const table = screen.getByTestId('davening-week-table')
    expect([...table.querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual([
      'Sun7:30, 8:30 AM10 min before sunset',
      'Mon6:45, 8 AM10 min before sunset',
      'TueToday7, 8 AM10 min before sunset',
      'Wed7, 8 AM10 min before sunset',
      'Thu6:45, 8 AM10 min before sunset',
      'Fri7, 8 AM–',
    ])
    expect(table.querySelector('[data-today]')).toHaveTextContent(/^TueToday/)
    // No more switching between today-and-tomorrow and the week.
    expect(screen.queryByRole('button', { name: /The whole week|Today and tomorrow/ })).not.toBeInTheDocument()
    expect(boxes()).toEqual(['davening-weekday'])
    expect(screen.getByTestId('listing-davening')).not.toHaveTextContent(/Shabbos times aren’t listed|Add their Shabbos times/)
  })

  it('Shabbos in the order it happens, written as the shul gives it, this season’s; first once the week’s last weekday minyan has started', () => {
    at('2026-10-08T19:00:00-04:00') // Thu, 7 PM: Thursday’s 6:45 AM was the week’s last
    show(mekor)
    expect(boxes()).toEqual(['davening-shabbos', 'davening-weekday'])
    expect([...screen.getByTestId('davening-shabbos-lines').children].map((l) => l.textContent)).toEqual([
      // Nov 19 (board 7e): Friday night and Shabbos, the times to the right.
      'Friday nightMincha & Maarivat candle lighting, never after 7 PM',
      'ShabbosShacharis9:15 AMMincha & Maariv30 min before sunset',
    ])
    expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('In winter, also Mincha 12:20 PM, following Kiddush.')
    cleanup()
    at('2026-10-06T17:30:00-04:00') // Tue: the week first
    show(mekor)
    expect(boxes()).toEqual(['davening-weekday', 'davening-shabbos'])
  })

  // Oct 26: Shabbos first only once the week's last weekday minyan has
  // started: on Friday morning the Shacharis still to come stays on top.
  it('the week stays first until its last weekday minyan starts, then Shabbos, until havdalah', () => {
    const order = (iso: string) => {
      cleanup()
      at(iso)
      show([...lowerMerion, ...mekor.filter((m) => m.days.includes('sat') && !m.season)])
      return boxes()
    }
    const weekFirst = ['davening-weekday', 'davening-shabbos']
    const shabbosFirst = ['davening-shabbos', 'davening-weekday']
    expect(order('2026-10-08T19:00:00-04:00')).toEqual(weekFirst) // Thu 7 PM: Friday's still to come
    expect(order('2026-10-09T07:30:00-04:00')).toEqual(weekFirst) // Fri 7:30 AM: 8 AM still to come
    expect(order('2026-10-09T08:00:00-04:00')).toEqual(shabbosFirst) // Fri 8 AM: the last has started
    expect(order('2026-10-10T15:00:00-04:00')).toEqual(shabbosFirst) // Shabbos afternoon
    expect(order('2026-10-10T19:30:00-04:00')).toEqual(weekFirst) // after havdalah: the week ahead
  })

  it('a shul with nothing on Friday: Shabbos first once Thursday’s last has started', () => {
    at('2026-10-08T07:00:00-04:00') // Thu 7 AM: Mekor's Thursday 6:45 AM was its last
    show(mekor)
    expect(boxes()).toEqual(['davening-shabbos', 'davening-weekday'])
    cleanup()
    at('2026-10-08T06:00:00-04:00') // Thu 6 AM: still to come
    show(mekor)
    expect(boxes()).toEqual(['davening-weekday', 'davening-shabbos'])
  })

  it('a Shabbos-only shul: one box, notes as “Until”, and nothing asking for weekday times', () => {
    at('2026-10-06T17:30:00-04:00')
    show(rodeph)
    expect(screen.queryByTestId('davening-weekday')).not.toBeInTheDocument()
    expect(screen.getByTestId('davening-shabbos-lines')).toHaveTextContent('Friday nightKabbalas ShabbosUntil 7:30 PM6 PMShabbosShacharisUntil 12:15 PM10:45 AM')
    expect(screen.getByTestId('listing-davening')).not.toHaveTextContent(/No weekday minyan|Add one/)
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

  // Nov 19 (boards 5e-7e): no box waiting for this week's. The usual times
  // show, open, until it comes, and adding it is the usual box's own
  // "Update their times". (Oct 26 drew "Not on the guide yet" with Add.)
  it('before this week’s comes in, a shul that sends one out shows its usual times, “Update their times” adding it', () => {
    show(before)
    expect(screen.queryByTestId('davening-this-week-waiting')).not.toBeInTheDocument()
    expect(screen.queryByTestId('davening-this-shabbos')).not.toBeInTheDocument()
    expect(screen.queryByTestId('davening-folded')).not.toBeInTheDocument()
    const usual = screen.getByTestId('davening-shabbos')
    expect(usual).toHaveTextContent('Shacharis9:15 AM')
    fireEvent.click(within(usual).getByRole('button', { name: 'Update their times' }))
    expect(within(usual).getByTestId('update-times')).toBeInTheDocument()
  })

  it('once it’s in: This Shabbos, its dates, its times under Friday night and Shabbos, and the usual Shabbos times folded', () => {
    show([...before, weekPost('Shabbos Bereishis', '2026-10-09', '2026-10-10', { postedAt: '2026-10-07T15:00:00.000Z' })])
    expect(screen.queryByTestId('davening-this-week-waiting')).not.toBeInTheDocument()
    // Only Shabbos's times: no week box (drawn Oct 26).
    expect(screen.queryByTestId('davening-this-week')).not.toBeInTheDocument()
    const box = screen.getByTestId('davening-this-shabbos')
    expect(within(box).getByRole('heading', { name: 'This Shabbos' })).toBeInTheDocument()
    // Nov 19 (board 5e): its dates, not the newsletter's name for it.
    expect(within(box).getByTestId('davening-this-shabbos-dates')).toHaveTextContent(/^Oct 9–10$/)
    expect(within(box).getByTestId('davening-shabbos-lines')).toHaveTextContent(/^Friday nightMincha & Maariv6:10 PMShabbosShacharisKiddush after davening9 AM$/)
    // It's this week's schedule, not something set against "usual times"
    // (the user, Oct 20).
    expect(box).not.toHaveTextContent(/usual/i)
    expect(screen.getByTestId('davening-folded')).toHaveTextContent(/^Usual Shabbos times$/)
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
    const box = screen.getByTestId('davening-this-shabbos')
    expect(within(box).getByTestId('freshness')).toHaveTextContent(/^Confirmed by Mekor Habracha, Oct 7/)
    expect(box).not.toHaveTextContent('Posted')
    expect(within(box).queryByRole('button', { name: 'Update their times' })).not.toBeInTheDocument()
    fireEvent.click(within(box).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', ['Shabbos Bereishis'])
  })

  // Nov 10, Mekor: Friday night from a person's week, Shabbos morning's
  // 9:15 PM from a one-day post off their website. Edit opened only the
  // first, so the 9:15 PM couldn't be found to change.
  it('Edit opens every post the box shows a time from', () => {
    const onEditBox = vi.fn()
    const person = { ...weekPost('Times for Oct 4 – Oct 9', '2026-10-04', '2026-10-09', { postedAt: '2026-10-06T15:00:00.000Z' }), minyanim: [{ id: 'p1', tefillah: 'mincha_maariv', on: ['2026-10-09'], time: '7:00pm' }] }
    const site = { ...weekPost('Times for Oct 10', '2026-10-10', '2026-10-10', { postedBy: 'website', postedAt: '2026-10-07T15:00:00.000Z' }), minyanim: [{ id: 's1', tefillah: 'shacharis', on: ['2026-10-10'], time: '9:15pm' }] }
    show([...before, person, site], { onEditBox })
    const box = screen.getByTestId('davening-this-shabbos')
    expect(within(box).getByTestId('davening-shabbos-lines')).toHaveTextContent('ShabbosShacharis9:15 PM')
    fireEvent.click(within(box).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', expect.arrayContaining(['Times for Oct 4 – Oct 9', 'Times for Oct 10']))
  })

  // Oct 19: opened, the usual times stayed open, and read as if current.
  it('the usual times, opened, still say this week’s replace them, and fold again', () => {
    show([...before, weekPost('Shabbos Bereishis', '2026-10-09', '2026-10-10')])
    fireEvent.click(screen.getByTestId('davening-folded'))
    const usual = screen.getByTestId('davening-shabbos')
    expect(usual).toHaveTextContent('Shacharis9:15 AM')
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

  // Oct 19: every usual weekday minyan at Mekor is in its WhatsApp group,
  // and the week's box took it. The user, Nov 5: "no borrowing". A week's
  // minyan is sign-up only when the week says so.
  it('the week’s minyanim take no sign-up group from the usual ones', () => {
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
    expect(within(box).queryByTestId('sign-up-box')).not.toBeInTheDocument()
    expect(within(box).queryByRole('link', { name: 'Say you’re coming' })).not.toBeInTheDocument()
    expect(within(box).queryByTestId('sign-up-time')).not.toBeInTheDocument()
  })

  // Oct 19: Mekor's newsletter week ran Sunday to Friday night, headed
  // "Shabbat Schedule". It was titled for the Shabbos it didn't cover, and
  // folded away (greyed) Shabbos morning's usual time, which still held.
  it('a week of weekdays to Friday night: This Shabbos by its dates, and Shabbos’s usual times left open', () => {
    const weekdays = {
      ...weekPost('Shabbat Schedule', '2026-10-04', '2026-10-09'),
      minyanim: [
        { id: 'w1', tefillah: 'shacharis', on: ['2026-10-05'], time: '6:50am' },
        { id: 'w2', tefillah: 'kabbalas_shabbos', on: ['2026-10-09'], time: '5:55pm' },
      ],
    }
    show([...before, weekdays])
    // Thursday: Monday's Shacharis is gone by, and a week of only days gone
    // by has no box; Friday night is Shabbos's.
    expect(screen.queryByTestId('davening-this-week')).not.toBeInTheDocument()
    expect(screen.getByTestId('davening-this-shabbos-dates')).toHaveTextContent(/^Oct 9$/)
    const shabbos = screen.getByTestId('davening-shabbos')
    expect(shabbos).toHaveTextContent('Shacharis9:15 AM')
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
    expect(box).toHaveTextContent('This week')
    expect(box).toHaveTextContent('Oct 4–10')
    expect(box).toHaveTextContent('No minyan this week')
    expect(screen.queryByTestId('davening-weekday')).not.toBeInTheDocument()
    expect(screen.queryByTestId('davening-shabbos')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('davening-folded').map((f) => f.textContent)).toEqual(['Usual weekday times', 'Usual Shabbos times'])
    fireEvent.click(screen.getAllByTestId('davening-folded')[0])
    expect(screen.getByTestId('davening-fold-reason')).toHaveTextContent('Not this week: no minyan this week')
    fireEvent.click(within(box).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', ['Times for Oct 4 – Oct 10'])
  })

  // Drawn Oct 26 (boards 2, 3 and 3b): the week's weekdays and This
  // Shabbos, ordered as the usual boxes are; a time already started today
  // greyed.
  describe('the week and This Shabbos (Oct 26)', () => {
    afterEach(() => {
      zmanimShabbos.candleLighting = null
    })
    const fullWeek = {
      ...weekPost('Times for Oct 4 – Oct 10', '2026-10-04', '2026-10-10', { postedBy: 'website' }),
      minyanim: [
        { id: 'f1', tefillah: 'shacharis', on: ['2026-10-08', '2026-10-09'], time: '7:00am' },
        { id: 'f2', tefillah: 'shacharis', on: ['2026-10-08', '2026-10-09'], time: '8:00am' },
        { id: 'f3', tefillah: 'kabbalas_shabbos', on: ['2026-10-09'], time: '6:20pm' },
        { id: 'f4', tefillah: 'shacharis', on: ['2026-10-10'], time: '9:00am' },
      ],
    }
    const showAt = (iso: string, schedules: unknown[]) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(iso))
      const shul = makeListing({ id: 'k', name: 'Lower Merion Synagogue', category: 'synagogue', minyanim: usual, minyanim_schedules: schedules })
      renderWithProviders(<DaveningCard item={shul} minyanim={usual} schedules={schedules} category={shuls} />, { content: { categories: [shuls] } })
    }
    const dated = () => [...screen.getByTestId('listing-davening').querySelectorAll('[data-testid="davening-this-week"], [data-testid="davening-this-shabbos"]')].map((e) => e.getAttribute('data-testid'))

    // Nov 19 (board 5e): a row a date from Sunday, the dates gone by greyed
    // and today tinted. Today's started times aren't greyed one by one now.
    it('Friday morning: the week first, the days gone by greyed; once the last has started, This Shabbos first', () => {
      showAt('2026-10-09T07:30:00-04:00', [fullWeek])
      expect(dated()).toEqual(['davening-this-week', 'davening-this-shabbos'])
      const rows = [...within(screen.getByTestId('davening-this-week')).getByTestId('davening-this-week-days').querySelectorAll('tbody tr')]
      expect(rows.map((r) => r.textContent)).toEqual(['ThuOct 87, 8 AM', 'FriOct 9Today7, 8 AM'])
      expect(rows[0]).toHaveAttribute('data-past')
      expect(rows[1]).toHaveAttribute('data-today')
      expect(rows[1]).not.toHaveAttribute('data-past')
      cleanup()
      showAt('2026-10-09T11:00:00-04:00', [fullWeek])
      expect(dated()).toEqual(['davening-this-shabbos', 'davening-this-week'])
    })

    // The user, Oct 27, and again Nov 20 though board 5e drew it: no candle
    // lighting, the city's time, not the shul's, and on the home page.
    // No havdalah either (Nov 20). Kol Tzedek got a Friday with nothing
    // else on it; it still doesn't.
    it('This Shabbos: no candle lighting or havdalah, and no Friday of its own when the week gives Friday nothing', () => {
      zmanAnchors.value = { timezone: 'America/New_York', candleLightingIso: '2026-10-09T18:05:00-04:00', havdalahIso: '2026-10-10T19:05:00-04:00' }
      showAt('2026-10-08T16:00:00-04:00', [fullWeek])
      expect(within(screen.getByTestId('davening-this-shabbos')).getByTestId('davening-shabbos-lines')).toHaveTextContent(
        /^Friday nightKabbalas Shabbos6:20 PMShabbosShacharis9 AM$/,
      )
      expect(screen.queryByText(/Candle lighting|Havdalah/)).not.toBeInTheDocument()
      cleanup()
      showAt('2026-10-08T16:00:00-04:00', [{ ...fullWeek, minyanim: fullWeek.minyanim.filter((m) => m.id !== 'f3') }])
      const shabbos = screen.getByTestId('davening-this-shabbos')
      expect(within(shabbos).getByTestId('davening-shabbos-lines')).toHaveTextContent(/^ShabbosShacharis9 AM$/)
      expect(within(shabbos).getByTestId('davening-this-shabbos-dates')).toHaveTextContent(/^Oct 10$/)
    })

    it('no dated This Shabbos while only the usual times are known', () => {
      showAt('2026-10-06T10:00:00-04:00', [{ ...fullWeek, minyanim: fullWeek.minyanim.filter((m) => m.id === 'f1') }])
      expect(screen.getByTestId('davening-this-week')).toBeInTheDocument()
      expect(screen.queryByTestId('davening-this-shabbos')).not.toBeInTheDocument()
      expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('Usual Shabbos times')
    })
  })

  describe('the week’s box, as live shuls showed it (Oct 27)', () => {
    const showTue = (schedules: unknown[], { rows = usual, ...over }: { rows?: unknown[] } & Record<string, unknown> = {}) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-06T10:00:00-04:00')) // Tue Oct 6
      const shul = makeListing({ id: 'k', name: 'Mekor Habracha', category: 'synagogue', minyanim: rows, minyanim_schedules: schedules, ...over })
      renderWithProviders(<DaveningCard item={shul} minyanim={rows} schedules={schedules} category={shuls} />, { content: { categories: [shuls] } })
    }

    // Rodeph Shalom: their whole week, one weekday minyan, read "Oct 29".
    it('dated as this week, Sunday to Friday, not just the day it has a minyan', () => {
      const whole = {
        ...weekPost('Times for Oct 4 – Oct 10', '2026-10-04', '2026-10-10', { postedBy: 'website', whole: true }),
        minyanim: [
          { id: 'w1', tefillah: 'shacharis', on: ['2026-10-08'], time: '8:10am' },
          { id: 'w2', tefillah: 'kabbalas_shabbos', on: ['2026-10-09'], time: '6:00pm' },
        ],
      }
      showTue([whole])
      expect(screen.getByTestId('davening-this-week-dates')).toHaveTextContent(/^Oct 4–9$/)
      // Sunday to Friday, a dash on each day with nothing (board 5e).
      expect([...screen.getByTestId('davening-this-week-days').querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual([
        'SunOct 4–', 'MonOct 5–', 'TueOct 6Today–', 'WedOct 7–', 'ThuOct 88:10 AM', 'FriOct 9–',
      ])
    })

    // BZBI: a pasted week to Thursday. The user, Oct 27: this week is
    // Sunday to Friday; a day the week doesn't have has no minyan, never
    // its usual times put in.
    it('a weekday the week doesn’t reach has nothing, the box still dated to Friday', () => {
      const rows = [...usual, { id: 'e', tefillah: 'shacharis', days: ['fri'], time: '7:30am' }]
      const pasted = {
        ...weekPost('Times for Oct 2 – Oct 8', '2026-10-02', '2026-10-08'),
        minyanim: [
          { id: 'p1', tefillah: 'shacharis', on: ['2026-10-05', '2026-10-08'], time: '6:45am' },
          { id: 'p2', tefillah: 'shacharis', on: ['2026-10-06', '2026-10-07'], time: '7:00am' },
        ],
      }
      showTue([pasted], { rows })
      const week = screen.getByTestId('davening-this-week')
      expect(within(week).getByTestId('davening-this-week-days')).toHaveTextContent(/ThuOct 86:45 AM$/)
      expect(week).not.toHaveTextContent('Fri Oct 9')
      expect(week).not.toHaveTextContent('7:30 AM')
      expect(screen.getByTestId('davening-this-week-dates')).toHaveTextContent(/^Oct 4–9$/)
    })

    // Shtiebel: its website's week, approved by an admin, said only "last
    // checked": the approval dates the whole listing, which no box goes by.
    it('a week from their website, approved, says who gave it', () => {
      const site = weekPost('Times for Oct 4 – Oct 10', '2026-10-04', '2026-10-10', { postedBy: 'website', postedAt: '2026-10-06T11:48:00.000Z' })
      showTue([{ ...site, minyanim: [{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-07'], time: '7:30am' }] }], {
        confirmedAt: '2026-10-06T18:56:00.000Z',
        confirmedFrom: { from: 'Mekor Habracha', at: '2026-10-06T18:56:00.000Z' },
      })
      expect(within(screen.getByTestId('davening-this-week')).getByTestId('freshness')).toHaveTextContent(/^Confirmed by Mekor Habracha, Oct 6\./)
    })
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
    expect(box).toHaveTextContent(/^This weekOct 8ShacharisThuOct 88:10 AM/)
    expect(box).not.toHaveTextContent('Oct 15')
    expect(box).not.toHaveTextContent(/usual|in place of/i)
    expect(screen.queryByTestId('davening-special-box')).not.toBeInTheDocument()
    // Nothing of the usual times is folded away.
    expect(screen.getByTestId('davening-shabbos')).toHaveTextContent('Shacharis10:45 AM')
    expect(screen.queryByTestId('davening-folded')).not.toBeInTheDocument()
  })

  // Oct 23: "on Friday people want to see shabbos as last. But right when
  // shabbos is over we need to show the week's schedule."
  it('on Shabbos, that day’s; after havdalah, the week ahead’s', () => {
    show('2026-10-10T15:00:00-04:00', thursdays) // Sat Oct 10, 3 PM
    expect(screen.queryByTestId('davening-this-week')).not.toBeInTheDocument()
    cleanup()
    show('2026-10-10T19:30:00-04:00', thursdays) // after havdalah
    expect(screen.getByTestId('davening-this-week')).toHaveTextContent('ThuOct 158:10 AM')
  })

  it('the day before, it stays there rather than in a box of its own', () => {
    show('2026-10-07T10:00:00-04:00', thursdays) // Wed Oct 7
    expect(screen.getByTestId('davening-this-week')).toHaveTextContent('ShacharisThuOct 88:10 AM')
    expect(screen.queryByTestId('davening-special-box')).not.toBeInTheDocument()
  })

  it('leaves a Yom Tov schedule its own box, the same day', () => {
    show('2026-10-01T10:00:00-04:00', [sukkos, day('2026-10-01', 'Thu Oct 1'), day('2026-10-02', 'Fri Oct 2')]) // Chol HaMoed
    expect(screen.getByTestId('davening-special-box')).toHaveTextContent('Sukkos 5787')
    expect(screen.getByTestId('davening-this-week')).toHaveTextContent('ShacharisThuOct 1Today8:10 AMFriOct 28:10 AM')
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
    expect(onEditBox).toHaveBeenCalledWith('this_week', 'This week’s schedule', ['2026-10-08'])
  })

  it('keeps an occasion’s name under its date', () => {
    show('2026-10-06T10:00:00-04:00', [day('2026-10-08', 'Thanksgiving')])
    expect(screen.getByTestId('davening-this-week-days')).toHaveTextContent(/^ShacharisThuOct 8Thanksgiving8:10 AM$/)
  })

  it('with a week the shul sent out: the weekdays in the week’s box, Shabbos in This Shabbos', () => {
    const week = { id: 'w', name: 'Shabbos Bereishis', from: '2026-10-09', to: '2026-10-10', mode: 'replace', kind: 'week', minyanim: [{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-10'], time: '9:00am' }] }
    show('2026-10-06T10:00:00-04:00', [week, ...thursdays])
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).getByTestId('davening-this-week-dates')).toHaveTextContent(/^Oct 8$/)
    expect(within(box).getByTestId('davening-this-week-days')).toHaveTextContent(/^ShacharisThuOct 88:10 AM$/)
    const shabbos = screen.getByTestId('davening-this-shabbos')
    expect(within(shabbos).getByTestId('davening-this-shabbos-dates')).toHaveTextContent(/^Oct 10$/)
    expect(within(shabbos).getByTestId('davening-shabbos-lines')).toHaveTextContent(/^ShabbosShacharis9 AM$/)
  })

  it('a time the week already gives is there once', () => {
    const week = { id: 'w', name: 'Times for Oct 4 – Oct 10', from: '2026-10-04', to: '2026-10-10', mode: 'replace', kind: 'week', postedBy: 'website', minyanim: [{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-08'], time: '8:10am' }] }
    show('2026-10-06T10:00:00-04:00', [week, ...thursdays])
    expect(screen.getByTestId('davening-this-week-days')).toHaveTextContent(/^ShacharisThuOct 88:10 AM$/)
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

  it('is one week, day by day, the newsletter’s times on the day both give: weekdays, then This Shabbos', () => {
    show([website, newsletter])
    expect(screen.getAllByTestId('davening-this-week')).toHaveLength(1)
    expect(screen.getByTestId('davening-this-week-dates')).toHaveTextContent(/^Oct 4–9$/)
    expect(screen.getByTestId('davening-this-week-days')).toHaveTextContent(/^ShacharisTueOct 6Today7 AMWedOct 77 AM$/)
    expect(within(screen.getByTestId('davening-this-shabbos')).getByTestId('davening-shabbos-lines')).toHaveTextContent(/^Friday nightKabbalas Shabbos6:10 PMShabbosShacharis9 AM$/)
    expect(screen.getByTestId('davening-this-shabbos-dates')).toHaveTextContent(/^Oct 9–10$/)
    expect(screen.getByTestId('davening-this-week')).not.toHaveTextContent(/usual/i)
  })

  it('each box’s Edit opens the week its times are from', () => {
    const onEditBox = vi.fn()
    show([website, newsletter], onEditBox)
    fireEvent.click(within(screen.getByTestId('davening-this-shabbos')).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenLastCalledWith('this_week', 'This week’s schedule', ['news'])
    fireEvent.click(within(screen.getByTestId('davening-this-week')).getByTestId('box-edit-button'))
    expect(onEditBox).toHaveBeenLastCalledWith('this_week', 'This week’s schedule', ['site'])
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
    // Nov 19 (board 7e): under its box, the line needn't name the times.
    expect(within(screen.getByTestId('davening-weekday')).getByTestId('freshness')).toHaveTextContent(/^Confirmed Aug 20\./)
    expect(within(screen.getByTestId('davening-shabbos')).getByTestId('freshness')).toHaveTextContent(/^Confirmed by community, Sep 29\./)
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
    // A row a day, Sunday to Thursday (board 7e, Nov 19).
    expect(marked.map((m) => m.textContent)).toEqual(Array(5).fill('9:45 PM (check group first)'))
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
    expect(screen.getByTestId('davening-shabbos-lines')).toHaveTextContent('ShacharisCheck group first7:30 AM')
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

  it('this week’s: under the grid, naming the minyan, opening the meeting in a new tab', () => {
    show(usual, [week([{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-22'], time: '8:10am', joinLink: ZOOM }, { id: 'w2', tefillah: 'kabbalas_shabbos', on: ['2026-10-23'], time: '6:00pm' }])])
    const box = screen.getByTestId('davening-this-week')
    // Under the grid, naming its minyan, as under the usual table (Nov 19).
    const links = within(box).getAllByRole('link', { name: /on Zoom/ })
    expect(links.map((l) => l.textContent)).toEqual(['Join Thu Shacharis on Zoom'])
    expect(links[0]).toHaveAttribute('href', ZOOM)
    expect(links[0]).toHaveAttribute('target', '_blank')
  })

  // It used to take the usual minyan's link; the user, Nov 5: "no borrowing".
  it('a week that gives the time alone has no join link, even at the usual minyan’s time', () => {
    show([usual[0], { ...usual[1], joinLink: ZOOM }], [week([{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-22'], time: '8:10am' }, { id: 'w3', tefillah: 'shacharis', on: ['2026-10-22'], time: '7:00am' }])])
    const box = screen.getByTestId('davening-this-week')
    expect(within(box).queryByRole('link', { name: /on Zoom/ })).not.toBeInTheDocument()
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
