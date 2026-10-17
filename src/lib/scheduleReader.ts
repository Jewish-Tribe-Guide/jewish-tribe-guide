import { formatAnchorRule, parseTimeToMinutes, RELATIVE_ELIGIBLE, TEFILLAH_LABELS, TEFILLAH_ORDER, type Tefillah, type ZmanAnchor } from './davening'
import { datesBetween, type ReadRegularTime, type RegularReading } from './scheduleUpdate'
import { DEFAULT_READER_MODEL } from './readQuestion'
import { dateText, type ScheduleDay, type ScheduleMinyan, type SpecialSchedule } from './schedules'
import type { Festival } from './festivals'

// ── Reading a shul's Yom Tov schedule from what it sent (step 4) ────────────
// The user's idea, agreed Oct 1: whoever has the shul's message (WhatsApp,
// email) or a photo of its flyer pastes or adds it, and the AI reads it into
// the guide's times, for that person to check before it goes to an admin.
//
// The AI reads; it never supplies a time. Each time it returns has to come
// with the words it read it from, and from pasted text, words that aren't
// in the text drop the time. Anything it can't tell ("Hakafos after Maariv
// 7:30": Maariv at 7:30, or Hakafos?) it flags rather than guesses, and the
// person settles it. A day the message doesn't mention is left out, so it
// shows "not posted", never a guess.

export type ReadTime = ScheduleMinyan & {
  /** The message's own words it was read from. */
  quote: string
  /** Whether those words were found in the pasted text. False for a photo
   *  or PDF, which the AI read itself. */
  checked: boolean
  /** Why to look twice, when the AI wasn't sure. */
  unsure?: string
}

export type ScheduleReading = {
  schedule: SpecialSchedule
  times: ReadTime[]
  /** Anything the AI noticed the message leaves out ("No Mincha on
   *  Shabbos"), said plainly. */
  missing: string | null
}

export type ScheduleSource = { text: string } | { image: string; mime: string } | { pdf: string }

const MAX_TEXT = 8_000

/** The festival's days, as the AI is told them: each date with its name, so
 *  "Shemini Atzeres" in a message is a date, and "Yom Tov" a known set. */
function daysList(f: Festival): string {
  return f.days.map((d) => `${d.date} (${dateText(d.date, { weekday: true })}): ${d.name}${d.yomTov ? ', Yom Tov' : d.cholHamoed ? ', Chol HaMoed' : ''}`).join('\n')
}

const TEFILLOS = TEFILLAH_ORDER.map((t) => `${t} (${TEFILLAH_LABELS[t]})`).join(', ')

export function scheduleMessages(source: ScheduleSource, f: Festival, shulName: string): unknown[] {
  const system = `You read a synagogue's schedule for a Jewish holiday and list its prayer times exactly as given.

The holiday: ${f.name}. Its days:
${daysList(f)}

Rules:
- One entry per prayer time. "tefillah" is one of: ${TEFILLOS}. A combined "Mincha/Maariv" is mincha_maariv. Anything that isn't a prayer (Yizkor, Hakafos, a kiddush, a class) goes in "notes" of the nearest prayer, or as tefillah "other" with the name in "notes".
- "on" lists the days it's held, as dates from the list above (YYYY-MM-DD). Use "yom_tov" only when the schedule says the time is for every Yom Tov day of the holiday, and "chol_hamoed" only when it's for every Chol HaMoed day. When the schedule names particular days ("Yom Tov (Sat 9/26, Sun 9/27)", "first days"), list exactly those dates, never "yom_tov".
- Dates are calendar days, midnight to midnight, not Jewish days that start at nightfall. A time on the night before a day ("Fri night", "erev", "eve of", "Leil") goes on the date it falls on, the earlier one: Mincha or Maariv the night Shemini Atzeres begins, when that night is Fri Oct 2, is on Fri Oct 2.
- "time" exactly as written, with am/pm when you can tell it ("9:00am", "6:30pm", "10 min before sunset"). Never work a time out or move it.
- "quote": a few words copied exactly from the schedule where you read this time.
- "unsure": when you can't tell what a time is for or which day it's on, say why in a few words. A time after "after", "following" or "approx." is unsure: "Hakafos after Maariv 7:30" could be Maariv at 7:30 or Hakafos at 7:30. Minutes from sunset ("15 min after sunset") are exact, not unsure. Otherwise leave it out.
- Only times the schedule gives. Never add one it doesn't. If it names no times for a day, leave that day out.
- "missing": one short sentence on what it leaves out that a shul usually has (e.g. "No Mincha times for Shabbos."), or null.

Answer in JSON only: {"times": [{"tefillah": "...", "on": ["..."], "time": "...", "notes": "...", "quote": "...", "unsure": "..."}], "missing": "..."}`
  const intro = `The shul: ${shulName}. Its schedule:`
  const content =
    'text' in source
      ? `${intro}\n\n${source.text.slice(0, MAX_TEXT)}`
      : 'image' in source
        ? [
            { type: 'text', text: intro },
            { type: 'image_url', image_url: { url: `data:${source.mime};base64,${source.image}` } },
          ]
        : [
            { type: 'text', text: intro },
            { type: 'file', file: { filename: 'schedule.pdf', file_data: `data:application/pdf;base64,${source.pdf}` } },
          ]
  return [
    { role: 'system', content: system },
    { role: 'user', content },
  ]
}

const SUNSET = "(?:sunset|sundown|sh(?:e|')?kiah?)"

/** "10 min before sunset", "15 minutes after shkia", "at sunset", "sunset":
 *  minutes from sunset (negative before), or null for anything else. */
export function readSunsetTime(time: string): number | null {
  const t = time.toLowerCase().replace(/\s+/g, ' ').trim()
  const offset = t.match(new RegExp(`^(\\d{1,3}) ?(?:min(?:ute)?s?\\.?|m) (before|prior to|after|past) (?:the )?${SUNSET}$`))
  if (offset) return Number(offset[1]) * (offset[2] === 'before' || offset[2] === 'prior to' ? -1 : 1)
  return new RegExp(`^(?:at )?${SUNSET}$`).test(t) ? 0 : null
}

/** A time as the guide keeps it: a clock time as written, or a time from
 *  sunset as a rule worked out each day. Anything else (candle lighting, a
 *  time "after Maariv") is kept as written, and the editor says it can't
 *  be shown until it's given as one or the other (SchedulesInput). Candle
 *  lighting isn't turned into sunset: the guide only has the coming
 *  Shabbos's. */
function asGuideTime(tefillah: Tefillah, time: string): Pick<ReadTime, 'time' | 'anchor' | 'offsetMinutes'> {
  if (Number.isFinite(parseTimeToMinutes(time))) return { time }
  const fromSunset = RELATIVE_ELIGIBLE.includes(tefillah) ? readSunsetTime(time) : null
  return fromSunset === null ? { time } : { time: formatAnchorRule('sunset', fromSunset), anchor: 'sunset', offsetMinutes: fromSunset }
}

const plain = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^a-z0-9':]+/g, ' ')
    .trim()

/**
 * What the AI said, kept to what holds up: a known tefillah, days that are
 * the festival's own (or its Yom Tov / Chol HaMoed days), a time, and the
 * schedule's own words for it; from pasted text, words that are in the
 * text. Everything else is dropped. Named and dated as the festival is.
 */
export function tidyScheduleReading(raw: unknown, f: Festival, source: ScheduleSource, newId: () => string): ScheduleReading {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const dates = new Set(f.days.map((d) => d.date))
  const hasYomTov = f.days.some((d) => d.yomTov)
  const hasChm = f.days.some((d) => d.cholHamoed)
  const text = 'text' in source ? ` ${plain(source.text)} ` : null
  const times: ReadTime[] = []
  for (const t of Array.isArray(body.times) ? body.times.slice(0, 60) : []) {
    if (!t || typeof t !== 'object') continue
    const x = t as Record<string, unknown>
    const tefillah = TEFILLAH_ORDER.find((o) => o === x.tefillah) as Tefillah | undefined
    const time = typeof x.time === 'string' ? x.time.trim().slice(0, 40) : ''
    const quote = typeof x.quote === 'string' ? x.quote.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    const on = (Array.isArray(x.on) ? x.on : []).filter(
      (d): d is ScheduleDay => (d === 'yom_tov' && hasYomTov) || (d === 'chol_hamoed' && hasChm) || (typeof d === 'string' && dates.has(d)),
    )
    if (!tefillah || !time || !quote || on.length === 0) continue
    if (text !== null && !text.includes(` ${plain(quote)} `)) continue
    const notes = typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim().slice(0, 120) : undefined
    const unsure = typeof x.unsure === 'string' && x.unsure.trim() ? x.unsure.trim().slice(0, 200) : undefined
    times.push({ id: newId(), tefillah, on: [...new Set(on)], ...asGuideTime(tefillah, time), ...(notes ? { notes } : {}), quote, checked: text !== null, ...(unsure ? { unsure } : {}) })
  }
  const missing = typeof body.missing === 'string' && body.missing.trim() ? body.missing.trim().slice(0, 300) : null
  return {
    schedule: {
      id: newId(),
      name: f.name,
      from: f.from,
      to: f.to,
      mode: 'replace',
      minyanim: times.map(({ id, tefillah, on, time, anchor, offsetMinutes, notes }) => ({
        id,
        tefillah,
        on,
        time,
        ...(anchor ? { anchor, offsetMinutes } : {}),
        ...(notes ? { notes } : {}),
      })),
    },
    times,
    missing,
  }
}

export async function readSchedule(
  source: ScheduleSource,
  f: Festival,
  shulName: string,
  { apiKey, model = DEFAULT_READER_MODEL, fetchImpl = fetch, newId = () => crypto.randomUUID() }: { apiKey: string; model?: string; fetchImpl?: typeof fetch; newId?: () => string },
): Promise<ScheduleReading & { model: string }> {
  const raw = await callReader(scheduleMessages(source, f, shulName), { apiKey, model, fetchImpl })
  return { ...tidyScheduleReading(raw, f, source, newId), model }
}

// ── Reading a shul's regular times (agreed Oct 1) ───────────────────────────
// "Update their times" on a shul's card: a whole new schedule ("Winter
// Schedule, starting Sunday, November 1"), or one Shabbos's times ("Shabbos
// Bereishis: Mincha 6:12…"). Read the same way as a Yom Tov's: the AI lists
// what the message says, each with its words, and drops nothing into it.
// What changes is worked out by plain code (scheduleUpdate.ts).

const ZMAN_WORDS: [ZmanAnchor, string][] = [
  ['candle_lighting', '(?:candle ?lighting|licht ?bentsh(?:en|ing)|lighting)'],
  ['havdalah', 'havdal(?:ah|a)'],
]

/** "At candle lighting", "10 min after candle lighting", "havdalah", and
 *  the sunset forms readSunsetTime knows: the zman and its minutes, or
 *  null. */
export function readZmanTime(time: string): { anchor: ZmanAnchor; offsetMinutes: number } | null {
  const sunset = readSunsetTime(time)
  if (sunset !== null) return { anchor: 'sunset', offsetMinutes: sunset }
  const t = time.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const [anchor, words] of ZMAN_WORDS) {
    const offset = t.match(new RegExp(`^(\\d{1,3}) ?(?:min(?:ute)?s?\\.?|m) (before|prior to|after|past) (?:the )?${words}$`))
    if (offset) return { anchor, offsetMinutes: Number(offset[1]) * (offset[2] === 'before' || offset[2] === 'prior to' ? -1 : 1) }
    if (new RegExp(`^(?:at )?${words}$`).test(t)) return { anchor, offsetMinutes: 0 }
  }
  return null
}

const EVENING: Tefillah[] = ['kabbalas_shabbos', 'mincha', 'maariv', 'mincha_maariv']

/** A time as the guide keeps it, for a shul's regular times: a clock time
 *  (a bare "5:59" for Mincha is the afternoon, a bare "9:00" for Shacharis
 *  the morning: no shul davens Mincha at 5:59 AM), or a rule from a zman
 *  for the tefillos that move with one. Anything else as written. */
export function asRegularTime(tefillah: Tefillah, time: string): { time: string; anchor?: ZmanAnchor; offsetMinutes?: number } {
  const bare = time.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (bare) {
    const h = Number(bare[1])
    if (EVENING.includes(tefillah) && h >= 1 && h <= 11) return { time: `${h}:${bare[2]}pm` }
    if (!EVENING.includes(tefillah) && tefillah !== 'other' && h >= 5 && h <= 11) return { time: `${h}:${bare[2]}am` }
  }
  if (Number.isFinite(parseTimeToMinutes(time))) return { time }
  const rule = RELATIVE_ELIGIBLE.includes(tefillah) ? readZmanTime(time) : null
  return rule ? { time: formatAnchorRule(rule.anchor, rule.offsetMinutes), ...rule } : { time }
}

/** The days the AI is told about: each date ahead, its weekday and what
 *  it's called ("Parashat Bereshit"), so "Shabbos Bereishis" is a date. */
export type ReadingDays = { today: string; days: { date: string; names: string[] }[] }

export function regularMessages(source: ScheduleSource, { today, days }: ReadingDays, shulName: string): unknown[] {
  const list = days.map((d) => `${d.date} (${dateText(d.date, { weekday: true })})${d.names.length ? `: ${d.names.join(', ')}` : ''}`).join('\n')
  const system = `You read a synagogue's prayer times from a message it sent, and list them exactly as given.

Today is ${today}. The days ahead:
${list}

First, what the message is:
- "kind": "schedule" when it gives the shul's usual times (what happens each week, perhaps for a season: "Winter Schedule", "Davening times"). "week" when it gives the times for particular days: this Shabbos, a parsha ("Shabbos Bereishis"), "this week", a date.
- "complete": true when it lists every minyan for the days it covers (a whole schedule, or the whole Shabbos), false when it mentions only a change or a few times ("Mincha this Shabbos will be at 5:45").
- "season": "winter" or "summer" when it says the schedule is for one, else null.
- "title": its heading, if it has one ("Winter Schedule", "Shabbos Bereishis"), else null.
- "startsOn": for a schedule that says when it starts, that date (YYYY-MM-DD), else null.
- "from", "to": for "week", the first and last dates it covers, from the days above. Else null.

Then "times", one entry per prayer time:
- "tefillah" is one of: ${TEFILLOS}. A combined "Mincha/Maariv" is mincha_maariv. Candle lighting, Shabbos ends, havdalah, a kiddush, a class or a shiur are not prayers: leave them out, or put them in "notes" of the nearest prayer.
- For "schedule": "days" lists the weekdays it's held, as sun, mon, tue, wed, thu, fri, sat ("Shabbos" is sat, "Sunday–Thursday" is sun to thu). A time for one date only ("Thanksgiving, Thu Nov 26") has "date" (YYYY-MM-DD, the next such date from today, even past the days listed) and "occasion" ("Thanksgiving") instead, never a weekday. Only when the message gives the date or names a day with a fixed date; otherwise leave that time out.
- For "week": every time has "date", from the days above.
- Dates are calendar days, midnight to midnight, not Jewish days that start at nightfall. Friday night's Mincha, Maariv or Kabbalas Shabbos is on the Friday.
- "time" exactly as written, with am/pm when you can tell it ("9:00am", "5:59pm", "30 min before shkiah", "at candle lighting"). Never work a time out or move it.
- "notes": anything the message says about that one minyan ("following Kiddush", "Winter only"), else leave it out.
- "quote": a few words copied exactly from the message where you read this time.
- "unsure": when you can't tell what a time is for or which day it's on, say why in a few words. Otherwise leave it out.
- Only times the message gives. Never add one it doesn't.

Answer in JSON only: {"kind": "...", "complete": true, "season": null, "title": "...", "startsOn": null, "from": null, "to": null, "times": [{"tefillah": "...", "days": ["..."], "date": "...", "occasion": "...", "time": "...", "notes": "...", "quote": "...", "unsure": "..."}]}`
  const intro = `The shul: ${shulName}. Its message:`
  const content =
    'text' in source
      ? `${intro}\n\n${source.text.slice(0, MAX_TEXT)}`
      : 'image' in source
        ? [
            { type: 'text', text: intro },
            { type: 'image_url', image_url: { url: `data:${source.mime};base64,${source.image}` } },
          ]
        : [
            { type: 'text', text: intro },
            { type: 'file', file: { filename: 'schedule.pdf', file_data: `data:application/pdf;base64,${source.pdf}` } },
          ]
  return [
    { role: 'system', content: system },
    { role: 'user', content },
  ]
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const isWeekday = (d: unknown): d is (typeof WEEKDAYS)[number] => (WEEKDAYS as readonly unknown[]).includes(d)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/**
 * What the AI said about a shul's regular times, kept to what holds up: a
 * known tefillah, real weekdays or a date among the days ahead, a time,
 * and the message's own words for it (from pasted text, words that are in
 * the text). A "week" covers at most 8 days, all of them ahead.
 */
export function tidyRegularReading(raw: unknown, source: ScheduleSource, { today, days }: ReadingDays, newId: () => string): RegularReading {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const ahead = new Set(days.map((d) => d.date))
  const yearOn = new Date(Date.parse(`${today}T12:00:00Z`) + 366 * 86_400_000).toISOString().slice(0, 10)
  const text = 'text' in source ? ` ${plain(source.text)} ` : null
  const times: ReadRegularTime[] = []
  for (const t of Array.isArray(body.times) ? body.times.slice(0, 80) : []) {
    if (!t || typeof t !== 'object') continue
    const x = t as Record<string, unknown>
    const tefillah = TEFILLAH_ORDER.find((o) => o === x.tefillah) as Tefillah | undefined
    const time = str(x.time, 40)
    const quote = typeof x.quote === 'string' ? x.quote.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    // A one-off can be months ahead (Thanksgiving); a week's dates are
    // checked against the days ahead below.
    const date = typeof x.date === 'string' && DATE_RE.test(x.date) && x.date >= today && x.date <= yearOn ? x.date : undefined
    const weekdays = [...new Set((Array.isArray(x.days) ? x.days : []).filter(isWeekday))]
    if (!tefillah || !time || !quote || (!date && weekdays.length === 0)) continue
    if (text !== null && !text.includes(` ${plain(quote)} `)) continue
    const notes = str(x.notes, 120)
    const unsure = str(x.unsure, 200)
    const occasion = date ? str(x.occasion, 40) : null
    times.push({
      id: newId(),
      tefillah,
      days: date ? [] : weekdays,
      ...(date ? { date } : {}),
      ...(occasion ? { occasion } : {}),
      ...asRegularTime(tefillah, time),
      ...(notes ? { notes } : {}),
      quote,
      checked: text !== null,
      ...(unsure ? { unsure } : {}),
    })
  }
  const dated = times.filter((t) => t.date).map((t) => t.date!).sort()
  let kind: RegularReading['kind'] = body.kind === 'week' ? 'week' : 'schedule'
  let from = typeof body.from === 'string' && ahead.has(body.from) ? body.from : (dated.find((d) => ahead.has(d)) ?? null)
  let to = typeof body.to === 'string' && ahead.has(body.to) ? body.to : ([...dated].reverse().find((d) => ahead.has(d)) ?? null)
  if (from && to && from > to) [from, to] = [to, from]
  // A week is its dated times: none, or more than 8 days, and it isn't one.
  if (kind === 'week' && (!from || !to || datesBetween(from, to).at(-1) !== to)) kind = 'schedule'
  const weekTimes = kind === 'week' ? times.filter((t) => t.date && t.date >= from! && t.date <= to!) : times
  return {
    kind,
    complete: body.complete === true,
    season: body.season === 'winter' || body.season === 'summer' ? body.season : null,
    title: str(body.title, 60),
    startsOn: typeof body.startsOn === 'string' && DATE_RE.test(body.startsOn) && body.startsOn >= today ? body.startsOn : null,
    from: kind === 'week' ? from : null,
    to: kind === 'week' ? to : null,
    times: weekTimes,
  }
}

async function callReader(messages: unknown[], { apiKey, model, fetchImpl }: { apiKey: string; model: string; fetchImpl: typeof fetch }): Promise<unknown> {
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(45_000),
  })
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] }
  if (!res.ok) throw new Error(`Schedule reader: ${res.status}`)
  try {
    return JSON.parse(body.choices?.[0]?.message?.content ?? 'null')
  } catch {
    return null
  }
}

export async function readRegular(
  source: ScheduleSource,
  days: ReadingDays,
  shulName: string,
  { apiKey, model = DEFAULT_READER_MODEL, fetchImpl = fetch, newId = () => crypto.randomUUID() }: { apiKey: string; model?: string; fetchImpl?: typeof fetch; newId?: () => string },
): Promise<RegularReading & { model: string }> {
  const raw = await callReader(regularMessages(source, days, shulName), { apiKey, model, fetchImpl })
  return { ...tidyRegularReading(raw, source, days, newId), model }
}
