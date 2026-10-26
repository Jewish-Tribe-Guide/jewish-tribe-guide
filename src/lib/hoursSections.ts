import type { CategoryConfig, CategoryField } from './categories'
import { DAY_KEYS, fmt12, isStructuredHours, type DayHours, type DayKey, type StructuredHours } from './hours'

// ── A mikvah's hours, as its listing's own sections (Oct 22) ────────────────
// Drawn on artifact 7MUNppcA4S4yvXKupEKJPR, agreed Oct 21: Mikvah hours
// shows a place as the listing's own sections, Women’s, Men’s and Keilim,
// each with its hours and its notes, and Use this takes a section whole.
// So the website's reading is filed a section at a time, like a shul's
// three parts (timesParts.ts), and approved onto the listing as it is then
// (rebaseSection): using the women's hours never undoes men's hours
// approved since they were read.
//
// A note is read too (the user, Oct 22): "by appointment, 48 hours ahead"
// can be a section's whole answer, so a mikvah with no set hours is read.

/** One section: the yes/no saying the place has it, its hours and notes. */
export type HoursSection = {
  /** The yes/no field's key ("womenTevillah"); a category with no
   *  sections, the hours field's own key. */
  section: string
  /** "Women’s", as the listing heads it (listingView.ts audienceGroups). */
  label: string
  hours: string | null
  notes: string | null
}

const label = (f: CategoryField) => f.filterLabel ?? f.label

/** The category's sections, with an hours field or a notes field each. The
 *  plain "Hours" Google keeps is none of them (listingPageWatch.ts). */
export function hoursSections(category: Pick<CategoryConfig, 'detailFields'>, hoursKeys: readonly string[]): HoursSection[] {
  const fields = category.detailFields
  const out: HoursSection[] = []
  for (const key of hoursKeys) {
    const f = fields.find((x) => x.key === key)
    if (!f) continue
    const flag = f.audienceKey ? fields.find((x) => x.key === f.audienceKey) : undefined
    if (!flag) {
      out.push({ section: key, label: f.label, hours: key, notes: null })
      continue
    }
    if (out.some((s) => s.section === flag.key)) continue
    const notes = fields.find((x) => x.type === 'textarea' && x.audienceKey === flag.key)
    out.push({ section: flag.key, label: label(flag), hours: key, notes: notes?.key ?? null })
  }
  return out
}

export const sectionKeys = (s: HoursSection): string[] => [s.hours, s.notes].filter((k): k is string => !!k)

/** The sections a place has: the ones its listing ticks. */
export function offeredSections(sections: readonly HoursSection[], item: Record<string, unknown>): HoursSection[] {
  return sections.filter((s) => s.section === s.hours || !!item[s.section])
}

/** Which section a set of changed keys belongs to, when it's one. */
export function sectionOfKeys(sections: readonly HoursSection[], keys: readonly string[]): HoursSection | null {
  const got = sections.filter((s) => keys.some((k) => sectionKeys(s).includes(k)))
  return got.length === 1 && keys.every((k) => sectionKeys(got[0]).includes(k)) ? got[0] : null
}

/** What a section finding carries in its source: the section, and the
 *  keys it puts on the listing. */
export type SectionSource = { section: string; keys: string[] }

export function readSectionSource(v: unknown): SectionSource | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (typeof r.section !== 'string' || !r.section || !Array.isArray(r.keys) || !r.keys.length || !r.keys.every((k) => typeof k === 'string' && k)) return null
  return { section: r.section, keys: r.keys as string[] }
}

/** A section finding's details, put on the listing as it is now: its
 *  section's keys as it says (or as the admin edited them), everything
 *  else as the listing has it. */
export function rebaseSection(source: SectionSource, listingDetails: Record<string, unknown>, sentDetails: Record<string, unknown>): Record<string, unknown> {
  // Only the keys it carries: one it doesn't say isn't emptied.
  return { ...listingDetails, ...Object.fromEntries(source.keys.filter((k) => k in sentDetails).map((k) => [k, sentDetails[k] ?? null])) }
}

const blank = (v: unknown) => (v === undefined || v === null || (typeof v === 'string' && !v.trim()) ? null : v)
const sameValue = (a: unknown, b: unknown) => (typeof blank(a) === 'string' && typeof blank(b) === 'string' ? sameNote(String(a), String(b)) : JSON.stringify(blank(a) ?? null) === JSON.stringify(blank(b) ?? null))

/** Two notes the same but for spacing and curly quotes. */
export function sameNote(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
  return n(a) === n(b)
}

/** A reading's details split into its sections, each only if it changes
 *  something: its own details (the listing's, with the section's keys as
 *  read) and its source. */
export function splitSections(sections: readonly HoursSection[], listing: Record<string, unknown>, read: Record<string, unknown>): { section: HoursSection; details: Record<string, unknown>; source: SectionSource }[] {
  return sections.flatMap((s) => {
    const keys = sectionKeys(s).filter((k) => k in read)
    if (!keys.some((k) => !sameValue(read[k], listing[k]))) return []
    const details = { ...read }
    for (const other of sections) if (other !== s) for (const k of sectionKeys(other)) if (k in details) details[k] = listing[k] ?? null
    // All the section's keys, so an admin's Edit of its note goes on too.
    return [{ section: s, details, source: { section: s.section, keys: sectionKeys(s) } }]
  })
}

// ── A section's rows, as its box shows them ────────────────────────────────

export type HoursRowMark = 'same' | 'new' | 'changed'
export type HoursRow = { days: string; text: string; was?: string; mark: HoursRowMark }

const DAY_NAMES: Record<DayKey, string> = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Shabbos' }

/** Days said as a person would: "Monday to Thursday", "Sunday to Thursday,
 *  Shabbos", "Sunday, Tuesday". */
export function hoursDays(days: readonly DayKey[]): string {
  const sorted = DAY_KEYS.filter((d) => days.includes(d))
  const runs: DayKey[][] = []
  for (const d of sorted) {
    const last = runs.at(-1)
    if (last && DAY_KEYS.indexOf(d) === DAY_KEYS.indexOf(last.at(-1)!) + 1) last.push(d)
    else runs.push([d])
  }
  return runs.flatMap((r) => (r.length >= 3 ? [`${DAY_NAMES[r[0]]} to ${DAY_NAMES[r.at(-1)!]}`] : r.map((d) => DAY_NAMES[d]))).join(', ')
}

/** "7:30–9:30 PM"; "11:00 AM–2:00 PM" across noon. */
export function openClose(d: { open: string; close: string }): string {
  const [o, c] = [fmt12(d.open), fmt12(d.close)]
  const [om, cm] = [o.slice(-2), c.slice(-2)]
  return om === cm ? `${o.slice(0, -3)}–${c}` : `${o}–${c}`
}

const dayText = (h: StructuredHours, d: DayKey): string | null => (!(d in h) ? null : h[d] ? openClose(h[d] as NonNullable<DayHours>) : 'Closed')

/** A section's hours as rows, days with the same hours (and the same old
 *  ones) together: "Monday to Thursday 7:30–9:30 PM was 8:30–10:30 PM".
 *  A day closed or not listed either way isn't a row. None at all, a
 *  "None" row. */
export function hoursRows(now: unknown, next: unknown = now): HoursRow[] {
  const a = (isStructuredHours(now) ? now : {}) as StructuredHours
  const b = (isStructuredHours(next) ? next : {}) as StructuredHours
  const groups: { days: DayKey[]; text: string; was: string | null }[] = []
  for (const d of DAY_KEYS) {
    const was = dayText(a, d)
    const text = dayText(b, d)
    const open = (t: string | null) => !!t && t !== 'Closed'
    if (!open(was) && !open(text)) continue
    const label = text ?? 'Not listed'
    const old = was === text ? null : (was ?? 'Not listed')
    const g = groups.find((x) => x.text === label && x.was === old)
    if (g) g.days.push(d)
    else groups.push({ days: [d], text: label, was: old })
  }
  if (!groups.length) return [{ days: 'None', text: '', mark: 'same' }]
  return groups.map((g) => ({ days: hoursDays(g.days), text: g.text, ...(g.was ? { was: g.was, mark: g.was === 'Not listed' ? 'new' : 'changed' } : { mark: 'same' }) }))
}

/** Whether a note reads differently, not just spaced differently. */
export function noteChanged(now: unknown, next: unknown): boolean {
  const a = typeof now === 'string' ? now : ''
  const b = typeof next === 'string' ? next : ''
  return !sameNote(a, b)
}
