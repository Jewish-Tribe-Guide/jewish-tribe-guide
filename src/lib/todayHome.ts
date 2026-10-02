import type { ZmanimData } from '@/types'

// ── The Today home (step 6) ─────────────────────────────────────────────────
// The home page that changes with the day, behind SiteSettings.homeStyle.
// What it says is worked out here, so each kind of day can be tested with a
// fixed clock.

/** The small line above the title: "Tuesday, Oct 6 · 25 Tishrei · sunset
 *  6:35 PM". Friday and Shabbos say "Shabbos" and leave sunset to the
 *  candles card; so does Yom Tov. The Hebrew date and sunset come with the
 *  zmanim, so until they arrive the line is the date alone. Null before
 *  there's a clock (the server render), so nothing says the wrong day. */
export function dayLine(now: number | null, timezone: string, zmanim: ZmanimData | null): string | null {
  if (now === null) return null
  const at = new Date(now)
  const weekday = at.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })
  const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone })
  const shabbos = weekday === 'Saturday'
  const parts = [`${shabbos ? 'Shabbos' : weekday}, ${date}`]
  // "25 Tishrei 5787": the year says nothing anyone needs today. Only when
  // the zmanim are today's: a cached copy from yesterday would be a day off.
  const hebrew = zmanim && zmanimAreFor(zmanim, at, timezone) ? zmanim.hebrewDate.replace(/\s+\d{4}$/, '') : ''
  if (hebrew) parts.push(hebrew)
  const ordinaryDay = !shabbos && weekday !== 'Friday' && !zmanim?.isYomTov
  const sunset = zmanim?.dailyZmanim.find((z) => z.label === 'Sunset')?.time
  if (hebrew && ordinaryDay && sunset) parts.push(`sunset ${sunset}`)
  return parts.join(' · ')
}

/** Whether these zmanim are for the day it is: their weekday matches. */
function zmanimAreFor(zmanim: ZmanimData, at: Date, timezone: string): boolean {
  const weekday = at.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone })
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][zmanim.dayOfWeek] === weekday
}
