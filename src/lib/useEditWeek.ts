'use client'

import { community } from '@/community.config'
import { useCommunityTimezone } from '@/lib/communityContext'
import { dayInTimezone } from '@/lib/activity'
import { shabbosIsOver } from '@/lib/schedules'
import { editWeek, weekAfter, type EditWeek } from '@/lib/thisWeekEdit'
import { useNow } from '@/lib/useNow'
import { useZmanim } from '@/lib/useZmanim'

/**
 * The week a shul's "This week's schedule" row in Edit listing is for
 * (thisWeekEdit.ts), and the one after it. The same week the listing's own
 * box uses (useMinyanSchedule), so the two never disagree about which week
 * it is. Null when `enabled` is off, and before the page has hydrated
 * (useNow).
 */
export function useEditWeek(enabled: boolean): { week: EditWeek; next: EditWeek } | null {
  const timezone = useCommunityTimezone()
  const now = useNow()
  // Nothing fetched for a place with no times.
  const { data } = useZmanim(enabled ? community.mapCenter : null)
  if (!enabled || now === null) return null
  const today = dayInTimezone(timezone, new Date(now))
  const week = editWeek(today, shabbosIsOver(today, now, data?.shabbos?.havdalah?.iso))
  return { week, next: weekAfter(week) }
}
