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
export async function readShulWeek(
  listing: DirectoryResource,
  minyanimKey: string,
  source: ScheduleSource,
  apiKey: string,
  { sentAt }: { sentAt?: number } = {},
) {
  const now = Date.now()
  const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: community.timezone }).format(new Date(ms))
  const today = dayOf(now)
  // A message sent days ago (a newsletter): its days start when it was sent,
  // at most two weeks back, so its "this Shabbos" lands where it meant.
  const sentOn = sentAt && Number.isFinite(sentAt) ? dayOf(Math.max(sentAt, now - 14 * 86_400_000)) : undefined
  const first = sentOn && sentOn < today ? sentOn : today
  const span = 21 + Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000)
  const coords = listing.geo ?? community.mapCenter
  const ahead = await fetchDatesInfo({ latitude: coords.lat, longitude: coords.lng, timezone: community.timezone }, first, datesFrom(first, span).at(-1)!)
  const days = { today, ...(first < today ? { sentOn: first } : {}), days: datesFrom(first, span).map((date) => ({ date, names: ahead.names[date] ?? [] })) }
  const reading = await readRegular(source, days, listing.name, { apiKey })
  const update = compareTimes(regularMinyanim(listing[minyanimKey]), reading, { season: currentSeason(now, community.timezone), zmanim: ahead.zmanim })
  return { update, model: reading.model }
}
