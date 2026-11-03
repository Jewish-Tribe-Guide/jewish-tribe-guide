import type { CategoryField } from '@/lib/categories'
import type { FieldDiff } from '@/lib/submissionDiff'
import type { Minyan } from '@/lib/davening'
import { timeText } from '@/lib/minyanText'

// A change's two answers on To do, naming what it changes (boards E1Times,
// R5Link, R1Women, R6After; the user, Nov 2: "Not labeled change"). The
// first takes it, as the card has it then; the second leaves the listing.

export type ChangeAnswers = { yes: string; no: string }

const LONG: readonly string[] = ['textarea', 'hours', 'contacts', 'minyanim', 'url', 'image']
const NONE = '—'
const short = (v: string) => v === NONE || (!v.includes('\n') && v.length <= 30)

/** "Women’s Notes" → "Women’s notes": a label inside a sentence. */
const inSentence = (label: string) => label.replace(/ (\S+)/g, (_, w: string) => ` ${w.toLowerCase()}`)
/** "This week’s schedule" → "this week’s schedule"; "Women’s" stays. */
const midSentence = (title: string) => (/^\S+['’]s\b/.test(title) ? title : title[0].toLowerCase() + title.slice(1))

export function changeAnswers({
  changed,
  fields,
  rows,
  minyan,
  items,
}: {
  /** What differs (diffListing's changed rows), in the listing's order. */
  changed: readonly FieldDiff[]
  fields: readonly CategoryField[]
  /** The titles of the card's rows. */
  rows: readonly string[]
  /** One usual minyan whose time alone changed, as the listing writes it. */
  minyan?: { was: string; now: string } | null
  /** A list of items that only gained some. */
  items?: { added: readonly string[]; removed: readonly string[]; noun: 'dish' | 'item' } | null
}): ChangeAnswers {
  if (items && items.added.length > 0 && items.removed.length === 0) {
    const one = items.added.length === 1
    return { yes: one ? `Add ${items.added[0]}` : `Add the ${items.added.length} ${items.noun === 'dish' ? 'dishes' : 'items'}`, no: one ? 'Don’t add it' : 'Don’t add them' }
  }
  if (minyan) return { yes: `Change to ${minyan.now}`, no: `Keep ${minyan.was}` }
  const field = (d: FieldDiff) => fields.find((f) => f.key === d.key)
  // The first short field names it, when the change is in one row.
  const first = rows.length === 1 ? changed.find((d) => !LONG.includes(field(d)?.type ?? '') && short(d.before) && short(d.after)) : undefined
  if (first) {
    if (first.before === NONE) return { yes: `Add ${first.after}`, no: 'Don’t add it' }
    if (first.after === NONE) return { yes: `Remove ${first.before}`, no: `Keep ${first.before}` }
    return { yes: `Change to ${first.after}`, no: `Keep ${first.before}` }
  }
  const one = changed.length === 1 ? field(changed[0]) : undefined
  if (one) return { yes: `Update ${inSentence(one.label)}`, no: 'Don’t update' }
  return { yes: rows.length === 1 ? `Update ${midSentence(rows[0])}` : 'Update the listing', no: 'Don’t update' }
}

const TIME_KEYS = ['time', 'anchor', 'offsetMinutes', 'notBefore', 'notAfter']
const withoutTime = (m: Minyan) => JSON.stringify(Object.entries(m).filter(([k]) => !TIME_KEYS.includes(k)).sort(([a], [b]) => a.localeCompare(b)))

/** The one minyan whose time alone a change moves, as the listing writes
 *  it (E1Times); null when it does anything else, or more. */
export function oneMinyanTime(was: readonly Minyan[], now: readonly Minyan[]): { was: string; now: string } | null {
  if (was.length !== now.length) return null
  const moved = now.filter((m) => {
    const old = was.find((w) => w.id === m.id)
    return !old || JSON.stringify(old) !== JSON.stringify(m)
  })
  if (moved.length !== 1) return null
  const old = was.find((w) => w.id === moved[0].id)
  if (!old || withoutTime(old) !== withoutTime(moved[0])) return null
  const [a, b] = [timeText(old), timeText(moved[0])]
  return a === b ? null : { was: a, now: b }
}
