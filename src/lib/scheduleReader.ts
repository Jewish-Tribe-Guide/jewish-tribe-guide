import { TEFILLAH_LABELS, TEFILLAH_ORDER, type Tefillah } from './davening'
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
- "unsure": when you can't tell what a time is for or which day it's on, say why in a few words. A time after "after", "following" or "approx." is unsure: "Hakafos after Maariv 7:30" could be Maariv at 7:30 or Hakafos at 7:30. Otherwise leave it out.
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
    times.push({ id: newId(), tefillah, on: [...new Set(on)], time, ...(notes ? { notes } : {}), quote, checked: text !== null, ...(unsure ? { unsure } : {}) })
  }
  const missing = typeof body.missing === 'string' && body.missing.trim() ? body.missing.trim().slice(0, 300) : null
  return {
    schedule: {
      id: newId(),
      name: f.name,
      from: f.from,
      to: f.to,
      mode: 'replace',
      minyanim: times.map(({ id, tefillah, on, time, notes }) => ({ id, tefillah, on, time, ...(notes ? { notes } : {}) })),
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
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: scheduleMessages(source, f, shulName), response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(45_000),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] }
  if (!res.ok) throw new Error(`Schedule reader: ${res.status}`)
  let raw: unknown = null
  try {
    raw = JSON.parse(body.choices?.[0]?.message?.content ?? 'null')
  } catch {
    raw = null
  }
  return { ...tidyScheduleReading(raw, f, source, newId), model }
}
