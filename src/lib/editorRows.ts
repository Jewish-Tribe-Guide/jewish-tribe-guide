import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, fieldIsVisible, selectValues, type CategoryConfig, type CategoryField, type FieldType } from './categories'
import { readContacts, sameContacts } from './contacts'
import { isMinyanim, TEFILLAH_LABELS, type Minyan } from './davening'
import { formatHoursSummary, hasAnyHours } from './hours'
import { sameFieldValue } from './listingDiff'
import { boxesOf, fixedPlaceOf, isBasicField, mainCardOf, parseListingParts, shabbosFieldsOf } from './listingParts'
import { fieldBoxes, type FieldPage } from './fieldBoxes'
import { partsOf } from './fieldParts'
import { isCertificateLink, isWebsite, itemsField, kindField, siteName } from './listingView'
import { minyanimForBox, type MinyanBox } from './minyanimBox'
import { itemWording } from './itemMarks'
import { MENU_LINK_KEY, MENU_LINK_LABEL } from './menuLink'
import { readSchedules, schedulesKey } from './schedules'
import { isNoMinyan, weekDates, weekDiffers, weekPostFor, weekRowsFor, type EditWeek } from './thisWeekEdit'

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
  kind: 'name' | 'fields' | 'contact' | 'items' | 'minyans' | 'audience'
  fields: CategoryField[]
  /** A shul's usual-times box, or 'this_week'. */
  box?: MinyanBox
  /** With box 'this_week': the week it's for (thisWeekEdit.ts). */
  week?: EditWeek
  /** A section's own yes/no ("Women’s Tevillah"): the row is there while
   *  it's on. */
  flag?: string
  /** An admin's listing: the contact box a row each (`splitContact`). */
  part?: 'address' | 'phone'
  /** A contact row: which of the address and phone it edits, by where the
   *  admin put them (fieldBoxes.ts). Both when unset. */
  basics?: ('address' | 'phone')[]
}

/** Whether the row edits the place's address or phone. */
export const rowHas = (row: EditorRow, b: 'address' | 'phone'): boolean =>
  row.part ? row.part === b : row.kind === 'contact' && (!row.basics || row.basics.includes(b))

/** What a draft holds: the three core values and the details. */
export type EditorValues = { name: string; address: string; phone: string; details: Record<string, unknown> }

const isBadge = (f: CategoryField) => (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' && (f.type === 'boolean' || f.type === 'select')

/** Whether a field is a list of its own (a week of hours, the dishes,
 *  the minyanim, the people to call), which a row opens on a screen of its
 *  own; anything else is a few inputs, which open where the row is. A row
 *  of hours alone opens where it is all the same (see opensInPlace).
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
  // A mikvah's sections (Women's, Men's, Keilim) are alike, each its own
  // screen, whichever fields an admin gave one.
  if (row.kind === 'items' || row.kind === 'minyans' || row.kind === 'audience') return false
  // Just a week of hours opens where it is too (the user, Oct 11).
  if (row.fields.length > 0 && row.fields.every((f) => f.type === 'hours')) return true
  return !row.fields.some((f) => IS_A_LIST[f.type])
}

/** The inputs a kind of place can bring up beside it (a link, a note), not
 *  a list or a week of hours, which are rows of their own. */
const BROUGHT_UP: Partial<Record<FieldType, true>> = { url: true, text: true, textarea: true, tel: true, number: true, select: true, boolean: true }

/** `week`: a shul's "This week's schedule" row is offered for it, on a
 *  listing's own edit only (thisWeekEdit.ts). `splitContact`: the contact box
 *  a row each, since a job keeps each one (the Places listing, Nov 1).
 *  `allSections`: a mikvah's sections offered whether on or not, for a place
 *  being added (sectionFlags turns on the ones written in). */
export function editorRows(category: CategoryConfig, details: Record<string, unknown>, { week, nextWeek, splitContact, allSections }: { week?: EditWeek | null; nextWeek?: EditWeek | null; splitContact?: boolean; allSections?: boolean } = {}): EditorRow[] {
  const fields = category.detailFields
  const placed = new Set<string>()
  const take = (list: CategoryField[]) => {
    for (const f of list) placed.add(f.key)
    return list
  }
  // Contact or About, where the admin put a field in one by name.
  const fixedPlace = fixedPlaceOf(category)
  const caveatParts = new Set(fields.flatMap((f) => (f.caveat ? [f.caveat.flagField, f.caveat.noteField] : [])))
  const audienceFlags = new Set(fields.map((f) => f.audienceKey).filter((k): k is string => !!k))
  // Hidden fields stay out, but for a hechsher's caveat (its yes/no and
  // note), which the listing says in its own box.
  for (const f of fields) if (f.renderAs === 'hidden' && !caveatParts.has(f.key)) placed.add(f.key)

  const rows: EditorRow[] = []
  const hasAddress = category.hasAddress !== false
  const hasPhone = category.hasPhone !== false
  // The listing's boxes, as the admin's Fields list lays them out.
  const page: FieldPage = { fields: fields.filter((f) => f.renderAs !== 'hidden'), hiddenFields: fields.filter((f) => f.renderAs === 'hidden'), hasAddress, hasPhone }
  const shownBoxes = fieldBoxes(page, parseListingParts(category.listingParts))
  // A field with no box of its own: in Contact or About.
  const boxless = new Set(shownBoxes.filter((b) => b.id === 'contact' || b.id === 'about').flatMap((b) => b.fields))

  // 1 · The name, its photo, and a short line under it.
  const photo = fields.filter((f) => f.key === PHOTO_FIELD_KEY && f.type === 'image')
  const tagline = fields.filter((f) => f.type === 'text' && f.showInHeader && f.headerMaxLength != null)
  rows.push({ id: 'name', title: 'Name', kind: 'name', fields: take([...photo, ...tagline]) })

  // 2 · What kind of place, then the facts that decide it.
  const named = mainCardOf(category)
  const namedKeys = new Set(named?.fields.map((f) => f.key) ?? [])
  const shabbos = shabbosFieldsOf(category) ?? []
  const shabbosKeys = new Set(shabbos.map((f) => f.key))
  const boxKeys = new Set(boxesOf(category).flatMap((b) => b.fields.filter((f) => !isBasicField(f)).map((f) => f.key)))
  const kind = kindField(category)
  if (kind && !placed.has(kind.key)) {
    // What the choice brings up goes with it (the user, Oct 20): picking
    // "Scheduled Deliveries" brought up a WhatsApp group in the contact
    // row, two rows away, where nobody thought to look. Short inputs only,
    // and none the admin put in a box of their own. The row is then named
    // for both, by the admin's section ("Store type and delivery").
    const brought = fields.filter(
      (f) =>
        f.showIf?.field === kind.key &&
        !placed.has(f.key) &&
        !f.audienceKey &&
        BROUGHT_UP[f.type] &&
        boxless.has(f.key),
    )
    const section = brought.length > 0 ? category.formSections?.find((s) => s.key === kind.formSection)?.label?.trim() : undefined
    rows.push({ id: 'kind', title: section || kind.label, kind: 'fields', fields: take([kind, ...brought]) })
  }
  const items = itemsField(category)
  const factFields = fields.filter(
    (f) =>
      !placed.has(f.key) &&
      f.key !== items?.key &&
      !f.audienceKey &&
      (isBadge(f) || caveatParts.has(f.key) || audienceFlags.has(f.key)) &&
      !(isBadge(f) && !f.filterable && fixedPlace(f.key) === 'about'),
  )
  const facts = factFields.filter((f) => !namedKeys.has(f.key) && !shabbosKeys.has(f.key) && !boxKeys.has(f.key) && !(allSections && audienceFlags.has(f.key)))
  // The certificate's link goes under the hechsher, not with the website
  // (the user, Oct 11), unless the admin put it in a box of its own.
  const hechsher = facts.findIndex((f) => f.caveat)
  if (hechsher >= 0) {
    const links = fields.filter(
      (f) => isCertificateLink(f) && !placed.has(f.key) && !f.audienceKey && !namedKeys.has(f.key) && !shabbosKeys.has(f.key) && !boxKeys.has(f.key),
    )
    facts.splice(hechsher + 1, 0, ...links)
  }
  if (allSections) take(fields.filter((f) => audienceFlags.has(f.key)))
  if (facts.length > 0) rows.push({ id: 'facts', title: factsTitle(facts), kind: 'fields', fields: take(facts) })

  // 3 · The listing's boxes, in its order, each as the admin arranged it
  // in Fields (fieldBoxes.ts): its name, its fields, the address and phone
  // where they were put (the user, Nov 10: editing follows the listing;
  // admins arrange it). The davening times keep their own rows, wherever
  // they are; a week of hours from Contact has its own, after it (Oct 11).
  const all = new Map(fields.map((f) => [f.key, f]))
  const audienceRow = (flagKey: string): EditorRow[] => {
    const flag = all.get(flagKey)
    const own = take(fields.filter((f) => f.audienceKey === flagKey && f.renderAs !== 'hidden'))
    return flag && (details[flagKey] || allSections) ? [{ id: `audience:${flagKey}`, title: flag.filterLabel ?? flag.label, kind: 'audience', fields: own, flag: flagKey }] : []
  }
  const minyanRows = (minyanim: CategoryField): EditorRow[] => [
    { id: 'minyans:weekday', title: 'Usual weekday times', kind: 'minyans', fields: [minyanim], box: 'weekday' },
    { id: 'minyans:shabbos', title: 'Usual Shabbos times', kind: 'minyans', fields: [minyanim], box: 'shabbos' },
    // This week's, or that there's no minyan this week (the user, Oct 23).
    // No Yom Tov schedules row (the user, Oct 11): a shul doesn't have
    // those ahead of time; they're added when posted, from the listing's
    // own schedule box.
    ...(week ? [{ id: 'minyans:this_week', title: 'This week’s schedule', kind: 'minyans' as const, fields: [minyanim], box: 'this_week' as const, week }] : []),
    // An admin's too (the user, Oct 31): a newsletter before Shabbos is about next week.
    ...(nextWeek ? [{ id: 'minyans:next_week', title: 'Next week’s schedule', kind: 'minyans' as const, fields: [minyanim], box: 'this_week' as const, week: nextWeek }] : []),
  ]
  for (const box of shownBoxes) {
    if (box.id === 'hidden') continue
    if (box.id.startsWith('audience:')) {
      rows.push(...audienceRow(box.id.slice(9)))
      continue
    }
    // Its fields, each with its parts (Delivery's link), not yet in a row.
    const seen = new Set<string>()
    const inBox = box.fields
      .flatMap((k) => {
        const f = all.get(k)
        return f ? [f, ...partsOf(f, fields)] : []
      })
      .filter((f) => !placed.has(f.key) && !seen.has(f.key) && seen.add(f.key))
    // A list, the davening times or the people to call: rows of their own.
    // People to call in an admin's box are edited in that box, together.
    const isBig = (f: CategoryField) => f.type === 'minyanim' || f.key === items?.key || (f.type === 'contacts' && box.kind !== 'admin')
    const big = inBox.filter(isBig)
    const contactBox = box.id === 'contact'
    const hoursOut = contactBox ? inBox.filter((f) => f.type === 'hours' && !f.audienceKey) : []
    // What Contact edits with the address and phone: links and short
    // lines, and a long text put there; anything else is a row of its own.
    const small = inBox.filter(
      (f) =>
        !isBig(f) &&
        !hoursOut.includes(f) &&
        !f.audienceKey &&
        (!contactBox || f.type === 'url' || f.type === 'text' || f.type === 'tel' || f.type === 'number' || (f.type === 'textarea' && fixedPlace(f.key) === 'contact')),
    )
    const basics = box.basics ?? []
    const id = contactBox ? 'contact' : box.id === 'about' || box.id === 'main' || box.id === 'shabbos' || box.id === 'items' || box.id === 'caveat' ? box.id : box.id.startsWith('contacts:') ? `box:${box.id.slice(9)}` : box.id.startsWith('box:') ? `box:${box.title}` : box.id
    const title = contactBox ? contactTitle(basics.includes('address'), basics.includes('phone'), small) : box.title
    // A box of just one list is that list's row, by the box's name.
    const alone = small.length === 0 && basics.length === 0 && big.length === 1
    if (splitContact && (basics.length > 0 || contactBox)) {
      // A job keeps each one (the Places listing, Nov 1).
      for (const b of basics) rows.push({ id: `contact:${b}`, title: b === 'address' ? 'Address' : 'Phone', kind: 'contact', fields: [], part: b })
      if (contactBox) {
        for (const f of take(small)) if (fieldIsVisible(f, details)) rows.push({ id: `field:${f.key}`, title: f.label, kind: 'fields', fields: [f] })
      } else if (small.length > 0) rows.push({ id, title, kind: 'fields', fields: take(small) })
    } else if (small.length > 0 || basics.length > 0) {
      rows.push({ id, title, kind: basics.length > 0 ? 'contact' : 'fields', fields: take(small), ...(basics.length > 0 && { basics }) })
    }
    for (const f of big) {
      take([f])
      if (f.type === 'minyanim') rows.push(...minyanRows(f))
      else if (f.key === items?.key) rows.push({ id: 'items', title: alone ? box.title : f.label, kind: 'items', fields: [f] })
      else rows.push({ id: `box:${f.key}`, title: alone ? box.title : f.label, kind: 'fields', fields: [f] })
    }
    // A place with a section per audience shows its hours in those.
    if (audienceFlags.size === 0) for (const f of hoursOut) rows.push({ id: hoursOut.length > 1 ? `hours:${f.key}` : 'hours', title: hoursOut.length > 1 ? f.label : 'Hours', kind: 'fields', fields: take([f]) })
  }
  // A section with no box of its own: its fields have no row of their own.
  for (const flagKey of audienceFlags) if (!rows.some((r) => r.flag === flagKey)) rows.push(...audienceRow(flagKey))
  // Hours left out of Contact for a mikvah's sections aren't offered.
  if (audienceFlags.size > 0) take(fields.filter((f) => f.type === 'hours' && !f.audienceKey))

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

/** The section switches a draft's writing asks for: on where its section has
 *  anything written, off where it hasn't. */
export function sectionFlags(category: Pick<CategoryConfig, 'detailFields'>, details: Record<string, unknown>): Record<string, boolean> {
  const fields = category.detailFields
  const flags = new Set(fields.map((f) => f.audienceKey).filter((k): k is string => !!k))
  return Object.fromEntries([...flags].map((flag) => [flag, fields.some((f) => f.audienceKey === flag && !blank(f, details[f.key]))]))
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
  if (row.kind === 'minyans' && row.week) {
    if (weekRowEmpty(row, d)) return ''
    const post = weekPostOf(row, d)!
    return [weekDates(row.week), ...(isNoMinyan(post) ? ['No minyan'] : weekRowsFor(readSchedules(d[schedulesKey(row.fields[0].key)]), row.week).map((m) => minyanText(m, timeText)))].join(' · ')
  }
  if (row.kind === 'minyans') {
    const rows = minyanimForBox(isMinyanim(d[row.fields[0].key]) ? (d[row.fields[0].key] as Minyan[]) : [], row.box!)
    return rows.map((m) => minyanText(m, timeText)).join(' · ')
  }
  if (row.kind === 'items') {
    const f = row.fields[0]
    const all = [...selectValues(d[f.key]), ...selectValues(d[`${f.key}_sometimes`])]
    const items = all.length === 0 ? '' : `${all.length} · ${all.slice(0, 5).join(', ')}${all.length > 5 ? '…' : ''}`
    return [items, hasMenuLink(row, d) && MENU_LINK_LABEL].filter(Boolean).join(' · ')
  }
  const parts: string[] = []
  if (row.part === 'address') parts.push(values.address.trim())
  else if (row.part === 'phone') parts.push(values.phone.trim())
  else if (row.kind === 'contact') {
    if (rowHas(row, 'address') && values.address.trim()) parts.push(values.address.split(',')[0].trim())
    if (rowHas(row, 'phone') && values.phone.trim()) parts.push(values.phone.trim())
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

/** A food place's menu link, typed on its Main dishes screen (menuLink.ts):
 *  it fills that row, dishes or none (the user, Oct 20). */
function hasMenuLink(row: EditorRow, d: Record<string, unknown>): boolean {
  return itemWording(row.fields[0]).noun === 'dish' && typeof d[MENU_LINK_KEY] === 'string' && (d[MENU_LINK_KEY] as string).trim() !== ''
}

/** Nothing in the row yet: it goes under "Not on the listing yet". The
 *  name row never does. */
export function rowIsEmpty(row: EditorRow, values: EditorValues): boolean {
  if (row.kind === 'name') return false
  const d = values.details
  if (row.kind === 'minyans' && row.week) return weekRowEmpty(row, d)
  if (row.kind === 'minyans') return minyanimForBox(isMinyanim(d[row.fields[0].key]) ? (d[row.fields[0].key] as Minyan[]) : [], row.box!).length === 0
  if (row.kind === 'items') return blank(row.fields[0], d[row.fields[0].key]) && selectValues(d[`${row.fields[0].key}_sometimes`]).length === 0 && !hasMenuLink(row, d)
  if (row.part) return !(row.part === 'address' ? values.address : values.phone).trim()
  if ((rowHas(row, 'address') && values.address.trim()) || (rowHas(row, 'phone') && values.phone.trim())) return false
  return row.fields.every((f) => (f.invertDisplay ? true : blank(f, d[f.key])))
}

/** Whether the draft changes what this row says (marked "Changed" on the
 *  list, and counted on Send). Field by field, not by which screen was
 *  opened: picking a new address from Google changes the name and hours
 *  rows too, and they're marked. */
export function rowChanged(row: EditorRow, item: DirectoryResource, values: EditorValues): boolean {
  const d = values.details
  if (row.kind === 'name' && !sameFieldValue('name', item.name, values.name)) return true
  if (row.part === 'address') return !sameFieldValue('address', item.address, values.address)
  if (row.part === 'phone') return !sameFieldValue('phone', item.phone, values.phone)
  if (rowHas(row, 'address') && !sameFieldValue('address', item.address, values.address)) return true
  if (rowHas(row, 'phone') && !sameFieldValue('phone', item.phone, values.phone)) return true
  if (row.kind === 'minyans' && row.week) {
    const sk = schedulesKey(row.fields[0].key)
    return weekDiffers(readSchedules(item[sk]), readSchedules(d[sk]), row.week)
  }
  if (row.kind === 'minyans') {
    const key = row.fields[0].key
    const was = isMinyanim(item[key]) ? (item[key] as Minyan[]) : []
    const now = isMinyanim(d[key]) ? (d[key] as Minyan[]) : []
    // By what each minyan says, not its id: the editor gives the rows
    // stored without one an id when a box is opened, and the other box's
    // rows go back with them.
    return boxText(minyanimForBox(was, row.box!)) !== boxText(minyanimForBox(now, row.box!))
  }
  // A food place's menu link is typed on its Main dishes screen.
  if (row.kind === 'items' && itemWording(row.fields[0]).noun === 'dish' && MENU_LINK_KEY in d && !sameFieldValue('url', item[MENU_LINK_KEY], d[MENU_LINK_KEY])) return true
  return row.fields.some((f) => {
    if (!fieldIsVisible(f, d) && !fieldIsVisible(f, item)) return false
    const after = fieldIsVisible(f, d) ? d[f.key] : undefined
    if (f.type === 'contacts') return !sameContacts(item[f.key], after)
    if (f.type === 'tags' && !sameFieldValue('tags', item[`${f.key}_sometimes`], d[`${f.key}_sometimes`])) return true
    return !sameFieldValue(f.type, item[f.key], after)
  })
}

/** The week post a "This week's schedule" row edits, in these details. */
function weekPostOf(row: EditorRow, details: Record<string, unknown>) {
  return weekPostFor(readSchedules(details[schedulesKey(row.fields[0].key)]), row.week!)
}

/** Whether the week has nothing to say: no post, or one with no times
 *  dated in it that isn't a no-minyan week. */
function weekRowEmpty(row: EditorRow, details: Record<string, unknown>) {
  const post = weekPostOf(row, details)
  return !post || (!isNoMinyan(post) && weekRowsFor(readSchedules(details[schedulesKey(row.fields[0].key)]), row.week!).length === 0)
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
