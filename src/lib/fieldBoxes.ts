import type { CategoryField } from './categories'
import { cardFieldChoices, LEAD_SLOTS, type LeadSlot, type ListingParts } from './listingParts'
import { caveatTitle, isCertificateLink } from './listingView'

// ── A page's fields, as its opened listing's boxes (Category pages step 3,
// boards 17-19) ─────────────────────────────────────────────────────────────
// Site → Category pages → a page → Fields lists the boxes a visitor sees on
// one of its places, in the order they see them, each with the fields in it.
// Where a field lands is worked out the way the listing works it out
// (listingView.ts, ListingView.tsx), never from the page's name:
//
//   Top           the photo, the line under the name, the filters' facts, a
//                 certificate's button. Always there; never moved.
//   the listing's own sections, where its fields put them: a link's own box
//                 ("Delivery"), what isn't kosher, the davening times, the
//                 items ("Main dishes"), a mikvah's sections. Dragged among
//                 each other (board 4), saved as ListingParts.lead.
//   the admin's   the card it opens with, the boxes ("Who to call"), the
//                 Shabbos card among them: named, moved, taken off, and
//                 any field a card can show dropped into them
//                 (listingParts.ts).
//   a list of contacts in no box, as a box of its own.
//   Contact       address, phone, hours, links, short lines. Always there.
//   About         the descriptions. Always there once there is one.
//
// A field is moved by dragging it onto another box's row: one list, the
// opened box's fields among the boxes (fieldItems), read back by readOrder.

export type FieldBox = {
  /** 'top', 'lead:<key>', 'caveat', 'main', 'minyanim', 'items',
   *  'audience:<flag>', 'box:<n>' (the admin's nth), 'shabbos',
   *  'contacts:<key>', 'contact', 'about', 'hidden'. */
  id: string
  title: string
  /** 'fixed': Top, Contact, About. 'listing': where the listing puts its
   *  own fields. 'admin': the admin's own, named and changed here. */
  kind: 'fixed' | 'listing' | 'admin'
  /** The admin's boxes and the Shabbos card: dragged among each other.
   *  So are the listing's own boxes before them, by their `lead`. */
  moves: boolean
  /** Which of the listing's own boxes before the admin's it is: a mikvah's
   *  sections are one, its main thing, and move together. */
  lead?: LeadSlot
  /** Field keys, in the order the box shows them. */
  fields: string[]
  /** Contact's address and phone, first, which are the page's own. */
  basics?: ('address' | 'phone')[]
}

export type FieldPage = {
  fields: readonly CategoryField[]
  /** Kept with a field, not shown on their own (a hechsher's caveat flag
   *  and note). */
  hiddenFields?: readonly CategoryField[]
  hasAddress: boolean
  hasPhone: boolean
}

const isBadge = (f: CategoryField) => (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' && (f.type === 'boolean' || f.type === 'select')

/** Where a field goes when it's in none of the admin's boxes. */
export function homeOf(f: CategoryField, page: FieldPage): string {
  const all = [...page.fields, ...(page.hiddenFields ?? [])]
  if (all.some((o) => o.caveat && (o.caveat.flagField === f.key || o.caveat.noteField === f.key))) return 'caveat'
  if (f.renderAs === 'hidden') return 'hidden'
  if (f.audienceKey) return `audience:${f.audienceKey}`
  // A link with its own box, and that box's words.
  if (f.type === 'url' && f.leadBox) return `lead:${f.key}`
  const lead = page.fields.find((o) => o.type === 'url' && o.leadBox?.text === f.key)
  if (lead) return `lead:${lead.key}`
  if (f.type === 'image' || f.showInHeader || (isBadge(f) && f.filterable) || f.caveat || isCertificateLink(f)) return 'top'
  if (f.type === 'minyanim') return 'minyanim'
  if (f.type === 'tags' && f.showCountInHeader) return 'items'
  if (f.type === 'contacts') return `contacts:${f.key}`
  if (f.type === 'textarea') return 'about'
  return 'contact'
}

/** The boxes, in the listing's order. */
export function fieldBoxes(page: FieldPage, parts: ListingParts): FieldBox[] {
  const fields = page.fields
  const byKey = new Map([...fields, ...(page.hiddenFields ?? [])].map((f) => [f.key, f]))
  const choices = new Set(cardFieldChoices(fields).map((f) => f.key))
  // The admin's boxes hold what a card can show, once each.
  const placed = new Set<string>()
  const own = (keys: readonly string[]) =>
    keys.filter((k) => {
      if (!choices.has(k) || placed.has(k)) return false
      placed.add(k)
      return true
    })
  const main = parts.main ? own(parts.main.fields) : null
  const boxes = (parts.boxes ?? []).map((b) => ({ title: b.title, fields: own(b.fields) }))
  const shabbos = parts.shabbos ? own(parts.shabbos.fields) : null

  const homes = new Map<string, string[]>()
  for (const f of [...fields, ...(page.hiddenFields ?? []).filter((h) => homeOf(h, page) === 'caveat')]) {
    if (placed.has(f.key)) continue
    const home = homeOf(f, page)
    homes.set(home, [...(homes.get(home) ?? []), f.key])
  }
  const listing = (id: string, title: string): FieldBox[] => {
    const keys = homes.get(id)
    return keys?.length ? [{ id, title, kind: 'listing', moves: false, fields: keys }] : []
  }
  const prefixed = (prefix: string, title: (key: string) => string): FieldBox[] =>
    [...homes.keys()].filter((id) => id.startsWith(prefix)).flatMap((id) => listing(id, title(id.slice(prefix.length))))
  const label = (key: string) => byKey.get(key)?.label ?? key

  const top: FieldBox = { id: 'top', title: 'Top', kind: 'fixed', moves: false, fields: homes.get('top') ?? [] }
  const slot = (lead: LeadSlot) => (b: FieldBox): FieldBox => ({ ...b, moves: true, lead })
  const slots: Record<LeadSlot, FieldBox[]> = {
    link: prefixed('lead:', (k) => byKey.get(k)?.leadBox?.title.trim() || label(k)).map(slot('link')),
    caveat: listing('caveat', caveatTitle(fields)).map(slot('caveat')),
    main: [
      ...(main ? [{ id: 'main', title: parts.main!.title, kind: 'admin' as const, moves: false, fields: main }] : []),
      ...listing('minyanim', 'Davening times'),
      ...listing('items', label(homes.get('items')?.[0] ?? '')),
      ...prefixed('audience:', (k) => byKey.get(k)?.filterLabel ?? label(k)),
    ].map(slot('main')),
  }
  const before = (parts.lead ?? LEAD_SLOTS).flatMap((s) => slots[s])
  // The admin's boxes, then lists of contacts in none, with the Shabbos card
  // after `after` of them, or after them all.
  const zone: FieldBox[] = [
    ...boxes.map((b, n) => ({ id: `box:${n}`, title: b.title, kind: 'admin' as const, moves: true, fields: b.fields })),
    ...prefixed('contacts:', label),
  ]
  // A box with nothing in it isn't on the listing, so isn't counted.
  if (shabbos) {
    const after = parts.shabbos!.after
    let at = zone.length
    if (after !== undefined) {
      let seen = 0
      at = zone.findIndex((b) => b.fields.length > 0 && ++seen > after)
      if (at < 0) at = zone.length
    }
    zone.splice(at, 0, { id: 'shabbos', title: 'This Shabbos', kind: 'admin', moves: true, fields: shabbos })
  }
  const basics = [...(page.hasAddress ? ['address' as const] : []), ...(page.hasPhone ? ['phone' as const] : [])]
  const contact: FieldBox[] =
    basics.length || homes.get('contact')?.length ? [{ id: 'contact', title: 'Contact', kind: 'fixed', moves: false, fields: homes.get('contact') ?? [], basics }] : []
  const about: FieldBox[] = homes.get('about')?.length ? [{ id: 'about', title: 'About', kind: 'fixed', moves: false, fields: homes.get('about')! }] : []
  return [top, ...before, ...zone, ...contact, ...about, ...listing('hidden', 'Not on the listing')]
}

/** Whether a box's name is changed in place: the admin's, and the boxes the
 *  listing makes itself, each named by a field (renameListingBox). Not the
 *  Shabbos card, Top, Contact or About, which every listing has, nor the
 *  davening times, whose boxes are named by what's in them. */
export const boxRenames = (box: FieldBox) =>
  box.kind === 'admin' ? box.id !== 'shabbos' : box.kind === 'listing' && box.id !== 'minyanim' && box.id !== 'hidden'

/** A renamed box's name as it's typed: what's saved, which can be empty
 *  while it's retyped, and what the listing says when it is. */
export function boxName(page: FieldPage, box: FieldBox): { value: string; placeholder: string } {
  const field = page.fields.find((f) => f.key === renameListingBox(page, box.id, '')?.key)
  if (!field || box.kind === 'admin') return { value: box.title, placeholder: 'New box' }
  if (box.id.startsWith('lead:')) return { value: field.leadBox?.title ?? '', placeholder: field.label }
  if (box.id === 'caveat') return { value: field.caveat?.title ?? 'What isn’t kosher', placeholder: 'What isn’t kosher' }
  if (box.id.startsWith('audience:')) return { value: field.filterLabel ?? field.label, placeholder: field.label }
  return { value: field.label, placeholder: 'New box' }
}

/** Renaming a box the listing makes itself renames the field it's named by:
 *  a link's own box ("Delivery"), the items ("Main dishes"), a list of
 *  contacts, an audience's section, what isn't kosher. */
export function renameListingBox(page: FieldPage, id: string, title: string): { key: string; patch: Partial<CategoryField> } | null {
  const field = (key: string) => page.fields.find((f) => f.key === key)
  if (id.startsWith('lead:')) {
    const f = field(id.slice(5))
    return f?.leadBox ? { key: f.key, patch: { leadBox: { ...f.leadBox, title } } } : null
  }
  if (id.startsWith('contacts:')) return field(id.slice(9)) ? { key: id.slice(9), patch: { label: title } } : null
  if (id.startsWith('audience:')) return field(id.slice(9)) ? { key: id.slice(9), patch: { filterLabel: title } } : null
  if (id === 'items') {
    const f = page.fields.find((o) => homeOf(o, page) === 'items')
    return f ? { key: f.key, patch: { label: title } } : null
  }
  if (id === 'caveat') {
    const f = page.fields.find((o) => o.caveat)
    return f ? { key: f.key, patch: { caveat: { ...f.caveat!, title } } } : null
  }
  return null
}

/** A box's line: its fields' names, the address and phone first. */
export function boxLine(box: FieldBox, page: FieldPage): string {
  const byKey = new Map([...page.fields, ...(page.hiddenFields ?? [])].map((f) => [f.key, f]))
  return [...(box.basics ?? []).map((b) => (b === 'address' ? 'Address' : 'Phone')), ...box.fields.map((k) => byKey.get(k)?.label || 'New field')].join(', ')
}

/** A field's line inside its box: what it is on the listing, where that
 *  isn't plain from its name. */
export function fieldLine(f: CategoryField): string | undefined {
  if (f.type === 'contacts') return 'A list of contacts'
  if (isBadge(f) && f.filterable) return 'Filter'
  if (f.type === 'url' && f.linkLabel?.trim()) return `Button: ${f.linkLabel.trim()}`
  return undefined
}

/** Whether a box can take this field: the admin's take what a card can
 *  show; any other only what goes there anyway. */
function boxTakes(box: FieldBox, f: CategoryField, page: FieldPage): boolean {
  if (box.kind === 'admin') return cardFieldChoices([f]).length > 0
  return homeOf(f, page) === box.id
}

// ── Dragging ─────────────────────────────────────────────────────────────────

/** One row of the drag list: a box, or, under the opened one, its address
 *  and phone, its fields and the end of it (its Add and trash can). */
export type FieldItem = { box: FieldBox } | { basic: 'address' | 'phone' } | { field: string } | { end: string }

export const itemKey = (i: FieldItem) => ('box' in i ? `box:${i.box.id}` : 'basic' in i ? `basic:${i.basic}` : 'field' in i ? `field:${i.field}` : 'end')

export function fieldItems(boxes: readonly FieldBox[], openId: string | null): FieldItem[] {
  return boxes.flatMap((box): FieldItem[] =>
    box.id === openId ? [{ box }, ...(box.basics ?? []).map((basic) => ({ basic })), ...box.fields.map((field) => ({ field })), { end: box.id }] : [{ box }],
  )
}

/** The box a row is under in this order, or null. */
export function boxOf(items: readonly FieldItem[], key: string): string | null {
  return owners(items).get(key) ?? null
}

/** The box each row is under: the nearest box above it. */
function owners(items: readonly FieldItem[]): Map<string, string | null> {
  const at = new Map<string, string | null>()
  let box: string | null = null
  for (const i of items) {
    if ('box' in i) box = i.box.id
    else at.set(itemKey(i), box)
  }
  return at
}

/** 0 before the admin's boxes, 1 among them, 2 after. */
function zoneOf(box: FieldBox): number {
  if (box.lead) return 0
  if (box.moves || box.id.startsWith('contacts:')) return 1
  if (box.id === 'contact' || box.id === 'about' || box.id === 'hidden') return 2
  return 0
}

/** Why an order isn't one the listing can take: null when it is. With the
 *  box that turned a field down, for drawing it so (`at`). */
export function orderProblem(prev: readonly FieldItem[], next: readonly FieldItem[], page: FieldPage): { at?: string; why?: string } | null {
  if (!next.length || !('box' in next[0]) || next[0].box.id !== 'top') return {}
  const was = owners(prev)
  const now = owners(next)
  const boxes = next.flatMap((i) => ('box' in i ? [i.box] : []))
  const boxIds = boxes.map((b) => b.id)
  const prevIds = prev.flatMap((i) => ('box' in i ? [i.box.id] : []))
  if (boxIds.join('\n') !== prevIds.join('\n')) {
    // A box moved: only the admin's, among each other, and nothing changes box.
    const still = (ids: string[]) => ids.filter((id) => !boxes.find((b) => b.id === id)?.moves).join('\n')
    if (still(boxIds) !== still(prevIds)) return {}
    const zones = boxes.map(zoneOf)
    if (zones.some((z, n) => n > 0 && z < zones[n - 1])) return {}
    const firstList = boxIds.findIndex((id) => id.startsWith('contacts:'))
    if (firstList >= 0 && boxIds.slice(firstList).some((id) => id.startsWith('box:'))) return {}
    // The listing's own boxes move as theirs do: a mikvah's sections together.
    const leads = boxes.flatMap((b) => (b.lead ? [b.lead] : []))
    if (leads.some((l, n) => n > 0 && l !== leads[n - 1] && leads.indexOf(l) < n)) return {}
    for (const [k, box] of now) if (was.get(k) !== box) return {}
    return null
  }
  // The opened box's address, phone and end stay under it, the end last.
  const open = prev.find((i): i is { end: string } => 'end' in i)?.end
  const end = next.findIndex((i) => 'end' in i)
  for (const [k, box] of now) {
    if (k.startsWith('basic:') || k === 'end') {
      if (box !== open) return {}
    } else if (box === open && end >= 0 && next.findIndex((i) => itemKey(i) === k) > end) return {}
  }
  const byKey = new Map([...page.fields, ...(page.hiddenFields ?? [])].map((f) => [f.key, f]))
  for (const [k, box] of now) {
    if (!k.startsWith('field:') || box === was.get(k)) continue
    const f = byKey.get(k.slice(6))
    const target = boxes.find((b) => b.id === box)
    if (!f || !target) return {}
    if (!boxTakes(target, f, page)) return { at: target.id, why: `${f.label || 'This field'} can’t go in ${target.title}` }
  }
  return null
}

/** What a reordered list says, for the draft: the admin's boxes (which
 *  fields, in what order, the boxes' own order and where the Shabbos card
 *  is) and, for a reordered box of the listing's own, the page's fields'
 *  new order (null when that didn't change). */
export function readOrder(
  prev: readonly FieldItem[],
  next: readonly FieldItem[],
  parts: ListingParts,
  page: FieldPage,
): { parts: ListingParts; order: string[] | null } {
  const was = owners(prev)
  const now = owners(next)
  const open = prev.find((i): i is { end: string } => 'end' in i)?.end ?? null
  const shownIn = (id: string) => next.flatMap((i) => ('field' in i && now.get(itemKey(i)) === id ? [i.field] : []))
  const moved = [...now].filter(([k, box]) => k.startsWith('field:') && box !== was.get(k)).map(([k, box]) => ({ key: k.slice(6), to: box! }))
  const movedKeys = new Set(moved.map((m) => m.key))
  const fieldsOf = (id: string, current: readonly string[]) => {
    if (id === open) return shownIn(id)
    return [...current.filter((k) => !movedKeys.has(k)), ...moved.filter((m) => m.to === id).map((m) => m.key)]
  }

  const out: ListingParts = { ...parts }
  if (parts.main) out.main = { ...parts.main, fields: fieldsOf('main', parts.main.fields) }
  if (parts.shabbos) out.shabbos = { ...parts.shabbos, fields: fieldsOf('shabbos', parts.shabbos.fields) }
  const boxIds = next.flatMap((i) => ('box' in i ? [i.box.id] : []))
  if (parts.boxes) {
    const order = boxIds.filter((id) => id.startsWith('box:')).map((id) => Number(id.slice(4)))
    out.boxes = order.map((n) => ({ ...parts.boxes![n], fields: fieldsOf(`box:${n}`, parts.boxes![n].fields) }))
  }
  // The listing's own boxes, when they moved: their order, unless it's the
  // usual one.
  const leads = [...new Set(next.flatMap((i) => ('box' in i && i.box.lead ? [i.box.lead] : [])))]
  const prevLeads = [...new Set(prev.flatMap((i) => ('box' in i && i.box.lead ? [i.box.lead] : [])))]
  if (leads.join() !== prevLeads.join()) {
    const order = [...leads, ...(parts.lead ?? LEAD_SLOTS).filter((l) => !leads.includes(l))]
    if (order.join() === LEAD_SLOTS.join()) delete out.lead
    else out.lead = order
  }
  // The Shabbos card, when it moved: after however many of the boxes and
  // lists of contacts come before it. After them all stays "after them all".
  const prevIds = prev.flatMap((i) => ('box' in i ? [i.box.id] : []))
  if (parts.shabbos && boxIds.join('\n') !== prevIds.join('\n')) {
    const counted = next.flatMap((i) => ('box' in i && (i.box.id.startsWith('box:') || i.box.id.startsWith('contacts:')) && i.box.fields.length > 0 ? [i.box.id] : []))
    const at = boxIds.indexOf('shabbos')
    const after = counted.filter((id) => boxIds.indexOf(id) < at).length
    out.shabbos = { fields: out.shabbos!.fields, ...(after < counted.length || parts.shabbos.after !== undefined ? { after } : {}) }
  }

  // A box of the listing's own, reordered: its fields take each other's
  // places among the page's fields.
  let order: string[] | null = null
  const openBox = prev.find((i): i is { box: FieldBox } => 'box' in i && i.box.id === open)?.box
  if (openBox && openBox.kind !== 'admin' && moved.length === 0) {
    const shown = shownIn(openBox.id)
    if (shown.join('\n') !== openBox.fields.join('\n')) {
      const keys = page.fields.map((f) => f.key)
      const slots = keys.flatMap((k, n) => (shown.includes(k) ? [n] : []))
      order = [...keys]
      slots.forEach((slot, n) => (order![slot] = shown[n]))
    }
  }
  return { parts: out, order }
}

/** "+ Add a box": a new, empty box, after the admin's others (and before
 *  any list of contacts in none), and its id. */
export function addBox(parts: ListingParts, title = 'New box'): { parts: ListingParts; id: string } {
  const boxes = [...(parts.boxes ?? []), { title, fields: [] }]
  return { parts: { ...parts, boxes }, id: `box:${boxes.length - 1}` }
}

/** Takes one of the admin's boxes off; its fields go back where they go. */
export function removeBox(parts: ListingParts, id: string): ListingParts {
  if (id === 'main') return { ...parts, main: undefined }
  if (id === 'shabbos') return { ...parts, shabbos: undefined }
  const n = Number(id.slice(4))
  const all = parts.boxes ?? []
  const boxes = all.filter((_, i) => i !== n)
  // The Shabbos card stays after the same boxes: one fewer before it when
  // this one was (an empty box isn't counted).
  const after = parts.shabbos?.after
  const counted = all.slice(0, n).filter((b) => b.fields.length > 0).length
  const before = after !== undefined && all[n]?.fields.length && counted < after
  return {
    ...parts,
    boxes: boxes.length ? boxes : undefined,
    ...(parts.shabbos && { shabbos: before ? { ...parts.shabbos, after: after! - 1 } : parts.shabbos }),
  }
}

/** Renames one of the admin's boxes (not the Shabbos card, whose name is
 *  the listing's). */
export function renameBox(parts: ListingParts, id: string, title: string): ListingParts {
  if (id === 'main' && parts.main) return { ...parts, main: { ...parts.main, title } }
  if (!id.startsWith('box:')) return parts
  const n = Number(id.slice(4))
  return { ...parts, boxes: (parts.boxes ?? []).map((b, i) => (i === n ? { ...b, title } : b)) }
}

/** A field added from a box's own "+ Add a field" goes in that box, when
 *  it's one of the admin's and the field can be shown in a card. */
export function addToBox(parts: ListingParts, id: string, key: string): ListingParts {
  const put = (fields: string[]) => (fields.includes(key) ? fields : [...fields, key])
  if (id === 'main' && parts.main) return { ...parts, main: { ...parts.main, fields: put(parts.main.fields) } }
  if (id === 'shabbos' && parts.shabbos) return { ...parts, shabbos: { ...parts.shabbos, fields: put(parts.shabbos.fields) } }
  if (!id.startsWith('box:')) return parts
  const n = Number(id.slice(4))
  return { ...parts, boxes: (parts.boxes ?? []).map((b, i) => (i === n ? { ...b, fields: put(b.fields) } : b)) }
}

/** A field's key changed (its name, typed): the boxes follow it. */
export function renameKey(parts: ListingParts, from: string, to: string): ListingParts {
  const swap = (fields: string[]) => fields.map((k) => (k === from ? to : k))
  return {
    ...parts,
    ...(parts.main && { main: { ...parts.main, fields: swap(parts.main.fields) } }),
    ...(parts.shabbos && { shabbos: { ...parts.shabbos, fields: swap(parts.shabbos.fields) } }),
    ...(parts.boxes && { boxes: parts.boxes.map((b) => ({ ...b, fields: swap(b.fields) })) }),
  }
}
