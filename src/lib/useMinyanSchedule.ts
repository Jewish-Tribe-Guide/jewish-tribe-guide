'use client'

import { useCategories } from '@/lib/useCategories'
import { useAllListings } from '@/lib/useAllListings'
import { useNow } from '@/lib/useNow'
import { currentSeason, type Season } from '@/lib/season'
import { DAY_KEYS, dayAndMinutesInTimezone, type DayKey } from '@/lib/hours'
import { isMinyanim, type Minyan, type MinyanDayKey } from '@/lib/davening'
import type { ShulMinyanim } from '@/lib/upcomingDavening'
import { useZmanim } from '@/lib/useZmanim'
import { useZmanAnchors, geoOrCommunityDefault } from '@/lib/useZmanAnchors'
import type { AnchorTimes } from '@/lib/useZmanAnchors'
import type { LatLng } from '@/lib/geo'
import { community } from '@/community.config'
import type { CategoryConfig, CategoryField } from '@/lib/categories'

export type MinyanSchedule = {
  /** The first category with a minyanim field — where "All davening times"
   *  lives. Undefined when the community has none. */
  linkCategoryId: string | undefined
  shuls: ShulMinyanim[]
  anchors: Record<string, AnchorTimes>
  now: number
  todayKey: DayKey
  tomorrowKey: DayKey
  /** Today's day keys: the weekday, plus 'yom_tov' once zmanim confirms it. */
  todayDayKeys: MinyanDayKey[]
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
 */
export function useMinyanSchedule(coords: LatLng | null): MinyanSchedule {
  const categories = useCategories()
  const listings = useAllListings()
  const now = useNow()

  const minyanimCategories: { category: CategoryConfig; field: CategoryField }[] = (categories ?? [])
    .map((c) => ({ category: c, field: c.detailFields.find((f) => f.type === 'minyanim') }))
    .filter((x): x is { category: CategoryConfig; field: CategoryField } => !!x.field)
  const linkCategoryId = minyanimCategories[0]?.category.id

  const categoryFieldKey: Record<string, string> = {}
  for (const { category, field } of minyanimCategories) categoryFieldKey[category.id] = field.key

  const shuls: ShulMinyanim[] = (listings ?? [])
    .filter((l) => l.category in categoryFieldKey)
    .map((l) => {
      const raw = l[categoryFieldKey[l.category]]
      return { id: l.id, name: l.name, geo: l.geo, minyanim: isMinyanim(raw) ? (raw as Minyan[]) : [] }
    })
    .filter((s) => s.minyanim.length > 0)

  // Only shuls with at least one anchor-based row need a resolved sunset —
  // fetching zmanim for every shul's location regardless would cost a
  // request per distinct address for a card that mostly doesn't need it.
  const anchorGeos = shuls.filter((s) => s.minyanim.some((m) => m.anchor)).map((s) => geoOrCommunityDefault(s.geo))
  const anchors = useZmanAnchors(anchorGeos)

  // In the community's own timezone, not the visitor's device — see
  // dayAndMinutesInTimezone's own doc for the "jumped to tomorrow" report a
  // plain `new Date(now).getDay()` produced whenever the two disagreed.
  const { day: todayKey, minutes: nowMinutes } = dayAndMinutesInTimezone(now, community.timezone)
  const tomorrowKey = DAY_KEYS[(DAY_KEYS.indexOf(todayKey) + 1) % 7]
  const season = currentSeason(now, community.timezone)

  // Falls back to the community's own default location: whether today is
  // Yom Tov doesn't depend on which address a visitor set.
  const { data: zmanimData } = useZmanim(coords ?? community.mapCenter)
  const todayDayKeys: MinyanDayKey[] = zmanimData?.isYomTov ? [todayKey, 'yom_tov'] : [todayKey]

  return { linkCategoryId, shuls, anchors, now, todayKey, tomorrowKey, todayDayKeys, nowMinutes, season }
}
