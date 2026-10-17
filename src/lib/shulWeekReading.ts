import { community } from '@/community.config'
import type { DirectoryResource } from '@/types'
import { fetchDatesInfo } from './dateZmanim'
import { readRegular, type ScheduleSource } from './scheduleReader'
import { compareTimes } from './scheduleUpdate'
import { regularMinyanim } from './schedules'
import { currentSeason } from './season'

/** `n` dates from `today`, inclusive. */
function datesFrom(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10))
}

/** "Update their times" (agreed Oct 1), the reading half: a shul's times
 *  read from what was sent, then compared with what the listing has, day by
 *  day, over the next three weeks (scheduleUpdate.ts). Shared by the shul
 *  card's own paste box and the "+ Add" box's reader. */
export async function readShulWeek(listing: DirectoryResource, minyanimKey: string, source: ScheduleSource, apiKey: string) {
  const now = Date.now()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: community.timezone }).format(new Date(now))
  const coords = listing.geo ?? community.mapCenter
  const ahead = await fetchDatesInfo({ latitude: coords.lat, longitude: coords.lng, timezone: community.timezone }, today, datesFrom(today, 21).at(-1)!)
  const days = { today, days: datesFrom(today, 21).map((date) => ({ date, names: ahead.names[date] ?? [] })) }
  const reading = await readRegular(source, days, listing.name, { apiKey })
  const update = compareTimes(regularMinyanim(listing[minyanimKey]), reading, { season: currentSeason(now, community.timezone), zmanim: ahead.zmanim })
  return { update, model: reading.model }
}
