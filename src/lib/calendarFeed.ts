// ─────────────────────────────────────────────────────────────────────────────
// A shul's calendar, read off its own website (the user, Oct 20: "the
// website reader should also take dated services and calendars"). Many
// shuls post their services on a calendar rather than a page of times, and
// a calendar is built in the browser: Leyv Ha-Ir's page reads as 208
// characters of header and footer, its entries sitting in a script
// (`window.CS_GRIDCAL_EVENTS = [{title, start}, …]`), and Rodeph Shalom's
// month grid reads as a jumble of potlucks, with an iCal feed beside it.
//
// So the page is searched for its calendar's own data, by code, never the
// AI: an iCal feed it links to (a `.ics` file, `?ical=1`, `webcal:`, a
// Google Calendar it embeds), or an event list in its scripts. Its entries
// become one line each, with the date, and are read a week at a time
// (calendarWeeks; listingPageRun.ts): the reader says which are services,
// and when, and the week is that week's schedule.
//
// Pure: listingPageRun.ts fetches.
// ─────────────────────────────────────────────────────────────────────────────

import { joinText, parseTimeToMinutes, TEFILLAH_LABELS } from './davening'
import { dateText, type SpecialSchedule } from './schedules'

export type CalendarEntry = {
  /** YYYY-MM-DD, as the shul's calendar has it. */
  date: string
  /** "7:30 PM", or null for an all-day entry with no time in its title. */
  time: string | null
  /** When it ends that day, "8:40 AM", when the calendar says. Rodeph
   *  Shalom's Thursday minyan is 8:10–8:40, and the reader, given only the
   *  start, never had its end (the user, Oct 22). */
  end?: string | null
  title: string
  /** The event's own page, when the calendar gives one (an iCal URL, or a
   *  LOCATION that is a web address): Rodeph Shalom's minyan's says "Join
   *  Zoom here" there, and nowhere in its feed (the user, Oct 22). */
  url?: string
  /** Where to join it from home, when the calendar or its page gives a
   *  Zoom, Google Meet or livestream link (joinLinkIn). */
  join?: string
}

/** At most this many lines: a busy shul's two weeks, well inside what the
 *  reader is given. */
const MAX_LINES = 120

const ICS_LINK = /(?:\.ics(?:[?#]|$)|[?&]ical=1\b|^webcal:)/i

/** A Google Calendar embed's calendar, as its feed is addressed. Google's
 *  embed code may give it in base64 (Kol Tzedek's, Oct 21:
 *  "a29sdHplZGVr…" for koltzedekcommunications@gmail.com), and the feed
 *  at that address is a 404. */
function googleCalendarId(src: string): string {
  if (src.includes('@') || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(src)) return src
  const decoded = Buffer.from(src, 'base64').toString('utf8')
  return /^[^\s@]+@[^\s@]+\.[a-z.]+$/i.test(decoded) ? decoded : src
}

/** How big a calendar feed may be. Google's public feed is every event
 *  the calendar ever had: Kol Tzedek's was 4.8 MB on Oct 21, over what a
 *  page may be (menuReader.ts). */
export const MAX_FEED_BYTES = 20_000_000

/** The iCal feeds a page links to or embeds, as addresses to fetch, the
 *  page's own first. A Google Calendar embed (`calendar/embed?src=…`), or a
 *  link to add one (`calendar/u/0?cid=…`), has a public feed at a known
 *  address. */
export function calendarFeeds(html: string, pageUrl: string): string[] {
  const found: string[] = []
  const add = (raw: string) => {
    try {
      const url = new URL(raw.replace(/&amp;/g, '&').replace(/^webcal:/i, 'https:'), pageUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return
      if (!found.includes(url.toString())) found.push(url.toString())
    } catch {
      /* not an address */
    }
  }
  for (const m of html.matchAll(/(?:href|src|data-[a-z-]+)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = m[1]
    if (ICS_LINK.test(raw.replace(/&amp;/g, '&'))) add(raw)
    const google = /calendar\.google\.com\/calendar\/(?:u\/\d+\/?)?(embed|r\/?)?\?([^"'\s]+)/i.exec(raw)
    if (google) {
      // An embed names it `src`; an "Add our Calendar" link, `cid` (the
      // South Philadelphia Shtiebel's, Oct 22: its embed is drawn by a
      // script, so that link is all the page has).
      for (const src of new URLSearchParams(google[2].replace(/&amp;/g, '&')).getAll(google[1] === 'embed' ? 'src' : 'cid')) {
        add(`https://calendar.google.com/calendar/ical/${encodeURIComponent(googleCalendarId(src))}/public/basic.ics`)
      }
    }
  }
  return found
}

const TIME_IN_TITLE = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\s*[-–:]?\s*/i

function clock(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** An entry's time from the front of its title ("10:30 AM Shabbat Morning
 *  Service"), and the title without it. */
function timeFromTitle(title: string): { time: string | null; title: string } {
  const m = TIME_IN_TITLE.exec(title)
  if (!m) return { time: null, title: title.trim() }
  const h = (Number(m[1]) % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)
  return { time: clock(h, Number(m[2] ?? 0)), title: title.slice(m[0].length).trim() }
}

/** The wall-clock date and time of an instant in `timezone`. */
function local(ms: number, timezone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: clock(Number(parts.hour), Number(parts.minute)) }
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/** An event list in the page's scripts, as calendar widgets (FullCalendar
 *  and its kind) are handed one: objects with a title and a start. */
export function embeddedEntries(html: string, timezone: string): CalendarEntry[] {
  const out: CalendarEntry[] = []
  for (const m of html.matchAll(/\{[^{}]*"(?:title|start)"\s*:[^{}]*\}/g)) {
    let o: Record<string, unknown>
    try {
      o = JSON.parse(m[0]) as Record<string, unknown>
    } catch {
      continue
    }
    if (typeof o.title !== 'string' || typeof o.start !== 'string') continue
    const start = o.start
    const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(start)
    const { time: titled, title } = timeFromTitle(unescapeHtml(o.title))
    const page = typeof o.url === 'string' && /^https?:\/\//i.test(o.url) ? { url: o.url } : {}
    if (dateOnly) {
      out.push({ date: dateOnly[1], time: titled, title, ...page })
      continue
    }
    const at = (v: unknown): { date: string; time: string } | null => {
      if (typeof v !== 'string') return null
      const wall = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(v)
      if (wall) return { date: wall[1], time: clock(Number(wall[2]), Number(wall[3])) }
      const ms = Date.parse(v)
      return Number.isFinite(ms) && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? local(ms, timezone) : null
    }
    const begins = at(start)
    if (!begins) continue
    const ends = at(o.end)
    out.push({ ...begins, ...(ends && ends.date === begins.date && ends.time !== begins.time ? { end: ends.time } : {}), title, ...page })
  }
  return out
}

/** One property of an iCal event: its parameters and value. */
type Prop = { params: Record<string, string>; value: string }

function icsText(v: string): string {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** An iCal date-time as its wall-clock date and time where the shul is. A
 *  time with its own TZID is taken as written: a shul's feed is in its own
 *  zone. */
function icsWhen(p: Prop, timezone: string): { date: string; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim())
  if (!m) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  if (!m[4] || p.params.VALUE === 'DATE') return { date, time: null }
  if (m[7]) return local(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), timezone)
  return { date, time: clock(Number(m[4]), Number(m[5])) }
}

/** An iCal event's own page and its join link. Its URL, or a LOCATION
 *  that is a web address, is its page (Rodeph Shalom's both are); a join
 *  link may be either, or a Google Meet's X-GOOGLE-CONFERENCE. Its
 *  DESCRIPTION only when it's short and has one: Rodeph Shalom's plugin
 *  puts the whole month page in every event's, any other event's Zoom
 *  link included. */
function eventLinks(event: Record<string, Prop>): Pick<CalendarEntry, 'url' | 'join'> {
  const web = (p: Prop | undefined) => {
    const v = p && icsText(p.value)
    return v && /^https?:\/\/\S+$/i.test(v) ? v : null
  }
  const given = [web(event.URL), web(event.LOCATION)].filter((v): v is string => !!v)
  const description = event.DESCRIPTION ? icsText(event.DESCRIPTION.value) : ''
  const join =
    [...given, web(event['X-GOOGLE-CONFERENCE'])].find((v) => v && isJoinLink(v)) ??
    (description.length <= 2_000 ? onlyJoinLink(description.match(/https?:\/\/[^\s"'<>]+/gi) ?? []) : null)
  const url = given.find((v) => !isJoinLink(v))
  return { ...(url ? { url } : {}), ...(join ? { join } : {}) }
}

// ── Join links ──────────────────────────────────────────────────────────────

/** A Zoom meeting, a Google Meet, or a live stream: a link to join from
 *  home. A YouTube or Vimeo link only when it's a live one, as a site's
 *  footer links its channel (Rodeph Shalom's event page does). The meeting
 *  it is, so two links to one meeting (one with its passcode) are one. */
function joinKey(link: string): string | null {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  const on = (d: string) => host === d || host.endsWith(`.${d}`)
  const path = u.pathname.replace(/\/+$/, '')
  if (on('zoom.us')) {
    const id = /^\/(?:j|w|my|wc\/join)\/([^/]+)/i.exec(path)
    return id ? `zoom:${id[1].toLowerCase()}` : null
  }
  if (host === 'meet.google.com') return /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(path) ? `meet:${path.slice(1).toLowerCase()}` : null
  if (on('youtube.com')) {
    if (/^\/live\/[\w-]+$/.test(path)) return `youtube:${path}`
    if (/^\/(?:@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)\/(?:live|streams)$/i.test(path)) return `youtube:${path.toLowerCase()}`
    if (path === '/embed/live_stream' && u.searchParams.get('channel')) return `youtube:live:${u.searchParams.get('channel')}`
    return null
  }
  if (on('vimeo.com')) return /^\/event\/\d+/.test(path) ? `vimeo:${path}` : null
  return null
}

export const isJoinLink = (link: string) => joinKey(link) !== null

/** The one meeting these links are to, as the first of them; null for
 *  none, or for two different ones (which is which isn't known). */
function onlyJoinLink(links: readonly string[]): string | null {
  const joins = links.map((l) => l.replace(/[).,;]+$/, '')).filter(isJoinLink)
  return joins.length && new Set(joins.map(joinKey)).size === 1 ? joins[0] : null
}

/** An event's page's join link: the one meeting its links go to, outside
 *  its menus, header and footer. Null when there's none, or more than one
 *  (a page of several events). Its links only, never text: "Add to Google
 *  Calendar" carries the Zoom link inside its own address. */
export function joinLinkIn(html: string): string | null {
  const body = html.replace(/<(nav|header|footer|script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  return onlyJoinLink([...body.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, '&').trim()))
}

/** Words that make a calendar entry a service, whose page is worth
 *  opening for its join link; a lecture's or a potluck's isn't. */
const SERVICE_TITLE = /\b(minyan|minyanim|services?|shacharit|shacharis|mincha|minchah|ma'?ariv|maariv|arvit|davening|daven|tefill?ah|tefill?ot|prayers?|kabbal(?:at|as) shabbat|kabbal(?:at|as) shabbos|havdalah|musaf|mussaf)\b/i

export const isServiceTitle = (title: string) => SERVICE_TITLE.test(title)

/** How many event pages one read opens for their join links. */
export const MAX_EVENT_PAGES = 4

/** The event pages to open for their join links: services from `from`
 *  (today) to `to`, in date order, each page once, at most
 *  MAX_EVENT_PAGES. One already with its link isn't opened. */
export function eventPagesToOpen(entries: readonly CalendarEntry[], from: string, to: string): string[] {
  const pages: string[] = []
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date) || minutes(a.time) - minutes(b.time))) {
    if (pages.length >= MAX_EVENT_PAGES) break
    if (e.date < from || e.date > to || !e.url || e.join || !e.time || !isServiceTitle(e.title) || pages.includes(e.url)) continue
    pages.push(e.url)
  }
  return pages
}

/** A dated time's join link, from its calendar. */
export type CalendarJoin = { date: string; time: string; link: string }

/** The calendar's join links from `from` to `to`, a timed entry each. */
export function calendarJoins(entries: readonly CalendarEntry[], from: string, to: string): CalendarJoin[] {
  return entries.flatMap((e) => (e.join && e.time && e.date >= from && e.date <= to ? [{ date: e.date, time: e.time, link: e.join }] : []))
}

/**
 * The calendar's join links onto the times the website's reading put on
 * those dates: a minyan on a date the calendar has a join link for, at
 * the same time, gets it, and the admin is told. By code, never the AI:
 * the reader is given the calendar's lines alone. Only the website's
 * schedules, and only a single date's minyan, so a time a person or the
 * newsletter gave is never touched.
 */
export function withJoinLinks(schedules: readonly SpecialSchedule[], joins: readonly CalendarJoin[]): { schedules: SpecialSchedule[]; changes: string[] } {
  const changes: string[] = []
  const next = schedules.map((s) => {
    if (s.postedBy !== 'website') return s
    let touched = false
    const minyanim = s.minyanim.map((m) => {
      if (m.on.length !== 1) return m
      const at = parseTimeToMinutes(m.time)
      const join = joins.find((j) => j.date === m.on[0] && parseTimeToMinutes(j.time) === at)
      if (!join || m.joinLink === join.link) return m
      touched = true
      changes.push(`${s.name}: ${TEFILLAH_LABELS[m.tefillah]}, ${dateText(join.date, { weekday: true })}, ${m.time} · ${joinText(join.link)}`)
      return { ...m, joinLink: join.link }
    })
    return touched ? { ...s, minyanim } : s
  })
  return { schedules: next, changes }
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

const weekdayNumber = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

/** One week of a calendar, as it's read: Sunday to Shabbos, from `from`
 *  (today, in this week), with that week's lines (calendarLines). */
export type CalendarWeek = { sunday: string; from: string; to: string; lines: string[]; joins?: CalendarJoin[] }

/** The weeks a calendar is read for (the user, Oct 20: "only read one week
 *  at a time so we just show this week's"): this week, from today to
 *  Shabbos, and from Thursday, when people plan for the next one, next
 *  week too. Each is read on its own, so each is that week's schedule. */
export function calendarWeeks(today: string): Omit<CalendarWeek, 'lines'>[] {
  const sunday = addDays(today, -weekdayNumber(today))
  const weeks = [{ sunday, from: today, to: addDays(sunday, 6) }]
  if (weekdayNumber(today) >= 4) weeks.push({ sunday: addDays(sunday, 7), from: addDays(sunday, 7), to: addDays(sunday, 13) })
  return weeks
}

/** The entries of an iCal feed between `from` and `to` inclusive. A weekly
 *  or monthly repeat (RRULE, as Google Calendar keeps a regular minyan) is
 *  laid out over those days; any other repeat is left at its first date. A
 *  date of a repeat moved or changed on its own (RECURRENCE-ID, Google's
 *  way) is that event, not the repeat's. */
export function icsEntries(ics: string, timezone: string, from: string, to: string): CalendarEntry[] {
  const lines = ics.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events: { props: Record<string, Prop>; exdates: string[] }[] = []
  let event: (typeof events)[number] | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      event = { props: {}, exdates: [] }
      continue
    }
    if (line === 'END:VEVENT' && event) {
      events.push(event)
      event = null
      continue
    }
    if (!event) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const [name, ...rawParams] = line.slice(0, colon).split(';')
    const params = Object.fromEntries(rawParams.map((p) => p.split('=') as [string, string]))
    const value = line.slice(colon + 1)
    if (name === 'EXDATE') {
      for (const v of value.split(',')) {
        const w = icsWhen({ params, value: v }, timezone)
        if (w) event.exdates.push(w.date)
      }
      continue
    }
    event.props[name.toUpperCase()] = { params, value }
  }
  // The dates of each repeat that are events of their own.
  const moved = new Set(
    events.flatMap(({ props }) => {
      const at = props['RECURRENCE-ID'] && icsWhen(props['RECURRENCE-ID'], timezone)
      return at && props.UID ? [`${props.UID.value}|${at.date}`] : []
    }),
  )
  const out: CalendarEntry[] = []
  for (const { props, exdates } of events) {
    const start = props.DTSTART && icsWhen(props.DTSTART, timezone)
    // Its end, when on the same day.
    const ends = start && start.time && props.DTEND ? icsWhen(props.DTEND, timezone) : null
    const ending = ends && ends.date === start!.date && ends.time && ends.time !== start!.time ? { end: ends.time } : {}
    const title = props.SUMMARY ? icsText(props.SUMMARY.value) : ''
    // Its page and its join link (eventLinks), the same on every date of a repeat.
    const end = { ...ending, ...eventLinks(props) }
    if (!start || !title || props.STATUS?.value === 'CANCELLED') continue
    const rule = props.RRULE ? Object.fromEntries(props.RRULE.value.split(';').map((kv) => kv.split('=') as [string, string])) : null
    const on = rule && repeatsOn(rule, start.date)
    if (on) {
      // Its end, where the shul is: a UTC end at midnight is the evening before.
      const until = rule.UNTIL ? icsWhen({ params: {}, value: rule.UNTIL }, timezone) : null
      const count = rule.COUNT ? Number(rule.COUNT) : Infinity
      let n = 0
      for (let d = start.date; d <= to && n < count; d = addDays(d, 1)) {
        if (until && (d > until.date || (d === until.date && until.time && minutes(start.time) > minutes(until.time)))) break
        if (!on(d)) continue
        n++
        if (d >= from && !exdates.includes(d) && !moved.has(`${props.UID?.value}|${d}`)) out.push({ date: d, time: start.time, ...end, title })
      }
    } else if (start.date >= from && start.date <= to) {
      out.push({ date: start.date, time: start.time, ...end, title })
    }
  }
  return out
}

/** Whether a repeat falls on a date, for the repeats laid out: weekly (on
 *  its days, every so many weeks) and monthly (its nth weekday, "1SA", the
 *  Little Shul's first Shabbos; its day of the month; or its first
 *  date's). Null for any other. */
function repeatsOn(rule: Record<string, string>, first: string): ((date: string) => boolean) | null {
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1))
  const at = (d: string) => new Date(`${d}T12:00:00Z`)
  if (rule.FREQ === 'WEEKLY') {
    const byDay = rule.BYDAY ? rule.BYDAY.split(',').map((d) => WEEKDAYS.indexOf(d.slice(-2))) : [at(first).getUTCDay()]
    return (d) => Math.floor((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / (7 * 86_400_000)) % interval === 0 && byDay.includes(at(d).getUTCDay())
  }
  if (rule.FREQ !== 'MONTHLY') return null
  const monthOf = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth()
  const lastDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  const days = rule.BYDAY?.split(',').map((x) => /^([+-]?\d+)?([A-Z]{2})$/.exec(x)).filter((m) => m !== null && WEEKDAYS.includes(m[2])) as RegExpExecArray[] | undefined
  const monthDays = rule.BYMONTHDAY?.split(',').map(Number).filter((n) => Number.isInteger(n) && n !== 0)
  return (d) => {
    const x = at(d)
    if ((monthOf(x) - monthOf(at(first))) % interval !== 0) return false
    const day = x.getUTCDate()
    if (days?.length) {
      return days.some(([, nth, wd]) => {
        if (x.getUTCDay() !== WEEKDAYS.indexOf(wd)) return false
        if (!nth) return true
        const n = Number(nth)
        return n > 0 ? Math.ceil(day / 7) === n : Math.ceil((lastDay(x) - day + 1) / 7) === -n
      })
    }
    if (monthDays?.length) return monthDays.some((n) => (n > 0 ? day === n : day === lastDay(x) + n + 1))
    return day === at(first).getUTCDate()
  }
}

export function isIcs(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/i.test(text)
}

/** The calendar's days from `from` to `to`, a line each, for the reader:
 *  "2026-10-30 (Fri) 7:30 PM: Kabbalat Shabbat Service", or with its end,
 *  "2026-10-22 (Thu) 8:10 AM–8:40 AM: Online Community Morning Minyan". In order, each
 *  entry once. Empty when there's nothing in that time. */
export function calendarLines(entries: readonly CalendarEntry[], from: string, to: string): string[] {
  const seen = new Set<string>()
  return entries
    .filter((e) => e.date >= from && e.date <= to && e.title)
    .sort((a, b) => a.date.localeCompare(b.date) || minutes(a.time) - minutes(b.time))
    .map((e) => {
      const weekday = new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      return `${e.date} (${weekday})${e.time ? ` ${e.time}${e.end ? `–${e.end}` : ''}` : ''}: ${e.title.replace(/\s+/g, ' ').slice(0, 120)}`
    })
    .filter((l) => (seen.has(l) ? false : (seen.add(l), true)))
    .slice(0, MAX_LINES)
}

function minutes(time: string | null): number {
  if (!time) return -1
  const m = /^(\d{1,2}):(\d{2}) ([AP])M$/.exec(time)
  return m ? ((Number(m[1]) % 12) + (m[3] === 'P' ? 12 : 0)) * 60 + Number(m[2]) : -1
}

/** What heads the calendar's lines in the text the reader is given. It
 *  tells the reader each is that date's only: a service on every Friday
 *  of the calendar isn't the shul saying it's every Friday (the user,
 *  Oct 20). */
export const CALENDAR_HEADING =
  'Their calendar, one entry per line (date, weekday, time: what it is). Each entry is for its date only, however often it repeats: give it that date, never a weekday:'
