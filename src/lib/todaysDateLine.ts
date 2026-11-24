// ─────────────────────────────────────────────────────────────────────────────
// A line that only says what day it is.
//
// Many shul sites print today's date on every page (ShulCloud's footer:
// "Tue, November 24, 2026 14 Kislev 5787"). The watch notices a page has
// changed by its words, so a page like that "changed" every night and was
// read by the AI again each time, and a reading that came out differently
// filed findings about a page nobody had touched (Sons of Israel's Schedule
// of Tefillot, Nov 21–24). The line is taken out before the page is
// fingerprinted or read.
//
// Only a line that is the date and nothing else goes: a weekday, today's
// date (or the day either side, since the site may keep another timezone's
// day), a Hebrew date, numbers. A line with a time or any other word stays
// ("Tue Nov 24: Shacharis 6:45am" is a schedule, not a date stamp).
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** The words a date stamp may carry besides the date: weekdays and the
 *  Hebrew months, as sites spell them. */
const DATE_WORDS = new Set([
  ...['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  ...['sun', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat'],
  ...['tishrei', 'tishri', 'cheshvan', 'heshvan', 'marcheshvan', 'mar', 'kislev', 'tevet', 'teves', 'shevat', 'shvat', 'adar', 'nisan', 'nissan', 'iyar', 'iyyar', 'sivan', 'tammuz', 'tamuz', 'av', 'elul', 'i', 'ii'],
  'today',
  'is',
])

const LONGEST_STAMP = 80

function shift(day: string, by: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10)
}

/** The ways a site writes one day: "November 24, 2026", "Nov. 24 2026",
 *  "24 November 2026", "11/24/2026", "11/24/26", "2026-11-24". */
function spellings(day: string): RegExp[] {
  const [y, m, d] = day.split('-').map(Number)
  const month = MONTHS[m - 1]
  const name = `(?:${month}|${month.slice(0, 3)}\\.?)`
  return [
    new RegExp(`\\b${name}\\s+0?${d}(?:st|nd|rd|th)?,?\\s+${y}\\b`, 'i'),
    new RegExp(`\\b0?${d}(?:st|nd|rd|th)?\\s+${name},?\\s+${y}\\b`, 'i'),
    new RegExp(`(?<![\\d/])0?${m}/0?${d}/(?:${y}|${String(y).slice(2)})(?![\\d/])`),
    new RegExp(`\\b${day}\\b`),
  ]
}

/** Whether a line is a date stamp for one of `days`, and only that. */
export function isDateStamp(line: string, days: readonly string[]): boolean {
  const text = line.trim()
  if (!text || text.length > LONGEST_STAMP) return false
  for (const day of days) {
    for (const re of spellings(day)) {
      const m = text.match(re)
      if (!m) continue
      const rest = text.replace(m[0], ' ').toLowerCase()
      const words = rest.match(/[a-z]+/g) ?? []
      if (words.every((w) => DATE_WORDS.has(w))) return true
    }
  }
  return false
}

/** The page's words without a line that only gives today's date. */
export function withoutTodaysDate(text: string, today: string): string {
  const days = [shift(today, -1), today, shift(today, 1)]
  const lines = text.split('\n')
  const kept = lines.filter((l) => !isDateStamp(l, days))
  return kept.length === lines.length ? text : kept.join('\n')
}
