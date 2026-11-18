// Shared types and helpers for the structured `hours` category field.
//
// Every function that depends on the current time takes it as an argument,
// defaulting to `new Date()`. Components pass `useNow()` instead, so a badge
// re-evaluates when the tab comes back rather than staying frozen at whatever
// moment the page happened to render — see useNow.ts. The default keeps
// non-component callers (and tests, which drive these with vi.useFakeTimers)
// working unchanged.
//
// Value shape stored in Supabase details JSONB:
//   { sun: { open: "HH:MM", close: "HH:MM" } | null, mon: ..., ... }
// Days absent from the object are treated as closed.

import { community as siteCommunity } from '@/community.config'

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
/** One day's hours. A close at or before the open is past midnight
 *  ("17:00"–"02:00"), as the editor allows. `periods`, when there are two or
 *  more, is the day in full (a lunch break between them); `open`/`close`
 *  are then the first open and the last close, for anything that reads one
 *  range. Only Google's hours carry periods today. */
export type DayHours = { open: string; close: string; periods?: { open: string; close: string }[] } | null
export type StructuredHours = Partial<Record<DayKey, DayHours>>

export const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Which weekday it is, and how many minutes into it, in `timezone` —
 *  NOT the caller's own device timezone, which `new Date(now).getDay()`/
 *  `.getHours()` would silently use instead. That distinction is exactly
 *  what upcomingDavening.ts needs and originally got wrong: it computed
 *  "today"/"now" straight off the browser's local clock, so a visitor whose
 *  device timezone doesn't match the community's (a phone that travelled,
 *  a hospital kiosk set to UTC) could get handed the wrong day's minyanim
 *  entirely, or a nowMinutes offset by hours — which reads exactly like "the
 *  card jumped to tomorrow" or "showed an afternoon time for a morning
 *  minyan" depending on which side of midnight/noon the offset landed on.
 *  lib/zmanim.ts's own todayInTimezone solves the identical problem for
 *  Hebcal's day-relative queries but isn't exported; this is the same
 *  technique (Intl.DateTimeFormat with an explicit `timeZone`), generalized
 *  for any caller that needs "what weekday, what time of day, over there".
 *
 *  NOT a replacement for getOpenStatus/hoursOpenNow above, which read the
 *  viewer's own local clock ON PURPOSE (see this file's own top-of-file
 *  doc and hours.test.ts's own note) — a visitor standing outside a store
 *  correctly cares about their own wall time, not the store's. This
 *  function is for the opposite case: matching a schedule that's tied to
 *  the COMMUNITY's own location (a shul's posted minyan times) regardless
 *  of where the person looking at the page happens to be standing. */
export function dayAndMinutesInTimezone(now: number, timezone: string): { day: DayKey; minutes: number } {
  const date = new Date(now)
  const shortDow = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(date)
  const day = DAY_KEYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(shortDow)]
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // Midnight formats as "24" in some ICU implementations under hour12:false
  // (correct per the spec's own hour-cycle rules, surprising to a caller
  // expecting 0-23) — normalized here so minutes-since-midnight never comes
  // out as 1440 for what is, in fact, minute 0.
  const hour = get('hour') % 24
  return { day, minutes: hour * 60 + get('minute') }
}

/** The community's own clock. Hours are posted in the place's time, so
 *  "open now" is read there, whatever the visitor's device is set to (a
 *  phone that travelled, a kiosk on UTC). Every community is Eastern today;
 *  the timezone is an argument so a caller can pass its own. */
export const HOURS_TIMEZONE = siteCommunity.timezone

/** Today in the community: which day, and minutes into it. */
export function placeClock(now: Date, timezone: string = HOURS_TIMEZONE): { day: DayKey; minutes: number; dayIndex: number } {
  const { day, minutes } = dayAndMinutesInTimezone(now.getTime(), timezone)
  return { day, minutes, dayIndex: DAY_KEYS.indexOf(day) }
}

const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** A day's ranges, each in minutes from that day's midnight. One past
 *  midnight ends after 1440; "23:59", the old "through end of day" mark,
 *  ends at 1440. */
type Span = { start: number; end: number; close: string }
function spansOf(day: DayHours | undefined): Span[] {
  if (!day) return []
  const list = day.periods && day.periods.length > 0 ? day.periods : day.open && day.close ? [{ open: day.open, close: day.close }] : []
  return list
    .filter((p) => p.open && p.close)
    .map((p) => {
      const start = toMins(p.open)
      let end = p.close === '23:59' ? 1440 : toMins(p.close)
      if (end <= start) end += 1440
      return { start, end, close: p.close }
    })
    .sort((a, b) => a.start - b.start)
}

/** The range open at this moment, today's or one carried over from
 *  yesterday past midnight, with how many minutes are left in it. */
function openSpan(hours: Record<string, DayHours>, now: Date, timezone: string): (Span & { left: number }) | null {
  const { dayIndex, minutes } = placeClock(now, timezone)
  for (const sp of spansOf(hours[DAY_KEYS[dayIndex]])) {
    if (sp.start <= minutes && minutes <= sp.end) return { ...sp, left: sp.end - minutes }
  }
  for (const sp of spansOf(hours[DAY_KEYS[(dayIndex + 6) % 7]])) {
    if (sp.end > 1440 && minutes + 1440 < sp.end) return { ...sp, left: sp.end - 1440 - minutes }
  }
  return null
}

/** A day's hours in words: "9:00 AM – 5:00 PM", or each range for a day
 *  with a break ("11:30 AM – 2:30 PM, 5:00 PM – 10:00 PM"). */
export function dayRangesText(day: NonNullable<DayHours>, time: (hhmm: string) => string = fmt12, dash = ' – '): string {
  const list = day.periods && day.periods.length > 0 ? day.periods : [{ open: day.open, close: day.close }]
  return list.map((p) => `${time(p.open)}${dash}${time(p.close)}`).join(', ')
}

const DAY_LABELS: Record<DayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

const DAY_SHORT: Record<DayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

/** Returns true when `v` is a structured-hours object (not a legacy string). */
export function isStructuredHours(v: unknown): v is StructuredHours {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Whether `v` gives any day's hours. A place saved as closed every day
 *  (almost always a form saved empty: Chalavita, The Brazilian BBQ and four
 *  more on Sep 30) has no hours anyone can use, and says "No hours listed"
 *  wherever it would have said "Closed" (fixes table, Sep 29). The editor
 *  and the moderation diffs still read it as the hours it is
 *  (isStructuredHours). */
export function hasAnyHours(v: unknown): v is StructuredHours {
  return isStructuredHours(v) && Object.values(v as Record<string, DayHours>).some((d) => !!d?.open && !!d?.close)
}

/** Formats "HH:MM" (24-h) to "h:mm AM/PM". */
export function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

/**
 * Returns true (open), false (closed), or null (can't tell).
 *
 * Returns null when `v` is not structured hours (legacy text value or missing),
 * or gives no day's hours at all (see hasAnyHours).
 * Returns false when today's hours are null (explicitly closed) or absent.
 */
export function hoursOpenNow(v: unknown, now: Date = new Date(), timezone: string = HOURS_TIMEZONE): boolean | null {
  if (!hasAnyHours(v)) return null
  const hours = v as Record<string, DayHours>
  if (openSpan(hours, now, timezone)) return true
  const day = hours[placeClock(now, timezone).day]
  if (day && (!day.open || !day.close)) return null
  return false
}

/**
 * For a place that's open right now, describes how close it is to closing.
 *   { closesSoon, closeLabel }
 *     - closesSoon: true when today's close time is within `withinMins` of now
 *     - closeLabel: today's formatted close time, e.g. "6:00 PM"
 * Returns null when the value isn't structured hours, or the place isn't open
 * right now (so callers can keep using `hoursOpenNow` to decide open vs. closed).
 *
 * A 23:59 close is our "open through end of day" sentinel (24/7 or a period
 * that rolls past midnight), so it never counts as closing soon.
 */
export function hoursClosing(
  v: unknown,
  withinMins = 60,
  now: Date = new Date(),
  timezone: string = HOURS_TIMEZONE,
): { closesSoon: boolean; closeLabel: string } | null {
  if (!hasAnyHours(v)) return null
  const span = openSpan(v as Record<string, DayHours>, now, timezone)
  if (!span) return null
  return {
    closesSoon: span.close !== '23:59' && span.left <= withinMins,
    closeLabel: fmt12(span.close),
  }
}

/**
 * For a place that isn't open right now, when it next opens: "4 PM" later
 * today, "Wed 7 PM" on another day (never "tomorrow", which is ambiguous
 * after midnight). Looks a week ahead.
 *
 * Null when the value isn't structured hours, or no day in the week has
 * hours: a place saved as closed every day has no hours anyone can use, and
 * the row says "No hours listed" for it, the same as for no hours at all.
 */
export function hoursNextOpening(v: unknown, now: Date = new Date(), timezone: string = HOURS_TIMEZONE): string | null {
  return hoursNextOpeningAt(v, now, timezone)?.label ?? null
}

/** hoursNextOpening, with how many minutes away it is, so the soonest of
 *  several places can be picked (Right now overnight, board V3). A day with
 *  a break opens again after it, later the same day. */
export function hoursNextOpeningAt(v: unknown, now: Date = new Date(), timezone: string = HOURS_TIMEZONE): { minutes: number; label: string } | null {
  if (!isStructuredHours(v)) return null
  const hours = v as Record<string, DayHours>
  const { dayIndex, minutes: nowMins } = placeClock(now, timezone)
  const short = (m: number) => fmt12(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).replace(/:00(?= [AP]M$)/, '')
  // Up to a week ahead, and today again a week from now when its last
  // opening has passed and nothing else all week has hours.
  for (let ahead = 0; ahead <= 7; ahead++) {
    const key = DAY_KEYS[(dayIndex + ahead) % 7]
    const next = spansOf(hours[key]).find((sp) => ahead > 0 || sp.start > nowMins)
    if (!next) continue
    const time = short(next.start)
    return { minutes: ahead * 1440 + next.start - nowMins, label: ahead === 0 ? time : `${DAY_SHORT[key]} ${time}` }
  }
  return null
}

/** Google's own verdict on whether the business is trading at all, which
 *  outranks its posted hours. A place marked temporarily closed usually still
 *  has last season's hours saved, so reading hours alone had every one of them
 *  showing a green "Open" badge — and passing the "Open now" filter — right
 *  through the closure. `businessStatus` is refreshed on every sync and needs
 *  no admin action either way, so this clears itself the day Google flips the
 *  place back to OPERATIONAL. */
export type Closure = 'temporary' | 'permanent'

export type BusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'

export const BUSINESS_STATUS_WORDS: Record<BusinessStatus, string> = {
  OPERATIONAL: 'Open',
  CLOSED_TEMPORARILY: 'Temporarily closed',
  CLOSED_PERMANENTLY: 'Permanently closed',
}

/**
 * What the app should treat this listing's status as: an admin's override
 * where one is set, otherwise whatever Google last said.
 *
 * The override exists because `businessStatus` is rewritten on every sync and
 * is deliberately outside OWNABLE_SYNC_FIELDS, which left three states with no
 * way out: Google stops returning a status at all (the write is skipped and
 * the old badge persists), the listing's sync starts failing, or its placeId
 * is cleared and it leaves the sync query entirely. In each, a wrong badge was
 * frozen on a live listing with nothing able to clear it.
 *
 * Google's own answer is never discarded — it keeps being recorded in
 * `businessStatus` — so the admin console can show the disagreement, and
 * clearing the override returns the listing to reality rather than to a
 * remembered guess.
 */
export function effectiveBusinessStatus(item: Record<string, unknown>): unknown {
  return item.businessStatusOverride ?? item.businessStatus
}

export function businessClosure(item: Record<string, unknown>): Closure | null {
  const status = effectiveBusinessStatus(item)
  if (status === 'CLOSED_TEMPORARILY') return 'temporary'
  if (status === 'CLOSED_PERMANENTLY') return 'permanent'
  return null
}

export const CLOSURE_LABELS: Record<Closure, string> = {
  temporary: 'Temporarily closed',
  permanent: 'Permanently closed',
}

/**
 * A listing's "Open"/"Closes Soon" status, from whichever of its hours
 * fields (there can be more than one — e.g. Mikvah's separate men's/women's/
 * keilim hours) says it's open right now. Shared by the collapsed listing
 * card's Open badge and the full detail body's status row, so the two can
 * never disagree about whether a place is open.
 *
 * A closed business is never open, whatever its saved hours say.
 *
 * With `now` null (useNow before the page has hydrated) only a closure is
 * known: whether it's open waits for the time.
 */
export function getOpenStatus(
  item: Record<string, unknown>,
  hoursFieldKeys: string[],
  now: Date | null = new Date(),
  timezone: string = HOURS_TIMEZONE,
): {
  isOpen: boolean
  closing: { closesSoon: boolean; closeLabel: string } | null
  closure: Closure | null
} {
  const closure = businessClosure(item)
  if (closure || !now) return { isOpen: false, closing: null, closure }
  const openVal = hoursFieldKeys
    .map((k) => item[k])
    .find((v) => v !== undefined && hoursOpenNow(v, now, timezone) === true && isStructuredHours(v))
  const isOpen = openVal !== undefined
  return { isOpen, closing: isOpen ? hoursClosing(openVal, 60, now, timezone) : null, closure: null }
}

/** "2026-06-07T…" → "Synced from Google · updated 3d ago" / "… updated today".
 *  Returns null if unparseable or absent. A listing-level fact (from its
 *  Google placeId), not tied to any one hours field — see PlaceDetailBody's
 *  own use of this for why it isn't gated on the category having hours at all. */
export function syncedLabel(iso?: string): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'Synced from Google · updated today'
  if (days === 1) return 'Synced from Google · updated 1d ago'
  return `Synced from Google · updated ${days}d ago`
}

/**
 * One-line label for today's hours shown on a directory card.
 *  - Structured hours → "Today: 9:00 AM – 5:00 PM" or "Closed today"
 *  - Legacy text string → the raw string (unchanged)
 *  - Missing/empty → null
 */
export function formatTodayHours(v: unknown, now: Date = new Date(), timezone: string = HOURS_TIMEZONE): string | null {
  if (!v && v !== false) return null
  if (typeof v === 'string') return v || null
  if (!hasAnyHours(v)) return null
  const hours = v as Record<string, DayHours>
  const day = hours[placeClock(now, timezone).day]
  if (day === null || day === undefined) return 'Closed today'
  if (!day.open || !day.close) return null
  return `Today: ${dayRangesText(day)}`
}

/**
 * Full 7-day breakdown for the expandable hours view on a directory card.
 *  - Structured hours → one entry per day (Sun→Sat), with today flagged.
 *  - Legacy text string or missing → null (caller falls back to the raw text).
 */
export function formatWeekHours(
  v: unknown,
  now: Date = new Date(),
): Array<{ key: DayKey; label: string; text: string; isToday: boolean }> | null {
  if (!hasAnyHours(v)) return null
  const hours = v as Record<string, DayHours>
  const todayKey = DAY_KEYS[now.getDay()]
  return DAY_KEYS.map((key) => {
    const day = hours[key] ?? null
    const text = day ? `${fmt12(day.open)} – ${fmt12(day.close)}` : 'Closed'
    return { key, label: DAY_LABELS[key], text, isToday: key === todayKey }
  })
}

/**
 * Multi-day summary for admin / diff display.
 * e.g. "Sun 9:00 AM–2:00 PM · Mon Closed · Tue–Sat 9:00 AM–5:00 PM"
 *
 * Collapses consecutive days with identical hours into ranges.
 * For a legacy text string, returns the raw string.
 * For an empty/missing value, returns "—".
 */
export function formatHoursSummary(v: unknown): string {
  if (!v) return '—'
  if (typeof v === 'string') return v
  if (!isStructuredHours(v)) return '—'
  const hours = v as Record<string, DayHours>

  // Build segments: consecutive days with identical open/close collapse to one range.
  type Seg = { keys: DayKey[]; day: DayHours }
  const segments: Seg[] = []
  for (const key of DAY_KEYS) {
    const day = hours[key] ?? null
    const last = segments[segments.length - 1]
    const sameAsLast =
      last &&
      ((day === null && last.day === null) ||
        (day !== null && last.day !== null && day.open === last.day.open && day.close === last.day.close))
    if (sameAsLast) {
      last.keys.push(key)
    } else {
      segments.push({ keys: [key], day })
    }
  }

  return segments
    .map(({ keys, day }) => {
      const range =
        keys.length === 1
          ? DAY_SHORT[keys[0]]
          : `${DAY_SHORT[keys[0]]}–${DAY_SHORT[keys[keys.length - 1]]}`
      const times = day ? `${fmt12(day.open)}–${fmt12(day.close)}` : 'Closed'
      return `${range} ${times}`
    })
    .join(' · ')
}

/** Full label for a day key, e.g. "Monday". */
export function dayLabel(key: DayKey): string {
  return DAY_LABELS[key]
}

// ── New Places JS API hours mapper (client-safe) ─────────────────────────────
// The PlaceAutocompleteElement uses the new Places JS API, which represents
// opening hours as { day, hour, minute } numbers rather than "HHMM" strings.
// This mapper is the client-side counterpart to googleHoursToStructured in
// googlePlaces.ts (which handles the legacy REST API format used by scripts).

type PlacesApiPoint = { day: number; hour: number; minute: number }
type PlacesApiPeriod = { open: PlacesApiPoint; close?: PlacesApiPoint | null }

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Maps a Google Places JS API `regularOpeningHours.periods` array into
 * StructuredHours. Pass `place.regularOpeningHours.periods` directly.
 * Returns null when periods is empty/null so callers leave existing hours
 * untouched rather than blanking them.
 */
export function placesApiHoursToStructured(periods: PlacesApiPeriod[]): StructuredHours | null {
  if (!periods || periods.length === 0) return null
  return periodsToStructured(
    periods.map((p) => ({
      day: p.open.day,
      open: padTime(p.open.hour, p.open.minute),
      close: p.close ? { day: p.close.day, time: padTime(p.close.hour, p.close.minute) } : null,
    })),
  )
}

/** Google's opening periods, in either API's shape once read, as
 *  StructuredHours: one entry per day, every day closed unless a period
 *  opens on it.
 *   • Open 24/7 (one period at midnight with no close) → 00:00–23:59 daily.
 *   • A close on the next day is kept as its time ("02:00"), which reads as
 *     past midnight; one with no close, or further on, ends the day (23:59).
 *   • Two or more periods on one day keep each one (`periods`), the break
 *     between them included; `open`/`close` span the day. */
export function periodsToStructured(periods: { day: number; open: string; close: { day: number; time: string } | null }[]): StructuredHours | null {
  if (periods.length === 0) return null
  if (periods.length === 1 && !periods[0].close && periods[0].open === '00:00') {
    const allDay: StructuredHours = {}
    for (const key of DAY_KEYS) allDay[key] = { open: '00:00', close: '23:59' }
    return allDay
  }
  const byDay = new Map<DayKey, { open: string; close: string }[]>()
  for (const p of periods) {
    if (p.day < 0 || p.day > 6) continue
    const key = DAY_KEYS[p.day]
    const nextDay = (p.day + 1) % 7
    const close = !p.close ? '23:59' : p.close.day === p.day ? p.close.time : p.close.day === nextDay && p.close.time <= p.open ? p.close.time : '23:59'
    byDay.set(key, [...(byDay.get(key) ?? []), { open: p.open, close }])
  }
  const result: StructuredHours = {}
  for (const key of DAY_KEYS) {
    const list = (byDay.get(key) ?? []).sort((a, b) => a.open.localeCompare(b.open))
    if (list.length === 0) result[key] = null
    else if (list.length === 1) result[key] = list[0]
    else result[key] = { open: list[0].open, close: list.at(-1)!.close, periods: list }
  }
  return result
}
