'use client'

import { community } from '@/community.config'
import { useCommunityTimezone } from '@/lib/communityContext'
import { dayInTimezone } from '@/lib/activity'
import { currentSeason, type Season } from '@/lib/season'
import { shabbosIsOver } from '@/lib/schedules'
import { editWeek, type EditWeek } from '@/lib/thisWeekEdit'
import { useNow } from '@/lib/useNow'
import { useZmanim } from '@/lib/useZmanim'
import { geoKey, geoOrCommunityDefault, useZmanAnchors, type AnchorTimes } from '@/lib/useZmanAnchors'

type Geo = { lat: number; lng: number }

/**
 * The week a shul's "This week's schedule" row in Edit listing is for
 * (thisWeekEdit.ts), with what its usual times are judged by this season:
 * the season and the shul's zmanim (seasonPairs.ts). The same week, season
 * and zmanim the listing's own box uses (useMinyanSchedule), so the two
 * never disagree about which week it is. Null when `enabled` is off, and
 * before the page has hydrated (useNow).
 */
export function useEditWeek(enabled: boolean, geo: Geo | null | undefined): { week: EditWeek; season: Season | null; anchors: AnchorTimes | undefined } | null {
  const timezone = useCommunityTimezone()
  const now = useNow()
  // Nothing fetched for a place with no times.
  const { data } = useZmanim(enabled ? community.mapCenter : null)
  const at = geoOrCommunityDefault(geo)
  const anchors = useZmanAnchors(enabled ? [at] : [])
  if (!enabled || now === null) return null
  const today = dayInTimezone(timezone, new Date(now))
  return { week: editWeek(today, shabbosIsOver(today, now, data?.shabbos?.havdalah?.iso)), season: currentSeason(now, timezone), anchors: anchors[geoKey(at)] }
}
