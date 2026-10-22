import { describe, expect, it } from 'vitest'
import { CALENDAR_HEADING, calendarFeeds, calendarLines, calendarWeeks, embeddedEntries, icsEntries, isIcs } from './calendarFeed'

const TZ = 'America/New_York'

describe('calendarFeeds: the iCal feeds a page links to', () => {
  it('finds an .ics file, an ?ical=1 link and a webcal: one, as https addresses on the page’s site', () => {
    const html = `
      <a href="/events/?ical=1">Export</a>
      <a href="webcal://shul.example/cal.ics">Subscribe</a>
      <link rel="alternate" href="https://shul.example/feed.ics?x=1&amp;y=2">
      <a href="/about">About</a>`
    expect(calendarFeeds(html, 'https://shul.example/calendar/')).toEqual([
      'https://shul.example/events/?ical=1',
      'https://shul.example/cal.ics',
      'https://shul.example/feed.ics?x=1&y=2',
    ])
  })

  it('turns an embedded Google Calendar into its public feed', () => {
    const html = `<iframe src="https://calendar.google.com/calendar/embed?src=shul%40gmail.com&amp;ctz=America%2FNew_York"></iframe>`
    expect(calendarFeeds(html, 'https://shul.example/')).toEqual(['https://calendar.google.com/calendar/ical/shul%40gmail.com/public/basic.ics'])
  })

  // The South Philadelphia Shtiebel's calendar page, Oct 22: its embed is
  // drawn by a script, and its "Add our Calendar" button names the calendar.
  it('reads a link to add a Google Calendar, its calendar named in base64', () => {
    const html = `<a data-testid="linkElement" href="https://calendar.google.com/calendar/u/0?cid=OTQ0OGU3YXI5NjNlMnJ2a25yc2I1ODU1bGNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ" target="_blank">Add our Calendar</a>`
    expect(calendarFeeds(html, 'https://www.southphiladelphiashtiebel.org/calendar')).toEqual(['https://calendar.google.com/calendar/ical/9448e7ar963e2rvknrsb5855lc%40group.calendar.google.com/public/basic.ics'])
    expect(calendarFeeds(`<a href="https://calendar.google.com/calendar/r?cid=shul%40gmail.com">Add</a>`, 'https://shul.example/')).toEqual(['https://calendar.google.com/calendar/ical/shul%40gmail.com/public/basic.ics'])
    // Its other pages name no calendar.
    expect(calendarFeeds(`<a href="https://calendar.google.com/calendar/u/0/r/eventedit?text=Kiddush">Add</a>`, 'https://shul.example/')).toEqual([])
  })

  // Kol Tzedek's home page, Oct 21: Google's embed code gave its calendar
  // in base64, and the feed at that address is a 404.
  it('reads a Google Calendar embed that names its calendar in base64', () => {
    const html = `<iframe src="https://calendar.google.com/calendar/embed?height=600&amp;mode=AGENDA&amp;src=a29sdHplZGVrY29tbXVuaWNhdGlvbnNAZ21haWwuY29t&amp;color=%23F6BF26"></iframe>`
    expect(calendarFeeds(html, 'https://www.kol-tzedek.org/')).toEqual(['https://calendar.google.com/calendar/ical/koltzedekcommunications%40gmail.com/public/basic.ics'])
    // A calendar id that only looks like base64 is left as it is.
    const plain = `<iframe src="https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com"></iframe><iframe src="https://calendar.google.com/calendar/embed?src=abcd"></iframe>`
    expect(calendarFeeds(plain, 'https://shul.example/')).toEqual([
      'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics',
      'https://calendar.google.com/calendar/ical/abcd/public/basic.ics',
    ])
  })

  it('finds nothing on a page with no calendar', () => {
    expect(calendarFeeds('<a href="/davening">Davening</a><a href="mailto:a@b.c">Mail</a>', 'https://shul.example/')).toEqual([])
  })
})

describe('embeddedEntries: a calendar widget’s event list in the page’s scripts', () => {
  // Leyv Ha-Ir's page, as it was on Oct 20: all-day entries, the time at the
  // front of the title.
  it('reads an all-day entry’s time from its title', () => {
    const html = `<script>window.CS_GRIDCAL_EVENTS = [{"id":1,"title":"7:30 PM Kabbalat Shabbat Service","start":"2026-10-30","allDay":true},{"title":"10:30am - Shabbat Morning Service","start":"2026-11-07","allDay":true},{"title":"Kiddush Lunch","start":"2026-11-07"}];</script>`
    expect(embeddedEntries(html, TZ)).toEqual([
      { date: '2026-10-30', time: '7:30 PM', title: 'Kabbalat Shabbat Service' },
      { date: '2026-11-07', time: '10:30 AM', title: 'Shabbat Morning Service' },
      { date: '2026-11-07', time: null, title: 'Kiddush Lunch' },
    ])
  })

  it('reads a wall-clock start as written, and an instant where the shul is', () => {
    const html = `[{"title":"Mincha","start":"2026-10-25T18:15:00"},{"title":"Maariv &amp; Shiur","start":"2026-10-26T00:30:00Z"}]`
    expect(embeddedEntries(html, TZ)).toEqual([
      { date: '2026-10-25', time: '6:15 PM', title: 'Mincha' },
      { date: '2026-10-25', time: '8:30 PM', title: 'Maariv & Shiur' },
    ])
  })

  it('keeps an event’s end that day', () => {
    const html = `[{"title":"Shacharis","start":"2026-10-25T08:10:00","end":"2026-10-25T08:40:00"},{"title":"Retreat","start":"2026-10-25T18:00:00","end":"2026-10-27"}]`
    expect(embeddedEntries(html, TZ)).toEqual([
      { date: '2026-10-25', time: '8:10 AM', end: '8:40 AM', title: 'Shacharis' },
      { date: '2026-10-25', time: '6:00 PM', title: 'Retreat' },
    ])
  })

  it('skips anything that isn’t an event', () => {
    expect(embeddedEntries(`{"title":"No start"} {"start":"2026-10-25"} {"title": broken, "start": "x"}`, TZ)).toEqual([])
  })
})

const ics = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}END:VCALENDAR\r\n`

describe('icsEntries: an iCal feed’s entries in the coming days', () => {
  // Rodeph Shalom's feed (The Events Calendar), as it was on Oct 20: each
  // occurrence its own event, in the shul's own zone.
  it('reads an event in its own zone as written, and a UTC one where the shul is', () => {
    const feed = ics(
      'BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261030T180000\r\nSUMMARY:Shabbat Evening Service\r\nEND:VEVENT\r\n' +
        'BEGIN:VEVENT\r\nDTSTART:20261031T144500Z\r\nSUMMARY:Shabbat Morning Services\\, Sanctuary\r\nEND:VEVENT\r\n',
    )
    expect(icsEntries(feed, TZ, '2026-10-20', '2026-11-09')).toEqual([
      { date: '2026-10-30', time: '6:00 PM', title: 'Shabbat Evening Service' },
      { date: '2026-10-31', time: '10:45 AM', title: 'Shabbat Morning Services, Sanctuary' },
    ])
  })

  // Oct 22: Rodeph Shalom's Thursday minyan is 8:10–8:40, and the reader,
  // given only its start, never had its end.
  it('keeps an event’s end that day, also over a weekly repeat; one ending another day has none', () => {
    const feed = ics(
      'BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261022T081000\r\nDTEND;TZID=America/New_York:20261022T084000\r\nSUMMARY:Online Community Morning Minyan\r\nEND:VEVENT\r\n' +
        'BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20260901T071500\r\nDTEND;TZID=America/New_York:20260901T080000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nSUMMARY:Shacharis\r\nEND:VEVENT\r\n' +
        'BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261024T200000\r\nDTEND;TZID=America/New_York:20261025T010000\r\nSUMMARY:Late Havdalah\r\nEND:VEVENT\r\n',
    )
    expect(icsEntries(feed, TZ, '2026-10-20', '2026-10-26')).toEqual([
      { date: '2026-10-22', time: '8:10 AM', end: '8:40 AM', title: 'Online Community Morning Minyan' },
      { date: '2026-10-26', time: '7:15 AM', end: '8:00 AM', title: 'Shacharis' },
      { date: '2026-10-24', time: '8:00 PM', title: 'Late Havdalah' },
    ])
  })

  it('unfolds a long line, and leaves out a cancelled event and one outside the days', () => {
    const feed = ics(
      'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261025\r\nSUMMARY:Sisterhood \r\n Brunch\r\nEND:VEVENT\r\n' +
        'BEGIN:VEVENT\r\nDTSTART:20261026T120000\r\nSUMMARY:Cancelled\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n' +
        'BEGIN:VEVENT\r\nDTSTART:20261201T120000\r\nSUMMARY:December\r\nEND:VEVENT\r\n',
    )
    expect(icsEntries(feed, TZ, '2026-10-20', '2026-11-09')).toEqual([{ date: '2026-10-25', time: null, title: 'Sisterhood Brunch' }])
  })

  // How a Google Calendar keeps a regular minyan.
  it('lays a weekly repeat over the days, skipping its exceptions and stopping at its end', () => {
    const feed = ics(
      'BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20260901T071500\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261102T000000Z\r\nEXDATE;TZID=America/New_York:20261026T071500\r\nSUMMARY:Shacharis\r\nEND:VEVENT\r\n',
    )
    expect(icsEntries(feed, TZ, '2026-10-20', '2026-11-09')).toEqual([
      { date: '2026-10-22', time: '7:15 AM', title: 'Shacharis' },
      { date: '2026-10-29', time: '7:15 AM', title: 'Shacharis' },
    ])
  })

  it('honours a repeat every other week, and a count', () => {
    const feed = ics('BEGIN:VEVENT\r\nDTSTART:20261004T100000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3\r\nSUMMARY:Learners’ Minyan\r\nEND:VEVENT\r\n')
    expect(icsEntries(feed, TZ, '2026-10-01', '2026-11-30').map((e) => e.date)).toEqual(['2026-10-04', '2026-10-18', '2026-11-01'])
  })

  it('knows a feed from a page', () => {
    expect(isIcs(ics(''))).toBe(true)
    expect(isIcs('<html>BEGIN:VCALENDAR</html>')).toBe(false)
  })
})

describe('calendarLines: what the reader is given', () => {
  it('a line each for the days asked, in order, each once, with the weekday', () => {
    const entries = [
      { date: '2026-10-31', time: '10:45 AM', title: 'Shabbat Morning Services' },
      { date: '2026-10-30', time: '6:00 PM', title: 'Shabbat   Evening Service' },
      { date: '2026-10-30', time: null, title: 'Office closed' },
      { date: '2026-10-30', time: '6:00 PM', title: 'Shabbat Evening Service' },
      { date: '2026-10-19', time: '7:00 AM', title: 'Yesterday' },
      { date: '2026-11-01', time: '7:00 AM', title: 'Past the week' },
    ]
    expect(calendarLines(entries, '2026-10-20', '2026-10-31')).toEqual([
      '2026-10-30 (Fri): Office closed',
      '2026-10-30 (Fri) 6:00 PM: Shabbat Evening Service',
      '2026-10-31 (Sat) 10:45 AM: Shabbat Morning Services',
    ])
  })

  it('an entry’s end, beside its start', () => {
    expect(calendarLines([{ date: '2026-10-22', time: '8:10 AM', end: '8:40 AM', title: 'Online Community Morning Minyan' }], '2026-10-22', '2026-10-24')).toEqual(['2026-10-22 (Thu) 8:10 AM–8:40 AM: Online Community Morning Minyan'])
  })
})

// The user, Oct 20: "for websites where we have access to the big schedule
// I think we should still only read one week at a time".
describe('calendarWeeks: the weeks a calendar is read for', () => {
  it('this week, from today to Shabbos', () => {
    expect(calendarWeeks('2026-10-20')).toEqual([{ sunday: '2026-10-18', from: '2026-10-20', to: '2026-10-24' }]) // Tue
    expect(calendarWeeks('2026-10-18')).toEqual([{ sunday: '2026-10-18', from: '2026-10-18', to: '2026-10-24' }]) // Sun
    expect(calendarWeeks('2026-10-21')).toHaveLength(1) // Wed
  })
  it('from Thursday, next week too, the whole of it', () => {
    const next = { sunday: '2026-10-25', from: '2026-10-25', to: '2026-10-31' }
    expect(calendarWeeks('2026-10-22')).toEqual([{ sunday: '2026-10-18', from: '2026-10-22', to: '2026-10-24' }, next]) // Thu
    expect(calendarWeeks('2026-10-24')).toEqual([{ sunday: '2026-10-18', from: '2026-10-24', to: '2026-10-24' }, next]) // Shabbos
  })
  it('across a month’s end', () => {
    expect(calendarWeeks('2026-10-29')[1]).toEqual({ sunday: '2026-11-01', from: '2026-11-01', to: '2026-11-07' })
  })
})

// Leyv Ha-Ir's Kabbalat Shabbat is on a Friday a month; the AI is told a
// calendar's entries are each that date's, so it never makes one a usual
// time (the user, Oct 20: a usual time is one the shul states).
describe('CALENDAR_HEADING', () => {
  it('tells the reader each entry is for its date only, never a weekday', () => {
    expect(CALENDAR_HEADING).toMatch(/for its date only, however often it repeats: give it that date, never a weekday/)
  })
})
