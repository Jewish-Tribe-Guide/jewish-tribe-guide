import { TEFILLAH_LABELS, TEFILLAH_ORDER, ZMAN_ANCHOR_LABELS, type Minyan } from './davening'
import type { MinyanBox } from './minyanimBox'

// ── A minyan written as the listing writes it ───────────────────────────────
// Out of weekTable.ts, which re-exports all of it, together with the shul's
// box editor's list (boxGroups). The editor (MinyanBoxEditor, loaded only
// when Edit is tapped) gets these from the listing as `minyanWriting`
// rather than importing them: importing any of this from the editor's lazy
// chunk, even this small file, made the bundler re-split the code the two
// then shared, and the home screen's first load grew 8 KB (budgets.spec,
// Oct 10; measured 392 KB without the import, 400 KB with it).

/** "7:15am", "19:30", "7 AM" as minutes from midnight; null for words
 *  ("Call to confirm") or nothing. */
export function clockMinutes(time: string): number | null {
  const t = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i)
  if (!t) return null
  let h = Number(t[1])
  const m = t[2] ? Number(t[2]) : 0
  const half = t[3]?.toLowerCase().replace(/\./g, '')
  if (h > 23 || m > 59 || (!half && !t[2])) return null
  if (half === 'pm' && h !== 12) h += 12
  if (half === 'am' && h === 12) h = 0
  return h * 60 + m
}

/** "7:15 AM", "6 PM": every time on the guide written one way. */
export function clockText(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** A minyan's time as its shul gives it: "9:15 AM"; "at candle lighting,
 *  never after 7 PM"; "15 min before sunset"; or its own words. */
export function timeText(row: Pick<Minyan, 'time' | 'anchor' | 'offsetMinutes' | 'notBefore' | 'notAfter'>): string {
  if (row.anchor) {
    const zman = ZMAN_ANCHOR_LABELS[row.anchor].toLowerCase()
    const off = row.offsetMinutes ?? 0
    const base = off === 0 ? `at ${zman}` : `${Math.abs(off)} min ${off < 0 ? 'before' : 'after'} ${zman}`
    const bound = (t?: string) => {
      const mins = t ? clockMinutes(t) : null
      return mins === null ? (t?.trim() ?? null) : clockText(mins)
    }
    const after = bound(row.notAfter)
    const before = bound(row.notBefore)
    if (before && after) return `${base}, between ${before} and ${after}`
    if (after) return `${base}, never after ${after}`
    if (before) return `${base}, never before ${before}`
    return base
  }
  const mins = clockMinutes(row.time)
  if (mins !== null) return clockText(mins)
  const words = row.time.trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/** A shul's note, tidied: "Ends at 12:15pm" reads "Until 12:15 PM". */
export function noteText(note: string | undefined): string | null {
  const n = note?.trim()
  if (!n) return null
  const ends = n.match(/^ends?\s+(?:at|by)\s+(.+?)\.?$/i)
  if (ends) {
    const mins = clockMinutes(ends[1])
    return `Until ${mins === null ? ends[1] : clockText(mins)}`
  }
  return n.charAt(0).toUpperCase() + n.slice(1)
}

export type ShabbosPart = 'friday' | 'morning' | 'afternoon' | 'motzei'

export const SHABBOS_PART_LABELS: Record<ShabbosPart, string> = {
  friday: 'Friday night',
  morning: 'Shabbos morning',
  afternoon: 'Afternoon',
  motzei: 'Motzei Shabbos',
}

export function partOf(m: Minyan, day: 'fri' | 'sat'): ShabbosPart {
  if (day === 'fri') return 'friday'
  if (m.tefillah === 'shacharis' || m.tefillah === 'shabbos_mussaf') return 'morning'
  if (m.tefillah === 'maariv' || m.anchor === 'havdalah') return 'motzei'
  return 'afternoon'
}

export const PART_ORDER: ShabbosPart[] = ['friday', 'morning', 'afternoon', 'motzei']

/** Where one row of the usual Shabbos box sits: Friday night when it's on
 *  Friday, else its part of Shabbos (the box's edit list, minyanimBox.ts). */
export function shabbosPartOf(m: Minyan): ShabbosPart {
  return partOf(m, m.days.includes('fri') && m.tefillah !== 'shacharis' ? 'fri' : 'sat')
}

// ── The box's minyanim as a list, one minyan at a time (Oct 10) ─────────────
// Edit under a box opens its minyanim as the box reads ("Mincha & Maariv at
// candle lighting"), one row each; a tap opens that one minyan. Shabbos's
// in the order of Shabbos (Friday night, morning, afternoon), the week's by
// tefillah, each with its days.

export type BoxGroup = { label: string; rows: Minyan[] }

const DAY_ORDER: Minyan['days'] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'rosh_chodesh', 'yom_tov', 'holiday']
const firstDay = (m: Minyan) => Math.min(...m.days.map((d) => DAY_ORDER.indexOf(d)), DAY_ORDER.length)
const atMinutes = (m: Minyan) => clockMinutes(m.time) ?? 24 * 60

export function boxGroups(rows: readonly Minyan[], box: MinyanBox): BoxGroup[] {
  if (box === 'shabbos') {
    return PART_ORDER.map((part) => ({
      label: SHABBOS_PART_LABELS[part],
      rows: rows
        .filter((m) => shabbosPartOf(m) === part)
        .sort((a, b) => atMinutes(a) - atMinutes(b) || TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah)),
    })).filter((g) => g.rows.length > 0)
  }
  return TEFILLAH_ORDER.map((t) => ({
    label: TEFILLAH_LABELS[t],
    rows: rows.filter((m) => m.tefillah === t).sort((a, b) => firstDay(a) - firstDay(b) || atMinutes(a) - atMinutes(b)),
  })).filter((g) => g.rows.length > 0)
}

/** What the shul's box editor writes minyanim with, handed to it by the
 *  listing (see the top of this file for why it isn't imported there). */
export const minyanWriting = { timeText, noteText, boxGroups }
export type MinyanWriting = typeof minyanWriting
