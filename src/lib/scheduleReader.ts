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

/** What's read: words, a photo, a PDF, or a calendar's pictures (a month
 *  posted as pictures on a shul's page, listingPageRun.ts), read together. */
export type ScheduleSource = { text: string } | { image: string; mime: string } | { pdf: string } | { images: { mime: string; b64: string }[] }

const MAX_TEXT = 8_000
/** Room for a rule in words: "Approximately 15 minutes before candle
 *  lighting." is 48 characters, and cut at 40 it was no rule at all. */
const MAX_TIME = 60

/** The user's message: the intro, then what was sent. */
function messageContent(intro: string, source: ScheduleSource): unknown {
  if ('text' in source) return `${intro}\n\n${source.text.slice(0, MAX_TEXT)}`
  const picture = (mime: string, b64: string) => ({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } })
  if ('image' in source) return [{ type: 'text', text: intro }, picture(source.mime, source.image)]
  if ('images' in source) return [{ type: 'text', text: intro }, ...source.images.map((i) => picture(i.mime, i.b64))]
  return [
    { type: 'text', text: intro },
    { type: 'file', file: { filename: 'schedule.pdf', file_data: `data:application/pdf;base64,${source.pdf}` } },
  ]
}

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
  const content = messageContent(intro, source)
  return [
    { role: 'system', content: system },
    { role: 'user', content },
  ]
}

// Shkiah however it's spelled: shkia, shkiah, shkiya, shkiyah, shekiah,
// sh'kia.
const SUNSET = "(?:sunset|sundown|sh(?:e|')?kiy?ah?)"

/** A rule as written, without a hedge in front or a full stop after:
 *  "around 15 minutes before sunset", "~30 min before sundown" (Mekor
 *  Habracha's page, Oct 19), "Approximately 15 minutes before shkiah."
 *  (Sons of Israel's, Oct 21: as written, it was a "change" from the
 *  listing's own 15 min before Sunset). Shuls round; a time within two
 *  minutes is the rule anyway (scheduleUpdate.ts). */
function unhedged(time: string): string {
  return time
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;!]+$/, '')
    .replace(/^(?:~|approx(?:\.|imately)?|around|about|ca\.?|circa)\s*/, '')
}

/** "15 min before" the zman, "10 minutes after", "within 10 minutes
 *  after" (no later than, which is the rule): signed minutes, or null.
 *  "Within 10 minutes of" isn't read: it doesn't say before or after, and
 *  code doesn't pick one. */
function minutesFrom(t: string, zman: string): number | null {
  const m = t.match(new RegExp(`^(?:within )?(\\d{1,3}) ?(?:min(?:ute)?s?\\.?|m) (before|prior to|after|past|following) (?:the )?${zman}$`))
  return m ? Number(m[1]) * (m[2] === 'before' || m[2] === 'prior to' ? -1 : 1) : null
}

/** "10 min before sunset", "15 minutes after shkia", "at sunset", "sunset":
 *  minutes from sunset (negative before), or null for anything else. */
export function readSunsetTime(time: string): number | null {
  const t = unhedged(time)
  return minutesFrom(t, SUNSET) ?? (new RegExp(`^(?:at )?${SUNSET}$`).test(t) ? 0 : null)
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
    const time = typeof x.time === 'string' ? x.time.trim().slice(0, MAX_TIME) : ''
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
  ['candle_lighting', '(?:candle[ -]?lighting|licht ?bentsh(?:en|ing)|lighting)'],
  ['havdalah', 'havdal(?:ah|a)'],
]

/** "At candle lighting", "10 min after candle lighting", "havdalah", and
 *  the sunset forms readSunsetTime knows: the zman and its minutes, or
 *  null. */
export function readZmanTime(time: string): { anchor: ZmanAnchor; offsetMinutes: number } | null {
  const sunset = readSunsetTime(time)
  if (sunset !== null) return { anchor: 'sunset', offsetMinutes: sunset }
  const t = unhedged(time)
  for (const [anchor, words] of ZMAN_WORDS) {
    const offset = minutesFrom(t, words)
    if (offset !== null) return { anchor, offsetMinutes: offset }
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
  // "8:00 AM – 8:40 AM", "6:00-7:15 pm": a minyan starts at its start;
  // its end isn't a time anyone comes for (Kesher, Oct 21: six "changes"
  // that were the same 8:00am with an end on it). The start takes the
  // end's am/pm unless it's earlier in the clock's cycle: 11:30 to 1:00 pm.
  // With no am/pm at all ("9:00–11:30", Kesher's Shabbat service, Oct
  // 22), the start is a bare time, read as the tefillah means it.
  const range = time.trim().match(/^(\d{1,2})(:\d{2})?\s*([ap]\.?m\.?)?\s*(?:–|—|-|to|until)\s*(\d{1,2})(?::\d{2})?(?:\s*([ap])\.?m\.?)?$/i)
  if (range && (range[3] || range[5] || range[2])) {
    const [, h, min = ':00', own, endH, endAp] = range
    if (own) return asRegularTime(tefillah, `${h}${min} ${own}`)
    if (!endAp) return asRegularTime(tefillah, `${h}${min}`)
    const flip = Number(h) !== 12 && Number(h) > Number(endH)
    const ap = flip ? (endAp.toLowerCase() === 'p' ? 'a' : 'p') : endAp.toLowerCase()
    return { time: `${Number(h)}${min}${ap}m` }
  }
  // "10am", "10 a.m.": the hour, as the guide writes it ("10:00am"), or
  // it's a different time from the shul's own 10:00am (Kol Tzedek, Oct 19).
  const hour = time.trim().match(/^(\d{1,2})\s*([ap])\.?\s*m\.?$/i)
  if (hour && Number(hour[1]) >= 1 && Number(hour[1]) <= 12) return { time: `${Number(hour[1])}:00${hour[2].toLowerCase()}m` }
  // "9:00 A.M.", as Mikveh Israel's calendar picture writes it (Oct 21):
  // else it's text, not a clock, and never the listing's 9:00am.
  const dotted = time.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])\.\s*m\.?$/i)
  if (dotted) return { time: `${Number(dotted[1])}:${dotted[2]}${dotted[3].toLowerCase()}m` }
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
 *  it's called ("Parashat Bereshit"), so "Shabbos Bereishis" is a date.
 *  `sentOn`, for a message sent before today (a newsletter read days
 *  later): its "this Shabbos" is the one after it was sent, so the days
 *  start there, and a time on a day already past is left out. */
export type ReadingDays = { today: string; sentOn?: string; days: { date: string; names: string[] }[] }

export function regularMessages(source: ScheduleSource, { today, sentOn, days }: ReadingDays, shulName: string): unknown[] {
  const list = days.map((d) => `${d.date} (${dateText(d.date, { weekday: true })})${d.names.length ? `: ${d.names.join(', ')}` : ''}`).join('\n')
  const sent =
    sentOn && sentOn < today
      ? `Today is ${today}, but the message was sent on ${sentOn} (${dateText(sentOn, { weekday: true })}): read "this Shabbos", "this week" and "tomorrow" from the day it was sent. The days from then:`
      : `Today is ${today}. The days ahead:`
  const system = `You read a synagogue's prayer times from a message it sent, and list them exactly as given.

${sent}
${list}

First, what the message is:
- "kind": "schedule" when it gives the shul's usual times (what happens each week, perhaps for a season: "Winter Schedule", "Davening times"). "week" when it gives the times for particular days: this Shabbos, a parsha ("Shabbos Bereishis"), "this week", a date.
- "complete": true when it lists every minyan for the days it covers (a whole schedule, or the whole Shabbos), false when it mentions only a change or a few times ("Mincha this Shabbos will be at 5:45").
- "season": "winter" or "summer" when it says the schedule is for one, else null.
- "title": its heading, if it has one ("Winter Schedule", "Shabbos Bereishis"), else null.
- "startsOn": for a schedule that says when it starts, that date (YYYY-MM-DD), else null.
- "from", "to": for "week", the first and last dates it covers, from the days above. Else null.

Then "times", one entry per prayer time:
- "tefillah" is one of: ${TEFILLOS}. A combined "Mincha/Maariv" is mincha_maariv, and so is one line naming several evening prayers held together ("Mincha / Kabbalat Shabbat / Ma'ariv 7:00 PM"): one entry, never one per prayer. Candle lighting, Shabbos ends, havdalah, a kiddush, a class or a shiur are not prayers: leave them out, or put them in "notes" of the nearest prayer.
- Only the shul's own davening, held every week as given. A service not held every week ("once a month", "the last Shabbat of the month", "first Friday"), a phone or online call run by someone else, a class, a program or an event: leave it out.
- A morning "Shabbat service", "Shabbat morning service" or "Services", on Shabbos or a weekday, is that day's Shacharis (shacharis): the shul's own davening, not a program or an event. When it gives a range ("9:00–11:30"), "time" is the start ("9:00") and the end goes in "notes" ("until 11:30").
- For "schedule": "days" lists the weekdays it's held, as sun, mon, tue, wed, thu, fri, sat ("Shabbos" is sat, "Sunday–Thursday" is sun to thu). A time for one date only ("Thanksgiving, Thu Nov 26") has "date" (YYYY-MM-DD, the next such date from today, even past the days listed) and "occasion" ("Thanksgiving") instead, never a weekday. Only when the message gives the date or names a day with a fixed date; otherwise leave that time out.
- For "week": every time has "date", from the days above.
- Dates are calendar days, midnight to midnight, not Jewish days that start at nightfall. Friday night's Mincha, Maariv or Kabbalas Shabbos is on the Friday.
- "time" exactly as written, with am/pm when you can tell it ("9:00am", "5:59pm", "30 min before shkiah", "at candle lighting"). Never work a time out or move it.
- "notes": anything the message says about that one minyan ("following Kiddush"), else leave it out.
- "season": "summer" or "winter" for a time held in one season only (a "Summer" or "Winter" label beside it, "during daylight saving time"), else leave it out. A minyan with a summer time and a winter time is two entries, one for each season, each with its own time exactly as written.
- "signUp": true when the message says this minyan is held only if enough people come or sign up ("held when there is sufficient interest", "if we have a minyan", "please confirm you're coming"). A footnote marked with * applies to the times it marks, and only those. Otherwise leave it out.
- "where": when the message says this minyan is held somewhere other than the shul itself (at another shul, at another address), that place exactly as written ("1818 Market or Mikveh Israel"). A room in the shul's own building ("in the chapel", "downstairs") is the shul itself: leave it out.
- "quote": a few words copied exactly from the message where you read this time.
- "unsure": when you can't tell what a time is for or which day it's on, say why in a few words. Otherwise leave it out.
- Only times the message gives. Never add one it doesn't.

Answer in JSON only: {"kind": "...", "complete": true, "season": null, "title": "...", "startsOn": null, "from": null, "to": null, "times": [{"tefillah": "...", "days": ["..."], "date": "...", "occasion": "...", "time": "...", "notes": "...", "season": "...", "signUp": true, "where": "...", "quote": "...", "unsure": "..."}]}`
  const intro = `The shul: ${shulName}. Its message:`
  const content = messageContent(intro, source)
  return [
    { role: 'system', content: system },
    { role: 'user', content },
  ]
}

const NOT_EVERY_WEEK = /\b(?:once (?:a|per|each|every) month|twice (?:a|per) month|monthly|every other (?:week|shabbat|shabbos|friday|saturday)|(?:first|second|third|fourth|last) (?:shabbat|shabbos|friday|saturday|sunday)s? of (?:the|each|every)(?: english| hebrew)? month)\b/i
const NOT_DAVENING = /\b(?:dial|call|tehillim|class|classes|shiur|shiurim|study|lecture|program|event)\b/i
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const isWeekday = (d: unknown): d is (typeof WEEKDAYS)[number] => (WEEKDAYS as readonly unknown[]).includes(d)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const seasonNote = (notes: string | undefined) => notes?.match(/\b(summer|winter)\s+only\b/i)?.[1].toLowerCase() ?? null
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/**
 * What the AI said about a shul's regular times, kept to what holds up: a
 * known tefillah, real weekdays or a date among the days ahead, a time,
 * and the message's own words for it (from pasted text, words that are in
 * the text). A "week" covers at most 8 days, all of them ahead.
 */
export function tidyRegularReading(raw: unknown, source: ScheduleSource, { today, days }: ReadingDays, newId: () => string): RegularReading {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  // Days before today are there only to place an old message's "this
  // Shabbos": a time on one is past.
  const ahead = new Set(days.filter((d) => d.date >= today).map((d) => d.date))
  const yearOn = new Date(Date.parse(`${today}T12:00:00Z`) + 366 * 86_400_000).toISOString().slice(0, 10)
  const text = 'text' in source ? ` ${plain(source.text)} ` : null
  const times: ReadRegularTime[] = []
  for (const t of Array.isArray(body.times) ? body.times.slice(0, 80) : []) {
    if (!t || typeof t !== 'object') continue
    const x = t as Record<string, unknown>
    const tefillah = TEFILLAH_ORDER.find((o) => o === x.tefillah) as Tefillah | undefined
    const time = str(x.time, MAX_TIME)
    const quote = typeof x.quote === 'string' ? x.quote.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    // A one-off can be months ahead (Thanksgiving); a week's dates are
    // checked against the days ahead below.
    const date = typeof x.date === 'string' && DATE_RE.test(x.date) && x.date >= today && x.date <= yearOn ? x.date : undefined
    const weekdays = [...new Set((Array.isArray(x.days) ? x.days : []).filter(isWeekday))]
    if (!tefillah || !time || !quote || (!date && weekdays.length === 0)) continue
    if (text !== null && !text.includes(` ${plain(quote)} `)) continue
    // A time's season goes where the rest of the guide reads it, its note
    // ("Winter only", seasonFromNotes), unless the note already says.
    const said = str(x.notes, 120)
    const season = x.season === 'summer' || x.season === 'winter' ? x.season : null
    const notes = season && !/\b(?:summer|winter)\s+only\b/i.test(said ?? '') ? `${season === 'summer' ? 'Summer' : 'Winter'} only${said ? `- ${said}` : ''}` : said
    // What a website says that isn't its weekly davening, read as if it
    // were, whatever the AI was told (the Oct 21 dry run: a monthly young
    // families service, the OU's daily Tehillim call, a Tuesday class).
    if (!date && NOT_EVERY_WEEK.test(`${quote} ${notes ?? ''}`)) continue
    if (tefillah === 'other' && NOT_DAVENING.test(`${quote} ${notes ?? ''}`)) continue
    const unsure = str(x.unsure, 200)
    const occasion = date ? str(x.occasion, 40) : null
    const signUp = x.signUp === true
    const where = str(x.where, 80)
    // The same time given twice (a page's summary and its detail) is one
    // time on all the days either gives, not a second minyan.
    const at = asRegularTime(tefillah, time)
    // Not across seasons: 7:00 PM in summer and in winter is two times.
    const twin = times.find((o) => o.tefillah === tefillah && o.date === date && o.time === at.time && o.anchor === at.anchor && o.offsetMinutes === at.offsetMinutes && seasonNote(o.notes) === seasonNote(notes ?? undefined))
    if (twin) {
      twin.days = [...new Set([...twin.days, ...(date ? [] : weekdays)])]
      if (signUp) twin.signUp = true
      if (where && !twin.where) twin.where = where
      continue
    }
    times.push({
      id: newId(),
      tefillah,
      days: date ? [] : weekdays,
      ...(date ? { date } : {}),
      ...(occasion ? { occasion } : {}),
      ...at,
      ...(notes ? { notes } : {}),
      quote,
      checked: text !== null,
      ...(unsure ? { unsure } : {}),
      ...(signUp ? { signUp: true as const } : {}),
      ...(where ? { where } : {}),
    })
  }
  joinEvening(times)
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

/** "Mincha / Kabbalat Shabbat / Ma'ariv 7:00 PM" is one minyan, however
 *  the AI splits it: Mekor's website, read three times on Oct 21, came
 *  back as Kabbalas Shabbos and Mincha & Maariv, then as Mincha, Maariv
 *  and Kabbalas Shabbos, each at 7:00 PM. Evening prayers at one time on
 *  the same days, in the same season, are the shul's Mincha & Maariv. */
function joinEvening(times: ReadRegularTime[]): void {
  const at = (t: ReadRegularTime) =>
    JSON.stringify([t.date ?? null, [...t.days].sort(), t.time, t.anchor ?? null, t.offsetMinutes ?? null, seasonNote(t.notes)])
  const groups = new Map<string, ReadRegularTime[]>()
  for (const t of times) if (EVENING.includes(t.tefillah)) groups.set(at(t), [...(groups.get(at(t)) ?? []), t])
  for (const group of groups.values()) {
    if (group.length < 2 || !group.some((t) => t.tefillah !== 'kabbalas_shabbos')) continue
    const [keep, ...rest] = group
    const notes = [keep.notes, group.some((t) => t.tefillah === 'kabbalas_shabbos') && !/kabbal/i.test(keep.notes ?? '') ? 'with Kabbalas Shabbos' : null].filter(Boolean).join('- ')
    Object.assign(keep, {
      tefillah: 'mincha_maariv',
      ...(notes ? { notes } : {}),
      ...(rest.some((t) => t.unsure) && !keep.unsure ? { unsure: rest.find((t) => t.unsure)!.unsure } : {}),
      ...(group.some((t) => t.signUp) ? { signUp: true } : {}),
      ...(!keep.where && rest.some((t) => t.where) ? { where: rest.find((t) => t.where)!.where } : {}),
    })
    for (const t of rest) times.splice(times.indexOf(t), 1)
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
