import type { EruvLineFile } from './eruvLine'

// ── Eruvim and their status (Oct 7) ─────────────────────────────────────────
// Each eruv's own site is the authority. The guide reads the page the eruv
// posts its status on, keeps the words it found, and says when it checked:
// "Up for this Shabbos · Checked 2:55 PM · every 15 minutes until candle
// lighting". It never decides a status itself.
//
// Rules, agreed with the user on the canvas (page "eruv"):
//   - The eruv's own "up", dated or not, is up, with the time the guide
//     checked. An eruv that dates each week's post (statusDated: Lower
//     Merion) is taken at its date: last week's "up" is "Not posted yet
//     this week".
//   - A page that says both up and down, neither, or can't be read is never
//     shown as up.
//   - Down always shows as down.

export type EruvStatus = 'up' | 'down' | 'unknown'

export type Eruv = {
  id: string
  name: string
  /** Where it goes, in words: "Center City and South Philadelphia, including
   *  Jefferson." */
  covers: string | null
  website: string | null
  hotline: string | null
  /** The eruv's own sign-up for alerts, if it has one. */
  alertsUrl: string | null
  /** The page it posts its status on; null when it has none (a hotline). */
  statusUrl: string | null
  /** Posts a dated status each week, so an old date means not posted yet. */
  statusDated: boolean
  status: EruvStatus | null
  /** The words the status was read from: "The Eruv is Up!". */
  statusWords: string | null
  /** The date the eruv put on its post (YYYY-MM-DD), when it gives one. */
  statusPostedOn: string | null
  /** The last time the guide read the page properly. */
  statusCheckedAt: string | null
  /** The last time a read failed, and why; newer than statusCheckedAt means
   *  the status shown is no longer current. */
  statusErrorAt: string | null
  statusError: string | null
  /** Its line on the guide's map, as an admin approved it, without the
   *  pieces they left out; null until one is approved. */
  line: EruvLineFile | null
}

// ── Reading a page ──────────────────────────────────────────────────────────

/** A page's words, without its scripts, styles and tags. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&rsquo;|&apos;/gi, '’')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The first date written out in English in `text`: "Oct 2nd 2026",
 *  "August 28, 2026". YYYY-MM-DD, or null. */
export function firstDate(text: string): string | null {
  const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i)
  if (!m) return null
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1
  const day = Number(m[2])
  if (day < 1 || day > 31) return null
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export type StatusReading = { status: EruvStatus; words: string | null; postedOn: string | null }

/** What an eruv's page says: "The Center City Eruv is currently up",
 *  "The Eruv is UP!". Every such sentence on the page must agree; if one
 *  says up and another down, or none is found, it's unknown. The date is
 *  the first one written after the first sentence (Lower Merion's "Oct 2nd
 *  2026"; Center City's "Last updated: Friday, August 28, 2026"). */
export function readStatus(text: string): StatusReading {
  const found = [...text.matchAll(/(?:\bthe\s+(?:[\w’'-]+\s+){0,3})?\beruv\s+is\s+(?:currently\s+|now\s+)?(up|down)\b[!.]?/gi)]
  const statuses = new Set(found.map((m) => m[1].toLowerCase() as 'up' | 'down'))
  if (statuses.size !== 1) return { status: 'unknown', words: found[0]?.[0].trim() ?? null, postedOn: null }
  const first = found[0]
  const after = text.slice((first.index ?? 0) + first[0].length, (first.index ?? 0) + first[0].length + 240)
  return { status: [...statuses][0], words: first[0].trim(), postedOn: firstDate(after) }
}

// ── When to read again ──────────────────────────────────────────────────────

const MINUTE = 60_000

/** Minutes from midnight and the date (YYYY-MM-DD) and weekday (0 = Sunday)
 *  at `now` in `tz`. */
export function localParts(now: Date, tz: string): { minutes: number; date: string; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return {
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
  }
}

/** Friday or an Erev Yom Tov, from noon until candle lighting: the hours
 *  people check. `candlesToday` is today's candle lighting in minutes from
 *  midnight, or null when there's none today. */
export function inCheckingHours(now: Date, tz: string, candlesToday: number | null): boolean {
  if (candlesToday === null) return false
  const { minutes } = localParts(now, tz)
  return minutes >= 12 * 60 && minutes < candlesToday
}

/** How old a reading may be before the page is read again: 15 minutes in
 *  the checking hours, 3 hours otherwise. */
export function staleAfterMs(now: Date, tz: string, candlesToday: number | null): number {
  return inCheckingHours(now, tz, candlesToday) ? 15 * MINUTE : 180 * MINUTE
}

export function isStale(eruv: Pick<Eruv, 'statusUrl' | 'statusCheckedAt' | 'statusErrorAt'>, now: Date, tz: string, candlesToday: number | null): boolean {
  if (!eruv.statusUrl) return false
  const last = Math.max(eruv.statusCheckedAt ? Date.parse(eruv.statusCheckedAt) : 0, eruv.statusErrorAt ? Date.parse(eruv.statusErrorAt) : 0)
  return now.getTime() - last >= staleAfterMs(now, tz, candlesToday)
}

// ── What a visitor sees ─────────────────────────────────────────────────────

export type EruvTone = 'green' | 'amber' | 'red' | 'grey'
export type EruvView = { tone: EruvTone; label: string; checked: string | null }

/** The Sunday (YYYY-MM-DD) that starts the week `date` is in. */
export function weekStart(date: string, weekday: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - weekday)
  return d.toISOString().slice(0, 10)
}

function timeOf(iso: string, now: Date, tz: string): string {
  const at = new Date(iso)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(at)
  if (localParts(at, tz).date === localParts(now, tz).date) return time
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(at)
  return `${day} ${time}`
}

/** "Up for this Shabbos" and "Checked 2:55 PM · every 15 minutes until
 *  candle lighting". */
export function eruvView(eruv: Eruv, now: Date, tz: string, candlesToday: number | null): EruvView {
  const { date, weekday } = localParts(now, tz)
  const shabbosSide = weekday === 5 || weekday === 6
  const every = inCheckingHours(now, tz, candlesToday) ? 'every 15 minutes until candle lighting' : 'every 15 minutes on Fridays until candle lighting'
  const checkedLine = (iso: string | null) => (iso ? `Checked ${timeOf(iso, now, tz)} · ${every}` : null)

  if (!eruv.statusUrl) return { tone: 'grey', label: 'No status online', checked: null }
  const failedSince = eruv.statusErrorAt && (!eruv.statusCheckedAt || Date.parse(eruv.statusErrorAt) > Date.parse(eruv.statusCheckedAt))
  if (!eruv.statusCheckedAt || failedSince) return { tone: 'amber', label: 'Couldn’t read their status', checked: eruv.statusErrorAt ? checkedLine(eruv.statusErrorAt) : null }
  const checked = checkedLine(eruv.statusCheckedAt)
  if (eruv.status === 'down') return { tone: 'red', label: shabbosSide ? 'Down this Shabbos' : 'Down', checked }
  if (eruv.status !== 'up') return { tone: 'amber', label: 'Couldn’t read their status', checked }
  if (eruv.statusDated && (!eruv.statusPostedOn || eruv.statusPostedOn < weekStart(date, weekday))) return { tone: 'amber', label: 'Not posted yet this week', checked }
  return { tone: 'green', label: shabbosSide ? 'Up for this Shabbos' : 'Up', checked }
}

/** A phone number as dialled: "(215) 333-ERUV" → "2153333788". */
export function dialable(phone: string): string {
  const letters: Record<string, string> = { a: '2', b: '2', c: '2', d: '3', e: '3', f: '3', g: '4', h: '4', i: '4', j: '5', k: '5', l: '5', m: '6', n: '6', o: '6', p: '7', q: '7', r: '7', s: '7', t: '8', u: '8', v: '8', w: '9', x: '9', y: '9', z: '9' }
  const main = phone.split(/,|\s+option\b/i)[0]
  return main.replace(/[a-z]/gi, (c) => letters[c.toLowerCase()]).replace(/[^\d+]/g, '')
}
