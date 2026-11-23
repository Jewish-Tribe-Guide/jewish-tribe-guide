import { fieldIsVisible, type CategoryConfig, type CategoryField } from './categories'
import { listingChanges, changedHoursDays } from './listingDiff'
import { dayLabel, fmt12, formatHoursSummary, isStructuredHours, type DayHours } from './hours'
import { isMinyanim, type Minyan } from './davening'
import { readSchedules, schedulesKey, type SpecialSchedule } from './schedules'
import { minyanimForBox } from './minyanimBox'
import { listingFacts, listingKind } from './listingView'
import type { DirectoryResource, ResourceSubmission } from '@/types'

// ── What an approved edit changed, said for visitors (step 7a) ───────────────
// Saved into the activity log when an edit is approved, so What changed can
// say "Hours Sunday 11 AM – 10 PM" rather than "updated". Agreed Oct 2:
//  - the new value only, never the old ("we just want to know what the new
//    ones are");
//  - text a person wrote (What isn't kosher?, delivery details) in full;
//    Google's description only named;
//  - a shul's times by the box that changed ("Usual Shabbos times
//    updated") and the week posted, never minyan by minyan (the user, Nov
//    23: one Sons of Israel edit was eleven lines).
// Which fields changed is listingChanges' call, the same rule the editor and
// the moderation queue use, so formatting never counts as a change here
// either. Saved as text: a later rename of a field leaves a past change
// saying what it said that day.

/** One thing that changed: "Hours" · "Sunday 11 AM – 10 PM". `quiet` is said
 *  in grey with no value of its own ("New photo"). */
export type ChangePart = { key: string; label: string; value: string; quiet?: boolean }

type Proposed = Pick<ResourceSubmission, 'name' | 'address' | 'phone' | 'details'>

/** "7:00 PM" → "7 PM"; "6:30 PM" stays (as on the category rows). */
const shortTime = (hhmm: string) => fmt12(hhmm).replace(':00 ', ' ')

const plainMinyan = (m: Minyan) => JSON.stringify(Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined && v !== '').sort(([a], [b]) => a.localeCompare(b))))
const sameRows = (a: readonly Minyan[], b: readonly Minyan[]) => JSON.stringify(a.map(plainMinyan).sort()) === JSON.stringify(b.map(plainMinyan).sort())

/** The usual boxes that changed, by name: "Usual weekday times updated".
 *  A change to neither box (Yom Tov days on a row) is the times'. */
function minyanParts(key: string, before: unknown, after: unknown): ChangePart[] {
  const b = isMinyanim(before) ? before : []
  const a = isMinyanim(after) ? after : []
  const boxes = (['weekday', 'shabbos'] as const).filter((box) => !sameRows(minyanimForBox(b, box), minyanimForBox(a, box)))
  if (boxes.length === 0) return sameRows(b, a) ? [] : [{ key, label: '', value: 'Usual times updated', quiet: true }]
  return boxes.map((box) => ({ key: `${key}:${box}`, label: '', value: box === 'weekday' ? 'Usual weekday times updated' : 'Usual Shabbos times updated', quiet: true }))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Nov 22–28", "Nov 30 – Dec 5", "Nov 27". */
export function datesSaid(from: string, to: string): string {
  const day = (iso: string) => ({ m: MONTHS[Number(iso.slice(5, 7)) - 1], d: Number(iso.slice(8, 10)) })
  const f = day(from)
  const t = day(to)
  if (from === to || !to) return `${f.m} ${f.d}`
  return f.m === t.m ? `${f.m} ${f.d}–${t.d}` : `${f.m} ${f.d} – ${t.m} ${t.d}`
}

/** The weeks a save posted or changed, once each by their dates (a week's
 *  Shabbos and weekdays are two schedules with one name). Weeks it left as
 *  they were, or took off, aren't said. */
function weekParts(key: string, before: unknown, after: unknown): ChangePart[] {
  const plain = (x: SpecialSchedule) => JSON.stringify({ ...x, id: undefined, postedAt: undefined })
  const was = new Map(readSchedules(before).map((x) => [x.id, plain(x)]))
  const said = new Map<string, ChangePart>()
  for (const x of readSchedules(after)) {
    const old = was.get(x.id)
    if (old === plain(x)) continue
    const dates = x.from && x.to ? datesSaid(x.from, x.to) : x.name
    const value = `Times for ${dates} ${old === undefined ? 'posted' : 'updated'}`
    if (![...said.values()].some((p) => p.value.startsWith(`Times for ${dates} `))) said.set(dates, { key, label: '', value, quiet: true })
  }
  return [...said.values()]
}

function hoursParts(field: CategoryField, before: unknown, after: unknown): ChangePart[] {
  if (!isStructuredHours(after)) return [{ key: field.key, label: field.label, value: formatHoursSummary(after) || 'None listed' }]
  const days = isStructuredHours(before) ? changedHoursDays(before, after) : []
  if (days.length === 0) return [{ key: field.key, label: field.label, value: formatHoursSummary(after) }]
  const a = after as Record<string, DayHours | undefined>
  return days.map((k) => {
    const d = a[k] ?? null
    return { key: field.key, label: field.label, value: `${dayLabel(k)} ${d ? `${shortTime(d.open)} – ${shortTime(d.close)}` : 'Closed'}` }
  })
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])

/** "added Pretzel Buns; taken off Steak". */
function listChange(before: unknown, after: unknown): string {
  const b = asList(before)
  const a = asList(after)
  const lower = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase()))
  const added = a.filter((x) => !lower(b).has(x.toLowerCase()))
  const removed = b.filter((x) => !lower(a).has(x.toLowerCase()))
  return [added.length ? `added ${added.join(', ')}` : '', removed.length ? `taken off ${removed.join(', ')}` : ''].filter(Boolean).join('; ')
}

/** A web address as people say it: "benjerry.com/upenn". */
const bareUrl = (v: unknown) => String(v ?? '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')

function optionLabels(field: CategoryField, v: unknown): string {
  const values = Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === '' ? [] : [String(v)]
  return values.map((x) => field.options?.find((o) => o.value === x)?.label ?? x).join(', ')
}

/** Everything an approved edit changed, as visitors read it, in the
 *  listing's own order. Fields a visitor can't see on the listing (a
 *  show-if that no longer applies) are left out. */
export function visitorChanges(existing: DirectoryResource | null | undefined, proposed: Proposed, fields: CategoryField[]): ChangePart[] {
  const details = (proposed.details ?? {}) as Record<string, unknown>
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const parts: ChangePart[] = []
  for (const change of listingChanges(existing, proposed, fields)) {
    if (change.key === 'name' || change.key === 'phone') {
      parts.push({ key: change.key, label: change.label, value: String(change.after ?? '').trim() || 'None listed' })
      continue
    }
    if (change.key === 'address') {
      parts.push({ key: change.key, label: change.label, value: String(change.after ?? '').replace(/,?\s*USA$/, '').trim() || 'None listed' })
      continue
    }
    const scheduled = fields.find((f) => f.type === 'minyanim' && schedulesKey(f.key) === change.key)
    if (scheduled) {
      parts.push(...weekParts(change.key, change.before, change.after))
      continue
    }
    const field = byKey.get(change.key)
    if (!field || !fieldIsVisible(field, details)) continue
    const { before, after } = change
    switch (field.type) {
      case 'hours':
        parts.push(...hoursParts(field, before, after))
        break
      case 'minyanim':
        parts.push(...minyanParts(field.key, before, after))
        break
      case 'image':
        parts.push({ key: field.key, label: '', value: after ? 'New photo' : 'Photo taken off', quiet: true })
        break
      case 'tags': {
        const main = listChange(before, after)
        const sometimes = listChange(existing?.[`${field.key}_sometimes`], details[`${field.key}_sometimes`])
        const value = [main, sometimes && `not always in stock: ${sometimes}`].filter(Boolean).join('; ')
        if (value) parts.push({ key: field.key, label: field.label, value })
        break
      }
      case 'boolean':
        parts.push({ key: field.key, label: field.label, value: (field.invertDisplay ? !after : !!after) ? 'Yes' : 'No' })
        break
      case 'select':
        parts.push({ key: field.key, label: field.label, value: optionLabels(field, after) || 'None' })
        break
      case 'url':
        parts.push({ key: field.key, label: field.label, value: bareUrl(after) || 'None listed' })
        break
      default:
        // Google's description is Google's words: named, not quoted (agreed
        // Oct 2). Text a person wrote is said in full.
        if (field.key === 'googleDescription') parts.push({ key: field.key, label: '', value: `${field.label} changed`, quiet: true })
        else parts.push({ key: field.key, label: field.label, value: String(after ?? '').trim() || 'None listed' })
    }
  }
  return parts
}

/** A new place's short facts, as its opened listing says them: its tagline,
 *  kind and badges, "Vegan Dine In · Restaurant · Parve · IKC". Nothing of
 *  the moment (open, closed). */
export function newListingFacts(item: DirectoryResource, category: CategoryConfig): ChangePart[] {
  const tagline = category.detailFields.find((f) => f.type === 'text' && f.showInHeader && f.headerMaxLength != null)
  const facts = [tagline ? String(item[tagline.key] ?? '').trim() : '', listingKind(item, category), ...listingFacts(item, category)].filter(Boolean)
  return facts.length ? [{ key: 'facts', label: '', value: [...new Set(facts)].join(' · '), quiet: true }] : []
}

/** Past this many letters a value is a paragraph, not an answer. */
export const LONG_VALUE = 80

/** What a change says, short, as Activity shows it (the user, Nov 23:
 *  "pretty wordy"): a line for each thing that changed. A short fact keeps
 *  its value ("Phone (215) 917-0209"); a field changed in several places
 *  (hours a day at a time) or at length (a note) is only named ("Hours
 *  updated"). Shown, not saved, so it shortens entries saved before too:
 *  their minyanim one by one become "Usual times updated", and a week's
 *  lines (once every week the shul had, changed or not) only the weeks
 *  posted. */
export function shortParts(parts: readonly ChangePart[], fields: readonly CategoryField[]): ChangePart[] {
  const groups = new Map<string, ChangePart[]>()
  for (const p of parts) groups.set(p.key, [...(groups.get(p.key) ?? []), p])
  const out: ChangePart[] = []
  for (const [key, group] of groups) {
    const field = fields.find((f) => f.key === key)
    const weeksOf = fields.find((f) => f.type === 'minyanim' && schedulesKey(f.key) === key)
    const values = [...new Set(group.map((p) => p.value))]
    // Said short when it was saved.
    if (group.every((p) => p.quiet)) {
      out.push(...values.map((value) => group.find((p) => p.value === value)!))
      continue
    }
    if (weeksOf) {
      // Saved before Nov 23: "Times for Nov 22 – Nov 28 times", every week
      // the shul had, "New:" on the ones posted.
      const posted = [...new Set(group.filter((p) => p.label === 'New:').map((p) => p.value.replace(/ times$/, '')))]
      out.push(...(posted.length ? posted.map((v) => ({ key, label: '', value: `${/^times for /i.test(v) ? v : `${v} times`} posted`, quiet: true })) : [{ key, label: '', value: 'Week’s times updated', quiet: true }]))
      continue
    }
    if (field?.type === 'minyanim') {
      out.push({ key, label: '', value: 'Usual times updated', quiet: true })
      continue
    }
    if (values.length > 1 || values[0].length > LONG_VALUE) {
      const label = field?.label ?? group[0].label
      out.push({ key, label: '', value: `${label || 'Details'} updated`, quiet: true })
      continue
    }
    out.push(group[0])
  }
  return out
}
