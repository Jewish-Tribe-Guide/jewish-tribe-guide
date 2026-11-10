import type { DirectoryResource } from '@/types'
import { fieldIsVisible, pickableOptions, selectValues, type CategoryConfig, type CategoryField } from './categories'
import { listingRowFacts, type RowFact, type RowFactTone } from './listingRow'
import { lineChoices, onThirdLine, underName } from './cardLines'
import { isCertificateLink, kindField, listingActions, listingFacts, listingKind } from './listingView'
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

/** What a made-up place says for a field, by its type. The second and third
 *  places (the list's other rows) pick the next choice and close earlier. */
export function sampleAnswer(field: CategoryField, place = 0): unknown {
  switch (field.type) {
    case 'text':
      return ['Open late on Thursdays', 'Catering for simchas', 'Fresh challah on Fridays'][place % 3]
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
      const options = pickableOptions(field)
      const one = options[options.length > 0 ? place % options.length : 0]?.value ?? 'A choice'
      return field.multiSelect ? [one] : one
    }
    case 'tags': {
      const some = (field.options ?? []).slice(place, place + 3).map((o) => o.value)
      return some.length > 0 ? some : ['Challah', 'Wine', 'Deli']
    }
    case 'hours':
      return place === 0 ? SAMPLE_HOURS : closingAt(SAMPLE_HOURS, place === 1 ? '20:00' : '18:00')
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

function closingAt(hours: StructuredHours, close: string): StructuredHours {
  return Object.fromEntries(Object.entries(hours).map(([day, h]) => [day, h && day !== 'fri' ? { ...h, close } : h])) as StructuredHours
}

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

/** The sample card's place: "A restaurant", or "A place" for a page
 *  whose name is no one place's ("Food"). */
export function sampleName(label: string, plural: string): string {
  const one = label.trim()
  return one && one.toLowerCase() !== plural.trim().toLowerCase() ? `A ${one.toLowerCase()}` : 'A place'
}

/** A place answering every field on the page, the open one included. */
export function madeUpPlace(category: CategoryConfig, name: string): DirectoryResource {
  return madeUpPlaces(category, name)[0].item
}

export type MadeUp = { item: DirectoryResource; /** Beside the name on a row: "Rittenhouse". */ where: string | null }

const SAMPLE_MILES = [0.3, 0.6, 4.1]

/** "A bakery", "An eatery"; null for a kind that isn't one place's noun
 *  ("Scheduled Deliveries", "Ice cream & treats"). */
function kindName(kind: string | undefined): string | null {
  const k = kind?.trim().toLowerCase()
  if (!k || /[&/,]/.test(k) || k.split(/\s+/).length > 2 || /[^s]s$/.test(k)) return null
  return `${/^[aeiou]/.test(k) ? 'An' : 'A'} ${k}`
}

/** The list's three made-up places (board 33d): the first is the one the
 *  other tabs show; the next two pick the field's next choices, so the
 *  list shows what it does for different answers. Each is named for its
 *  type of place where that's a noun ("A bakery"), and placed in the
 *  community's own neighbourhoods when it has a list of them. No address,
 *  so no Directions; a phone where the page has one. A field asked only
 *  after another answer (`askedWhen`: Delivery Details, once Store Type is
 *  Scheduled Deliveries) has that answer given; every other field asked
 *  only after one is left out where it wouldn't be asked, as the site
 *  leaves it out. */
export function madeUpPlaces(
  category: CategoryConfig,
  name: string,
  areas: readonly string[] = [],
  askedWhen?: CategoryField['showIf'],
): MadeUp[] {
  // Named for a kind only when the field says what type of place it is
  // (Store Type), not something about it (Denomination: "An orthodox").
  const kind = [kindField(category)].find((f) => f && /\b(type|kind)\b/i.test(f.label)) ?? null
  const used = new Set<string>()
  return SAMPLE_MILES.map((miles, i) => {
    const item: DirectoryResource = { id: i === 0 ? 'made-up' : `made-up-${i}`, category: category.id, name, anchorId: 'all', distance: miles, address: '', milesFromCenter: miles }
    if (category.hasPhone !== false) item.phone = '2155550100'
    for (const f of category.detailFields) {
      const v = sampleAnswer(f, i)
      if (v !== undefined) item[f.key] = v
    }
    if (askedWhen) {
      const trigger = category.detailFields.find((f) => f.key === askedWhen.field)
      item[askedWhen.field] = trigger?.multiSelect ? [askedWhen.equals] : askedWhen.equals
    }
    for (const f of category.detailFields) if (!fieldIsVisible(f, item as Record<string, unknown>)) delete item[f.key]
    const own = kind ? kindName(answerText(kind, item[kind.key])) : null
    // Never two places by one name: a kind already used goes by its number.
    const fresh = own && !used.has(own) ? own : null
    item.name = i === 0 ? (name === 'A place' && fresh ? fresh : name) : (fresh ?? (i === 1 ? 'Another place' : 'A third place'))
    used.add(item.name)
    return { item, where: areas[i] ?? null }
  })
}

/** The page and place with one field gone: what's left when it's taken
 *  off. */
function without(category: CategoryConfig, item: DirectoryResource, key: string): [CategoryConfig, DirectoryResource] {
  const rest = { ...item }
  delete rest[key]
  return [{ ...category, detailFields: category.detailFields.filter((f) => f.key !== key) }, rest]
}

/** What's in `all` and not in `rest`, each once: the open field's part. */
function partsOf(all: readonly (string | RowFact)[], rest: readonly string[]): Part[] {
  const left = [...rest]
  return all.map((one) => {
    const { text, tone } = typeof one === 'string' ? { text: one, tone: undefined } : one
    const i = left.indexOf(text)
    const mine = i < 0
    if (!mine) left.splice(i, 1)
    return tone && tone !== 'plain' ? { text, mine, tone } : { text, mine }
  })
}

/** A piece of a line, and whether it's the open field's. `tone` as the row
 *  colours it (green for open). */
export type Part = { text: string; mine: boolean; tone?: RowFactTone }

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
    all.filter((f) => !f.ownLine),
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
  const boxes = listingBoxes(category)
  const box = boxes.find((b) => b.fields.includes(field.key))
  // Up in the header: the photo, a certificate's button.
  if (!box || field.type === 'image' || isCertificateLink(field)) return { at: 'tagline', text: text || field.label }
  const others = boxes.filter((b) => b !== box && (b.fields.length > 0 || (b.basics?.length ?? 0) > 0)).map((b) => b.title)
  const inBox = box.fields.length + (box.basics?.length ?? 0) > 1
  return { at: 'box', title: box.title, label: inBox ? field.label : null, text: field.type === 'url' && field.linkLabel ? field.linkLabel : text, others }
}

function listingBoxes(category: CategoryConfig) {
  const page = {
    fields: category.detailFields.filter((f) => f.renderAs !== 'hidden'),
    hiddenFields: category.detailFields.filter((f) => f.renderAs === 'hidden'),
    hasAddress: category.hasAddress !== false,
    hasPhone: category.hasPhone !== false,
  }
  return fieldBoxes(page, parseListingParts(category.listingParts)).filter((b) => b.id !== 'hidden')
}

export type ListingScreen = {
  /** "Restaurant", beside where it is. */
  kind: Part[]
  /** The bold line: open now, then the facts. */
  facts: Part[]
  tagline: Part | null
  /** The buttons under the name, Share last. No Directions: the made-up
   *  place has no address. */
  actions: { label: string; icon: 'call' | 'website' | 'certificate' | 'email' | 'link' | 'share' }[]
  /** The listing's boxes in order, each with what it says. */
  boxes: { title: string; lines: string[]; mine: boolean; label: string | null }[]
  /** Where the field is, or 'none' when it isn't on the listing. */
  at: ListingLook['at']
}

/** The whole opened listing of the made-up place (board 33f), the open
 *  field marked where listingLook puts it. */
export function listingScreen(category: CategoryConfig, field: CategoryField, item: DirectoryResource): ListingScreen {
  const look = listingLook(category, field, item)
  const kindText = listingKind(item, category)
  const kind: Part[] = look.at === 'kind' ? look.parts : kindText ? [{ text: kindText, mine: false }] : []
  const status = listingRowFacts(item, category, SAMPLE_NOW).find((f) => f.tone === 'open' || f.tone === 'opens' || f.tone === 'caution')
  const hoursMine = field.type === 'hours' && look.at !== 'none'
  const facts: Part[] = [
    ...(status ? [{ text: status.text, mine: hoursMine, tone: status.tone }] : []),
    ...(look.at === 'facts' ? look.parts : listingFacts(item, category).map((text) => ({ text, mine: false }))),
  ]
  const taglineField = category.detailFields.find((f) => f.type === 'text' && f.showInHeader && f.headerMaxLength != null && answerText(f, item[f.key]))
  const tagline: Part | null =
    look.at === 'tagline' ? { text: look.text, mine: true } : taglineField ? { text: answerText(taglineField, item[taglineField.key]), mine: false } : null
  const { buttons } = listingActions(item, category)
  const actions: ListingScreen['actions'] = buttons.flatMap((a): ListingScreen['actions'] => {
    if (a.kind === 'call') return [{ label: 'Call', icon: 'call' }]
    if (a.kind === 'email') return [{ label: 'Email', icon: 'email' }]
    if (a.kind === 'link') {
      const label = a.field.linkLabel ?? a.field.label
      const icon = /website/i.test(`${a.field.key} ${label}`) ? ('website' as const) : isCertificateLink(a.field) ? ('certificate' as const) : ('link' as const)
      return [{ label: icon === 'website' ? 'Website' : label, icon }]
    }
    return []
  })
  actions.push({ label: 'Share', icon: 'share' })
  const byKey = new Map(category.detailFields.map((f) => [f.key, f]))
  const boxes = listingBoxes(category)
    .flatMap((b): ListingScreen['boxes'] => {
      const mine = look.at === 'box' && b.fields.includes(field.key)
      // What isn't kosher shows on a place where not everything is; the
      // made-up place says everything is.
      if (b.id === 'caveat' && !mine) return []
      if (mine && look.at === 'box') return [{ title: b.title, lines: [look.text || 'A photo'], mine, label: look.label }]
      const lines = [
        ...(b.basics ?? []).flatMap((basic) => (basic === 'phone' && item.phone ? [formatPhone(item.phone)] : [])),
        ...b.fields.flatMap((key) => {
          const f = byKey.get(key)
          // A "Yes" alone says nothing out of its row; one under the name
          // is said there.
          const text = f && f.type !== 'image' && f.type !== 'boolean' && !underName(f) ? answerText(f, item[key]) : ''
          return text ? [text] : []
        }),
      ].slice(0, 2)
      return lines.length > 0 ? [{ title: b.title, lines, mine, label: null }] : []
    })
  return { kind, facts, tagline, actions, boxes, at: look.at }
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

/** Filters as the sheet shows them (board 33e): Open now first, then the
 *  page's other filters in its order, the open field's marked. */
export function filtersScreen(category: CategoryConfig, field: CategoryField): { key: string; look: FilterLook; mine: boolean }[] {
  const all = category.detailFields.flatMap((f) => {
    const look = filterLook(category, f)
    return look ? [{ key: f.key, look, mine: f.key === field.key }] : []
  })
  const first = (l: FilterLook) => (l.kind === 'switch' && l.label === 'Open now' ? 0 : 1)
  return all.sort((a, b) => first(a.look) - first(b.look))
}

export type AddingRow = { title: string; text: string }

/** The add form around the field (board 33g): the place's name, the row
 *  asked just before the field's, then the field's own row open, its
 *  neighbours in it. `big` when the field is a screen of its own when
 *  adding (hours, minyanim, the people to call, a photo, the items). */
export function addingScreen(
  page: CategoryConfig,
  field: CategoryField,
  item: DirectoryResource,
  askedWhen?: CategoryField['showIf'],
): { before: AddingRow[]; title: string; fields: CategoryField[]; big: boolean } {
  // Asked where the site asks it: a field asked after an answer sits with
  // the question it follows (Delivery Details with Store Type).
  const category = askedWhen ? { ...page, detailFields: page.detailFields.map((f) => (f.key === field.key ? { ...f, showIf: askedWhen } : f)) } : page
  const rows = editorRows(category, item, { allSections: true })
  const at = rows.findIndex((r) => r.fields.some((f) => f.key === field.key))
  const summary = (r: (typeof rows)[number]): AddingRow => ({
    title: r.kind === 'name' ? 'Name' : r.title,
    text: r.kind === 'name' ? item.name : r.fields.map((f) => (f.type === 'image' || f.type === 'boolean' ? '' : answerText(f, item[f.key]))).filter(Boolean).join(' · '),
  })
  const big = field.type === 'hours' || field.type === 'minyanim' || field.type === 'contacts' || field.type === 'image' || field.type === 'tags'
  if (at < 0) return { before: rows.slice(0, 1).map(summary), title: field.label, fields: [field], big }
  const before = [rows[0], at > 1 ? rows[at - 1] : null].filter((r): r is (typeof rows)[number] => !!r && r !== rows[at]).map(summary)
  const row = rows[at]
  const asked = row.fields.filter((f) => f.key === field.key || (f.type !== 'image' && fieldIsVisible(f, item as Record<string, unknown>)))
  return { before, title: row.title, fields: asked, big }
}
