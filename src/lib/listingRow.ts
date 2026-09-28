import { selectValues, type CategoryConfig, type CategoryField } from './categories'
import { CLOSURE_LABELS, getOpenStatus, isStructuredHours } from './hours'
import { travelParts } from './listingTravel'
import type { DirectoryResource } from '@/types'

// ── A listing row's second line ──────────────────────────────────────────────
// A directory row is two lines, as in the redesign's mockups: the name, then
// the facts that decide whether to open it, in the order they matter.
//
//   Open until 7 PM · 1.2 mi · Parve · IKC
//   Mincha 6:34 PM · 0.4 mi · Chabad
//   Temporarily closed · 3.1 mi · Meat
//
// Plain text, not chips. The row itself opens the listing, and the filters
// above the list are where to narrow it; a row of pill buttons made every
// fact look like a control and every card look busy. Colour only where it
// means something: green for open, rust for "check first" (closing soon,
// temporarily closed, a hechsher caveat), red for permanently closed.

export type RowFactTone = 'open' | 'caution' | 'closed' | 'minyan' | 'plain'

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
  opts: { nextMinyan?: string | null } = {},
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
  } else if (hoursKeys.some((k) => isStructuredHours(item[k]))) {
    facts.push({ text: 'Closed now', tone: 'plain' })
  }

  if (opts.nextMinyan) facts.push({ text: opts.nextMinyan, tone: 'minyan' })

  const travel = travelParts(item)
  if (travel.length > 0) facts.push({ text: travel[0].text, tone: 'plain' })

  // "12 kosher items", for a tags field the admin opted in (showCountInHeader).
  // Both the always and the sometimes arrays are real items.
  const countField = fields.find((f) => f.type === 'tags' && f.showCountInHeader)
  const count = countField ? selectValues(item[countField.key]).length + selectValues(item[countField.key + '_sometimes']).length : 0
  // A badge the count already says ("Kosher Items" next to "12 kosher
  // items") is left out, but only when there is a count to say it.
  const replaced = count > 0 ? countField?.countReplacesKey : undefined

  for (const f of rowBadgeFields(category)) {
    if (f.key === replaced) continue
    const present = f.type === 'boolean' ? !!item[f.key] : selectValues(item[f.key]).length > 0
    if (!present) continue
    const note = f.caveat && item[f.caveat.flagField] ? String(item[f.caveat.noteField] ?? '').trim() : null
    const values = f.type === 'select' ? selectValues(item[f.key]) : [f.filterLabel ?? f.label]
    for (const v of values) {
      // The option's current label, so a renamed option shows at once.
      const text = f.options?.find((o) => o.value === v)?.label ?? v
      facts.push(
        note === null
          ? { text, tone: 'plain' }
          : { text, tone: 'caution', title: note || 'Not everything here is kosher — please verify.' },
      )
    }
  }

  if (count > 0 && countField) {
    // countLabel is a singular noun ("kosher item"); a field's own label, the
    // fallback, is often already plural ("Kosher Items available").
    const noun = countField.countLabel ?? countField.label.toLowerCase()
    facts.push({ text: `${count} ${count === 1 || noun.endsWith('s') ? noun : `${noun}s`}`, tone: 'plain' })
  }

  return facts
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
