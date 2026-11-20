import { describe, expect, it } from 'vitest'
import type { Minyan, Tefillah } from './davening'
import type { ReadRegularTime, RegularReading } from './scheduleUpdate'
import { calendarListsUsual, fromReading, pick, sameNote, weekFrom, type DatedTime, type Finding, type Part, type SourceKind, type SourceRead, type WeekContext } from './shulTimes'

// Each case here is a real one (docs/shul-watch-rebuild.md, "Steps" 3 and
// "Cases from live"), from the Nov 5–19 To do items and the newsletters
// read Nov 19. The week is Sun Nov 15 – Sat Nov 21, 2026; today Thu Nov 19.

const WEEK = { from: '2026-11-15', to: '2026-11-21' }
const SUN = '2026-11-15', MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18', THU = '2026-11-19', FRI = '2026-11-20', SAT = '2026-11-21'
const WEEKDAYS = [SUN, MON, TUE, WED, THU, FRI]

const t = (date: string, tefillah: Tefillah, time: string, extra: Partial<DatedTime> = {}): DatedTime => ({ date, tefillah, time, ...extra })
const src = (id: string, kind: SourceKind, at = '2026-11-19T12:00:00Z') => ({ id, kind, label: id, at })
const read = (source: SourceRead['source'], shape: SourceRead['shape'], shows: { from: string; to: string }, times: DatedTime[], extra: Partial<SourceRead> = {}): SourceRead => ({ source, shape, shows, times, ...extra })
const m = (tefillah: Tefillah, days: Minyan['days'], time: string, extra: Partial<Minyan> = {}): Minyan => ({ id: `${tefillah}-${days.join('')}-${time}`, tefillah, days, time, ...extra })
const ctx = (over: Partial<WeekContext> = {}): WeekContext => ({
  week: WEEK,
  today: THU,
  usual: [],
  held: [],
  // Philadelphia, Fri Nov 20: candle lighting 4:24 PM, sunset 4:42 PM.
  zmanim: { [FRI]: { candleLighting: 16 * 60 + 24, sunset: 16 * 60 + 42 } },
  ...over,
})
const part = (fs: Finding[], p: Part) => fs.find((f) => f.part === p)!

// A shul with Shacharis every weekday and Mincha/Maariv Friday night and
// Shabbos morning: Mekor's shape, simplified.
const USUAL: Minyan[] = [
  m('shacharis', ['sun'], '8:30 AM'),
  m('shacharis', ['mon', 'tue', 'wed', 'thu', 'fri'], '6:45 AM'),
  m('mincha_maariv', ['fri'], '', { anchor: 'candle_lighting', offsetMinutes: 0 }),
  m('shacharis', ['sat'], '9:15 AM'),
]
const weekdayTimes = (except: string[] = []) => WEEKDAYS.filter((d) => !except.includes(d)).map((d) => t(d, 'shacharis', d === SUN ? '8:30 AM' : '6:45 AM'))

describe('a whole source', () => {
  it('Lower Merion: its calendar is the week, its homepage’s late Maariv is not looked at', () => {
    const calendar = read(src('calendar', 'calendar'), 'schedule', WEEK, [...weekdayTimes([THU]), t(THU, 'shacharis', '7:00 AM'), t(FRI, 'kabbalas_shabbos', '4:30 PM'), t(SAT, 'shacharis', '8:45 AM')])
    const homepage = read(src('homepage', 'page'), 'highlight', { from: WED, to: WED }, [t(WED, 'maariv', '9:30 PM')], { heading: 'This week at LMS' })
    const fs = weekFrom([homepage, calendar], ctx({ usual: USUAL }))
    expect(part(fs, 'weekdays')).toMatchObject({ do: 'take', from: { source: { id: 'calendar' } } })
    expect((part(fs, 'weekdays') as Extract<Finding, { do: 'take' }>).times.some((x) => x.time === '9:30 PM')).toBe(false)
    expect(part(fs, 'shabbos')).toMatchObject({ do: 'take', from: { source: { id: 'calendar' } } })
  })

  it('Society Hill: the whole email is both parts, the Monday Zoom Maariv included', () => {
    const email = read(src('email', 'newsletter'), 'schedule', WEEK, [t(MON, 'maariv', '7:00 PM', { notes: 'Zoom' }), t(FRI, 'kabbalas_shabbos', '6:00 PM'), t(SAT, 'shacharis', '9:30 AM')], {
      heading: 'This Week at Society Hill',
    })
    const fs = weekFrom([email], ctx())
    expect(part(fs, 'weekdays')).toMatchObject({ do: 'take', times: [{ date: MON, tefillah: 'maariv', notes: 'Zoom' }] })
    expect(part(fs, 'shabbos')).toMatchObject({ do: 'take' })
  })

  it('the Shtiebel: a Shabbos-only email takes Shabbos and says nothing about weekdays', () => {
    const email = read(src('email', 'newsletter'), 'schedule', { from: FRI, to: SAT }, [t(FRI, 'kabbalas_shabbos', '4:25 PM'), t(SAT, 'shacharis', '9:00 AM'), t(SAT, 'mincha', '4:15 PM')])
    const fs = weekFrom([email], ctx({ usual: USUAL }))
    expect(part(fs, 'shabbos')).toMatchObject({ do: 'take' })
    expect(part(fs, 'weekdays')).toMatchObject({ do: 'nothing', reason: 'not read' })
  })

  it('a day the week leaves out has no minyan: BZBI’s regular times without Wednesday', () => {
    const email = read(src('email', 'newsletter'), 'schedule', WEEK, weekdayTimes([WED]))
    const take = part(weekFrom([email], ctx({ usual: USUAL })), 'weekdays') as Extract<Finding, { do: 'take' }>
    expect(take.do).toBe('take')
    expect(take.times.map((x) => x.date)).not.toContain(WED)
  })

  it('a week said in a sentence: the cancellation comes off and is quoted', () => {
    const quote = 'No Shabbat Services!'
    const email = read(src('email', 'newsletter'), 'schedule', WEEK, [t(SAT, 'shacharis', '10:00 AM')], { cancelled: [{ date: FRI, quote }] })
    const take = part(weekFrom([email], ctx()), 'shabbos') as Extract<Finding, { do: 'take' }>
    expect(take).toMatchObject({ do: 'take', quotes: [quote] })
    expect(take.times.map((x) => x.date)).toEqual([SAT])
  })

  it('never reads the usual times: the same week whatever they are', () => {
    const email = read(src('email', 'newsletter'), 'schedule', WEEK, [...weekdayTimes([TUE]), t(SAT, 'shacharis', '9:15 AM')])
    const strip = (fs: Finding[]) => JSON.stringify(fs)
    expect(strip(weekFrom([email], ctx({ usual: USUAL })))).toBe(strip(weekFrom([email], ctx({ usual: [] }))))
  })

  // The Shtiebel's calendar, Nov 19 dry run: next week's weekdays exactly
  // their usual times, and nothing on the listing for that week yet. It is
  // still put to the admin, said to be as usual; if that proves accurate,
  // it may later go up on its own (the user, Nov 20).
  it('the Shtiebel: a whole week that is only the usual times goes to the admin, marked as usual', () => {
    const fs = weekFrom([read(src('calendar', 'calendar'), 'schedule', WEEK, weekdayTimes())], ctx({ usual: USUAL }))
    expect(part(fs, 'weekdays')).toMatchObject({ do: 'take', asUsual: true })
    const online = weekdayTimes().map((x) => (x.date === MON ? { ...x, notes: 'Online only' } : x))
    const changed = part(weekFrom([read(src('calendar', 'calendar'), 'schedule', WEEK, online)], ctx({ usual: USUAL })), 'weekdays')
    expect(changed).toMatchObject({ do: 'take' })
    expect(changed).not.toHaveProperty('asUsual')
  })

  it('files nothing when it is the week we already have', () => {
    const times = weekdayTimes()
    const email = read(src('email', 'newsletter'), 'schedule', { from: SUN, to: FRI }, times)
    const fs = weekFrom([email], ctx({ held: [{ part: 'weekdays', times }] }))
    expect(part(fs, 'weekdays')).toMatchObject({ do: 'nothing', reason: 'same' })
  })
})

describe('one pick per part', () => {
  it('BZBI: a newsletter wins over a calendar that disagrees with it', () => {
    const calendar = read(src('calendar', 'calendar', '2026-11-19T00:00:00Z'), 'schedule', WEEK, [t(SUN, 'shacharis', '9:00 AM'), t(TUE, 'shacharis', '7:45 AM')])
    const email = read(src('email', 'newsletter', '2026-11-17T00:00:00Z'), 'schedule', WEEK, weekdayTimes())
    expect(part(weekFrom([calendar, email], ctx()), 'weekdays')).toMatchObject({ do: 'take', from: { source: { id: 'email' } } })
  })

  it('BZBI: a whole calendar waits while the newsletter is due, so a part is filed once', () => {
    const next = { from: '2026-11-22', to: '2026-11-28' }
    const calendar = read(src('calendar', 'calendar'), 'schedule', next, [t('2026-11-22', 'shacharis', '9:00 AM'), t('2026-11-24', 'shacharis', '7:45 AM')])
    const fs = weekFrom([calendar], ctx({ week: next, newsletterGives: ['weekdays', 'shabbos'] }))
    expect(part(fs, 'weekdays')).toMatchObject({ do: 'nothing', reason: 'waiting' })
    // Once the part has begun without it, the calendar is the week.
    expect(part(weekFrom([calendar], ctx({ week: next, today: '2026-11-23', newsletterGives: ['weekdays'] })), 'weekdays')).toMatchObject({ do: 'take' })
  })

  it('Kol Tzedek: a newsletter wins over its homepage and Shabbat page, so they don’t take turns', () => {
    const email = read(src('email', 'newsletter'), 'schedule', { from: FRI, to: SAT }, [t(FRI, 'kabbalas_shabbos', '6:30 PM', { notes: 'Online only' }), t(SAT, 'shacharis', '10:00 AM')])
    const home = read(src('home', 'page', '2026-11-19T20:00:00Z'), 'schedule', { from: FRI, to: SAT }, [t(FRI, 'kabbalas_shabbos', '6:30 PM', { notes: 'Hybrid' }), t(SAT, 'shacharis', '10:00 AM')])
    expect(part(weekFrom([home, email], ctx()), 'shabbos')).toMatchObject({ from: { source: { id: 'email' } } })
  })

  // Kol Tzedek, Nov 19 dry run: its homepage carries the same calendar feed
  // as its calendar page, and the reader gave Shabbos morning's end two ways
  // ("until 10:45 AM", "until 12:30 PM"). Whichever page ran last filed it.
  it('Kol Tzedek: two sources of one rank, one giving the week we hold, file nothing', () => {
    const held = [t(FRI, 'kabbalas_shabbos', '6:30pm', { notes: 'until 8:00 PM' }), t(SAT, 'shacharis', '10:00am', { notes: 'until 12:30 PM' })]
    const calendar = read(src('calendar', 'calendar', '2026-11-19T11:00:00Z'), 'schedule', { from: THU, to: SAT }, [t(FRI, 'kabbalas_shabbos', '6:30 PM', { notes: 'until 8:00 PM' }), t(SAT, 'shacharis', '10:00 AM', { notes: 'until 12:30 PM' })])
    const homepage = read(src('homepage', 'calendar', '2026-11-19T11:05:00Z'), 'schedule', { from: THU, to: SAT }, [t(FRI, 'kabbalas_shabbos', '6:30 PM', { notes: 'until 8:00 PM' }), t(SAT, 'shacharis', '10:00 AM', { notes: 'until 10:45 AM' })])
    const fs = weekFrom([homepage, calendar], ctx({ held: [{ part: 'shabbos', times: held }] }))
    expect(part(fs, 'shabbos')).toEqual({ do: 'nothing', part: 'shabbos', reason: 'same' })
    // A newer source of a lower rank still doesn't get a say.
    const page = read(src('page', 'page', '2026-11-19T11:10:00Z'), 'schedule', { from: THU, to: SAT }, [t(FRI, 'kabbalas_shabbos', '6:00 PM'), t(SAT, 'shacharis', '10:00 AM')])
    expect(part(weekFrom([page, calendar], ctx({ held: [{ part: 'shabbos', times: held }] })), 'shabbos')).toMatchObject({ do: 'nothing', reason: 'same' })
  })

  it('Sons of Israel’s usual times: the regular-schedule page over the homepage', () => {
    expect(pick([src('home', 'page'), src('tefillot', 'schedule')])?.id).toBe('tefillot')
    expect(pick([src('home', 'page'), src('cal', 'calendar'), src('email', 'newsletter')])?.id).toBe('email')
    expect(pick([src('a', 'page', '2026-11-01T00:00:00Z'), src('b', 'page', '2026-11-02T00:00:00Z')])?.id).toBe('b')
    expect(pick([])).toBeNull()
  })
})

describe('a calendar’s weeks', () => {
  it('the Little Shul: an empty week is no minyan when something is posted after it', () => {
    const calendar = read(src('calendar', 'calendar'), 'schedule', WEEK, [], { lastPosted: '2026-12-05' })
    expect(part(weekFrom([calendar], ctx({ usual: USUAL })), 'shabbos')).toMatchObject({ do: 'take', times: [] })
  })

  it('an empty week with nothing posted after it isn’t posted yet (Leyv Ha-Ir, Nov 22–28)', () => {
    const calendar = read(src('calendar', 'calendar'), 'schedule', WEEK, [], { lastPosted: '2026-11-07' })
    expect(part(weekFrom([calendar], ctx()), 'shabbos')).toMatchObject({ do: 'nothing', reason: 'not read' })
  })

  it('Sons of Israel: a calendar showing Thu–Sat is whole for Shabbos only; the days before aren’t cancelled', () => {
    const calendar = read(src('calendar', 'calendar'), 'schedule', { from: THU, to: SAT }, [t(THU, 'shacharis', '6:45 AM'), t(FRI, 'shacharis', '6:45 AM'), t(SAT, 'shacharis', '9:15 AM')])
    const fs = weekFrom([calendar], ctx({ usual: USUAL }))
    expect(part(fs, 'shabbos')).toMatchObject({ do: 'take' })
    expect(part(fs, 'weekdays')).toMatchObject({ do: 'nothing', reason: 'agrees' })
  })
})

describe('a short source', () => {
  it('Mekor: its homepage’s Friday isn’t looked at beside the newsletter', () => {
    const home = read(src('home', 'page'), 'highlight', { from: FRI, to: FRI }, [t(FRI, 'mincha_maariv', '4:25 PM')])
    const email = read(src('email', 'newsletter'), 'schedule', WEEK, [t(FRI, 'mincha_maariv', '4:30 PM'), t(SAT, 'shacharis', '9:15 AM')])
    expect(part(weekFrom([home, email], ctx({ usual: USUAL })), 'shabbos')).toMatchObject({ do: 'take', from: { source: { id: 'email' } } })
  })

  it('Mekor: its homepage waits while the newsletter is due', () => {
    const home = read(src('home', 'page'), 'highlight', { from: FRI, to: FRI }, [t(FRI, 'mincha_maariv', '4:40 PM')])
    expect(part(weekFrom([home], ctx({ usual: USUAL, newsletterGives: ['shabbos'] })), 'shabbos')).toMatchObject({ do: 'nothing', reason: 'waiting' })
    // Saturday, and no newsletter came: now it is looked at.
    expect(part(weekFrom([home], ctx({ usual: USUAL, today: SAT, newsletterGives: ['shabbos'] })), 'shabbos')).toMatchObject({ do: 'ask' })
  })

  it('a highlight that agrees is ignored: a highlight never removes a minyan', () => {
    const home = read(src('home', 'page'), 'highlight', { from: FRI, to: FRI }, [t(FRI, 'kabbalas_shabbos', '4:25 PM')], { heading: 'This Shabbat' })
    expect(part(weekFrom([home], ctx({ usual: USUAL })), 'shabbos')).toMatchObject({ do: 'nothing', reason: 'agrees' })
  })

  it('a highlight with a different time goes to the admin, saying how it was read', () => {
    const home = read(src('home', 'page'), 'highlight', { from: SAT, to: SAT }, [t(SAT, 'shacharis', '10:00 AM')], { heading: 'This Shabbat' })
    const ask = part(weekFrom([home], ctx({ usual: USUAL })), 'shabbos') as Extract<Finding, { do: 'ask' }>
    expect(ask).toMatchObject({ do: 'ask', different: [{ read: { time: '10:00 AM' } }], missing: [] })
    expect(ask.readAs).toBe('Read as a highlight, under “This Shabbat”')
  })

  it('a short schedule that leaves out a usual minyan on a day it shows goes to the admin', () => {
    const page = read(src('page', 'page'), 'schedule', { from: MON, to: MON }, [], { cancelled: [] })
    const withMaariv = read(src('page', 'page'), 'schedule', { from: MON, to: MON }, [t(MON, 'maariv', '7:00 PM')])
    expect(part(weekFrom([page], ctx({ usual: USUAL })), 'weekdays')).toMatchObject({ do: 'nothing' })
    expect(part(weekFrom([withMaariv], ctx({ usual: USUAL })), 'weekdays')).toMatchObject({ do: 'ask', extra: [{ tefillah: 'maariv' }], missing: [{ date: MON }] })
  })

  it('Kesher Israel: a short source giving only the usual times files nothing', () => {
    const home = read(src('home', 'page'), 'highlight', { from: FRI, to: SAT }, [t(FRI, 'mincha_maariv', '4:24 PM'), t(SAT, 'shacharis', '9:15 AM')])
    expect(part(weekFrom([home], ctx({ usual: USUAL })), 'shabbos')).toMatchObject({ do: 'nothing', reason: 'agrees' })
  })

  it('a cancellation in a short source goes to the admin with its words', () => {
    const home = read(src('home', 'page'), 'highlight', { from: FRI, to: FRI }, [], { cancelled: [{ date: FRI, quote: 'No services this Friday' }] })
    expect(part(weekFrom([home], ctx({ usual: USUAL })), 'shabbos')).toMatchObject({ do: 'ask', quotes: ['No services this Friday'] })
  })
})

describe('what isn’t counted', () => {
  it('Society Hill’s Kristallnacht email and BZBI’s Hanukkah email: events are no part', () => {
    const event = read(src('email', 'newsletter'), 'event', { from: MON, to: MON }, [t(MON, 'other', '5:00 PM')])
    const fs = weekFrom([event], ctx({ usual: USUAL }))
    expect(fs).toHaveLength(2)
    expect(fs.every((f) => f.do === 'nothing')).toBe(true)
  })

  it('Mekor’s “other” at 9:15 PM on Shabbos isn’t a minyan', () => {
    const home = read(src('home', 'page'), 'highlight', { from: SAT, to: SAT }, [t(SAT, 'other', '9:15 PM')])
    expect(part(weekFrom([home], ctx({ usual: USUAL })), 'shabbos')).toMatchObject({ do: 'nothing' })
  })
})

describe('notes compared by what they say', () => {
  it('Rodeph Shalom’s Thursday note, four ways in one week, is one note', () => {
    expect(sameNote('Online; until 8:40 AM', 'Online')).toBe(true)
    expect(sameNote('Online; until 8:40 AM', 'until 8:40 AM; Online')).toBe(true)
    expect(sameNote('Online; until 8:40 AM', 'Online only')).toBe(true)
    expect(sameNote('Online', 'Online only')).toBe(true)
    expect(sameNote('until 8:40 AM', 'until 8:40')).toBe(true)
    expect(sameNote(undefined, '')).toBe(true)
  })

  // Kol Tzedek's Shabbos morning, read three ways from one feed (Nov 19).
  it('Kol Tzedek: the same words, hyphened, shortened or with the tefillah named, is one note', () => {
    const held = 'Masked; In-Person; until 12:30 PM; Torah Study with Rabbi Mó'
    expect(sameNote(held, 'Masked; in person; Torah Study; until 12:30 PM')).toBe(true)
    expect(sameNote(held, 'Masked; in-person; until 12:30 PM; Shacharit & Torah Study with Rabbi Mó')).toBe(true)
  })

  it('a note that says something new is a change', () => {
    expect(sameNote('In person', 'Not in person')).toBe(false)
    expect(sameNote('until 12:30 PM', 'until 1:30 PM')).toBe(false)
    expect(sameNote('Hybrid', 'Online only')).toBe(false)
    expect(sameNote('Online', 'Online; Celebrating the Bar Mitzvah of Sam')).toBe(false)
    expect(sameNote(undefined, 'Zoom')).toBe(false)
  })

  it('a week whose notes are only reworded files nothing', () => {
    const held = [t(THU, 'shacharis', '8:10 AM', { notes: 'Online; until 8:40 AM' })]
    for (const notes of ['Online', 'until 8:40 AM; Online', 'Online only']) {
      const calendar = read(src('calendar', 'calendar'), 'schedule', { from: SUN, to: FRI }, [t(THU, 'shacharis', '8:10 AM', { notes })])
      expect(part(weekFrom([calendar], ctx({ held: [{ part: 'weekdays', times: held }] })), 'weekdays')).toMatchObject({ do: 'nothing', reason: 'same' })
    }
  })
})

describe('fromReading: a reader’s reply as the rules take it', () => {
  const rt = (tefillah: Tefillah, days: ReadRegularTime['days'], time: string, extra: Partial<ReadRegularTime> = {}): ReadRegularTime => ({ id: `${tefillah}${time}`, tefillah, days, time, quote: `${tefillah} ${time}`, checked: true, ...extra })
  const reading = (times: ReadRegularTime[], extra: Partial<RegularReading> = {}): RegularReading => ({ kind: 'week', complete: false, season: null, title: null, startsOn: null, from: null, to: null, times, ...extra })

  it('BZBI: an email’s weekday times are that week’s, on each of those days', () => {
    const r = fromReading(reading([rt('shacharis', ['mon', 'tue', 'thu'], '7:00 AM'), rt('maariv', ['sat'], '5:30 PM', { date: SAT })], { shape: 'schedule' }), src('email', 'newsletter'), { week: WEEK })
    expect(r.shows).toEqual(WEEK)
    expect(r.times.map((x) => `${x.date} ${x.tefillah}`)).toEqual([`${MON} shacharis`, `${TUE} shacharis`, `${THU} shacharis`, `${SAT} maariv`])
  })

  it('a page’s weekday times are its usual times, not this week: only dated ones count, and it shows their days', () => {
    const r = fromReading(reading([rt('shacharis', ['mon'], '7:00 AM'), rt('kabbalas_shabbos', ['fri'], '4:30 PM', { date: FRI }), rt('shacharis', ['sat'], '9:00 AM', { date: SAT })]), src('home', 'page'), { week: WEEK })
    expect(r.times.map((x) => x.date)).toEqual([FRI, SAT])
    expect(r.shows).toEqual({ from: FRI, to: SAT })
    expect(r.shape).toBe('highlight')
  })

  it('a page with nothing dated shows no day, so it says nothing', () => {
    const r = fromReading(reading([rt('shacharis', ['mon'], '7:00 AM')], { complete: true }), src('home', 'page'), { week: WEEK })
    expect(r.times).toEqual([])
    expect(part(weekFrom([r], ctx({ usual: USUAL })), 'weekdays')).toMatchObject({ do: 'nothing', reason: 'not read' })
  })

  it('Rodeph Shalom: a calendar’s shape is the one passed in, whatever the reader called its week', () => {
    const r = fromReading(reading([rt('shacharis', ['thu'], '8:10 AM', { date: '2026-11-26' })], { shape: 'event' }), src('cal', 'calendar'), { week: WEEK, shows: WEEK, shape: 'schedule' })
    expect(r.shape).toBe('schedule')
  })

  it('the shows window and last date passed in win; the reader’s shape, heading and cancellations carry over', () => {
    const cal = fromReading(reading([]), src('cal', 'calendar'), { week: WEEK, shows: WEEK, lastPosted: '2026-12-01', shape: 'schedule' })
    expect(cal).toMatchObject({ shape: 'schedule', shows: WEEK, lastPosted: '2026-12-01', times: [] })
    const page = fromReading(
      reading([rt('shacharis', ['sat'], '9:00 AM', { date: SAT })], { from: THU, to: SAT, title: 'Shabbat Vayetze', shape: 'highlight', heading: 'This Shabbat', cancelled: [{ date: FRI, quote: 'No Kabbalat Shabbat' }] }),
      src('home', 'page'),
      { week: WEEK },
    )
    expect(page).toMatchObject({ shape: 'highlight', heading: 'This Shabbat', shows: { from: THU, to: SAT }, cancelled: [{ date: FRI }] })
  })
})

describe('calendarListsUsual: a calendar that is the shul’s schedule', () => {
  const e = (date: string, time: string) => ({ date, time })
  it('the Shtiebel: its clock-time minyanim are there; Kabbalat Shabbat at candle lighting isn’t held against it', () => {
    const usual = [m('shacharis', ['mon', 'thu'], '7:15am'), m('shacharis', ['sat'], '9:00am'), m('kabbalas_shabbos', ['fri'], 'At Candle Lighting', { anchor: 'candle_lighting' })]
    expect(calendarListsUsual([e(MON, '7:15 AM'), e(SAT, '9:00 AM'), e(FRI, '5:00 PM')], usual)).toBe(true)
  })
  it('BZBI: a usual minyan it never lists (Wednesday Maariv) means it isn’t the schedule', () => {
    const usual = [m('shacharis', ['mon', 'thu'], '7:45 AM'), m('maariv', ['wed'], '7:00 PM')]
    expect(calendarListsUsual([e(MON, '7:45 AM'), e(THU, '7:45 AM')], usual)).toBe(false)
  })
  it('a calendar of classes, and a shul with only zman times, aren’t either', () => {
    expect(calendarListsUsual([e(TUE, '7:00 PM')], [m('shacharis', ['mon'], '7:00 AM')])).toBe(false)
    expect(calendarListsUsual([e(FRI, '4:30 PM')], [m('kabbalas_shabbos', ['fri'], 'At Candle Lighting', { anchor: 'candle_lighting' })])).toBe(false)
  })
})
