import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { Proposal } from './messageReader'
import { isCommunityEdit } from './submissionSource'
import type { UpdateRow } from './scheduleUpdate'
import type { DayKey } from './hours'
import { CALENDAR_HEADING } from './calendarFeed'
import {
  changedOn,
  CHECK_READ_LINES,
  checkFrom,
  filedBefore,
  hoursNowIntro,
  hoursReadLines,
  pageCheck,
  timesReadLines,
  hoursReads,
  isListingPageWatch,
  LISTING_PAGE_FOUND_CREATOR,
  LISTING_PAGE_WATCH_CREATOR,
  LISTING_PAGE_WATCH_NAME,
  listingPageNote,
  listingPageSource,
  pageReadBoxes,
  pageReadsFor,
  suggestionKey,
} from './listingPageWatch'

const shul = makeCategory({ id: 'synagogue', detailFields: [{ key: 'website', label: 'Website', type: 'url' }, { key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const mikvah = makeCategory({
  id: 'mikvah',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' },
    { key: 'e', label: 'Email', type: 'text' },
  ],
})

describe('isListingPageWatch', () => {
  it('is a listing’s own page: one an admin added, or one found from its website', () => {
    expect(isListingPageWatch({ createdBy: LISTING_PAGE_WATCH_CREATOR })).toBe(true)
    expect(isListingPageWatch({ createdBy: LISTING_PAGE_FOUND_CREATOR })).toBe(true)
    expect(isListingPageWatch({ createdBy: 'hours off' })).toBe(false)
    expect(isListingPageWatch({ createdBy: 'admin@example.org' })).toBe(false)
    expect(isListingPageWatch({ createdBy: 'menu links' })).toBe(false)
  })
})

// The user, Oct 23: "We're dating what we're checking." A page that agrees
// dates the boxes it read, and no others.
describe('pageReadBoxes', () => {
  const sections = makeCategory({
    id: 'mikvah',
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours' },
      { key: 'women', label: 'Women', type: 'boolean' },
      { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'women' },
      { key: 'women_notes', label: 'Notes', type: 'textarea', audienceKey: 'women' },
      { key: 'keilim', label: 'Keilim', type: 'boolean' },
      { key: 'keilim_hours', label: 'Keilim Hours', type: 'hours', audienceKey: 'keilim' },
    ],
  })

  it('a shul’s page: its usual weekday and Shabbos times, and this week’s', () => {
    expect(pageReadBoxes(shul, {}, { kind: 'times', key: 'minyanim' }, false)).toEqual(['weekday', 'shabbos', 'week'])
  })

  it('a mikvah’s page: the section of each hours and notes it read, not one it didn’t', () => {
    expect(pageReadBoxes(sections, {}, { kind: 'hours', keys: ['women_s_hours'], notes: ['women_notes'] }, false)).toEqual(['women'])
  })

  it('plain hours are the contact box’s, unless Google keeps them; the phone and email too when they agree', () => {
    expect(pageReadBoxes(sections, {}, { kind: 'hours', keys: ['hours'], notes: [] }, false)).toEqual(['contact'])
    expect(pageReadBoxes(sections, { placeId: 'p', googleFields: ['hours'] }, { kind: 'hours', keys: ['hours'], notes: [] }, false)).toEqual([])
    expect(pageReadBoxes(shul, {}, { kind: 'times', key: 'minyanim' }, true)).toEqual(['weekday', 'shabbos', 'week', 'contact'])
  })
})

describe('pageReadsFor', () => {
  it('reads a shul’s page for its davening times, and a mikvah’s for its named hours, not the plain “Hours”', () => {
    expect(pageReadsFor(shul)).toEqual({ kind: 'times', key: 'minyanim' })
    expect(pageReadsFor(mikvah)).toEqual({ kind: 'hours', keys: ['women_s_hours'], notes: [] })
  })

  // The user, Oct 22: "by appointment, 48 hours ahead" can be all a
  // mikvah's page says, so each section's notes are read too.
  it('reads each section’s notes beside its hours', () => {
    const sections = makeCategory({
      detailFields: [
        { key: 'womenTevillah', label: 'Women’s Tevillah', type: 'boolean' },
        { key: 'keilim', label: 'Keilim', type: 'boolean' },
        { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'womenTevillah' },
        { key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea', audienceKey: 'womenTevillah' },
        { key: 'keilim_hours', label: 'Keilim Hours', type: 'hours', audienceKey: 'keilim' },
        { key: 'about', label: 'About', type: 'textarea' },
      ],
    })
    expect(pageReadsFor(sections)).toEqual({ kind: 'hours', keys: ['women_s_hours', 'keilim_hours'], notes: ['women_s_notes'] })
  })

  it('reads the plain “Hours” where it is the only hours there are', () => {
    expect(pageReadsFor(makeCategory({ detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] }))).toEqual({ kind: 'hours', keys: ['hours'], notes: [] })
  })

  it('has nothing to read for a listing with neither', () => {
    expect(pageReadsFor(makeCategory({ detailFields: [{ key: 'website', label: 'Website', type: 'url' }] }))).toBeNull()
  })
})

describe('hoursReads', () => {
  const fields = (listingId: string | null, changes: Extract<Proposal, { kind: 'fields' }>['changes']): Proposal => ({
    kind: 'fields',
    listingId,
    asWritten: '',
    ask: null,
    changes,
    note: null,
    quote: '',
    checked: true,
  })
  const women = { key: 'women_s_hours', hours: { days: ['sun' as const], open: '19:00', close: '22:00', closed: false, when: 'every_week' as const } }

  it('keeps only the hours read for this listing', () => {
    const out = hoursReads(
      [fields('m1', [women, { key: 'e', value: 'new@mikvah.org' }]), fields('other', [women]), { kind: 'not_update', note: 'chat' }],
      'm1',
      ['hours', 'women_s_hours'],
    )
    expect(out).toEqual([women])
  })

  it('takes hours read for no place as this one’s, but not one it asked about', () => {
    expect(hoursReads([fields(null, [women])], 'm1', ['women_s_hours'])).toEqual([women])
    const asked = { ...fields(null, [women]), ask: { question: 'Which?', choices: [] } } as Proposal
    expect(hoursReads([asked], 'm1', ['women_s_hours'])).toEqual([])
  })

  it('keeps a section’s note read as words, not an empty one or another field’s', () => {
    const note = { key: 'women_s_notes', value: 'Schedule your appointment (48 hours advance notice would be appreciated)' }
    expect(hoursReads([fields('m1', [note, { key: 'women_s_notes', value: ' ' }, { key: 'about', value: 'x' }])], 'm1', ['women_s_hours'], ['women_s_notes'])).toEqual([note])
    expect(hoursReads([fields('m1', [note])], 'm1', ['women_s_hours'])).toEqual([])
  })
})

describe('the note and the source', () => {
  it('says it’s from their website, and the day the page changed', () => {
    const on = changedOn(Date.parse('2026-10-20T11:00:00Z'))
    expect(on).toBe('Oct 20')
    expect(listingPageNote('https://lms.org/times', on, ['Changed: mincha · Sun · 6:05pm, was 6:15pm', 'New: maariv · Mon · 9:00pm'])).toBe(
      'From their website, changed Oct 20: https://lms.org/times\n\nChanged: mincha · Sun · 6:05pm, was 6:15pm\nNew: maariv · Mon · 9:00pm',
    )
  })

  // The AI read it: never "automatic", the label code-read sources get.
  it('is read by AI, from their website, with the page beside it', () => {
    const s = listingPageSource('Lower Merion Synagogue', 'https://lms.org/times', 'Oct 20', 'Shacharis 6:45am')
    expect(s).toEqual({
      readBy: 'ai',
      from: 'Lower Merion Synagogue’s website',
      named: 'Lower Merion Synagogue',
      note: 'From their website, changed Oct 20: https://lms.org/times',
      original: 'Shacharis 6:45am',
    })
    expect(isCommunityEdit({ note: null, submitted_by: { name: LISTING_PAGE_WATCH_NAME }, payload: { source: s } })).toBe(false)
  })
})

describe('filedBefore', () => {
  const times = [
    { id: 'a', tefillah: 'shacharis', days: ['mon'], time: '6:45am' },
    { id: 'b', tefillah: 'mincha', days: ['sun'], time: '6:05pm' },
  ]
  const keys = ['minyanim', 'minyanim_schedules']

  it('knows the same times read again, with new ids and in another order', () => {
    const again = [
      { id: 'x', tefillah: 'mincha', days: ['sun'], time: '6:05pm' },
      { id: 'y', tefillah: 'shacharis', days: ['mon'], time: '6:45am' },
    ]
    expect(filedBefore([{ payload: { details: { minyanim: times, website: 'old' } } }], { minyanim: again, website: 'new' }, keys)).toBe(true)
  })

  it('files times that differ from anything filed before', () => {
    const later = [times[0], { ...times[1], time: '5:55pm' }]
    expect(filedBefore([{ payload: { details: { minyanim: times } } }], { minyanim: later }, keys)).toBe(false)
    expect(filedBefore([], { minyanim: times }, keys)).toBe(false)
    expect(filedBefore([{ payload: null }], { minyanim: times }, keys)).toBe(false)
  })

  it('compares only the fields the page keeps', () => {
    expect(suggestionKey({ hours: { sun: null }, e: 'a' }, ['hours'])).toBe(suggestionKey({ hours: { sun: null }, e: 'b' }, ['hours']))
    expect(suggestionKey({ hours: { sun: null } }, ['hours'])).not.toBe(suggestionKey({ hours: { sun: { open: '19:00', close: '22:00' } } }, ['hours']))
  })
})

// The user, Oct 20: "Check now" says what the AI read, a short line each.
describe('what a full read found', () => {
  const row = (day: string, tefillah: UpdateRow['tefillah'], time: string, status: UpdateRow['status'] = 'same'): UpdateRow => ({ id: `${day}${tefillah}${time}`, day, tefillah, time, status })

  it('gives the times the page gives, a line per minyan, days run together', () => {
    const rows = [
      ...['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => row(d, 'shacharis', '7:00 AM')),
      row('sun', 'shacharis', '8:00 AM', 'changed'),
      row('sun', 'mincha', '6:15 PM', 'new'),
      // The listing's own time the page doesn't give isn't something it read.
      row('sat', 'maariv', '8:00 PM', 'gone'),
      row('fri', 'mincha', '6:00 PM', 'kept'),
      row('2026-10-25', 'mincha', '6:05 PM', 'new'),
    ]
    expect(timesReadLines(rows)).toEqual(['Shacharis Mon–Fri 7:00 AM', 'Shacharis Sun 8:00 AM', 'Mincha Sun 6:15 PM', 'Mincha Sun Oct 25 6:05 PM'])
  })

  // Seen on Mekor Habracha's page: "6:45am" beside "12:20 PM".
  it('writes every clock time the same way, and runs together days the page wrote differently', () => {
    const rows = [row('mon', 'shacharis', '6:45am'), row('thu', 'shacharis', '6:45 AM'), row('sat', 'mincha', '12:20 pm'), row('sun', 'maariv', '15 min before Sunset')]
    expect(timesReadLines(rows)).toEqual(['Shacharis Mon, Thu 6:45 AM', 'Mincha Sat 12:20 PM', 'Maariv Sun 15 min before Sunset'])
  })

  // LMC's men's mikvah, Oct 20: "Sun, Mon, Tue, Wed, Thu, Sat".
  it('runs the days together in their runs', () => {
    const category = { detailFields: [{ key: 'men_s_hours', label: 'Men’s Hours', type: 'hours' as const }] }
    const read = { key: 'men_s_hours', hours: { days: ['sun', 'mon', 'tue', 'wed', 'thu', 'sat'] as DayKey[], open: '04:30', close: '10:00', closed: false, when: 'every_week' as const } }
    expect(hoursReadLines([read], category)).toEqual(['Men’s Hours, Sun–Thu, Sat: 4:30 AM–10:00 AM'])
    expect(timesReadLines(['sun', 'mon', 'tue', 'thu', 'fri'].map((d) => row(d, 'shacharis', '7:00 AM')))).toEqual(['Shacharis Sun–Tue, Thu, Fri 7:00 AM'])
  })

  it('says which season a time is for, when the page gives both (Mekor, Oct 21)', () => {
    const rows = [
      { ...row('fri', 'mincha_maariv', '7:00 PM'), season: 'summer' as const },
      { ...row('fri', 'mincha_maariv', 'At Candle Lighting'), season: 'winter' as const },
      { ...row('sun', 'maariv', '6:30 PM'), notes: 'Winter only' },
    ]
    expect(timesReadLines(rows)).toEqual(['Maariv Sun 6:30 PM · Winter', 'Mincha & Maariv Fri 7:00 PM · Summer', 'Mincha & Maariv Fri At Candle Lighting · Winter'])
  })

  it('gives the hours the page gives', () => {
    const category = { detailFields: [{ key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' as const }] }
    expect(
      hoursReadLines(
        [
          { key: 'women_s_hours', hours: { days: ['sun', 'mon', 'tue', 'wed', 'thu'], open: '19:00', close: '22:00', closed: false, when: 'every_week' } },
          { key: 'women_s_hours', hours: { days: ['fri'], open: null, close: null, closed: true, when: 'every_week' } },
          { key: 'women_s_hours', hours: { days: 'all', open: null, close: '21:00', closed: false, when: 'one_day' } },
        ],
        category,
      ),
    ).toEqual(['Women’s Hours, Sun–Thu: 7:00 PM–10:00 PM', 'Women’s Hours, Fri: closed', 'Women’s Hours, every day: closes 9:00 PM (one day only)'])
  })

  it('says where it read: the page, its calendar, or a PDF', () => {
    expect(checkFrom({ text: 'Shacharis 7am', pdf: null })).toBe('page')
    expect(checkFrom({ text: `${CALENDAR_HEADING}\n2026-10-25, Sun, 6:05 PM: Mincha`, pdf: null })).toBe('calendar')
    expect(checkFrom({ text: null, pdf: 'b64' })).toBe('pdf')
    // A menu read from its pictures (Oct 20): a page that is only pictures, or one whose words named no dishes.
    expect(checkFrom({ text: null, pdf: null })).toBe('pictures')
    expect(checkFrom({ text: 'About us', pdf: null }, { pictures: true })).toBe('pictures')
  })

  it('agrees when it read something and nothing differs, finds nothing when it read nothing, and keeps the first few lines', () => {
    const lines = Array.from({ length: CHECK_READ_LINES + 3 }, (_, i) => `line ${i}`)
    expect(pageCheck('times', 'page', lines, { differences: [], queue: 'filed' })).toEqual({
      what: 'times',
      from: 'page',
      result: 'agrees',
      read: lines.slice(0, CHECK_READ_LINES),
      more: 3,
      differences: [],
      queue: null,
    })
    expect(pageCheck('times', 'page', [], { differences: [], queue: null }).result).toBe('nothing')
    expect(pageCheck('hours', 'page', ['x'], { differences: ['y'], queue: 'waiting' })).toMatchObject({ result: 'differs', queue: 'waiting' })
  })

  it('isn’t agreement when something it read couldn’t be compared', () => {
    const unread = ['Women’s Hours: opens 7:30 PM, closes 9:30 PM, but which days isn’t said']
    expect(pageCheck('hours', 'page', ['Women’s Hours, every day: 7:30 PM–9:30 PM'], { differences: [], queue: null, unread })).toMatchObject({ result: 'unsure', unread })
    expect(pageCheck('hours', 'page', ['x'], { differences: ['y'], queue: 'filed', unread })).toMatchObject({ result: 'differs', unread })
  })

  it('tells the AI what each of several hours fields holds now, and nothing for one', () => {
    const two = makeCategory({ detailFields: [{ key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' }, { key: 'keilim_hours', label: 'Keilim Hours', type: 'hours' }] })
    const intro = hoursNowIntro('LMC', two, ['women_s_hours', 'keilim_hours'], { women_s_hours: { mon: { open: '20:30', close: '22:30' } } })
    expect(intro).toContain('Women’s Hours: Sun Closed · Mon 8:30 PM–10:30 PM · Tue–Sat Closed')
    expect(intro).toContain('Keilim Hours: none listed')
    expect(hoursNowIntro('LMC', two, ['women_s_hours'], {})).toBeNull()
  })

  it('tells it each section’s note too, and to give the page’s words only for what the note doesn’t say', () => {
    const one = makeCategory({ detailFields: [{ key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' }, { key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea' }] })
    const intro = hoursNowIntro('Mei Shalva', one, ['women_s_hours'], { women_s_notes: ' By appointment. ' }, ['women_s_notes'])
    expect(intro).toContain('Women’s Hours: none listed\nWomen’s Notes: By appointment.')
    expect(intro).toContain('When the guide’s note already says what the page says, give the guide’s note unchanged.')
  })

  it('says a note it read in a line, cut short when it’s long', () => {
    const category = { detailFields: [{ key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea' as const }] }
    expect(hoursReadLines([{ key: 'women_s_notes', value: 'Schedule your\nappointment.' }], category)).toEqual(['Women’s Notes: Schedule your appointment.'])
    expect(hoursReadLines([{ key: 'women_s_notes', value: 'a'.repeat(200) }], category)[0]).toHaveLength('Women’s Notes: '.length + 120)
  })
})
