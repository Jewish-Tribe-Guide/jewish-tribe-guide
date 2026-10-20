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
// Google Calendar it embeds), or an event list in its scripts. The coming
// weeks' entries become one line each, with the date, and are read with
// the page as any shul's page is (listingPageRun.ts): the reader says
// which are services, and when.
//
// Pure: listingPageRun.ts fetches.
// ─────────────────────────────────────────────────────────────────────────────

export type CalendarEntry = {
  /** YYYY-MM-DD, as the shul's calendar has it. */
  date: string
  /** "7:30 PM", or null for an all-day entry with no time in its title. */
  time: string | null
  title: string
}

/** How far ahead the lines go: the days the shul's reader is told about
 *  (shulWeekReading.ts). */
export const CALENDAR_DAYS = 21
/** At most this many lines: a busy shul's three weeks, well inside what the
 *  reader is given. */
const MAX_LINES = 120

const ICS_LINK = /(?:\.ics(?:[?#]|$)|[?&]ical=1\b|^webcal:)/i

/** The iCal feeds a page links to or embeds, as addresses to fetch, the
 *  page's own first. A Google Calendar embed (`calendar/embed?src=…`) has
 *  a public feed at a known address. */
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
    const google = /calendar\.google\.com\/calendar\/(?:u\/\d+\/)?embed\?([^"'\s]+)/i.exec(raw)
    if (google) {
      for (const src of new URLSearchParams(google[1].replace(/&amp;/g, '&')).getAll('src')) {
        add(`https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`)
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
    if (dateOnly) {
      out.push({ date: dateOnly[1], time: titled, title })
      continue
    }
    const wall = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(start)
    if (wall) {
      out.push({ date: wall[1], time: clock(Number(wall[2]), Number(wall[3])), title })
      continue
    }
    const ms = Date.parse(start)
    if (Number.isFinite(ms)) out.push({ ...local(ms, timezone), title })
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

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** The entries of an iCal feed between `from` and `to` inclusive. A weekly
 *  repeat (RRULE FREQ=WEEKLY, as Google Calendar keeps a regular minyan) is
 *  laid out over those days; any other repeat is left at its first date. */
export function icsEntries(ics: string, timezone: string, from: string, to: string): CalendarEntry[] {
  const lines = ics.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: CalendarEntry[] = []
  let event: Record<string, Prop> | null = null
  let exdates: string[] = []
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      event = {}
      exdates = []
      continue
    }
    if (line === 'END:VEVENT' && event) {
      const start = event.DTSTART && icsWhen(event.DTSTART, timezone)
      const title = event.SUMMARY ? icsText(event.SUMMARY.value) : ''
      if (start && title && event.STATUS?.value !== 'CANCELLED') {
        const rule = event.RRULE ? Object.fromEntries(event.RRULE.value.split(';').map((kv) => kv.split('=') as [string, string])) : null
        if (rule?.FREQ === 'WEEKLY') {
          const interval = Math.max(1, Number(rule.INTERVAL ?? 1))
          // Its end, where the shul is: a UTC end at midnight is the evening before.
          const until = rule.UNTIL ? icsWhen({ params: {}, value: rule.UNTIL }, timezone) : null
          const count = rule.COUNT ? Number(rule.COUNT) : Infinity
          const byDay = rule.BYDAY ? rule.BYDAY.split(',').map((d) => WEEKDAYS.indexOf(d.slice(-2))) : [new Date(`${start.date}T12:00:00Z`).getUTCDay()]
          let n = 0
          for (let d = start.date; d <= to && n < count; d = addDays(d, 1)) {
            if (until && (d > until.date || (d === until.date && until.time && minutes(start.time) > minutes(until.time)))) break
            const weeks = Math.floor((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${start.date}T12:00:00Z`)) / (7 * 86_400_000))
            if (weeks % interval !== 0 || !byDay.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) continue
            n++
            if (d >= from && !exdates.includes(d)) out.push({ date: d, time: start.time, title })
          }
        } else if (start.date >= from && start.date <= to) {
          out.push({ date: start.date, time: start.time, title })
        }
      }
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
        if (w) exdates.push(w.date)
      }
      continue
    }
    event[name.toUpperCase()] = { params, value }
  }
  return out
}

export function isIcs(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/i.test(text)
}

/** The calendar's coming days, a line each, for the reader: "2026-10-30
 *  (Fri) 7:30 PM: Kabbalat Shabbat Service". From `today`, for
 *  CALENDAR_DAYS days, in order, each entry once. Empty when there's
 *  nothing in that time. */
export function calendarLines(entries: readonly CalendarEntry[], today: string): string[] {
  const last = addDays(today, CALENDAR_DAYS - 1)
  const seen = new Set<string>()
  return entries
    .filter((e) => e.date >= today && e.date <= last && e.title)
    .sort((a, b) => a.date.localeCompare(b.date) || minutes(a.time) - minutes(b.time))
    .map((e) => {
      const weekday = new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      return `${e.date} (${weekday})${e.time ? ` ${e.time}` : ''}: ${e.title.replace(/\s+/g, ' ').slice(0, 120)}`
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
  'Their calendar, the coming weeks, one entry per line (date, weekday, time: what it is). Each entry is for its date only, however often it repeats: give it that date, never a weekday:'
