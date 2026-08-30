import type { ZmanimData } from '@/types'
import { ALL_DAYS, type MinyanDayKey } from '@/lib/davening'
import { secularHoliday } from '@/lib/secularHolidays'

// ─────────────────────────────────────────────────────────────────────────────
// Which day keys apply to today — the thing that turns a minyan's
// `days: ['mon', 'thu', 'rosh_chodesh']` from a label into an answer.
//
// Until now nothing in the app evaluated the two pseudo-days at all: they
// rendered as the words "Rosh Chodesh" and "Holiday" and no code ever asked
// whether either was true. The Today filter therefore had to include both
// unconditionally, or it would have hidden minyanim that were genuinely
// running. This is what lets it stop doing that.
//
// The governing rule, and the reason `roshChodeshKnown` is part of the return
// value rather than an implementation detail: **never narrow on missing
// data.** A wrong "yes" here shows a minyan that isn't running, and the
// visitor reads the "Rosh Chodesh" heading and discounts it. A wrong "no"
// hides a minyan that is, and there is nothing on screen to discount. So when
// the Jewish-calendar answer hasn't arrived — a slow fetch, a Hebcal outage,
// an older deployment whose payload predates the field — this falls back to
// including Rosh Chodesh, exactly as before.
//
// Secular holidays have no such failure mode: they're computed locally from
// nth-weekday rules (see secularHolidays.ts), so the answer is always known
// and can always be trusted to narrow.
// ─────────────────────────────────────────────────────────────────────────────

export type CalendarToday = {
  /** Day keys a minyan can match to count as running today. */
  dayKeys: MinyanDayKey[]
  /** Calendar facts worth naming in the UI, e.g. ["Rosh Chodesh Elul"]. */
  labels: string[]
  /** False while the Rosh Chodesh answer is a fallback rather than a fact. */
  roshChodeshKnown: boolean
}

export function calendarDaysFor(now: number, zmanim: ZmanimData | null | undefined): CalendarToday {
  const date = new Date(now)
  const dayKeys: MinyanDayKey[] = [ALL_DAYS[date.getDay()]]
  const labels: string[] = []

  const holiday = secularHoliday(date)
  if (holiday) {
    dayKeys.push('holiday')
    labels.push(holiday)
  }

  // `undefined` is "we don't know", not "no" — an older deployment's cached
  // zmanim payload has no isRoshChodesh field at all.
  const roshChodeshKnown = typeof zmanim?.isRoshChodesh === 'boolean'
  if (!roshChodeshKnown || zmanim?.isRoshChodesh) dayKeys.push('rosh_chodesh')
  if (roshChodeshKnown && zmanim?.isRoshChodesh) {
    // Prefer Hebcal's own name ("Rosh Chodesh Elul") over a generic label.
    labels.push(zmanim.holidays?.find((e) => e.startsWith('Rosh Chodesh')) ?? 'Rosh Chodesh')
  }

  return { dayKeys, labels, roshChodeshKnown }
}
