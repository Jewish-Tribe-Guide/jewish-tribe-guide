import type { CategoryField } from './categories'

// ── A place before it's opened (Category pages step 4, boards 20-23) ────────
// The card a category page lists a place on is three lines, and the admin
// chooses what's on two of them:
//
//   First line    the photo (initials when it's off), the name, where it
//                 is, the upvotes.
//   Second line   open or opens at, the distance, then the yes/no and
//                 choice fields chosen for it, in the page's order.
//   Third line    the first that applies: a hechsher that doesn't cover
//                 everything, nobody having confirmed it, then the short
//                 lines chosen for it.
//
// Kept on the fields themselves, so the card needs nothing stored of its
// own: a yes/no or choice field's `onCard`, the photo field's `onCard:
// false`, a short line's `showInHeader`. A field never set keeps the rule
// from before the card could be chosen, a badge with a filter, so no page
// changes until an admin changes it. Being on the card and being a filter
// are separate from here on.

const isChoice = (f: CategoryField) => (f.type === 'boolean' || f.type === 'select') && f.renderAs !== 'hidden'
const isLine = (f: CategoryField) => f.type === 'text' || f.type === 'textarea'

/** Whether a field is on the card's second line. */
export function onSecondLine(f: CategoryField): boolean {
  if (!isChoice(f)) return false
  return f.onCard ?? ((f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' && !!f.filterable)
}

/** Whether a field is one of the third line's short lines. */
export const onThirdLine = (f: CategoryField) => isLine(f) && !!f.showInHeader

export const secondLineFields = (fields: readonly CategoryField[]) => fields.filter(onSecondLine)
export const thirdLineFields = (fields: readonly CategoryField[]) => fields.filter(onThirdLine)

/** What could go on a line, on it or not: the second's yes/no and choice
 *  fields, the third's short lines. */
export function lineChoices(fields: readonly CategoryField[], line: 'second' | 'third'): CategoryField[] {
  return fields.filter(line === 'second' ? isChoice : isLine)
}

/** The photo, or the place's initials: on unless the photo field says off. */
export const photoOnCard = (fields: readonly CategoryField[]) => fields.find((f) => f.type === 'image')?.onCard !== false

/** Putting a field on a line, or taking it off. */
export function cardPatch(f: CategoryField, on: boolean): Partial<CategoryField> {
  return isLine(f) ? { showInHeader: on } : { onCard: on }
}

export type CardPage = {
  fields: readonly CategoryField[]
  hasAddress: boolean
  upvotes: boolean
}

/** What a line shows that nobody chooses, by what the card works out for
 *  itself, in its order. */
export function automaticLines(page: CardPage): Record<'first' | 'second' | 'third', string[]> {
  const has = (type: CategoryField['type']) => page.fields.some((f) => f.type === type)
  return {
    first: ['Name', ...(page.hasAddress ? ['Where it is'] : []), ...(page.upvotes ? ['Upvotes'] : [])],
    second: [...(has('hours') ? ['Open or opens at'] : []), ...(page.hasAddress ? ['Distance'] : [])],
    third: [
      ...(page.fields.some((f) => f.caveat) ? ['Not everything here is kosher'] : []),
      ...(has('minyanim') ? ['Times not confirmed by anyone yet'] : []),
      'Not confirmed by anyone yet',
    ],
  }
}

/** A line's row in the admin: everything on it, in order. */
export function lineSummary(page: CardPage, line: 'first' | 'second' | 'third'): string {
  const auto = automaticLines(page)[line]
  if (line === 'first') {
    const [name, ...rest] = auto
    const head = rest.length ? `${name} · ${rest.map((r) => r.toLowerCase()).join(', ')}` : name
    return photoOnCard(page.fields) && page.fields.some((f) => f.type === 'image') ? `Photo, ${head}` : head
  }
  const chosen = (line === 'second' ? secondLineFields : thirdLineFields)(page.fields).map((f) => f.label)
  return [...auto, ...chosen].join(', ') || 'Nothing in it yet'
}

/** A chosen field's line under its name: its choices, or how long it is. */
export function cardFieldLine(f: CategoryField): string {
  if (f.type === 'boolean') return 'Yes or no'
  if (f.type === 'select') {
    const labels = (f.options ?? []).map((o) => o.label)
    if (labels.length === 0) return 'Choices'
    return labels.length <= 3 ? labels.join(', ') : `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`
  }
  return f.type === 'text' && f.headerMaxLength != null ? `Up to ${f.headerMaxLength} letters` : 'Text'
}

/** The page's fields with a line's own put in a new order, each in a slot
 *  one of them held: nothing else on the page moves. */
export function reorderLine<T extends { key: string }>(fields: readonly T[], keys: readonly string[]): T[] {
  const moving = new Set(keys)
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const next = keys.map((k) => byKey.get(k)!).filter(Boolean)
  let n = 0
  return fields.map((f) => (moving.has(f.key) ? (next[n++] ?? f) : f))
}
