import type { DirectoryResource, ResourceSubmission } from '@/types'
import type { CategoryConfig, CategoryField, FieldType } from './categories'
import { editSubmission } from './editSubmission'
import { dayLabel, fmt12, isStructuredHours, type DayHours, type DayKey, type StructuredHours } from './hours'
import { fmt } from './submissionDiff'
import { formatPhone, normalizeUrl } from './validation'
import { contactLine, mergeContacts, readContacts, sameContacts } from './contacts'

// ── A change to any field of a listing, read from a message ──────────────
// Added Oct 5 after the box's first tries: "the women's hours go until 4pm
// now", "change the hechsher to Keystone-K" and "closes at 3 on Wednesday"
// all came back "doesn't look like a change", because the reader knew only
// items, davening times and new places. This covers every field a person
// can edit on the listing (the name, address and phone, and the category's
// own text, phone, link, number, yes/no, choice and hours fields), from the
// category's own setup, so a field an admin adds is covered too. Items and
// davening times keep their own readers.

export const DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const CHANGEABLE = new Set<FieldType>(['text', 'tel', 'textarea', 'url', 'number', 'boolean', 'select', 'hours', 'contacts'])
const MAX_TEXT = 1000

/** A field the box can change: the listing's own name, address and phone, or
 *  one of its category's fields. */
export type ChangeableField = {
  key: string
  label: string
  type: FieldType
  /** The category's field; none for the name, address and phone. */
  field?: CategoryField
}

export function changeableFields(category: CategoryConfig): ChangeableField[] {
  const out: ChangeableField[] = [{ key: 'name', label: 'Name', type: 'text' }]
  if (category.hasAddress !== false) out.push({ key: 'address', label: 'Address', type: 'text' })
  if (category.hasPhone !== false) out.push({ key: 'phone', label: 'Phone', type: 'tel' })
  for (const f of category.detailFields) if (CHANGEABLE.has(f.type)) out.push({ key: f.key, label: f.label, type: f.type, field: f })
  return out
}

const CORE = new Set(['name', 'address', 'phone'])
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** A day's hours as checked: null (closed), or both times. */
function dayHours(v: unknown): DayHours | undefined {
  if (v === null) return null
  if (!v || typeof v !== 'object') return undefined
  const { open, close } = v as Record<string, unknown>
  return typeof open === 'string' && typeof close === 'string' && TIME.test(open) && TIME.test(close) ? { open, close } : undefined
}

/** A value for a field in the shape the guide stores it, or undefined when it
 *  can't be one: a choice that isn't among the field's options, hours that
 *  aren't hours. A choice is matched loosely ("keystone k" is Keystone-K). */
export function fieldValue(f: ChangeableField, raw: unknown): unknown {
  switch (f.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
      return Number.isFinite(n) ? n : undefined
    }
    case 'select': {
      const options = f.field?.options ?? []
      const one = (v: unknown) => (typeof v === 'string' ? options.find((o) => loose(o.value) === loose(v) || loose(o.label) === loose(v))?.value : undefined)
      if (f.field?.multiSelect) {
        const list = (Array.isArray(raw) ? raw : [raw]).map(one)
        return list.length && list.every(Boolean) ? [...new Set(list as string[])] : undefined
      }
      return one(raw)
    }
    case 'hours': {
      if (!isStructuredHours(raw)) return undefined
      const out: StructuredHours = {}
      for (const d of DAYS) {
        if (!(d in raw)) continue
        const h = dayHours((raw as Record<string, unknown>)[d])
        if (h === undefined) return undefined
        out[d] = h
      }
      return out
    }
    case 'tel': {
      const v = typeof raw === 'string' ? raw.trim().slice(0, 40) : ''
      return v ? formatPhone(v) : undefined
    }
    case 'url':
      return typeof raw === 'string' && raw.trim() ? normalizeUrl(raw.trim().slice(0, MAX_TEXT)) : undefined
    // A list of contacts, each entry checked (contacts.ts); none is no value.
    case 'contacts': {
      const list = readContacts(raw)
      return list.length ? list : undefined
    }
    default:
      return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_TEXT) : undefined
  }
}

const current = (listing: DirectoryResource, key: string): unknown => listing[key]

/** The same value for this field: a list of contacts entry by entry. */
function sameFor(f: ChangeableField, a: unknown, b: unknown): boolean {
  return f.type === 'contacts' ? sameContacts(a, b) : same(a, b)
}

function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? [...v].map(String).sort() : isStructuredHours(v) ? DAYS.map((d) => (d in v ? (v as StructuredHours)[d] : 'unset')) : v ?? ''
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

const dayText = (h: DayHours | undefined) => (h === undefined ? 'not listed' : h === null ? 'Closed' : `${fmt12(h.open)}–${fmt12(h.close)}`)

/** What a change does, a line each: "Kosher Certification: IKC → Keystone-K",
 *  and for hours a line per day that changes. */
export function changeLines(fields: ChangeableField[], listing: DirectoryResource, values: Record<string, unknown>): string[] {
  const lines: string[] = []
  for (const [key, after] of Object.entries(values)) {
    const f = fields.find((x) => x.key === key)
    if (!f) continue
    const before = current(listing, key)
    if (f.type === 'hours') {
      const b = (isStructuredHours(before) ? before : {}) as StructuredHours
      const a = after as StructuredHours
      for (const d of DAYS) {
        if (!(d in a) || JSON.stringify(d in b ? b[d] : 'unset') === JSON.stringify(a[d])) continue
        lines.push(`${f.label}, ${dayLabel(d)}: ${dayText(b[d])} → ${dayText(a[d])}`)
      }
      continue
    }
    // A list: a line an entry added or changed, not the whole list twice.
    if (f.type === 'contacts') {
      const was = new Map(readContacts(before).map((e) => [e.name, contactLine(e)]))
      for (const e of readContacts(after)) {
        const line = contactLine(e)
        const old = was.get(e.name)
        if (old === line) continue
        lines.push(old ? `${f.label}: ${old} → ${line}` : `${f.label}: + ${line}`)
      }
      continue
    }
    lines.push(`${f.label}: ${fmt(before, f.field)} → ${fmt(after, f.field)}`)
  }
  return lines
}

// ── What the reader hands over ─────────────────────────────────────────────

export type HoursRead = {
  /** The days it's about; "all" is every day the place is open. */
  days: DayKey[] | 'all'
  open: string | null
  close: string | null
  closed: boolean
  /** From now on, one day only, or not said ("closes at 3 on Wednesday"). */
  when: 'every_week' | 'one_day' | 'unclear'
}
export type FieldRead = { key: string; value?: unknown; hours?: HoursRead }

export type FieldsReading = {
  /** Each field as it would be: the listing's whole hours, say, with one
   *  day changed. */
  values: Record<string, unknown>
  lines: string[]
  /** What was read but isn't changed, and why. */
  held: string[]
  /** For the admin, beside the change: what the guide can't hold. */
  notes: string[]
  /** Hours whose "from now on or just once" wasn't said: asked before Send. */
  askWhen: { key: string; question: string; oneDay: string } | null
}

/** What the reader's changes do to the listing as it is now. */
export function readFieldChanges(category: CategoryConfig, listing: DirectoryResource, reads: FieldRead[]): FieldsReading {
  const fields = changeableFields(category)
  const values: Record<string, unknown> = {}
  const held: string[] = []
  const notes: string[] = []
  let askWhen: FieldsReading['askWhen'] = null

  for (const r of reads) {
    const f = fields.find((x) => x.key === r.key)
    if (!f) continue
    if (f.type === 'hours') {
      const h = r.hours
      if (!h) continue
      const now = (isStructuredHours(current(listing, f.key)) ? current(listing, f.key) : {}) as StructuredHours
      const days = h.days === 'all' ? DAYS.filter((d) => now[d]) : h.days
      const said = h.closed ? 'closed' : [h.open && `opens ${fmt12(h.open)}`, h.close && `closes ${fmt12(h.close)}`].filter(Boolean).join(', ')
      const which = h.days === 'all' ? 'every day' : h.days.map(dayLabel).join(', ')
      if (days.length === 0) {
        const note = `${f.label}: ${said}, but which days isn’t said`
        held.push(note)
        notes.push(note)
        continue
      }
      const next: StructuredHours = { ...((values[f.key] as StructuredHours | undefined) ?? now) }
      let missing = false
      let misfit = false
      for (const d of days) {
        if (h.closed) {
          next[d] = null
          continue
        }
        const open = h.open ?? now[d]?.open
        const close = h.close ?? now[d]?.close
        if (!open || !close) missing = true
        // One time said, the other kept, and they don't make a day: "until
        // 4pm" on hours listed as 8:30–10:30 PM is about some other hours
        // (Lower Merion's women's hours, Oct 5). Both said, a close before
        // the open is past midnight, as the editor allows.
        else if ((!h.open || !h.close) && close <= open) misfit = true
        else next[d] = { open, close }
      }
      if (missing || misfit) {
        const note = missing
          ? `${f.label}, ${which}: ${said}; the rest of the hours aren’t listed or said`
          : `${f.label}, ${which}: ${said}, which doesn’t fit the hours listed (${days.map((d) => dayText(now[d])).filter((t, i, a) => a.indexOf(t) === i).join('; ')})`
        held.push(note)
        notes.push(note)
        continue
      }
      const oneDay = `${f.label}, ${which}, one day only: ${said}. The guide’s hours can’t hold a one-day change, so this goes to the admin as a note.`
      if (h.when === 'one_day') {
        held.push(`${f.label}, ${which}: ${said}, one day only`)
        notes.push(oneDay)
        continue
      }
      // Asked only when a day is named: "closes at 3 on Wednesday" may be
      // one Wednesday, while "goes until 4pm now" is from now on.
      if (h.when === 'unclear' && h.days !== 'all' && !askWhen) {
        askWhen = { key: f.key, question: days.length === 1 ? `Every ${dayLabel(days[0])}, or just this one?` : 'From now on, or just this once?', oneDay }
      }
      if (!same(next, now)) values[f.key] = next
      else held.push(`${f.label}: already says that`)
      continue
    }
    if (r.value === undefined) continue
    const v = fieldValue(f, r.value)
    if (v === undefined) {
      const note = `${f.label}: “${String(r.value ?? '')}”${f.type === 'select' ? ' isn’t one of the guide’s choices' : ''}`
      held.push(note)
      notes.push(note)
      continue
    }
    // A list gains what was read (mergeContacts): the message gives the
    // entries it's about, not the whole list.
    const next = f.type === 'contacts' ? mergeContacts(values[f.key] ?? current(listing, f.key), v) : v
    if (sameFor(f, next, current(listing, f.key))) held.push(`${f.label}: already says that`)
    else values[f.key] = next
  }
  if (askWhen && !(askWhen.key in values)) askWhen = null
  return { values, lines: changeLines(fields, listing, values), held, notes, askWhen }
}

// ── Send: the edit itself, worked out again on the server ──────────────────

/** The edit suggestion for what the person sent: only fields a person can
 *  change, each checked again, and only those that differ from the listing
 *  as it is now. Moving the address drops the old map pin. */
export function fieldsEdit(category: CategoryConfig, listing: DirectoryResource, sent: unknown): { submission: ResourceSubmission; lines: string[] } {
  const fields = changeableFields(category)
  const values: Record<string, unknown> = {}
  if (sent && typeof sent === 'object' && !Array.isArray(sent)) {
    for (const [key, raw] of Object.entries(sent as Record<string, unknown>)) {
      const f = fields.find((x) => x.key === key)
      const v = f ? fieldValue(f, raw) : undefined
      if (f && v !== undefined && !sameFor(f, v, current(listing, key))) values[key] = v
    }
  }
  const details = Object.fromEntries(Object.entries(values).filter(([k]) => !CORE.has(k)))
  const submission = editSubmission(category, listing, details)
  if (typeof values.name === 'string') submission.name = values.name
  if (typeof values.phone === 'string') submission.phone = values.phone
  if (typeof values.address === 'string') {
    submission.address = values.address
    submission.geo = null
  }
  return { submission, lines: changeLines(fields, listing, values) }
}
