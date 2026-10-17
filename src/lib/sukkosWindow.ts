import type { CategoryField } from './categories'

// ── Fields shown only part of the year ──────────────────────────────────────
// A hospital's sukkah matters from Rosh Hashanah, when families start asking,
// to the end of Sukkos (Simchas Torah, 23 Tishrei outside Israel). Worked
// out from the Hebrew date the browser's own calendar gives, so it needs no
// request. The date turns at midnight, not sunset: a few hours either way
// don't matter for a sukkah.

/** Whether `now` falls from 1 to 23 Tishrei, in the community's timezone. */
export function aroundSukkos(now: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone, month: 'long', day: 'numeric' }).formatToParts(now)
  const month = parts.find((p) => p.type === 'month')?.value
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  return month === 'Tishri' && day >= 1 && day <= 23
}

/** Whether a listing shows the field now. Always, for a field with no
 *  season; never before the page knows the time (`now` null), so the server
 *  and the browser draw the same thing. */
export function inSeason(field: Pick<CategoryField, 'shownAround'>, now: Date | null, timeZone: string): boolean {
  if (!field.shownAround) return true
  if (!now) return false
  return aroundSukkos(now, timeZone)
}
