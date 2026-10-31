import { community } from '@/community.config'
import type { DirectoryResource } from '@/types'
import { fetchDatesInfo } from './dateZmanim'
import { leaveOutHeldElsewhere } from './heldElsewhere'
import { readRegular, type ScheduleSource } from './scheduleReader'
import { compareTimes, weekdayOf, type RegularReading } from './scheduleUpdate'
import { editWeek, type EditWeek } from './thisWeekEdit'
import { regularMinyanim } from './schedules'
import { currentSeason } from './season'

/** `n` dates from `today`, inclusive. */
function datesFrom(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10))
}

/** "Update their times" (agreed Oct 1), the reading half: a shul's times
 *  read from what was sent, then compared with what the listing has, day by
 *  day, over the next three weeks (scheduleUpdate.ts). Shared by the shul
 *  card's own paste box and the "+ Add" box's reader.
 *
 *  `week`: one week of the shul's calendar (calendarFeed.ts), read as that
 *  week's times whatever the AI calls it, dated, each date only, and every
 *  minyan those days: a calendar is the shul's whole week (the user, Oct
 *  20: "if we have the schedule for the week then it's not usual times").
 *
 *  `others`: the guide's listings, asked for only when a time was read as
 *  held somewhere else, so one another shul already has is left out
 *  (heldElsewhere.ts); `elsewhere` says which, for the admin. */
export async function readShulWeek(
  listing: DirectoryResource,
  minyanimKey: string,
  source: ScheduleSource,
  apiKey: string,
  { sentAt, week, others }: { sentAt?: number; week?: { from: string; to: string }; others?: () => Promise<readonly DirectoryResource[]> } = {},
) {
  const now = Date.now()
  const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: community.timezone }).format(new Date(ms))
  const today = dayOf(now)
  // A message sent days ago (a newsletter): its days start when it was sent,
  // at most two weeks back, so its "this Shabbos" lands where it meant.
  const sentOn = sentAt && Number.isFinite(sentAt) ? dayOf(Math.max(sentAt, now - 14 * 86_400_000)) : undefined
  const first = sentOn && sentOn < today ? sentOn : today
  const dates = week
    ? datesFrom(week.from, 1 + Math.round((Date.parse(`${week.to}T12:00:00Z`) - Date.parse(`${week.from}T12:00:00Z`)) / 86_400_000))
    : datesFrom(first, 21 + Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000))
  const coords = listing.geo ?? community.mapCenter
  const ahead = await fetchDatesInfo({ latitude: coords.lat, longitude: coords.lng, timezone: community.timezone }, dates[0], dates.at(-1)!)
  const days = { today, ...(!week && first < today ? { sentOn: first } : {}), days: dates.map((date) => ({ date, names: ahead.names[date] ?? [] })) }
  const raw = await readRegular(source, days, listing.name, { apiKey })
  const { times, left } = await leaveOutHeldElsewhere(raw.times, { shulId: listing.id, key: minyanimKey, zmanim: ahead.zmanim, others })
  const read = { ...raw, times }
  // "This week", given by weekday: the guide's week, Sunday to Shabbos,
  // the next once Shabbos is over, as Edit listing's (thisWeekEdit.ts).
  const shabbosOver = first === today && weekdayOf(today) === 'sat' && localMinutes(now) >= (ahead.zmanim[today]?.havdalah ?? Infinity)
  const reading = week ? asCalendarWeek(read, week) : weekdaysOnGuideWeek(read, editWeek(first, shabbosOver), 'text' in source ? source.text : undefined)
  const compare = (r: RegularReading) => compareTimes(regularMinyanim(listing[minyanimKey]), r, { season: currentSeason(now, community.timezone), zmanim: ahead.zmanim })
  const update = compare(reading)
  // A website page's: its usual times, then each week it gives dates for,
  // as that week's schedule (datedAsWeeks).
  const { usual, weeks } = datedAsWeeks(reading)
  return { update, updates: [...(usual ? [usual] : []), ...weeks].map(compare), model: read.model, elsewhere: left }
}

/** A page's times as the website gives them (the user, Oct 21, on Mikveh
 *  Israel's "Shabbat Lekh Lekha · Fri Oct 23 · 6:00 PM": "If we have
 *  specific dates then it should all go on this week"): its usual times,
 *  and what it gives for particular dates as the schedule for their week,
 *  from the first of them to that Shabbos, never as one day's extra "as
 *  well as the regular times". The usual times those days are kept beside
 *  them (keepUncovered), since a page posting this Shabbos rarely lists
 *  everything. A week as read is left as it is. */
export function datedAsWeeks(reading: RegularReading): { usual: RegularReading | null; weeks: RegularReading[] } {
  const dated = reading.times.filter((t) => t.date)
  if (reading.kind !== 'schedule' || !dated.length) return { usual: reading, weeks: [] }
  const undated = reading.times.filter((t) => !t.date)
  const shabbosOf = (date: string) => {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 6 - d.getUTCDay())
    return d.toISOString().slice(0, 10)
  }
  const byWeek = new Map<string, typeof dated>()
  for (const t of [...dated].sort((a, b) => a.date!.localeCompare(b.date!))) byWeek.set(shabbosOf(t.date!), [...(byWeek.get(shabbosOf(t.date!)) ?? []), t])
  const weeks = [...byWeek].map(([shabbos, times]): RegularReading => {
    const occasions = new Set(times.map((t) => t.occasion ?? null))
    const [occasion] = occasions
    return { kind: 'week', complete: false, season: null, title: occasions.size === 1 ? occasion : null, startsOn: null, from: times[0].date!, to: shabbos, times }
  })
  return { usual: undated.length ? { ...reading, times: undated } : null, weeks }
}

// Minutes past midnight in the community's timezone.
function localMinutes(ms: number): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: community.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)).split(':').map(Number)
  return h * 60 + m
}

// "Oct 24", "October 24th", "10/24", "the 24th": the message names a date.
const NAMES_A_DATE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)\b/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Whether the message writes one of these dates anywhere, a heading above
 *  its times included: "Weekday Services: November 1 to November 6". */
function textNamesDate(text: string, dates: readonly string[]): boolean {
  return dates.some((date) => {
    const [, month, day] = date.split('-').map(Number)
    return new RegExp(`\\b${MONTHS[month - 1]}[a-z]*\\.?\\s+0?${day}(?:st|nd|rd|th)?\\b|\\b0?${month}/0?${day}\\b`, 'i').test(text)
  })
}

/** A week given by weekday ("this week's schedule: Sunday 9:00 AM…"), on
 *  the guide's week, Sunday to Shabbos (the user, Oct 23: BZBI's, pasted on
 *  a Friday, was dated Fri Oct 23 – Thu Oct 29 one read and Sun Oct 25 –
 *  Sat Oct 31 the next, the AI choosing). Each time keeps its weekday. A
 *  message that names its dates is left as read: a newsletter's "Shabbos
 *  Oct 24, weekdays Oct 25–29" really does run past Shabbos. So it is when
 *  they are only in a heading: Mekor's "Weekday Services: November 1 to
 *  November 6" went on Oct 25–30 (the user, Oct 31). */
export function weekdaysOnGuideWeek(reading: RegularReading, week: EditWeek, text?: string): RegularReading {
  if (reading.kind !== 'week' || reading.namesDates || reading.times.some((t) => NAMES_A_DATE.test(t.quote))) return reading
  if (text && textNamesDate(text, reading.times.flatMap((t) => (t.date ? [t.date] : [])))) return reading
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${week.from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10))
  const onWeek = (date: string) => days.find((d) => weekdayOf(d) === weekdayOf(date))!
  const seen = new Set<string>()
  const times = reading.times.flatMap((t) => {
    if (!t.date) return [t]
    const date = onWeek(t.date)
    const key = JSON.stringify([date, t.tefillah, t.time, t.anchor ?? null, t.offsetMinutes ?? null])
    if (seen.has(key)) return []
    seen.add(key)
    return [{ ...t, date }]
  })
  return { ...reading, from: week.from, to: week.to, times }
}

/** A calendar's week as the reader read it, held to what a calendar is:
 *  that week's times, on their dates, all of them. */
export function asCalendarWeek(reading: RegularReading, week: { from: string; to: string }): RegularReading {
  return {
    kind: 'week',
    complete: true,
    season: null,
    title: null,
    startsOn: null,
    from: week.from,
    to: week.to,
    times: reading.times.filter((t) => t.date && t.date >= week.from && t.date <= week.to),
  }
}
