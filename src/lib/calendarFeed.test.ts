import { describe, expect, it } from 'vitest'
import { CALENDAR_HEADING, calendarFeeds, calendarLines, embeddedEntries, icsEntries, isIcs } from './calendarFeed'

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
  it('a line each from today for three weeks, in order, each once, with the weekday', () => {
    const entries = [
      { date: '2026-10-31', time: '10:45 AM', title: 'Shabbat Morning Services' },
      { date: '2026-10-30', time: '6:00 PM', title: 'Shabbat   Evening Service' },
      { date: '2026-10-30', time: null, title: 'Office closed' },
      { date: '2026-10-30', time: '6:00 PM', title: 'Shabbat Evening Service' },
      { date: '2026-10-19', time: '7:00 AM', title: 'Yesterday' },
      { date: '2026-11-10', time: '7:00 AM', title: 'Past three weeks' },
    ]
    expect(calendarLines(entries, '2026-10-20')).toEqual([
      '2026-10-30 (Fri): Office closed',
      '2026-10-30 (Fri) 6:00 PM: Shabbat Evening Service',
      '2026-10-31 (Sat) 10:45 AM: Shabbat Morning Services',
    ])
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
