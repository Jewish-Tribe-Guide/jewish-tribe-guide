import { fieldIsVisible, type CategoryConfig, type CategoryField } from './categories'
import { listingChanges, changedHoursDays } from './listingDiff'
import { dayLabel, fmt12, formatHoursSummary, isStructuredHours, type DayHours } from './hours'
import { formatDays, isMinyanim, parseTimeToMinutes, SEASON_LABELS, TEFILLAH_LABELS, type Minyan } from './davening'
import { readSchedules, schedulesKey } from './schedules'
import { listingFacts, listingKind } from './listingView'
import type { DirectoryResource, ResourceSubmission } from '@/types'

// ── What an approved edit changed, said for visitors (step 7a) ───────────────
// Saved into the activity log when an edit is approved, so What changed can
// say "Hours Sunday 11 AM – 10 PM" rather than "updated". Agreed Oct 2:
//  - the new value only, never the old ("we just want to know what the new
//    ones are");
//  - text a person wrote (What isn't kosher?, delivery details) in full;
//    Google's description only named;
//  - a minyan by its day and tefillah, the way the shul's page names it.
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

/** A stored minyan time ("7:00am", "19:30") as the site says it ("7 AM");
 *  a rule ("15 min before Sunset") as written. */
function minyanTime(time: string): string {
  const minutes = parseTimeToMinutes(time)
  if (!Number.isFinite(minutes)) return time.trim()
  return shortTime(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`)
}

/** "Shabbos Shacharis", "Weekday Mincha", "Sunday Shacharis", "Mon, Thu
 *  Shacharis". */
function minyanName(m: Minyan): string {
  const days = [...m.days].sort().join(',')
  const when =
    days === 'sat' ? 'Shabbos'
    : days === 'fri,mon,thu,tue,wed' ? 'Weekday'
    : m.days.length === 1 && m.days[0] !== 'sat' ? formatDays(m.days).replace(/^(Sun|Mon|Tue|Wed|Thu|Fri)$/, (d) => ({ Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' })[d]!)
    : formatDays(m.days)
  // Kabbalas Shabbos and Shabbos Mussaf say Shabbos themselves.
  const tefillah = TEFILLAH_LABELS[m.tefillah]
  return when && !(when === 'Shabbos' && tefillah.startsWith('Shabbos')) && !(when === 'Friday' && m.tefillah === 'kabbalas_shabbos') ? `${when} ${tefillah}` : tefillah
}

function minyanLine(m: Minyan, withNotes: boolean): string {
  return [`${minyanName(m)} ${minyanTime(m.time)}`, m.season && SEASON_LABELS[m.season], withNotes && m.notes?.trim()].filter(Boolean).join(' · ')
}

/** Each minyan added, changed or taken off, matched by its id. */
function minyanParts(key: string, before: unknown, after: unknown): ChangePart[] {
  const b = isMinyanim(before) ? before : []
  const a = isMinyanim(after) ? after : []
  const id = (m: Minyan, i: number) => m.id ?? `#${i}`
  const was = new Map(b.map((m, i) => [id(m, i), m]))
  const now = new Map(a.map((m, i) => [id(m, i), m]))
  const parts: ChangePart[] = []
  a.forEach((m, i) => {
    const old = was.get(id(m, i))
    if (!old) parts.push({ key, label: 'New:', value: minyanLine(m, true) })
    else if (JSON.stringify(old) !== JSON.stringify(m)) parts.push({ key, label: '', value: minyanLine(m, (old.notes ?? '') !== (m.notes ?? '')) })
  })
  b.forEach((m, i) => {
    if (!now.has(id(m, i))) parts.push({ key, label: 'No longer listed:', value: minyanLine(m, false) })
  })
  return parts
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
      const had = new Set(readSchedules(change.before).map((s) => s.id))
      for (const s of readSchedules(change.after)) parts.push({ key: change.key, label: had.has(s.id) ? '' : 'New:', value: `${s.name} times` })
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
