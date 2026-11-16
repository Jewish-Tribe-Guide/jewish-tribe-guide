import { nextUpcomingDavening, type UpcomingDavening } from './upcomingDavening'
import { secularHolidayTomorrow } from './secularHolidays'
import { routes } from './routes'
import type { MinyanSchedule } from './useMinyanSchedule'

// The next minyan, as the Next minyan card and Right now's minyan row (board
// V2, Nov 15) both say it, and where a tap on either goes.

/** The next minyan today, or tomorrow's first; null when neither has one. */
export function nextMinyan(schedule: MinyanSchedule): UpcomingDavening | null {
  return nextUpcomingDavening(schedule.shuls, {
    today: schedule.todayDayKeys,
    tomorrow: schedule.tomorrowDayKeys,
    nowMinutes: schedule.nowMinutes,
    season: schedule.season,
    anchors: schedule.anchors,
  })
}

/**
 * The minyan page with "All davening times" open (`?davening=1`), on the day
 * the answer is for. Without `davening=1` this landed on a bare category page
 * and made the visitor find the same button a second time. With tomorrow's
 * first minyan, `&day=` opens tomorrow, or the view would open on a today
 * with nothing left in it and no visible reason why.
 *
 * Comma-separated, not just the weekday: if tomorrow is also a secular
 * holiday, a shul's holiday-specific minyan (days: ['holiday']) needs that
 * pseudo-day in the filter too. Rosh Chodesh isn't included, for the same
 * reason as secularHolidayTomorrow's own doc gives.
 */
export function nextMinyanHref(
  communitySlug: string,
  categoryId: string,
  result: UpcomingDavening | null,
  schedule: MinyanSchedule | null,
  timezone: string,
): string {
  const tomorrowHoliday = result?.isTomorrow && schedule ? secularHolidayTomorrow(schedule.now, timezone) : null
  const day = [schedule?.tomorrowKey, ...(tomorrowHoliday ? ['holiday'] : [])].join(',')
  return `${routes.slug(communitySlug, categoryId)}?davening=1${result?.isTomorrow ? `&day=${day}` : ''}`
}
