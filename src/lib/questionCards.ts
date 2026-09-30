import type { DirectoryResource, ResourceSubmission } from '@/types'
import { fieldIsVisible, isCategorySyncEligible, selectValues, type CategoryConfig, type CategoryField } from './categories'
import { rowItems } from './listingRow'

// ── One question card per list ───────────────────────────────────────────────
// The cheapest way to help the guide: a single tap, in the list, below the
// first screen. Each category chooses its one question in the admin's
// category editor (CategoryConfig.questionCard), or none:
//
//   a field   QUICK QUESTION · "Sweet Box Bakery: meat, dairy or parve?"
//             about a place that doesn't say, with one button per answer and
//             "Not sure". An answer is an ordinary edit suggestion changing
//             that one field, so the moderation queue shows it like any
//             other edit and an admin checks it before it shows.
//   confirm   BEEN THERE LATELY? · "GIANT · Center City: still has wine,
//             challah, deli and cheese?" about a place nobody has confirmed.
//             "Yes, still right" is today's Mark as current; "Something
//             changed" opens the listing's Edit.
//
// A place already asked about in this browser (answered, confirmed or "Not
// sure") isn't asked again here, so the card moves on to the next.

export type QuestionCard = { kind: 'field'; key: string } | { kind: 'confirm' }

/** A pick-list with more choices than this makes a poor one-tap question. */
export const MAX_QUESTION_OPTIONS = 6

/** Whether a stored value is a question this code knows. Anything else means
 *  no card, never an error. */
export function parseQuestionCard(raw: unknown): QuestionCard | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>
  if (q.kind === 'confirm') return { kind: 'confirm' }
  if (q.kind === 'field' && typeof q.key === 'string' && q.key) return { kind: 'field', key: q.key }
  return null
}

/** A question as one string, for the editor's <select>: '' (none),
 *  'confirm', or 'field:<key>'. */
export function questionCardKey(q: QuestionCard | null | undefined): string {
  if (!q) return ''
  return q.kind === 'field' ? `field:${q.key}` : 'confirm'
}

export function questionCardFromKey(key: string): QuestionCard | null {
  if (key === 'confirm') return { kind: 'confirm' }
  if (key.startsWith('field:') && key.length > 6) return { kind: 'field', key: key.slice(6) }
  return null
}

/** The field a question asks about, when it can still be asked: a yes/no,
 *  or a pick-list short enough to answer in a tap. */
function askableField(category: CategoryConfig, key: string): CategoryField | null {
  const f = category.detailFields.find((x) => x.key === key)
  if (!f) return null
  if (f.type === 'boolean') return f
  if (f.type === 'select' && (f.options?.length ?? 0) >= 2 && (f.options?.length ?? 0) <= MAX_QUESTION_OPTIONS) return f
  return null
}

/** The questions a category can ask, for the admin's editor, each with how
 *  it reads on the page. */
export function questionCardOptions(category: CategoryConfig): { value: QuestionCard; label: string }[] {
  const out: { value: QuestionCard; label: string }[] = [
    { value: { kind: 'confirm' }, label: 'Been there lately? Is a place nobody has confirmed still right' },
  ]
  for (const f of category.detailFields) {
    if (!askableField(category, f.key)) continue
    out.push({ value: { kind: 'field', key: f.key }, label: `Ask what a place doesn’t say: “${fieldQuestion(f)}”` })
  }
  return out
}

/** The answers a field question offers, in the admin's order. */
export function questionAnswers(field: CategoryField): { value: string | boolean; label: string }[] {
  if (field.type === 'boolean') {
    return [
      { value: true, label: 'Yes' },
      { value: false, label: 'No' },
    ]
  }
  return (field.options ?? []).map((o) => ({ value: o.value, label: o.label }))
}

/** "meat, dairy or parve?", "Shabbat friendly?", "which denomination?" */
function fieldQuestion(field: CategoryField): string {
  if (field.type === 'select') {
    const labels = (field.options ?? []).map((o) => o.label)
    // Short, one-word choices read as the question itself; plain words are
    // lowercased mid-sentence ("meat", not "Meat"), anything else is kept.
    if (labels.length <= 3 && labels.every((l) => /^[A-Za-z]+$/.test(l))) {
      const words = labels.map((l) => (/^[A-Z][a-z]+$/.test(l) ? l.toLowerCase() : l))
      return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}?`
    }
    return `which ${(field.filterLabel ?? field.label).toLowerCase()}?`
  }
  const label = (field.filterLabel ?? field.label).replace(/\?+$/, '')
  return `${label}?`
}

/** Whether a listing says anything for a field. An unticked yes/no saved as
 *  false says "no"; only a missing value is unsaid. */
function says(item: DirectoryResource, field: CategoryField): boolean {
  if (field.type === 'boolean') return item[field.key] === true || item[field.key] === false
  return selectValues(item[field.key]).some((v) => String(v).trim() !== '')
}

export type PickedQuestion =
  | {
      kind: 'field'
      item: DirectoryResource
      field: CategoryField
      /** "Sweet Box Bakery: meat, dairy or parve?" */
      question: string
      answers: { value: string | boolean; label: string }[]
      /** "36 places here don’t say yet." */
      footnote: string
    }
  | {
      kind: 'confirm'
      item: DirectoryResource
      /** "GIANT · Center City: still has wine, challah, deli +3?" */
      question: string
      /** "No one has confirmed it yet." */
      footnote: string
    }

/**
 * The question to ask now, about the first place in the list's own order
 * that it fits and this browser hasn't been asked about. Null when the
 * category asks nothing, or nothing is left to ask.
 */
export function pickQuestion(
  category: CategoryConfig,
  /** The list as shown, in its order. */
  shown: readonly DirectoryResource[],
  /** Every listing in the category, for the count. */
  all: readonly DirectoryResource[],
  asked: ReadonlySet<string>,
  place: (item: DirectoryResource) => string | null,
): PickedQuestion | null {
  const card = parseQuestionCard(category.questionCard)
  if (!card) return null
  const named = (item: DirectoryResource) => {
    const where = place(item)
    return where ? `${item.name} · ${where}` : item.name
  }

  if (card.kind === 'field') {
    const field = askableField(category, card.key)
    if (!field) return null
    const unsaid = (item: DirectoryResource) => fieldIsVisible(field, item as Record<string, unknown>) && !says(item, field)
    const item = shown.find((i) => unsaid(i) && !asked.has(i.id))
    if (!item) return null
    const missing = all.filter(unsaid).length
    const noun = missing === 1 ? 'place here doesn’t' : 'places here don’t'
    return {
      kind: 'field',
      item,
      field,
      question: `${named(item)}: ${fieldQuestion(field)}`,
      answers: questionAnswers(field),
      footnote: `${missing} ${noun} say yet. An admin checks each answer before it shows.`,
    }
  }

  // Confirm: a place nobody has confirmed, in the list's order.
  const item = shown.find((i) => !i.confirmedAt && !asked.has(i.id))
  if (!item) return null
  const itemsField = category.detailFields.find((f) => f.type === 'tags' && f.showCountInHeader)
  const items = itemsField ? rowItems(item, itemsField.key) : null
  const hasTimes = category.detailFields.some((f) => f.type === 'minyanim' && Array.isArray(item[f.key]) && (item[f.key] as unknown[]).length > 0)
  const what = items ? `still has ${items.charAt(0).toLowerCase()}${items.slice(1)}?` : hasTimes ? 'are its davening times still right?' : 'is everything here still right?'
  const confirmed = all.filter((i) => i.confirmedAt).length
  return {
    kind: 'confirm',
    item,
    question: `${named(item)}: ${what}`,
    footnote:
      confirmed === 0
        ? `No one has confirmed a ${category.label.toLowerCase()} listing yet.`
        : 'No one has confirmed it yet.',
  }
}

/**
 * The edit suggestion an answer sends: the listing as it stands, with one
 * field changed. Built the way the Edit form builds its own (useListingDraft's
 * buildSubmission), so the queue shows exactly that one change.
 */
export function answerSubmission(category: CategoryConfig, item: DirectoryResource, field: CategoryField, value: string | boolean): ResourceSubmission {
  const hasAddress = category.hasAddress !== false
  const hasPhone = category.hasPhone !== false
  const details: Record<string, unknown> = {}
  for (const f of category.detailFields) {
    if (f.key in item) details[f.key] = item[f.key]
    if (f.type === 'tags') {
      const sk = `${f.key}_sometimes`
      if (sk in item) details[sk] = item[sk]
    }
  }
  details[field.key] = field.type === 'select' && field.multiSelect ? [value] : value
  const visible: Record<string, unknown> = {}
  for (const f of category.detailFields) {
    if (!fieldIsVisible(f, details)) continue
    visible[f.key] = details[f.key]
    if (f.type === 'tags') visible[`${f.key}_sometimes`] = details[`${f.key}_sometimes`] ?? []
  }
  const sync = isCategorySyncEligible(category)
  return {
    category: category.id,
    name: item.name,
    anchorId: hasAddress ? 'all' : 'community',
    distance: null,
    address: hasAddress ? (item.address ?? '') : '',
    phone: hasPhone ? (item.phone ?? '') : '',
    details: {
      ...visible,
      ...(sync && typeof item.placeId === 'string' ? { placeId: item.placeId } : {}),
      ...(sync && typeof item.businessStatus === 'string' ? { businessStatus: item.businessStatus } : {}),
    },
    geo: hasAddress ? ((item.geo as { lat: number; lng: number } | undefined) ?? null) : null,
  }
}

/**
 * The one question an opened listing asks (its part 6, agreed Sep 30): the
 * most useful thing it doesn't say yet, answerable with a tap. The
 * category's own question card first, when it asks about a field this
 * listing leaves empty; then any other fact a row shows and this one lacks,
 * what decides it before what kind of place it is. Null when it says
 * everything that can be asked this way, or this browser has been asked
 * already. Whether it's still right is the dated line's question, not this.
 */
export function pickListingQuestion(category: CategoryConfig, item: DirectoryResource, asked: ReadonlySet<string>): PickedQuestion | null {
  if (asked.has(item.id)) return null
  const card = parseQuestionCard(category.questionCard)
  const badges = category.detailFields.filter(
    (f) => (f.type === 'boolean' || f.type === 'select') && (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' && f.filterable,
  )
  const kind = badges.find((f) => f.type === 'select' && !f.caveat)
  const order = [
    ...(card?.kind === 'field' ? [card.key] : []),
    ...badges.filter((f) => f !== kind).map((f) => f.key),
    ...(kind ? [kind.key] : []),
  ]
  for (const key of order) {
    const field = askableField(category, key)
    if (!field || !fieldIsVisible(field, item as Record<string, unknown>) || says(item, field)) continue
    const q = fieldQuestion(field)
    // "Meat, dairy or parve?", "Which denomination?", "Shabbat friendly?":
    // the listing's name is right above it.
    const question = q.charAt(0).toUpperCase() + q.slice(1)
    return { kind: 'field', item, field, question, answers: questionAnswers(field), footnote: 'An admin checks each answer before it shows.' }
  }
  return null
}
