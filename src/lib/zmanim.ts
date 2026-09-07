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

// How far past the real lookahead window the holiday-calendar query reaches,
// purely so a period starting right at the window's edge still has room to
// show its own close-out havdalah — see the holidayUrl comment in
// getZmanimData for the full reasoning. 3 covers the longest a period this
// card cares about actually runs past its first candle-lighting: a 2-day
// Rosh Hashana/Pesach/Sukkot-opening ends on day 2, so 3 is a day of slack
// on top of the longest real case, not a tuned-to-the-exact-day number.
const HOLIDAY_QUERY_PAD_DAYS = 3

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
  /** Only present on some items — e.g. "major" on a Yom Tov `holiday` item,
   *  "fast" on a fast's `holiday`/`zmanim` items. Used here to find a fast's
   *  "Fast begins"/"Fast ends" pair (see findFastPeriod). */
  subcat?: string
  /** Which named event a "Fast begins"/"Fast ends" `zmanim` item belongs to
   *  — e.g. "Tzom Gedaliah", or "Erev Tish'a B'Av" on the begins item
   *  specifically (Tisha B'Av's fast starts the evening before; every other
   *  fast's begins/ends share one plain name). Absent on other categories. */
  memo?: string
}

type HebcalShabbat = {
  items?: HebcalShabbatItem[]
}

// The /hebcal calendar endpoint returns the same {category, title, date}
// item shape as /shabbat, just for an explicit date range instead of
// "whatever the next Shabbos-relevant cycle is" — see `getZmanimData`'s own
// comment on why that distinction is exactly why this needs a second
// endpoint rather than reusing the /shabbat response for holiday detection.
type HebcalCalendar = {
  items?: HebcalShabbatItem[]
}

type HebcalConverter = {
  hy: number
  hm: string
  hd: number
  /** Jewish-calendar events falling on this date — "Rosh Chodesh Elul",
   *  "Parashat Ki Tavo", "Erev Rosh Chodesh Sivan", yom tov names. Already in
   *  the response this call has always made; nothing extra is fetched for it. */
  events?: string[]
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

/** Abbreviated weekday + calendar date (e.g. "Fri, Sep 11") for an ISO
 *  datetime — used only for `holidayPeriod.begins`/`ends`, not the regular
 *  `shabbos.candleLighting`/`havdalah` fields (which stay the plain
 *  `weekdayName` they've always been). A holiday period spans several days
 *  and the same weekday name recurs across weeks, so "Friday" alone doesn't
 *  say WHICH Friday the way it's enough to for "this week's" ordinary
 *  candle lighting. */
function weekdayAndDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz }).format(
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

/** Adds `days` civil days to a "YYYY-MM-DD" string, returning the same
 *  shape. Calendar-day arithmetic only — deliberately not timezone-aware
 *  (there's no instant here to convert, just a date to walk forward from),
 *  which is why this parses the parts by hand into Date.UTC rather than
 *  letting `new Date(dateStr)` interpret the string in the machine's own
 *  local time and risk landing on the wrong civil day. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
}

/** How many days ahead the Shabbat & Holiday Times card looks for an
 *  upcoming Yom Tov: through the end of the current week (Sunday–Saturday),
 *  or 3 days, whichever is more.
 *
 *  The 3-day floor exists specifically for a holiday landing early the
 *  following week — checked from Thursday or Friday, "days left in this
 *  week" alone shrinks to 1–2, which would give almost no advance notice of
 *  a holiday starting the coming Sunday or Monday. The floor guarantees at
 *  least 3 days of notice regardless of where in the week today falls; the
 *  week-length half is what lets it see further on a Sunday or Monday, when
 *  there's a full week of runway to look across (up to 6 days, reaching all
 *  the way to that Saturday's Havdalah).
 *
 *  `dayOfWeek` is 0 (Sunday) through 6 (Saturday), same convention as
 *  `todayInTimezone`'s own return value and WEEKDAY_INDEX above. */
export function lookaheadDays(dayOfWeek: number): number {
  const daysLeftInWeek = 6 - dayOfWeek
  return Math.max(daysLeftInWeek, 3)
}

/** Hebcal's holiday titles carry a suffix that means nothing to a visitor
 *  glancing at a compact card: a Hebrew year ("Rosh Hashana 5787"), a day
 *  number ("Sukkot II", "Pesach VII"), or a chol hamoed marker
 *  ("Sukkot III (CH'M)"). Strips those down to the plain name Zmanim &
 *  Shabbos' own fuller page can still expand on. An "Erev "-prefixed title
 *  is preferred to KEEP its prefix when it's the only holiday name found in
 *  the period (see `findHolidayPeriod`) — this normalizer only ever runs on
 *  a title the caller has already decided is the one to show. */
function normalizeHolidayName(title: string): string {
  return title
    .replace(/\s*\(CH['’]M\)\s*$/i, '')
    .replace(/\s+(I|II|III|IV|V|VI|VII|VIII)$/, '')
    .replace(/\s+\d{4}$/, '')
    .trim()
}

/** Full Yom Tov day names the Hebrew-calendar converter can report for
 *  today, matched by prefix the same way `isRoshChodesh` matches "Rosh
 *  Chodesh" — deliberately excludes fasts (Yom Kippur is its own prefix, not
 *  a fast-day one), Chanukah/Purim (minor holidays; work is permitted, so a
 *  shul's ordinary weekday minyan still applies), and Rosh Chodesh itself
 *  (already its own pseudo-day). */
const YOM_TOV_PREFIXES = [
  'Rosh Hashana',
  'Yom Kippur',
  'Sukkot',
  'Shmini Atzeret',
  'Simchat Torah',
  'Pesach',
  'Shavuot',
]

/** True for a full Yom Tov day event ("Sukkot I", "Pesach VIII"), false for
 *  the lead-up ("Erev Sukkot") and the intermediate days Hebcal marks
 *  "(CH'M)" — Chol HaMoed keeps a shul's regular weekday schedule (plus
 *  Hallel), not its Yom Tov one. */
function isYomTovEvent(event: string): boolean {
  if (event.startsWith('Erev ')) return false
  if (/\(CH['’]M\)/i.test(event)) return false
  return YOM_TOV_PREFIXES.some((p) => event.startsWith(p))
}

/** Groups a date-ranged Hebcal response into the next complete Yom Tov
 *  period — a `candles` item, everything after it up to and including the
 *  next `havdalah` — and names it from whichever `holiday` item in that
 *  stretch isn't an "Erev " one (falling back to the Erev title itself, if
 *  that's all there is).
 *
 *  `windowEnd` ("YYYY-MM-DD") is the real lookahead boundary — the one a
 *  visitor was actually promised — which is deliberately NOT the same date
 *  the Hebcal query itself was asked for. A period's own `begins` can land
 *  exactly on the last day of the window with its `ends` one or two days
 *  past it (a 2-day Rosh Hashana starting Friday ends Sunday), so
 *  `getZmanimData` queries a few days further than `windowEnd` specifically
 *  to have a chance at seeing that close-out havdalah at all; the caller
 *  would otherwise report a Yom Tov as having "no time to show" (see
 *  `lookaheadDays`'s whole reason for existing) purely because its own
 *  ending fell one calendar day outside an unpadded query. This is what
 *  stops that padding from also silently pulling in a SECOND, later period
 *  that starts after `windowEnd` — one that's genuinely not upcoming yet by
 *  the window's own definition.
 *
 *  Returns `null` when there's no complete, in-window period: no `candles`
 *  item at all (the ordinary case — no Yom Tov within the lookahead), a
 *  `candles` with no `havdalah` following it anywhere in the padded
 *  response (the period doesn't end within what Hebcal returned at all, so
 *  there's nothing honest to put in "ends"), or a `candles` that starts
 *  after `windowEnd` (a real period, just not an upcoming one yet). An
 *  ordinary Friday with no `holiday` item anywhere in its span still forms
 *  a "period" by this reading — the caller is the one that decides whether
 *  a holiday-less period is worth surfacing here at all, since the regular
 *  `shabbos.candleLighting`/`havdalah` fields already cover that case on
 *  their own. */
function findHolidayPeriod(items: HebcalShabbatItem[], timezone: string, windowEnd: string): ZmanimData['holidayPeriod'] {
  const startIdx = items.findIndex((i) => i.category === 'candles')
  if (startIdx === -1) return null
  if (items[startIdx].date.slice(0, 10) > windowEnd) return null

  const endIdx = items.findIndex((i, idx) => idx >= startIdx && i.category === 'havdalah')
  if (endIdx === -1) return null

  const span = items.slice(startIdx, endIdx + 1)
  const holidayItems = span.filter((i) => i.category === 'holiday')
  if (holidayItems.length === 0) return null

  const named = holidayItems.find((i) => !i.title.startsWith('Erev ')) ?? holidayItems[0]

  const toEntry = (item: HebcalShabbatItem): ZmanEntry => ({
    label: weekdayAndDate(item.date, timezone),
    time: formatTime(item.date, timezone),
    iso: item.date,
  })

  return {
    name: normalizeHolidayName(named.title),
    begins: toEntry(span[0]),
    ends: toEntry(span[span.length - 1]),
  }
}

/** Finds the next fast day within the lookahead window — Tzom Gedaliah,
 *  Asara B'Tevet, Ta'anit Esther, Shiva Asar B'Tammuz, Tisha B'Av, or
 *  Ta'anit Bechorot. Hebcal reports these as a `category: 'zmanim',
 *  subcat: 'fast'` pair titled literally "Fast begins"/"Fast ends", each
 *  carrying the fast's name in `memo` — a different shape from
 *  `findHolidayPeriod`'s candles/holiday/havdalah grouping, so this doesn't
 *  reuse it. Two things that shape forces:
 *
 *  - Tisha B'Av's fast starts the evening before, so its "Fast begins" memo
 *    is "Erev Tish'a B'Av" while "Fast ends" is the plain "Tish'a B'Av" —
 *    every other fast's begins/ends share one identical name. Preferring
 *    the end item's memo (falling back to the begin item's own, with any
 *    "Erev " stripped) gets the plain name either way.
 *  - Ta'anit Bechorot (the Fast of the Firstborn, Erev Pesach) has a
 *    "Fast begins" with no "Fast ends" at all — it's traditionally ended
 *    early by a siyum, not a published zman — so `ends` is nullable here,
 *    unlike `findHolidayPeriod`'s `ends`, where a missing havdalah means no
 *    period at all. A fast genuinely can lack a published end time; a
 *    multi-day Yom Tov period missing its havdalah is just an unpadded
 *    query, which is a real difference in what "missing" means between the
 *    two.
 *
 *  Yom Kippur is a fast too, but Hebcal never gives it this "Fast begins"/
 *  "Fast ends" pair — it's a `maj` holiday with its own candle-lighting/
 *  havdalah, already covered by `holidayPeriod`, so nothing here would ever
 *  double-report it. */
function findFastPeriod(items: HebcalShabbatItem[], timezone: string, windowEnd: string): ZmanimData['fastPeriod'] {
  const isFastZman = (i: HebcalShabbatItem) => i.category === 'zmanim' && i.subcat === 'fast'

  const startIdx = items.findIndex((i) => isFastZman(i) && i.title === 'Fast begins')
  if (startIdx === -1) return null
  if (items[startIdx].date.slice(0, 10) > windowEnd) return null

  // The next fast-related zmanim item is this fast's own end — unless it's
  // actually a LATER fast's "Fast begins" (Ta'anit Bechorot's case), which
  // means this one simply has no end time to find.
  let endItem: HebcalShabbatItem | null = null
  for (let i = startIdx + 1; i < items.length; i++) {
    if (!isFastZman(items[i])) continue
    if (items[i].title === 'Fast begins') break
    if (items[i].title === 'Fast ends') {
      endItem = items[i]
      break
    }
  }

  const toEntry = (item: HebcalShabbatItem): ZmanEntry => ({
    label: weekdayAndDate(item.date, timezone),
    time: formatTime(item.date, timezone),
    iso: item.date,
  })

  return {
    name: endItem?.memo ?? items[startIdx].memo?.replace(/^Erev\s+/, '') ?? 'Fast Day',
    begins: toEntry(items[startIdx]),
    ends: endItem ? toEntry(endItem) : null,
  }
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
  // Y-M-D as plain integers (no leading zeros) — gy/gm/gd, not `date=`. The
  // /shabbat endpoint silently ignores a `date=YYYY-MM-DD` param and always
  // falls back to Hebcal's own server clock; gy/gm/gd is the param set it
  // actually reads to pick "the Shabbos ahead" relative to a given day. That
  // distinction is what previously made candle-lighting/havdalah return last
  // week's Shabbos instead of the upcoming one for most of the week.
  const [gy, gm, gd] = dateStr.split('-').map(Number)

  const geo = `latitude=${latitude}&longitude=${longitude}&tzid=${encodeURIComponent(timezone)}`
  const zmanimUrl = `${HEBCAL_BASE}/zmanim?cfg=json&${geo}&date=${dateStr}`
  const shabbatUrl = `${HEBCAL_BASE}/shabbat?cfg=json&${geo}&b=18&M=on&gy=${gy}&gm=${gm}&gd=${gd}`
  const converterUrl = `${HEBCAL_BASE}/converter?cfg=json&date=${dateStr}&g2h=1`
  // /shabbat (above) answers "what's the next Shabbos-relevant cycle", which
  // is exactly wrong for holiday detection: from an ordinary Tuesday with a
  // plain Friday two days out and a Yom Tov six days out, it returns only
  // that Friday — the Yom Tov, further away, never appears, even though it's
  // well inside the lookahead window. /hebcal takes an explicit start/end
  // range instead, so this asks for exactly the window this card cares
  // about rather than whatever cycle Hebcal decides is "next". c=on (candle
  // lighting) + maj=on (major holidays, which is what actually carries the
  // havdalah/second-candle items a period needs) + mf=on (minor fasts —
  // Tzom Gedaliah, Asara B'Tevet, Ta'anit Esther, Shiva Asar B'Tammuz,
  // Tisha B'Av, Ta'anit Bechorot; see findFastPeriod) with the rest of the
  // minor-calendar categories turned off — nothing else here is shown on
  // the card, so there's no reason to ask Hebcal to compute it.
  //
  // The query itself reaches a few days PAST windowEnd (see
  // HOLIDAY_QUERY_PAD_DAYS) — a period starting right at the edge of the
  // real window can still end a day or two later (Rosh Hashana is 2 days),
  // and without the padding that close-out havdalah would fall outside what
  // Hebcal was even asked for, making an upcoming Yom Tov look like it had
  // "no time to show" for a reason that has nothing to do with the
  // 3-day-floor problem `lookaheadDays` actually solves. `findHolidayPeriod`
  // is what keeps this padding from also surfacing a second, later period
  // that starts past the real window; `findFastPeriod` needs no equivalent
  // guard since a fast is always a single day, never a multi-day span that
  // could straddle the window's edge the way a Yom Tov period can.
  const windowEnd = addDays(dateStr, lookaheadDays(dayOfWeek))
  const holidayUrl = `${HEBCAL_BASE}/hebcal?cfg=json&v=1&start=${dateStr}&end=${addDays(windowEnd, HOLIDAY_QUERY_PAD_DAYS)}&${geo}&c=on&maj=on&min=off&mod=off&s=off&mf=on&d=off&o=off&F=off&D=off`

  const [zmanim, shabbat, converter, holidayCalendar] = await Promise.all([
    fetchJson<HebcalZmanim>(zmanimUrl),
    fetchJson<HebcalShabbat>(shabbatUrl),
    fetchJson<HebcalConverter>(converterUrl),
    fetchJson<HebcalCalendar>(holidayUrl),
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
    // Everything the Hebrew calendar says about today, minus the parsha (which
    // has its own field above and is a property of the week, not the day).
    holidays: (converter.events ?? []).filter((e) => !e.startsWith('Parashat')),
    // Matched on the prefix rather than an exact name because Hebcal qualifies
    // it with the month — "Rosh Chodesh Elul". Deliberately excludes "Erev
    // Rosh Chodesh": this drives which minyanim show for TODAY, and a minyan
    // tagged Rosh Chodesh means the day itself.
    //
    // Known edge: the Jewish day begins at sunset, so a maariv tagged Rosh
    // Chodesh on erev Rosh Chodesh is already Rosh Chodesh while this still
    // says false. Not chased here — the converter is queried for the daytime
    // date, which is right for shacharis and mincha, and being late by an
    // evening errs toward showing a row rather than hiding one only after the
    // fallback in useCalendarDays has already been resolved.
    isRoshChodesh: (converter.events ?? []).some((e) => e.startsWith('Rosh Chodesh')),
    isYomTov: (converter.events ?? []).some(isYomTovEvent),
    holidayPeriod: findHolidayPeriod(holidayCalendar.items ?? [], timezone, windowEnd),
    fastPeriod: findFastPeriod(holidayCalendar.items ?? [], timezone, windowEnd),
  }
}
