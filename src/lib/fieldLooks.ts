import type { DirectoryResource } from '@/types'
import { pickableOptions, selectValues, type CategoryConfig, type CategoryField } from './categories'
import { listingRowFacts } from './listingRow'
import { lineChoices, onThirdLine } from './cardLines'
import { kindField, listingFacts } from './listingView'
import { fieldBoxes } from './fieldBoxes'
import { parseListingParts } from './listingParts'
import { editorRows } from './editorRows'
import { formatHoursSummary, type StructuredHours } from './hours'
import { formatMinyanimSummary, type Minyan } from './davening'
import { formatPhone } from './validation'
import { itemFields } from './itemFilter'

// ── A field, how it looks (boards 33c and 34, Nov 9) ─────────────────────────
// Beside a field an admin has open: the field in the places a visitor meets
// it, on a made-up place, in place of the whole page's preview ("a lot of
// noise for someone who just wants to see what the field looks like in
// three scenarios", the user, Nov 9). A listing showed the fullest real
// place, so a new field, with no answers yet, never showed in it at all.
//
// The made-up place answers every field on the page, by its type, so the
// field sits among its neighbours the way it would on a full listing; what
// is the field's own is worked out by taking it off and seeing what goes.
// The answers are general, by type, not per category.

/** What a made-up place says for a field, by its type. */
export function sampleAnswer(field: CategoryField): unknown {
  switch (field.type) {
    case 'text':
      return 'Open late on Thursdays'
    case 'textarea':
      return 'Orders by Wednesday noon for Shabbos. Delivered on Thursdays.'
    case 'tel':
      return '2155550134'
    case 'url':
      return 'https://example.com'
    case 'number':
      return 12
    case 'boolean':
      return true
    case 'select': {
      const first = pickableOptions(field)[0]?.value ?? 'A choice'
      return field.multiSelect ? [first] : first
    }
    case 'tags': {
      const some = (field.options ?? []).slice(0, 3).map((o) => o.value)
      return some.length > 0 ? some : ['Challah', 'Wine', 'Deli']
    }
    case 'hours':
      return SAMPLE_HOURS
    case 'minyanim':
      return SAMPLE_MINYANIM
    case 'contacts':
      return [{ name: 'Front desk', phones: ['2155550134'] }]
    case 'image':
      return undefined
  }
}

const NINE_TO_NINE = { open: '09:00', close: '21:00' }
const SAMPLE_HOURS: StructuredHours = {
  sun: { open: '10:00', close: '18:00' },
  mon: NINE_TO_NINE,
  tue: NINE_TO_NINE,
  wed: NINE_TO_NINE,
  thu: NINE_TO_NINE,
  fri: { open: '09:00', close: '14:00' },
  sat: null,
}
const SAMPLE_MINYANIM: Minyan[] = [
  { id: 'sample-shacharis', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '7:00 AM' },
  { id: 'sample-mincha', tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '6:00 PM' },
]

/** A Wednesday afternoon, so hours say "Open until 9 PM" whatever the day
 *  the admin looks. */
export const SAMPLE_NOW = new Date(2026, 10, 11, 14, 0)

/** The field's answer as words, the way a listing says it. */
export function answerText(field: CategoryField, value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  switch (field.type) {
    case 'select':
      return selectValues(value).map((v) => field.options?.find((o) => o.value === v)?.label ?? v).join(', ')
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'tel':
      return formatPhone(String(value))
    case 'url':
      return String(value).replace(/^https?:\/\//, '').replace(/\/$/, '')
    case 'tags':
      return selectValues(value).join(', ')
    case 'hours':
      return formatHoursSummary(value)
    case 'minyanim':
      return Array.isArray(value) ? formatMinyanimSummary(value as Minyan[]) : ''
    case 'contacts':
      return Array.isArray(value)
        ? (value as { name: string; phones?: string[] }[]).map((c) => [c.name, c.phones?.[0] && formatPhone(c.phones[0])].filter(Boolean).join(' · ')).join('; ')
        : ''
    default:
      return String(value)
  }
}

/** A place answering every field on the page, the open one included. */
export function madeUpPlace(category: CategoryConfig, name: string): DirectoryResource {
  const item: DirectoryResource = { id: 'made-up', category: category.id, name, anchorId: 'all', distance: 0, address: '' }
  for (const f of category.detailFields) {
    const v = sampleAnswer(f)
    if (v !== undefined) item[f.key] = v
  }
  return item
}

/** The page and place with one field gone: what's left when it's taken
 *  off. */
function without(category: CategoryConfig, item: DirectoryResource, key: string): [CategoryConfig, DirectoryResource] {
  const rest = { ...item }
  delete rest[key]
  return [{ ...category, detailFields: category.detailFields.filter((f) => f.key !== key) }, rest]
}

/** What's in `all` and not in `rest`, each once: the open field's part. */
function partsOf(all: readonly string[], rest: readonly string[]): { text: string; mine: boolean }[] {
  const left = [...rest]
  return all.map((text) => {
    const i = left.indexOf(text)
    if (i >= 0) {
      left.splice(i, 1)
      return { text, mine: false }
    }
    return { text, mine: true }
  })
}

export type Part = { text: string; mine: boolean }

export type RowLook = {
  /** The second line, the field's own parts marked. */
  facts: Part[]
  /** A line of its own: the items, or a short line on the third line. */
  own: Part[]
  /** Whether the field shows on the row at all. */
  onRow: boolean
  /** The card line it could go on, when it isn't: the card's picker for it
   *  (boards 20-23). Null where no line takes it. */
  canGoOn: 'second' | 'third' | null
}

/** The field on a category page's row. */
export function rowLook(category: CategoryConfig, field: CategoryField, item: DirectoryResource): RowLook {
  const [restCategory, restItem] = without(category, item, field.key)
  const all = listingRowFacts(item, category, SAMPLE_NOW)
  const rest = listingRowFacts(restItem, restCategory, SAMPLE_NOW)
  const facts = partsOf(
    all.filter((f) => !f.ownLine).map((f) => f.text),
    rest.filter((f) => !f.ownLine).map((f) => f.text),
  )
  const own = partsOf(
    all.filter((f) => f.ownLine).map((f) => f.text),
    rest.filter((f) => f.ownLine).map((f) => f.text),
  )
  const lines = category.detailFields.filter(onThirdLine).map((f) => ({ text: answerText(f, item[f.key]), mine: f.key === field.key })).filter((p) => p.text)
  own.push(...lines)
  const onRow = facts.some((p) => p.mine) || own.some((p) => p.mine)
  const fields = category.detailFields
  const canGoOn = onRow ? null : lineChoices(fields, 'second').some((f) => f.key === field.key) ? 'second' : lineChoices(fields, 'third').some((f) => f.key === field.key) ? 'third' : null
  return { facts, own, onRow, canGoOn }
}

export type ListingLook =
  /** Under the name: what kind of place ("Restaurant"). */
  | { at: 'kind'; parts: Part[] }
  /** The bold facts line under it ("Meat · Keystone-K"). */
  | { at: 'facts'; parts: Part[] }
  /** The short line under the header. */
  | { at: 'tagline'; text: string }
  /** In one of the listing's boxes, its other boxes named under it. */
  | { at: 'box'; title: string; label: string | null; text: string; others: string[] }
  /** Not on the listing (shown only to admins, or nowhere). */
  | { at: 'none' }

/** The field on the opened listing. */
export function listingLook(category: CategoryConfig, field: CategoryField, item: DirectoryResource): ListingLook {
  if (field.renderAs === 'hidden') return { at: 'none' }
  const [restCategory, restItem] = without(category, item, field.key)
  const text = answerText(field, item[field.key])
  if (kindField(category)?.key === field.key) return { at: 'kind', parts: [{ text, mine: true }] }
  const facts = partsOf(listingFacts(item, category), listingFacts(restItem, restCategory))
  if (facts.some((p) => p.mine)) return { at: 'facts', parts: facts }
  // The first short line with a length cap is the listing's tagline
  // (ListingView); any other is in the details.
  const tagline = category.detailFields.find((f) => f.type === 'text' && f.showInHeader && f.headerMaxLength != null && answerText(f, item[f.key]))
  if (tagline?.key === field.key) return { at: 'tagline', text }
  // The listing's boxes as the editor's Fields box lays them out
  // (fieldBoxes.ts): a link's own box (Delivery), What isn't kosher, the
  // admin's boxes, Contact, About.
  const page = {
    fields: category.detailFields.filter((f) => f.renderAs !== 'hidden'),
    hiddenFields: category.detailFields.filter((f) => f.renderAs === 'hidden'),
    hasAddress: category.hasAddress !== false,
    hasPhone: category.hasPhone !== false,
  }
  const boxes = fieldBoxes(page, parseListingParts(category.listingParts)).filter((b) => b.id !== 'hidden')
  const box = boxes.find((b) => b.fields.includes(field.key))
  // Up in the header: the photo, a short line, a certificate's link.
  if (!box || box.id === 'top') return { at: 'tagline', text: text || field.label }
  const others = boxes.filter((b) => b !== box && b.id !== 'top' && (b.fields.length > 0 || (b.basics?.length ?? 0) > 0)).map((b) => b.title)
  const inBox = box.fields.length + (box.basics?.length ?? 0) > 1
  return { at: 'box', title: box.title, label: inBox ? field.label : null, text: field.type === 'url' && field.linkLabel ? field.linkLabel : text, others }
}

export type FilterLook =
  | { kind: 'switch'; label: string }
  | { kind: 'chips'; legend: string; values: { text: string; count?: number }[] }

/** The field in the Filters sheet, while it's in the filter; null when
 *  it isn't, or the sheet has nothing for its type. */
export function filterLook(category: CategoryConfig, field: CategoryField): FilterLook | null {
  if (field.type === 'tags' && itemFields(category).some((f) => f.key === field.key)) {
    const values = selectValues(sampleAnswer(field)).map((text, i) => ({ text, count: 9 - i * 3 }))
    return { kind: 'chips', legend: 'Has', values }
  }
  if (!field.filterable) return null
  if (field.type === 'hours') return { kind: 'switch', label: 'Open now' }
  if (field.type === 'boolean') return { kind: 'switch', label: field.filterLabel ?? field.label }
  if (field.type === 'select') {
    const values = pickableOptions(field).map((o) => ({ text: o.value }))
    return values.length > 0 ? { kind: 'chips', legend: field.filterLabel ?? field.label, values } : null
  }
  return null
}

/** The question asked just before this one when adding a place, for its
 *  faded row, in the add form's order (editorRows.ts): the one before it in
 *  its row or the row before, or the place's name. */
export function askedBefore(category: CategoryConfig, field: CategoryField, item: DirectoryResource): { label: string; text: string } {
  const asked = editorRows(category, item, { splitContact: true, allSections: true }).flatMap((r) =>
    r.kind === 'name'
      ? [{ key: null as string | null, label: 'Name', text: item.name }]
      : r.fields.length === 0
        ? [{ key: null, label: r.title, text: '' }]
        : r.fields.filter((f) => f.type !== 'image').map((f) => ({ key: f.key as string | null, label: f.label, text: answerText(f, item[f.key]) })),
  )
  const at = asked.findIndex((a) => a.key === field.key)
  const before = at > 0 ? asked[at - 1] : asked[0]
  return { label: before.label, text: before.text }
}
