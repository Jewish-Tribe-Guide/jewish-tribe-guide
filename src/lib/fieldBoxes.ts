import type { CategoryField, FieldType } from './categories'
import { arrange, basicPlace, basicToken, BASICS, cardFieldChoices, FIXED_PLACES, LEAD_SLOTS, type Basic, type FixedPlace, type LeadSlot, type ListingParts } from './listingParts'
import { underName } from './cardLines'
import { partKeys } from './fieldParts'
import { caveatTitle } from './listingView'

// ── A page's fields, as its opened listing's boxes (Category pages step 3,
// boards 17-19) ─────────────────────────────────────────────────────────────
// Site → Category pages → a page → Fields lists the boxes a visitor sees on
// one of its places, in the order they see them, each with the fields in it.
// Where a field lands is worked out the way the listing works it out
// (listingView.ts, ListingView.tsx), never from the page's name:
//
//   (no Top)      the photo is the listing's, with the name, and isn't in
//                 the list (Nov 10, board A: "just boxes and fields"); what
//                 shows under the name is each field's own Under the name.
//   the listing's own sections, where its fields put them: Delivery's own
//                 box, What isn't kosher (the hechsher's), the davening
//                 times, the items ("Main dishes"), a mikvah's sections.
//                 Dragged among each other, saved as ListingParts.lead.
//   the admin's   the card it opens with, the boxes ("Who to call"), the
//                 Shabbos card among them: named, moved, taken off, and
//                 any field a card can show dropped into them
//                 (listingParts.ts).
//   a list of contacts in no box, as a box of its own.
//   Contact       address, phone, hours, links, short lines. Always there.
//   About         the descriptions. Always there once there is one.
//
// Any field goes in any box (the user, Nov 10): a long text in Contact, a
// phone in About, hours in "Who to call". A field that draws a whole box (the
// davening times, a list of items or contacts, Delivery, a hechsher) is a
// box of its own until it's put in one of the admin's, where it's drawn
// the same (the user, Nov 10: "Let's say same for now").
//
// Hechsher and Delivery are one field each, always (the user, Nov 10: "If
// they are one field then they should be one field always"): a row of its
// own, its parts never rows, and the listing draws them as it always has
// (the hechsher under the name, its caveat in the amber box, its
// certificate a button; Delivery its own box).
//
// A field stays in the box it's in (the user, Nov 10, round 3: "these
// hidden rules do not work for me"). It lands in the box whose + Add a field
// was clicked and moves only when dragged. A field with parts (a hechsher,
// Delivery details: fieldParts.ts) is one row, and its parts go with it.
//
// Every box moves, anywhere between Top and "Not on the listing", and any
// box can be taken off, its fields with it (the user, Nov 10: "Can't we
// just have boxes and fields and an admin can arrange how they want?").
// The order is saved as ListingParts.order (arrange).
//
// A field is moved by dragging it onto another box's row: one list, the
// opened box's fields among the boxes (fieldItems), read back by readOrder.

export type FieldBox = {
  /** 'lead:<link>', 'caveat', 'main', 'minyanim', 'items',
   *  'audience:<flag>', 'box:<n>' (the admin's nth), 'shabbos',
   *  'contacts:<key>', 'contact', 'about', 'hidden'. */
  id: string
  title: string
  /** 'fixed': Contact, About. 'listing': where the listing puts its
   *  own fields. 'admin': the admin's own, named and changed here. */
  kind: 'fixed' | 'listing' | 'admin'
  /** Every box but "Not on the listing". */
  moves: boolean
  /** The listing's main thing, before the admin's boxes until moved: a
   *  mikvah's sections are one, and move together. */
  lead?: LeadSlot
  /** Field keys, in the order the box shows them. */
  fields: string[]
  /** Contact's address and phone, first, which are the page's own. */
  basics?: ('address' | 'phone')[]
}

export type FieldPage = {
  fields: readonly CategoryField[]
  /** Kept with a field, not shown on their own (a hechsher's caveat flag
   *  and note: its parts). */
  hiddenFields?: readonly CategoryField[]
  hasAddress: boolean
  hasPhone: boolean
}

const isBadge = (f: CategoryField) => (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' && (f.type === 'boolean' || f.type === 'select')

/** Where a field goes when it's in none of the admin's boxes. */
export function homeOf(f: CategoryField, page: FieldPage): string {
  // Another field's part goes where that field is, and isn't a row.
  if (partKeys([...page.fields, ...(page.hiddenFields ?? [])]).has(f.key)) return 'part'
  if (f.renderAs === 'hidden') return 'hidden'
  if (f.audienceKey) return `audience:${f.audienceKey}`
  // A hechsher: its caveat is the amber box (What isn't kosher).
  if (f.caveat) return 'caveat'
  // Delivery: the words of a link's own box, the link its part; or a
  // link's own box with no words.
  const lead = page.fields.find((o) => o.type === 'url' && o.leadBox?.text === f.key)
  if (lead) return `lead:${lead.key}`
  if (f.type === 'url' && f.leadBox) return `lead:${f.key}`
  // The place's photo is with its name.
  if (f.type === 'image') return 'name'
  if (f.type === 'minyanim') return 'minyanim'
  if (f.type === 'tags' && f.showCountInHeader) return 'items'
  if (f.type === 'contacts') return `contacts:${f.key}`
  if (f.type === 'textarea') return 'about'
  return 'contact'
}

/** Whether a field goes in whichever box it's put in: one whose own home
 *  is Contact or About, not one that is a box itself. */
export const movable = (f: CategoryField, page: FieldPage) => ['contact', 'about'].includes(homeOf(f, page))

/** Where a field is: Contact or About when the admin put it there, else
 *  its own home. */
function placedHome(f: CategoryField, page: FieldPage, parts: ListingParts): string {
  const home = homeOf(f, page)
  // Anything goes in Contact or About (the user, Nov 10: "anything takes
  // anything"): a field that's a box of its own too, once it's put there.
  if (home !== 'contact' && home !== 'about' && !takesAnywhere(f, page)) return home
  return FIXED_PLACES.find((p) => parts[p]?.includes(f.key)) ?? home
}

/** A field that can go in any box: one Contact or About has, or one a
 *  card can show (the davening times, a list, Delivery, a hechsher). */
const takesAnywhere = (f: CategoryField, page: FieldPage) => movable(f, page) || cardFieldChoices([f]).length > 0

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
  for (const f of fields) {
    if (placed.has(f.key)) continue
    const home = placedHome(f, page, parts)
    if (home === 'part') continue
    homes.set(home, [...(homes.get(home) ?? []), f.key])
  }
  const listing = (id: string, title: string): FieldBox[] => {
    const keys = homes.get(id)
    return keys?.length ? [{ id, title, kind: 'listing', moves: false, fields: keys }] : []
  }
  const prefixed = (prefix: string, title: (key: string) => string): FieldBox[] =>
    [...homes.keys()].filter((id) => id.startsWith(prefix)).flatMap((id) => listing(id, title(id.slice(prefix.length))))
  const label = (key: string) => byKey.get(key)?.label ?? key

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
  // The address and phone: Contact's unless put elsewhere (the user, Nov
  // 10: "move all fields. Including address and phone").
  const pageHas = { address: page.hasAddress, phone: page.hasPhone }
  const basicsAt = (id: string) => BASICS.filter((b) => pageHas[b] && basicPlace(parts, b) === id)
  const withBasics = (id: string) => (basicsAt(id).length ? { basics: basicsAt(id) } : {})
  const zone: FieldBox[] = [
    ...boxes.map((b, n) => ({ id: `box:${n}`, title: b.title, kind: 'admin' as const, moves: true, fields: b.fields, ...withBasics(`box:${n}`) })),
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
  const basics = basicsAt('contact')
  const contact: FieldBox[] =
    basics.length || homes.get('contact')?.length ? [{ id: 'contact', title: 'Contact', kind: 'fixed', moves: false, fields: homes.get('contact') ?? [], basics }] : []
  const about: FieldBox[] =
    homes.get('about')?.length || basicsAt('about').length ? [{ id: 'about', title: 'About', kind: 'fixed', moves: false, fields: homes.get('about') ?? [], ...withBasics('about') }] : []
  const middle = [...before, ...zone, ...contact, ...about].map((b) => ({ ...b, moves: true }))
  return [...(parts.order ? arrange(middle, parts.order) : middle), ...listing('hidden', 'Not on the listing')]
}

/** A box's token in the saved order: its id, but 'box' for each of the
 *  admin's, in turn (their ids are their places among them). */
export const boxToken = (id: string) => (id.startsWith('box:') ? 'box' : id)

/** The tokens of an order of boxes, "Not on the listing" left out. */
const tokensOf = (ids: readonly string[]) => ids.filter((id) => id !== 'hidden').map(boxToken)

/** Whether a box of the listing's own can become one of the admin's: every
 *  field in it is one a card can show. Not "Not on the listing", nor a
 *  mikvah's section, whose fields belong to its switch. */
export function ownable(box: FieldBox, page: FieldPage): boolean {
  if (box.kind !== 'listing' || box.id === 'hidden' || box.id.startsWith('audience:') || !box.fields.length) return false
  const fields = box.fields.map((k) => page.fields.find((f) => f.key === k))
  return fields.every((f) => !!f && cardFieldChoices([f]).length > 0)
}

/** A box of the listing's own made one of the admin's, in its place, with
 *  its name (or `title`) and fields: what adding to it, dragging into it or
 *  renaming it does (the user, Nov 10: "existing boxes not being editable").
 *  Its new id; the admin's boxes after it move up one. Any other box, as it
 *  is. `shown` is the boxes as they are. */
export function ownBox(parts: ListingParts, shown: readonly FieldBox[], id: string, page: FieldPage, title?: string): { parts: ListingParts; id: string } {
  const at = shown.findIndex((b) => b.id === id)
  const box = shown[at]
  if (!box || !ownable(box, page)) return { parts, id }
  const n = shown.slice(0, at).filter((b) => b.id.startsWith('box:')).length
  const boxes = [...(parts.boxes ?? [])]
  boxes.splice(n, 0, { title: title ?? box.title, fields: [...box.fields] })
  const order = tokensOf(shown.map((b) => (b.id === id ? 'box:' : b.id)))
  const out: ListingParts = { ...parts, boxes, order, ...(parts.shabbos && { shabbos: { fields: parts.shabbos.fields } }) }
  delete out.lead
  return { parts: out, id: `box:${n}` }
}

/** The id a box has once `owned` became the admin's nth: itself `box:n`, and
 *  the admin's from n on one further along. */
function afterOwning(id: string, owned: string, n: number): string {
  if (id === owned) return `box:${n}`
  if (!id.startsWith('box:')) return id
  const k = Number(id.slice(4))
  return k >= n ? `box:${k + 1}` : id
}

/** Whether a box's name is changed in place: the admin's, and every other
 *  of the listing's own, which then becomes the admin's (ownBox). A box's
 *  name is never a field's: a field is renamed on its own screen (the
 *  user, Nov 10). Not the Shabbos card, Contact or About, which every
 *  listing has. */
export function boxRenames(box: FieldBox, page: FieldPage): boolean {
  if (box.kind === 'admin') return box.id !== 'shabbos'
  return ownable(box, page)
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
  const says = [...(isBadge(f) && f.filterable ? ['Filter'] : []), ...(underName(f) ? ['Under the name'] : [])]
  if (says.length) return says.join(' · ')
  if (f.type === 'url' && f.linkLabel?.trim()) return `Button: ${f.linkLabel.trim()}`
  return undefined
}

/** Whether a box can take this field: every box takes any field (the user,
 *  Nov 10: "anything takes anything"; "existing boxes not being editable"),
 *  the davening times, a list, Delivery and a hechsher among them. A box of
 *  the listing's own becomes one of the admin's when it takes one (ownBox).
 *  Not "Not on the listing", nor a mikvah's section, whose fields are its
 *  switch's. */
function boxTakes(box: FieldBox, f: CategoryField, page: FieldPage): boolean {
  if (box.kind === 'admin' || ownable(box, page)) return cardFieldChoices([f]).length > 0
  if (box.id === 'contact' || box.id === 'about') return takesAnywhere(f, page)
  return homeOf(f, page) === box.id
}

/** Where a field added from a box's "+ Add a field" lands: in that box
 *  ('here'), or nowhere from there ('elsewhere'), which the picker doesn't
 *  offer. Never another box (the user, Nov 9: "sometimes I'll click add a
 *  field under a specific box and it gets added under a different box";
 *  Nov 10: "these hidden rules do not work for me"). */
export function whereAdded(box: FieldBox, f: CategoryField, page: FieldPage): 'here' | 'elsewhere' {
  return boxTakes(box, f, page) ? 'here' : 'elsewhere'
}

/** Whether a field is a box of its own until it's put in one of the
 *  admin's: the davening times, a list of items or contacts, an
 *  audience's section, Delivery, a hechsher (What isn't kosher). */
export const makesBox = (f: CategoryField, page: FieldPage) => !['name', 'contact', 'about', 'hidden', 'part'].includes(homeOf(f, page))

/** A field made here, from a box's + Add a field: a row. In the filter and
 *  Under the name are its own switches. */
export function madeField(type: FieldType, label: string, key: string): CategoryField {
  return { key, label, type, renderAs: 'row', madeHere: true }
}

/** The page's own address, phone, hours and website: always Contact's. */
export const basicsLandIn = (box: FieldBox) => box.id === 'contact'

// ── Dragging ─────────────────────────────────────────────────────────────────

/** One row of the drag list: a box's head, its address and phone, its
 *  fields, and the end of it (its + Add a field and trash can). Every box
 *  is open (the user, Nov 10, board E1b); a box given as `open` alone is
 *  for the tests that still read one box at a time. */
export type FieldItem = { box: FieldBox } | { basic: 'address' | 'phone' } | { field: string } | { end: string }

export const itemKey = (i: FieldItem) => ('box' in i ? `box:${i.box.id}` : 'basic' in i ? `basic:${i.basic}` : 'field' in i ? `field:${i.field}` : `end:${i.end}`)

export function fieldItems(boxes: readonly FieldBox[], open: string | null | 'all' = 'all'): FieldItem[] {
  return boxes.flatMap((box): FieldItem[] =>
    open === 'all' || box.id === open ? [{ box }, ...(box.basics ?? []).map((basic) => ({ basic })), ...box.fields.map((field) => ({ field })), { end: box.id }] : [{ box }],
  )
}

/** The rows a box's head carries when it's dragged: everything under it,
 *  to its end. */
export function rowsOfBox(items: readonly FieldItem[], id: string): string[] {
  const at = items.findIndex((i) => 'box' in i && i.box.id === id)
  if (at < 0) return []
  const out: string[] = []
  for (const i of items.slice(at + 1)) {
    if ('box' in i) break
    out.push(itemKey(i))
  }
  return out
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

/** Why an order isn't one the listing can take: null when it is. With the
 *  box that turned a field down, for drawing it so (`at`). */
export function orderProblem(prev: readonly FieldItem[], next: readonly FieldItem[], page: FieldPage): { at?: string; why?: string } | null {
  if (!next.length || !('box' in next[0])) return {}
  const was = owners(prev)
  const now = owners(next)
  const boxes = next.flatMap((i) => ('box' in i ? [i.box] : []))
  const boxIds = boxes.map((b) => b.id)
  const prevIds = prev.flatMap((i) => ('box' in i ? [i.box.id] : []))
  if (boxIds.join('\n') !== prevIds.join('\n')) {
    // A box moved: anywhere after Top and before "Not on the listing", and
    // nothing changes box.
    const still = (ids: string[]) => ids.filter((id) => !boxes.find((b) => b.id === id)?.moves).join('\n')
    if (still(boxIds) !== still(prevIds)) return {}
    const hiddenAt = boxIds.indexOf('hidden')
    if (hiddenAt >= 0 && hiddenAt !== boxIds.length - 1) return {}
    for (const [k, box] of now) if (was.get(k) !== box) return {}
    return null
  }
  // A box's end stays under it, last.
  for (const [k, box] of now) if (k.startsWith('end:') && box !== was.get(k)) return {}
  for (let n = 0; n < next.length - 1; n++) if ('end' in next[n] && !('box' in next[n + 1])) return {}
  const byKey = new Map([...page.fields, ...(page.hiddenFields ?? [])].map((f) => [f.key, f]))
  // The address and phone go in any box but the Shabbos card, a card it
  // opens with, a mikvah's section and "Not on the listing".
  for (const [k, box] of now) {
    if (!k.startsWith('basic:') || box === was.get(k)) continue
    const target = boxes.find((b) => b.id === box)
    if (!target) return {}
    if (!takesBasic(target, page)) return { at: target.id, why: `${k === 'basic:address' ? 'Address' : 'Phone'} can’t go in ${target.title}` }
  }
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
  // A field dropped into a box of the listing's own makes it the admin's
  // first, in its place.
  const to = [...owners(next)].find(([k, box]) => (k.startsWith('field:') || k.startsWith('basic:')) && box !== owners(prev).get(k) && box && !box.startsWith('box:'))?.[1]
  const target = to ? prev.find((i): i is { box: FieldBox } => 'box' in i && i.box.id === to)?.box : undefined
  if (target && ownable(target, page)) {
    const shown = prev.flatMap((i) => ('box' in i ? [i.box] : []))
    const own = ownBox(parts, shown, to!, page)
    const n = Number(own.id.slice(4))
    const remap = (items: readonly FieldItem[]): FieldItem[] =>
      items.map((i) =>
        'box' in i ? { box: { ...i.box, id: afterOwning(i.box.id, to!, n), ...(i.box.id === to && { kind: 'admin' as const }) } } : 'end' in i ? { end: afterOwning(i.end, to!, n) } : i,
      )
    return readOrder(remap(prev), remap(next), own.parts, page)
  }
  const was = owners(prev)
  const now = owners(next)
  const open = new Set(prev.flatMap((i) => ('end' in i ? [i.end] : [])))
  const shownIn = (id: string) => next.flatMap((i) => ('field' in i && now.get(itemKey(i)) === id ? [i.field] : []))
  const moved = [...now].filter(([k, box]) => k.startsWith('field:') && box !== was.get(k)).map(([k, box]) => ({ key: k.slice(6), to: box! }))
  const movedKeys = new Set(moved.map((m) => m.key))
  const fieldsOf = (id: string, current: readonly string[]) => {
    if (open.has(id)) return shownIn(id)
    return [...current.filter((k) => !movedKeys.has(k)), ...moved.filter((m) => m.to === id).map((m) => m.key)]
  }

  const out: ListingParts = { ...parts }
  if (parts.main) out.main = { ...parts.main, fields: fieldsOf('main', parts.main.fields) }
  if (parts.shabbos) out.shabbos = { ...parts.shabbos, fields: fieldsOf('shabbos', parts.shabbos.fields) }
  const boxIds = next.flatMap((i) => ('box' in i ? [i.box.id] : []))
  const adminOrder = boxIds.filter((id) => id.startsWith('box:')).map((id) => Number(id.slice(4)))
  if (parts.boxes) out.boxes = adminOrder.map((n) => ({ ...parts.boxes![n], fields: fieldsOf(`box:${n}`, parts.boxes![n].fields) }))
  // A field moved into Contact or About is put there by name; one moved
  // anywhere else is in neither.
  let placedOut: ListingParts = out
  for (const m of moved) placedOut = putInPlace(placedOut, m.key, m.to === 'contact' || m.to === 'about' ? m.to : null)
  Object.assign(out, placedOut)
  for (const p of FIXED_PLACES) if (!placedOut[p]) delete out[p]
  // The address and phone, in the box they're under now.
  for (const i of next) {
    if (!('basic' in i)) continue
    const at = now.get(itemKey(i)) ?? 'contact'
    const placed = placeBasic(out, i.basic, at.startsWith('box:') ? `box:${adminOrder.indexOf(Number(at.slice(4)))}` : at)
    for (const k of Object.keys(out) as (keyof ListingParts)[]) if (!(k in placed)) delete out[k]
    Object.assign(out, placed)
  }

  // The boxes, when they moved: the order, which then decides it all.
  const prevIds = prev.flatMap((i) => ('box' in i ? [i.box.id] : []))
  if (boxIds.join('\n') !== prevIds.join('\n')) {
    out.order = tokensOf(boxIds)
    delete out.lead
    if (out.shabbos) out.shabbos = { fields: out.shabbos.fields }
  }

  // A box of the listing's own, reordered: its fields take each other's
  // places among the page's fields.
  let order: string[] | null = null
  for (const i of prev) {
    if (!('box' in i) || !open.has(i.box.id) || i.box.kind === 'admin' || moved.length > 0) continue
    const shown = shownIn(i.box.id)
    if (shown.join('\n') === i.box.fields.join('\n')) continue
    const keys = page.fields.map((f) => f.key)
    const slots = keys.flatMap((k, n) => (shown.includes(k) ? [n] : []))
    order = [...keys]
    slots.forEach((slot, n) => (order![slot] = shown[n]))
    break
  }
  return { parts: out, order }
}

/** "+ Add a box": a new, empty box at the end, after About (board B), and
 *  its id. `shown` is the boxes as they are, for the order to start from. */
export function addBox(parts: ListingParts, shown: readonly FieldBox[], title = ''): { parts: ListingParts; id: string } {
  const boxes = [...(parts.boxes ?? []), { title, fields: [] }]
  const order = [...tokensOf(shown.map((b) => b.id)), 'box']
  const out: ListingParts = { ...parts, boxes, order, ...(parts.shabbos && { shabbos: { fields: parts.shabbos.fields } }) }
  delete out.lead
  return {
    parts: out,
    id: `box:${boxes.length - 1}`,
  }
}

/** Takes a box off the listing. Its fields come off the page with it,
 *  which the editor does (the user, Nov 10); here, the box itself. */
export function removeBox(parts: ListingParts, id: string): ListingParts {
  const order = parts.order && dropToken(parts.order, id)
  const out = order ? { ...parts, order } : parts
  if (id === 'main') return { ...out, main: undefined }
  if (id === 'shabbos') return { ...out, shabbos: undefined }
  if (!id.startsWith('box:')) return out
  return removeAdminBox(out, id)
}

/** The order without one box's token: the nth 'box' for the admin's nth. */
function dropToken(order: readonly string[], id: string): string[] {
  if (!id.startsWith('box:')) return order.filter((t) => t !== id)
  const n = Number(id.slice(4))
  let seen = -1
  return order.filter((t) => t !== 'box' || ++seen !== n)
}

function removeAdminBox(parts: ListingParts, id: string): ListingParts {
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

/** A field added from a box's own "+ Add a field" goes in that box: one of
 *  the admin's, or Contact or About, by name. Taken out of any other. */
export function addToBox(parts: ListingParts, id: string, key: string): ListingParts {
  const put = (fields: string[]) => (fields.includes(key) ? fields : [...fields, key])
  if (id === 'contact' || id === 'about') return putInPlace(parts, key, id)
  if (id === 'main' && parts.main) return { ...parts, main: { ...parts.main, fields: put(parts.main.fields) } }
  if (id === 'shabbos' && parts.shabbos) return { ...parts, shabbos: { ...parts.shabbos, fields: put(parts.shabbos.fields) } }
  if (!id.startsWith('box:')) return parts
  const n = Number(id.slice(4))
  return { ...parts, boxes: (parts.boxes ?? []).map((b, i) => (i === n ? { ...b, fields: put(b.fields) } : b)) }
}

/** Whether a box takes the address and phone: Contact, About, the admin's
 *  own and a box of the listing's own that becomes the admin's (ownBox). */
function takesBasic(box: FieldBox, page: FieldPage): boolean {
  return box.id === 'contact' || box.id === 'about' || box.id.startsWith('box:') || ownable(box, page)
}

/** From a box's + Add a field: whether it offers the address or phone. */
export const basicLandsIn = (box: FieldBox, page: FieldPage) => takesBasic(box, page)

/** The address or phone put in a box (Contact, About or the admin's nth),
 *  and out of any other. Contact is where it is when nowhere else. In a box
 *  they come first, the address before the phone, as the admin's list and
 *  the listing both draw them. */
export function placeBasic(parts: ListingParts, b: Basic, id: string): ListingParts {
  const t = basicToken(b)
  const out: ListingParts = { ...parts }
  const first = (fields: string[], here: boolean) => {
    const rest = fields.filter((k) => k !== t)
    const tokens = BASICS.map(basicToken).filter((k) => (k === t ? here : rest.includes(k)))
    return [...tokens, ...rest.filter((k) => !tokens.includes(k))]
  }
  if (parts.boxes) out.boxes = parts.boxes.map((x, n) => ({ ...x, fields: first(x.fields, id === `box:${n}`) }))
  const about = [...(parts.about ?? []).filter((k) => k !== t), ...(id === 'about' ? [t] : [])]
  if (about.length) out.about = about
  else delete out.about
  return out
}

/** A field put in Contact or About by name (null: in neither), and out of
 *  the other. */
function putInPlace(parts: ListingParts, key: string, place: FixedPlace | null): ListingParts {
  const out: ListingParts = { ...parts }
  for (const p of FIXED_PLACES) {
    const fields = (parts[p] ?? []).filter((k) => k !== key)
    if (p === place) fields.push(key)
    if (fields.length > 0) out[p] = fields
    else delete out[p]
  }
  return out
}

/** A field's key changed (its name, typed): the boxes follow it. */
export function renameKey(parts: ListingParts, from: string, to: string): ListingParts {
  const swap = (fields: string[]) => fields.map((k) => (k === from ? to : k))
  return {
    ...parts,
    ...(parts.main && { main: { ...parts.main, fields: swap(parts.main.fields) } }),
    ...(parts.shabbos && { shabbos: { ...parts.shabbos, fields: swap(parts.shabbos.fields) } }),
    ...(parts.boxes && { boxes: parts.boxes.map((b) => ({ ...b, fields: swap(b.fields) })) }),
    ...(parts.contact && { contact: swap(parts.contact) }),
    ...(parts.about && { about: swap(parts.about) }),
  }
}
