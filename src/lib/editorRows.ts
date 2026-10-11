import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, fieldIsVisible, selectValues, type CategoryConfig, type CategoryField, type FieldType } from './categories'
import { readContacts, sameContacts } from './contacts'
import { isMinyanim, TEFILLAH_LABELS, type Minyan } from './davening'
import { formatHoursSummary, hasAnyHours } from './hours'
import { sameFieldValue } from './listingDiff'
import { boxesOf, mainCardOf, shabbosAfter, shabbosFieldsOf } from './listingParts'
import { isWebsite, itemsField, kindField, siteName } from './listingView'
import { minyanimForBox, type MinyanBox } from './minyanimBox'
import { readSchedules, schedulesKey } from './schedules'

// ── The whole-listing editor's rows (agreed Oct 11, canvas page "editor") ───
// "Suggest an edit" is the listing's own boxes, in the listing's order, one
// row each: its heading, what it says now, and a tap to change it. Each row
// opens the editor that box's own Edit opens. Worked out here from the
// category's fields and the admin's boxes, the same way the listing is
// (listingView.ts, listingParts.ts), never from a category's name, so a
// category made tomorrow edits the way it reads.
//
// A field the listing never shows (a hidden field that isn't a hechsher's
// caveat, a mikvah's general hours beside its sections') isn't offered.

export type EditorRow = {
  /** Stable, for keys and tests: 'name', 'kind', 'facts', 'items',
   *  'minyans:weekday', 'box:Who to call', 'contact', 'hours', 'about'… */
  id: string
  title: string
  kind: 'name' | 'fields' | 'contact' | 'items' | 'minyans' | 'schedules' | 'audience'
  fields: CategoryField[]
  /** A shul's usual-times box. */
  box?: MinyanBox
  /** A section's own yes/no ("Women’s Tevillah"): the row is there while
   *  it's on. */
  flag?: string
}

/** What a draft holds: the three core values and the details. */
export type EditorValues = { name: string; address: string; phone: string; details: Record<string, unknown> }

const isBadge = (f: CategoryField) => (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' && (f.type === 'boolean' || f.type === 'select')

/** Whether a field is a list of its own (a week of hours, the dishes,
 *  the minyanim, the people to call), which a row opens on a screen of its
 *  own; anything else is a few inputs, which open where the row is.
 *  Keyed on every type, so a new one is a compile error until it's placed. */
const IS_A_LIST: Record<FieldType, boolean> = {
  text: false,
  tel: false,
  textarea: false,
  number: false,
  boolean: false,
  select: false,
  url: false,
  image: false,
  tags: true,
  hours: true,
  minyanim: true,
  contacts: true,
}

/** A row opens where it is, inside its own card, unless it holds a list
 *  (agreed Oct 11, canvas page "editorlook"): then it's its own screen. */
export function opensInPlace(row: EditorRow): boolean {
  if (row.kind === 'items' || row.kind === 'minyans' || row.kind === 'schedules') return false
  return !row.fields.some((f) => IS_A_LIST[f.type])
}

export function editorRows(category: CategoryConfig, details: Record<string, unknown>): EditorRow[] {
  const fields = category.detailFields
  const placed = new Set<string>()
  const take = (list: CategoryField[]) => {
    for (const f of list) placed.add(f.key)
    return list
  }
  const caveatParts = new Set(fields.flatMap((f) => (f.caveat ? [f.caveat.flagField, f.caveat.noteField] : [])))
  const audienceFlags = new Set(fields.map((f) => f.audienceKey).filter((k): k is string => !!k))
  // Hidden fields stay out, but for a hechsher's caveat (its yes/no and
  // note), which the listing says in its own box.
  for (const f of fields) if (f.renderAs === 'hidden' && !caveatParts.has(f.key)) placed.add(f.key)

  const rows: EditorRow[] = []

  // 1 · The name, its photo, and a short line under it.
  const photo = fields.filter((f) => f.key === PHOTO_FIELD_KEY && f.type === 'image')
  const tagline = fields.filter((f) => f.type === 'text' && f.showInHeader && f.headerMaxLength != null)
  rows.push({ id: 'name', title: 'Name', kind: 'name', fields: take([...photo, ...tagline]) })

  // 2 · What kind of place, then the facts that decide it.
  const kind = kindField(category)
  if (kind && !placed.has(kind.key)) rows.push({ id: 'kind', title: kind.label, kind: 'fields', fields: take([kind]) })
  const items = itemsField(category)
  const factFields = fields.filter(
    (f) =>
      !placed.has(f.key) &&
      f.key !== items?.key &&
      !f.audienceKey &&
      (isBadge(f) || caveatParts.has(f.key) || audienceFlags.has(f.key)),
  )
  const named = mainCardOf(category)
  const namedKeys = new Set(named?.fields.map((f) => f.key) ?? [])
  const shabbos = shabbosFieldsOf(category) ?? []
  const shabbosKeys = new Set(shabbos.map((f) => f.key))
  const boxKeys = new Set(boxesOf(category).flatMap((b) => b.fields.map((f) => f.key)))
  const facts = factFields.filter((f) => !namedKeys.has(f.key) && !shabbosKeys.has(f.key) && !boxKeys.has(f.key))
  if (facts.length > 0) rows.push({ id: 'facts', title: factsTitle(facts), kind: 'fields', fields: take(facts) })

  // 3 · The main thing.
  if (named) rows.push({ id: 'main', title: named.label, kind: 'fields', fields: take([...named.fields]) })
  const minyanim = fields.find((f) => f.type === 'minyanim' && !placed.has(f.key))
  if (minyanim) {
    take([minyanim])
    rows.push({ id: 'minyans:weekday', title: 'Usual weekday times', kind: 'minyans', fields: [minyanim], box: 'weekday' })
    rows.push({ id: 'minyans:shabbos', title: 'Usual Shabbos times', kind: 'minyans', fields: [minyanim], box: 'shabbos' })
    rows.push({ id: 'schedules', title: 'Yom Tov and special schedules', kind: 'schedules', fields: [minyanim] })
  }
  if (items && !placed.has(items.key)) rows.push({ id: 'items', title: items.label, kind: 'items', fields: take([items]) })
  // A section per audience (a mikvah's Women’s, Men’s, Keilim), while it's on.
  for (const flagKey of audienceFlags) {
    const flag = fields.find((f) => f.key === flagKey)
    const own = fields.filter((f) => f.audienceKey === flagKey && f.renderAs !== 'hidden')
    take(own)
    if (flag && details[flagKey]) rows.push({ id: `audience:${flagKey}`, title: flag.filterLabel ?? flag.label, kind: 'audience', fields: own, flag: flagKey })
  }

  // 4 · The admin's boxes, then any list of contacts in none of them, with
  // the Shabbos card among them where the admin put it.
  const boxes: EditorRow[] = [
    ...boxesOf(category).map((b) => ({ id: `box:${b.title}`, title: b.title, kind: 'fields' as const, fields: take([...b.fields]) })),
    ...fields
      .filter((f) => f.type === 'contacts' && !placed.has(f.key) && !shabbosKeys.has(f.key))
      .map((f) => ({ id: `box:${f.key}`, title: f.label, kind: 'fields' as const, fields: take([f]) })),
  ]
  const shabbosRow: EditorRow[] = shabbos.length > 0 ? [{ id: 'shabbos', title: 'Shabbos', kind: 'fields', fields: take(shabbos) }] : []
  const after = shabbosAfter(category)
  rows.push(...(after === null ? [...boxes, ...shabbosRow] : [...boxes.slice(0, after), ...shabbosRow, ...boxes.slice(after)]))

  // 5 · The contact box: address, phone, website and other links, and
  // short lines (an email).
  const contact = fields.filter(
    (f) => !placed.has(f.key) && !f.audienceKey && (f.type === 'url' || f.type === 'text' || f.type === 'tel' || f.type === 'number'),
  )
  const hasAddress = category.hasAddress !== false
  const hasPhone = category.hasPhone !== false
  if (hasAddress || hasPhone || contact.length > 0) {
    rows.push({ id: 'contact', title: contactTitle(hasAddress, hasPhone, contact), kind: 'contact', fields: take(contact) })
  }

  // 6 · Hours, on their own (the user, Oct 11): a week of them is its own
  // screen, and the thing most often wrong. A place with a section per
  // audience shows its hours in those, not here.
  const hours = audienceFlags.size > 0 ? [] : fields.filter((f) => f.type === 'hours' && !placed.has(f.key) && !f.audienceKey)
  for (const f of hours) rows.push({ id: hours.length > 1 ? `hours:${f.key}` : 'hours', title: hours.length > 1 ? f.label : 'Hours', kind: 'fields', fields: take([f]) })

  // 7 · About: the descriptions.
  const about = fields.filter((f) => !placed.has(f.key) && !f.audienceKey && f.type === 'textarea')
  if (about.length > 0) rows.push({ id: 'about', title: 'About', kind: 'fields', fields: take(about) })

  // Anything else the listing lists: another tags field, a yes/no or a
  // choice it shows as a line.
  for (const f of fields) {
    if (placed.has(f.key) || f.audienceKey || f.type === 'hours' || f.type === 'image' || f.type === 'minyanim') continue
    rows.push({ id: `field:${f.key}`, title: f.label, kind: 'fields', fields: take([f]) })
  }

  return rows.filter((r) => r.kind !== 'fields' || r.fields.length > 0 || r.id === 'name')
}

/** The facts row's title, from what it holds: a hechsher's caveat makes it
 *  "Kosher", yes/no sections "What’s here", one choice its own name. */
function factsTitle(facts: CategoryField[]): string {
  if (facts.some((f) => f.caveat)) return 'Kosher'
  if (facts.every((f) => f.type === 'boolean')) return 'What’s here'
  if (facts.length === 1) return facts[0].label
  return 'Details'
}

/** "Address, phone and website", "Address, phone, website and email". */
function contactTitle(hasAddress: boolean, hasPhone: boolean, fields: CategoryField[]): string {
  const urls = fields.filter((f) => f.type === 'url')
  const site = urls.some(isWebsite)
  const others = urls.length - (site ? 1 : 0)
  const parts = [
    hasAddress && 'address',
    hasPhone && 'phone',
    site && 'website',
    others > 0 && (others === 1 && !site && !hasAddress && !hasPhone ? (urls[0].linkLabel ?? urls[0].label).toLowerCase() : 'links'),
    ...fields.filter((f) => f.type !== 'url').map((f) => f.label.toLowerCase()),
  ].filter((p): p is string => !!p)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? 'contact')
  return list[0].toUpperCase() + list.slice(1)
}

// ── What a row says now ──────────────────────────────────────────────────────

function blank(f: CategoryField, v: unknown): boolean {
  if (f.type === 'boolean') return v !== true
  if (f.type === 'select' || f.type === 'tags') return selectValues(v).length === 0
  if (f.type === 'contacts') return readContacts(v).length === 0
  if (f.type === 'hours') return !hasAnyHours(v) && !(typeof v === 'string' && v.trim())
  if (f.type === 'minyanim') return !isMinyanim(v) || v.length === 0
  return String(v ?? '').trim() === ''
}

function optionText(f: CategoryField, v: unknown): string {
  return selectValues(v)
    .map((x) => f.options?.find((o) => o.value === x)?.label ?? x)
    .join(', ')
}

function minyanText(m: Minyan, timeText: (m: Minyan) => string): string {
  return `${TEFILLAH_LABELS[m.tefillah]} ${timeText(m)}`
}

/** The line under a row's title: what the listing says there now, short.
 *  Empty when it says nothing yet. */
export function rowSummary(row: EditorRow, values: EditorValues, timeText: (m: Minyan) => string): string {
  const d = values.details
  const shown = row.fields.filter((f) => fieldIsVisible(f, d))
  if (row.kind === 'minyans') {
    const rows = minyanimForBox(isMinyanim(d[row.fields[0].key]) ? (d[row.fields[0].key] as Minyan[]) : [], row.box!)
    return rows.map((m) => minyanText(m, timeText)).join(' · ')
  }
  if (row.kind === 'schedules') return readSchedules(d[schedulesKey(row.fields[0].key)]).map((s) => s.name).join(' · ')
  if (row.kind === 'items') {
    const f = row.fields[0]
    const all = [...selectValues(d[f.key]), ...selectValues(d[`${f.key}_sometimes`])]
    return all.length === 0 ? '' : `${all.length} · ${all.slice(0, 5).join(', ')}${all.length > 5 ? '…' : ''}`
  }
  const parts: string[] = []
  if (row.kind === 'contact') {
    if (values.address.trim()) parts.push(values.address.split(',')[0].trim())
    if (values.phone.trim()) parts.push(values.phone.trim())
  }
  const anyFilled = shown.some((f) => !blank(f, d[f.key]))
  for (const f of shown) {
    const v = d[f.key]
    if (f.type === 'boolean' && f.invertDisplay) {
      // "Everything here is kosher" holds true when it isn't.
      if (v === true) parts.push(`${f.label}: No`)
      else if (anyFilled) parts.push(f.label)
      continue
    }
    if (blank(f, v)) continue
    if (f.type === 'image') continue
    if (f.type === 'boolean') parts.push(f.filterLabel ?? f.label)
    else if (f.type === 'select') parts.push(optionText(f, v))
    // "Mon–Fri 9 AM–7 PM", not "9:00 AM–7:00 PM": a line to recognise.
    else if (f.type === 'hours') parts.push(typeof v === 'string' ? v : formatHoursSummary(v).replace(/:00/g, ''))
    else if (f.type === 'contacts') parts.push(readContacts(v).map((c) => c.name).join(', '))
    else if (f.type === 'tags') parts.push(selectValues(v).join(', '))
    // The website by name; any other link by what it is ("Kosher
    // Certification"), not a file's address.
    else if (f.type === 'url') parts.push((isWebsite(f) && siteName(/^https?:\/\//i.test(String(v)) ? String(v) : `https://${v}`)) || (f.linkLabel ?? f.label))
    else parts.push(String(v).trim())
  }
  return parts.join(' · ')
}

/** Nothing in the row yet: it goes under "Not on the listing yet". The
 *  name row never does. */
export function rowIsEmpty(row: EditorRow, values: EditorValues): boolean {
  if (row.kind === 'name') return false
  const d = values.details
  if (row.kind === 'minyans') return minyanimForBox(isMinyanim(d[row.fields[0].key]) ? (d[row.fields[0].key] as Minyan[]) : [], row.box!).length === 0
  if (row.kind === 'schedules') return readSchedules(d[schedulesKey(row.fields[0].key)]).length === 0
  if (row.kind === 'items') return blank(row.fields[0], d[row.fields[0].key]) && selectValues(d[`${row.fields[0].key}_sometimes`]).length === 0
  if (row.kind === 'contact' && (values.address.trim() || values.phone.trim())) return false
  return row.fields.every((f) => (f.invertDisplay ? true : blank(f, d[f.key])))
}

/** Whether the draft changes what this row says (marked "Changed" on the
 *  list, and counted on Send). Field by field, not by which screen was
 *  opened: picking a new address from Google changes the name and hours
 *  rows too, and they're marked. */
export function rowChanged(row: EditorRow, item: DirectoryResource, values: EditorValues): boolean {
  const d = values.details
  if (row.kind === 'name' && !sameFieldValue('name', item.name, values.name)) return true
  if (row.kind === 'contact' && (!sameFieldValue('address', item.address, values.address) || !sameFieldValue('phone', item.phone, values.phone))) return true
  if (row.kind === 'minyans') {
    const key = row.fields[0].key
    const was = isMinyanim(item[key]) ? (item[key] as Minyan[]) : []
    const now = isMinyanim(d[key]) ? (d[key] as Minyan[]) : []
    // By what each minyan says, not its id: the editor gives the rows
    // stored without one an id when a box is opened, and the other box's
    // rows go back with them.
    return boxText(minyanimForBox(was, row.box!)) !== boxText(minyanimForBox(now, row.box!))
  }
  if (row.kind === 'schedules') {
    const key = schedulesKey(row.fields[0].key)
    return JSON.stringify(readSchedules(item[key])) !== JSON.stringify(readSchedules(d[key]))
  }
  return row.fields.some((f) => {
    if (!fieldIsVisible(f, d) && !fieldIsVisible(f, item)) return false
    const after = fieldIsVisible(f, d) ? d[f.key] : undefined
    if (f.type === 'contacts') return !sameContacts(item[f.key], after)
    if (f.type === 'tags' && !sameFieldValue('tags', item[`${f.key}_sometimes`], d[`${f.key}_sometimes`])) return true
    return !sameFieldValue(f.type, item[f.key], after)
  })
}

/** A box's minyanim as one string, ids left out and keys in order. */
function boxText(rows: readonly Minyan[]): string {
  return rows
    .map((m) =>
      JSON.stringify(
        Object.entries(m)
          .filter(([k, v]) => k !== 'id' && v !== undefined && v !== '' && v !== null)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .sort()
    .join('|')
}
