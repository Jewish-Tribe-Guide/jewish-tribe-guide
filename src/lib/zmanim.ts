import type { ZmanimData, ZmanEntry } from '@/types'

// ── Hebcal data layer ─────────────────────────────────────────────────────────
//
// Single place that talks to the Hebcal API and normalizes its responses into
// the `ZmanimData` shape the UI consumes. To add new sections later (holidays,
// fast days, weekly parsha, extra zmanim) extend the parsing here and populate
// the corresponding optional fields on `ZmanimData` — the route and card don't
// need to change.

const HEBCAL_BASE = 'https://www.hebcal.com'

// Cache upstream responses briefly: zmanim for a given date + location are
// fixed, so there's no need to hit Hebcal on every request.
const FETCH_OPTS: RequestInit = { next: { revalidate: 1800 } } as RequestInit

export type ZmanimCoords = {
  latitude: number
  longitude: number
  timezone: string
}

// Minimal shapes for the parts of the Hebcal responses we read.
type HebcalZmanim = {
  times: Record<string, string>
}

type HebcalShabbatItem = {
  category: string
  title: string
  date: string
}

type HebcalShabbat = {
  items?: HebcalShabbatItem[]
}

type HebcalConverter = {
  hy: number
  hm: string
  hd: number
}

const WEEKDAY_INDEX = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Format an ISO datetime to "h:mm AM/PM" in the given timezone. */
function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(new Date(iso))
}

/** Full weekday name (e.g. "Friday") for an ISO datetime in the given timezone. */
function weekdayName(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(
    new Date(iso),
  )
}

/** Today's civil date (YYYY-MM-DD) and weekday index in the given timezone. */
function todayInTimezone(tz: string): { dateStr: string; dayOfWeek: number } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`
  const shortDow = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: tz,
  }).format(now)
  return { dateStr, dayOfWeek: WEEKDAY_INDEX.indexOf(shortDow) }
}

/** Adds `offsetMinutes` to a Hebcal instant and formats the result the same
 *  way `formatTime` does — used to turn an anchor (sunset/candle-lighting/
 *  havdalah) plus a signed offset into a real clock time for a minyan defined
 *  relative to that zman (e.g. "20 min before sunset"). */
export function applyOffsetMinutes(iso: string, offsetMinutes: number, timezone: string): string {
  const shifted = new Date(new Date(iso).getTime() + offsetMinutes * 60_000)
  return formatTime(shifted.toISOString(), timezone)
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, FETCH_OPTS)
  if (!res.ok) throw new Error(`Hebcal request failed (${res.status}): ${url}`)
  return (await res.json()) as T
}

/**
 * Fetch and normalize today's zmanim + the upcoming Shabbos for a location.
 * Throws if any of the Hebcal requests fail — the caller decides how to surface it.
 */
export async function getZmanimData(coords: ZmanimCoords): Promise<ZmanimData> {
  const { latitude, longitude, timezone } = coords
  const { dateStr, dayOfWeek } = todayInTimezone(timezone)

  const geo = `latitude=${latitude}&longitude=${longitude}&tzid=${encodeURIComponent(timezone)}`
  const zmanimUrl = `${HEBCAL_BASE}/zmanim?cfg=json&${geo}&date=${dateStr}`
  const shabbatUrl = `${HEBCAL_BASE}/shabbat?cfg=json&${geo}&b=18&M=on`
  const converterUrl = `${HEBCAL_BASE}/converter?cfg=json&date=${dateStr}&g2h=1`

  const [zmanim, shabbat, converter] = await Promise.all([
    fetchJson<HebcalZmanim>(zmanimUrl),
    fetchJson<HebcalShabbat>(shabbatUrl),
    fetchJson<HebcalConverter>(converterUrl),
  ])

  const t = zmanim.times
  const dailyZmanim: ZmanEntry[] = [
    { label: 'Sunrise', time: formatTime(t.sunrise, timezone) },
    { label: 'Latest Shema', time: formatTime(t.sofZmanShma, timezone) },
    { label: 'Latest Shacharis', time: formatTime(t.sofZmanTfilla, timezone) },
    { label: 'Sunset', time: formatTime(t.sunset, timezone), iso: t.sunset },
    { label: 'Nightfall', time: formatTime(t.tzeit7083deg, timezone) },
  ]

  const items = shabbat.items ?? []
  const candleItem = items.find((i) => i.category === 'candles')
  const havdalahItem = items.find((i) => i.category === 'havdalah')
  const parshaItem = items.find((i) => i.category === 'parashat')

  const toEntry = (item: HebcalShabbatItem | undefined): ZmanEntry | null =>
    item
      ? { label: weekdayName(item.date, timezone), time: formatTime(item.date, timezone), iso: item.date }
      : null

  return {
    hebrewDate: `${converter.hd} ${converter.hm} ${converter.hy}`,
    dayOfWeek,
    isFriday: dayOfWeek === 5,
    isShabbos: dayOfWeek === 6,
    dailyZmanim,
    shabbos: {
      candleLighting: toEntry(candleItem),
      havdalah: toEntry(havdalahItem),
    },
    // Future-friendly: already available from Hebcal, exposed for later UI use.
    parsha: parshaItem?.title,
  }
}
