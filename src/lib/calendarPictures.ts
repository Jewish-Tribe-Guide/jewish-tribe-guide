import { pagePictures, type PagePicture } from './menuReader'

// A shul's month posted as pictures (Mikveh Israel, Oct 21): its calendar
// page's event list is empty, and the month is in PNGs, "Oct. High Holiday
// calendar 2026.png" and "Calendar September 2026.png". They're read as a
// PDF is, a week at a time (listingPageRun.ts). Pure: which pictures, not
// their reading.

/** At most this many: a month and the next, not a gallery. */
export const MAX_CALENDAR_PICTURES = 2

/** What a calendar's file name or alt text calls it. Not "minyan": that's
 *  as likely a photo of one. */
const SAYS_CALENDAR = /calendar|schedule|davening|zmanim|luach/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** A month named in a file name ("Calendar September 2026", "oct_2026"),
 *  whole or cut short, never inside a word or a hex id. */
const MONTH_NAME = /(?<![a-z0-9])(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z0-9])/gi
const YEAR = /(?<![0-9])20\d\d(?![0-9])/g

/** Its file name, spaced as written, and its alt text or title. */
function nameOf(p: PagePicture): string {
  return `${decodeURIComponent(new URL(p.url).pathname.split('/').pop() ?? '').replace(/[+_]/g, ' ')} ${p.words}`
}

/** A picture the shape and size of a printed page, upright: a scanned
 *  calendar or flyer, not a photo or a banner (Mikveh Israel's header is
 *  846×550; its calendars 2550×3300). */
function pageShaped(p: PagePicture): boolean {
  return !!p.width && !!p.height && p.height >= 1000 && p.height / p.width >= 1.2 && p.height / p.width <= 1.5
}

/** Whether a picture naming a month (and a year) is for the days read:
 *  last month's calendar, still posted beside this one, isn't. One naming
 *  none may be. */
function forTheseDays(name: string, days: readonly string[]): boolean {
  const months = [...name.matchAll(MONTH_NAME)].map((m) => MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1)
  const years = [...name.matchAll(YEAR)].map((m) => Number(m[0]))
  const covered = (n: number, at: 0 | 1) => days.some((d) => Number(d.split('-')[at]) === n)
  return (!months.length || months.some((m) => covered(m, 1))) && (!years.length || years.some((y) => covered(y, 0)))
}

/**
 * The pictures on a shul's page that may be its calendar for `days` (the
 * weeks it's read for, first and last of each), best first, at most
 * MAX_CALENDAR_PICTURES: one its file name or alt text calls a calendar or
 * schedule, then one the shape of a printed page. Never a logo or a photo,
 * nor one naming a month the days aren't in. For a page whose words give
 * no davening time (listingPageRun.ts).
 */
export function calendarPictures(html: string, base: string, days: readonly string[]): string[] {
  const all = pagePictures(html, base).filter((p) => forTheseDays(nameOf(p), days))
  const named = all.filter((p) => SAYS_CALENDAR.test(nameOf(p)))
  const shaped = all.filter((p) => !named.includes(p) && pageShaped(p))
  return [...named, ...shaped].slice(0, MAX_CALENDAR_PICTURES).map((p) => p.url)
}
