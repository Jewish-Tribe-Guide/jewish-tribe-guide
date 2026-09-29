import { selectValues, type CategoryConfig, type CategoryField } from './categories'
import { CLOSURE_LABELS, getOpenStatus, hoursNextOpening } from './hours'
import { travelParts } from './listingTravel'
import type { DirectoryResource } from '@/types'

// ── A listing row ────────────────────────────────────────────────────────────
// A directory row is two lines, as in the redesign's mockups: the name and
// where it is, then the facts that decide whether to open it, in the order
// they matter. A third line only when something is off.
//
//   Goldie · Rittenhouse
//   Open until 8 PM · 0.4 mi · Parve · IKC · Restaurant
//   ⚠ Not everything here is kosher
//
//   Fitz on 4th · Queen Village
//   Opens 4 PM · 1.2 mi · Parve · IKC
//
//   GIANT · Center City
//   Open until 10 PM · 0.9 mi · Wine, challah, deli, cheese
//
// Plain text, not chips. The row itself opens the listing, and the filters
// above the list are where to narrow it; a row of pill buttons made every
// fact look like a control and every card look busy. Colour only where it
// means something: green for open, rust for "check first" (closing soon,
// temporarily closed, a hechsher caveat), red for permanently closed.

export type RowFactTone = 'open' | 'caution' | 'closed' | 'minyan' | 'opens' | 'quiet' | 'plain'

export type RowFact = {
  text: string
  tone: RowFactTone
  /** Shown on hover: a caveat's note, say. */
  title?: string
}

/** The badge fields a collapsed row shows: boolean/select fields rendered as
 *  a badge and tied to a filter. Everything else waits for the opened
 *  listing. */
export function rowBadgeFields(category: CategoryConfig): CategoryField[] {
  return category.detailFields.filter((f) => {
    if (f.type === 'tags' || f.type === 'url' || f.type === 'hours' || f.type === 'minyanim' || f.type === 'image') return false
    if ((f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) !== 'badge') return false
    return !!f.filterable
  })
}

/** "7:00 PM" → "7 PM"; "6:30 PM" stays. */
function shortTime(label: string): string {
  return label.replace(/:00(?= [AP]M$)/, '')
}

export function listingRowFacts(
  item: DirectoryResource,
  category: CategoryConfig,
  now: Date,
  opts: {
    nextMinyan?: string | null
    /** A field the row's group heading already says ("Orthodox
     *  (Ashkenazi) · 7" above seven rows): left off the row. */
    omitKey?: string | null
  } = {},
): RowFact[] {
  const facts: RowFact[] = []
  const fields = category.detailFields
  const hoursKeys = fields.filter((f) => f.type === 'hours').map((f) => f.key)

  const { isOpen, closing, closure } = getOpenStatus(item, hoursKeys, now)
  if (closure) {
    facts.push({ text: CLOSURE_LABELS[closure], tone: closure === 'permanent' ? 'closed' : 'caution' })
  } else if (isOpen) {
    // 11:59 PM is how "open till midnight" is stored; it isn't a time anyone
    // would say. Overnight hours give no closing label at all.
    const until = closing && closing.closeLabel !== '11:59 PM' ? shortTime(closing.closeLabel) : null
    if (closing?.closesSoon && until) facts.push({ text: `Closes soon · ${until}`, tone: 'caution' })
    else facts.push({ text: until ? `Open until ${until}` : 'Open', tone: 'open' })
  } else if (hoursKeys.length > 0) {
    // When it opens next, which is what someone deciding where to go wants
    // from a closed place. A place with no hours, or saved as closed every
    // day, says so rather than looking closed. Hours written as free text
    // (from before hours had a shape) say nothing: they can't be read.
    const next = hoursKeys.map((k) => hoursNextOpening(item[k], now)).find((n) => n !== null)
    const unreadable = hoursKeys.some((k) => typeof item[k] === 'string' && (item[k] as string).trim())
    if (next) facts.push({ text: `Opens ${next}`, tone: 'opens' })
    else if (!unreadable) facts.push({ text: 'No hours listed', tone: 'quiet' })
  }

  if (opts.nextMinyan) facts.push({ text: opts.nextMinyan, tone: 'minyan' })

  const travel = travelParts(item)
  if (travel.length > 0) facts.push({ text: travel[0].text, tone: 'plain' })

  // The items themselves, for a tags field the admin opted in
  // (showCountInHeader): "Wine, challah, deli, cheese", or "Pretzel buns,
  // donuts, brie +3". Names say far more than "12 kosher items" did.
  const itemsField = fields.find((f) => f.type === 'tags' && f.showCountInHeader)
  const items = itemsField ? rowItems(item, itemsField.key) : null
  // A badge saying what the items already say ("Kosher Items" beside a list
  // of kosher items) is left out, but only that value: "Kosher store"
  // says something the items don't, and stays.
  const repeats = (field: CategoryField, label: string) =>
    !!items && field.key === itemsField?.countReplacesKey && saysTheSame(label, itemsField)

  for (const f of rowBadgeFields(category)) {
    if (f.key === opts.omitKey) continue
    const present = f.type === 'boolean' ? !!item[f.key] : selectValues(item[f.key]).length > 0
    if (!present) continue
    const values = f.type === 'select' ? selectValues(item[f.key]) : [f.filterLabel ?? f.label]
    for (const v of values) {
      // The option's current label, so a renamed option shows at once.
      const text = f.options?.find((o) => o.value === v)?.label ?? v
      if (repeats(f, text)) continue
      // A hechsher's caveat is the row's third line now (listingRowNote),
      // where a phone can read it; a hover title was all it had.
      facts.push({ text, tone: 'plain' })
    }
  }

  if (items) facts.push({ text: items, tone: 'plain' })

  return facts
}


/** Whether a badge's value says what an items field already does: every
 *  word of "Kosher Items" is in "Kosher items available". */
function saysTheSame(label: string, itemsField: CategoryField): boolean {
  const known = new Set(wordsOf(`${itemsField.label} ${itemsField.countLabel ?? ''}`))
  return wordsOf(label).every((w) => known.has(w))
}

const wordsOf = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g)?.map((w) => w.replace(/s$/, '')) ?? []

/** "Wine, challah, deli, cheese" or "Pretzel buns, donuts, brie +3": up to
 *  four named, or three and how many more. Items a place has only sometimes
 *  come after, marked. See itemCase for the capitals. */
export function rowItems(item: DirectoryResource, key: string): string | null {
  const names = (k: string) => selectValues(item[k]).map((v) => v.trim()).filter(Boolean)
  const all = [...names(key).map((name) => ({ name, sometimes: false })), ...names(`${key}_sometimes`).map((name) => ({ name, sometimes: true }))]
  if (all.length === 0) return null
  const shown = all.length <= 4 ? all : all.slice(0, 3)
  const text = shown.map((v, i) => `${itemCase(v.name, i === 0)}${v.sometimes ? ' (sometimes)' : ''}`).join(', ')
  return all.length > shown.length ? `${text} +${all.length - shown.length}` : text
}

/** How an item reads mid-line. Items are often typed in Title Case
 *  ("Cheddar Cheese"), which isn't how anyone writes a list, so an item with
 *  every word capitalised is lowercased; one with only some ("Pas Yisroel
 *  bread") has a name in it and is left alone, as is an abbreviation (OU).
 *  The first item starts with a capital. */
function itemCase(item: string, first: boolean): string {
  const parts = item.split(' ')
  const isAbbrev = (w: string) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)
  const titleCase = parts.every((w) => isAbbrev(w) || /^[A-Z][^A-Z]*$/.test(w))
  const cased = titleCase ? parts.map((w) => (isAbbrev(w) ? w : w.toLowerCase())).join(' ') : item
  return first ? cased[0].toUpperCase() + cased.slice(1) : cased
}

export type RowNote = {
  text: string
  tone: 'caution' | 'quiet' | 'quote'
  /** Something off (a caveat, nobody confirmed), which every row shows;
   *  or the admin's own note, which only a category page's row does (other
   *  lists show that note their own way). */
  kind: 'exception' | 'note'
  title?: string
}

/** A row's third line, which only something out of the ordinary gets: a
 *  hechsher that doesn't cover everything, or nobody having confirmed the
 *  listing. Failing those, a short note the admin put on the row (a hotel's
 *  "Electronic keys, but reception will open the door"). One line at most,
 *  the most important first.
 *
 *  `flagUnconfirmed` is the category's call (see GenericDirectory): a row
 *  says "Not confirmed by anyone yet" only where most of its list is vouched
 *  for. Where most isn't, every row would say it, and a line on every row
 *  tells nobody anything. */
export function listingRowNote(
  item: DirectoryResource,
  category: CategoryConfig,
  now: Date,
  opts: { flagUnconfirmed?: boolean } = {},
): RowNote | null {
  const fields = category.detailFields
  for (const f of rowBadgeFields(category)) {
    if (!f.caveat || !item[f.caveat.flagField]) continue
    const present = f.type === 'boolean' ? !!item[f.key] : selectValues(item[f.key]).length > 0
    if (!present) continue
    // The opened listing's own words for it. Not the flag field's label:
    // that's the form's question, and a form may ask it the other way round
    // ("Everything here is kosher?"). What isn't kosher, when someone wrote
    // it, on hover and in the opened listing.
    const note = String(item[f.caveat.noteField] ?? '').trim()
    return { text: 'Not everything here is kosher', tone: 'caution', kind: 'exception', title: note || undefined }
  }

  // Minyan times come from the community, never from Google, so a shul's
  // are unconfirmed until a person confirms them, whatever Google synced.
  const minyanKeys = fields.filter((f) => f.type === 'minyanim').map((f) => f.key)
  const hasTimes = minyanKeys.some((k) => Array.isArray(item[k]) && (item[k] as unknown[]).length > 0)
  if (hasTimes && !item.confirmedAt) return { text: 'Times not confirmed by anyone yet', tone: 'quiet', kind: 'exception' }
  if (!hasTimes && opts.flagUnconfirmed && !isVouchedFor(item, now)) return { text: 'Not confirmed by anyone yet', tone: 'quiet', kind: 'exception' }

  const noteField = fields.find(
    (f) => (f.type === 'text' || f.type === 'textarea') && f.showInHeader && String(item[f.key] ?? '').trim(),
  )
  if (noteField) {
    const text = String(item[noteField.key]).trim()
    // A longer note is someone's report of the place, and quoted as one; a
    // short tagline ("Vegan pizzeria") is just said.
    return noteField.type === 'textarea' ? { text: `“${text}”`, tone: 'quote', kind: 'note' } : { text, tone: 'quiet', kind: 'note' }
  }
  return null
}

/** Whether anyone stands behind a listing now: a person confirmed it, or
 *  Google refreshed it in the last two weeks. The nightly sync touches every
 *  place Google still knows, so a fortnight without one means Google has
 *  lost it. */
export function isVouchedFor(item: DirectoryResource, now: Date): boolean {
  if (item.confirmedAt) return true
  const synced = item.googleSyncedAt ? Date.parse(item.googleSyncedAt) : NaN
  return Number.isFinite(synced) && now.getTime() - synced < 14 * 24 * 60 * 60 * 1000
}

/** "Shlomo's Fish Market" → "SF"; "ALDI" → "AL"; "The Kosher Grill" → "KG". For a
 *  listing with no photo of its own: a place is told apart by its name, and
 *  the category's icon repeated down a list of one category tells nothing. */
export function initialsOf(name: string): string {
  const all = name.replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const words = all.length > 1 && all[0].toLowerCase() === 'the' ? all.slice(1) : all
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
