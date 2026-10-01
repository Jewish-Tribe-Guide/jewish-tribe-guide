'use client'

import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { useNow } from '@/lib/useNow'
import { currentSeason, type Season } from '@/lib/season'
import { DAY_KEYS, dayAndMinutesInTimezone, type DayKey } from '@/lib/hours'
import type { MinyanDayKey } from '@/lib/davening'
import { dateKey, factsFor, readSchedules, regularMinyanim, schedulesKey, withSchedules, type DateFacts, type DayPosting } from '@/lib/schedules'
import { dayInTimezone } from '@/lib/activity'
import { listMinyanim, minyanimOn, type ShulMinyanim } from '@/lib/upcomingDavening'
import type { AnswerSchedule } from '@/lib/askAnswer'
import { useZmanim } from '@/lib/useZmanim'
import { useZmanAnchors, geoOrCommunityDefault } from '@/lib/useZmanAnchors'
import type { AnchorTimes } from '@/lib/useZmanAnchors'
import type { LatLng } from '@/lib/geo'
import { community } from '@/community.config'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

export type MinyanSchedule = {
  /** The first category with a minyanim field — where "All davening times"
   *  lives. Undefined when the community has none. */
  linkCategoryId: string | undefined
  shuls: ShulMinyanim[]
  anchors: Record<string, AnchorTimes>
  now: number
  todayKey: DayKey
  tomorrowKey: DayKey
  /** Today's day keys: the weekday, its date (a special schedule's
   *  minyanim), plus 'yom_tov' once the calendar confirms it. */
  todayDayKeys: MinyanDayKey[]
  /** Tomorrow's, the same way. */
  tomorrowDayKeys: MinyanDayKey[]
  /** What the calendar says about today and tomorrow. */
  today: DateFacts
  tomorrow: DateFacts
  /** Today and the six days after it. */
  week: DateFacts[]
  /** Whose times each shul has today and tomorrow, by listing id and date:
   *  a special schedule's, or regular ones where a festival has none posted
   *  (see schedules.ts). */
  posting: Record<string, Record<string, DayPosting>>
  nowMinutes: number
  season: Season | null
}

/**
 * Everything needed to say when minyanim are today: every shul with
 * structured minyanim, the resolved sunset/candle-lighting times its
 * anchor-based rows need, and today's and tomorrow's day keys in the
 * community's own timezone. Shared by the home screen's davening card and
 * the search's minyan answers, so the two can never disagree about what
 * "today" or "the next Maariv" means. Lifted out of DaveningTimesCard, whose
 * comments explain each rule below.
 *
 * Null until the page has hydrated: what's next depends on the time, which
 * isn't known before then (see useNow).
 */
export function useMinyanSchedule(coords: LatLng | null, only?: readonly DirectoryResource[]): MinyanSchedule | null {
  const categories = useCategories()
  // A category page passes its own listings (`only`): it has no provider of
  // every listing on the site, which only the home screen and the map load.
  const all = useAllListings()
  const listings = only ?? all
  const now = useNow()

  const minyanimCategories: { category: CategoryConfig; field: CategoryField }[] = (categories ?? [])
    .map((c) => ({ category: c, field: c.detailFields.find((f) => f.type === 'minyanim') }))
    .filter((x): x is { category: CategoryConfig; field: CategoryField } => !!x.field)
  const linkCategoryId = minyanimCategories[0]?.category.id

  const categoryFieldKey: Record<string, string> = {}
  for (const { category, field } of minyanimCategories) categoryFieldKey[category.id] = field.key

  // In the community's own timezone, not the visitor's device — see
  // dayAndMinutesInTimezone's own doc for the "jumped to tomorrow" report a
  // plain `new Date(now).getDay()` produced whenever the two disagreed.
  // Falls back to the community's own default location: whether today is
  // Yom Tov doesn't depend on which address a visitor set.
  const { data: zmanimData } = useZmanim(coords ?? community.mapCenter)
  // Today and the six days after it: what "Shabbos" or "Sunday" means when
  // asked this week, which a festival can change (Shemini Atzeres on
  // Shabbos).
  const dates =
    now === null
      ? []
      : Array.from({ length: 7 }, (_, i) => factsFor(dayInTimezone(community.timezone, new Date(now + i * 86_400_000)), zmanimData?.days, zmanimData?.daysThrough))
  // Today's Yom Tov answer is the converter's own (isYomTov); the days
  // ahead only fill in what it doesn't say.
  if (dates[0] && typeof zmanimData?.isYomTov === 'boolean') dates[0] = { ...dates[0], yomTov: zmanimData.isYomTov }

  const posting: Record<string, Record<string, DayPosting>> = {}
  const shuls: ShulMinyanim[] = (listings ?? [])
    .filter((l) => l.category in categoryFieldKey)
    .map((l) => {
      const key = categoryFieldKey[l.category]
      const applied = withSchedules(regularMinyanim(l[key]), readSchedules(l[schedulesKey(key)]), dates)
      posting[l.id] = applied.posting
      return { id: l.id, name: l.name, geo: l.geo, minyanim: applied.minyanim }
    })
    .filter((s) => s.minyanim.length > 0)

  // Only shuls with at least one anchor-based row need a resolved sunset —
  // fetching zmanim for every shul's location regardless would cost a
  // request per distinct address for a card that mostly doesn't need it.
  const anchorGeos = shuls.filter((s) => s.minyanim.some((m) => m.anchor)).map((s) => geoOrCommunityDefault(s.geo))
  const anchors = useZmanAnchors(anchorGeos)

  // Nothing is scheduled before the page has hydrated, when there's no time
  // yet (see useNow).
  if (now === null) return null
  const { day: todayKey, minutes: nowMinutes } = dayAndMinutesInTimezone(now, community.timezone)
  const tomorrowKey = DAY_KEYS[(DAY_KEYS.indexOf(todayKey) + 1) % 7]
  const season = currentSeason(now, community.timezone)
  const [today, tomorrow] = dates
  const todayDayKeys = dayKeysFor(today)
  const tomorrowDayKeys = dayKeysFor(tomorrow)

  return { linkCategoryId, shuls, anchors, now, todayKey, tomorrowKey, todayDayKeys, tomorrowDayKeys, today, tomorrow, week: dates, posting, nowMinutes, season }
}

/** The day keys a date's minyanim match: its weekday, its own date (a
 *  special schedule's), and Yom Tov when the calendar says so. */
export function dayKeysFor(d: DateFacts): MinyanDayKey[] {
  return [d.weekday, dateKey(d.date), ...(d.yomTov ? (['yom_tov'] as const) : [])]
}

/** The schedule as a search answer needs it (see askAnswer's
 *  AnswerSchedule): today's and tomorrow's minyanim, and any other day's
 *  on asking. Shared by the home search and a category page's. */
export function answerSchedule(schedule: MinyanSchedule): AnswerSchedule {
  return {
    ...listMinyanim(schedule.shuls, {
      today: schedule.todayDayKeys,
      tomorrow: schedule.tomorrowDayKeys,
      season: schedule.season,
      anchors: schedule.anchors,
    }),
    nowMinutes: schedule.nowMinutes,
    todayKey: schedule.todayKey,
    tomorrowKey: schedule.tomorrowKey,
    // The next such day this week, with whatever schedule it has.
    onDay: (day) => {
      const date = schedule.week.find((d) => d.weekday === day)
      return minyanimOn(schedule.shuls, date ? dayKeysFor(date) : [day], schedule.season, schedule.anchors)
    },
  }
}
