import { PHOTO_FIELD_KEY, type CategoryConfig, type CategoryField, type FieldType } from './categories'

// Ready-made pages and fields (Category pages boards 2 and 7-11): what any
// community's pages already hold, offered first so a new page or field
// starts from one that exists rather than from nothing (the user, Nov 5:
// "ideally people aren't reinventing the wheel").

/** A listing page somewhere, and the community it's in. */
export type PageEverywhere = { community: string; category: CategoryConfig }

export type ReadyPage = {
  id: string
  pluralLabel: string
  /** Its first three fields, as the row's line: "Food Type, Kosher
   *  Certification, Main dishes". */
  line: string
  /** This community's own page of the same kind, when it has one. */
  ownId: string | null
  /** The page to copy. */
  source: CategoryConfig
}

/** The four every page may have, offered as rows of their own. */
export type BasicKind = 'address' | 'phone' | 'hours' | 'website'

export type ReadyField = {
  id: string
  label: string
  /** "Food · Meat, Dairy, Parve", "Most pages · puts the page on the map". */
  line: string
  /** The pages it's on, by name. Empty for the basics ("Most pages"). */
  pages: string[]
  basic?: BasicKind
  field?: CategoryField
  /** A caveat's flag and note fields, which come with it. */
  companions?: CategoryField[]
}

const BASICS: { kind: BasicKind; label: string; line: string }[] = [
  { kind: 'address', label: 'Address', line: 'Most pages · puts the page on the map' },
  { kind: 'hours', label: 'Hours', line: 'Most pages' },
  { kind: 'phone', label: 'Phone', line: 'Most pages' },
  { kind: 'website', label: 'Website', line: 'Most pages' },
]

const norm = (s: string) => s.trim().toLowerCase()

export function isBasicField(f: Pick<CategoryField, 'key' | 'label' | 'type'>): boolean {
  if (f.key === PHOTO_FIELD_KEY || f.type === 'image') return true
  if (f.type === 'hours' && norm(f.label) === 'hours') return true
  if (f.type === 'url' && norm(f.label) === 'website') return true
  return false
}

/** "A, B, C and 3 more", or all of them when there are three or fewer. */
export function listLine(items: string[], shown = 3): string {
  if (items.length <= shown) {
    if (items.length <= 1) return items.join('')
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
  }
  return `${items.slice(0, shown).join(', ')} and ${items.length - shown} more`
}

const KIND_WORDS: Partial<Record<FieldType, string>> = {
  boolean: 'yes or no',
  tags: 'a list of items',
  url: 'link',
  contacts: 'contacts',
  textarea: 'text',
  number: 'a number',
}

/** What a field holds, after the pages on its line. */
export function fieldKindWord(f: CategoryField): string | null {
  if (f.type === 'select') return (f.options ?? []).length ? listLine((f.options ?? []).map((o) => o.label)) : 'choices'
  if ((f.type === 'text' || f.type === 'textarea') && f.showInHeader) return 'a line under the name'
  return KIND_WORDS[f.type] ?? null
}

function shownFields(c: CategoryConfig): CategoryField[] {
  return c.detailFields.filter((f) => f.renderAs !== 'hidden' && f.key !== PHOTO_FIELD_KEY && f.type !== 'image')
}

/** Every listing page any community has with fields of its own, once each
 *  by its address, with this community's own first (so its own copy is the
 *  one offered). */
export function readyMadePages(everywhere: PageEverywhere[], own: CategoryConfig[], community: string): ReadyPage[] {
  const byId = new Map<string, PageEverywhere>()
  for (const p of [...everywhere].sort((a, b) => Number(b.community === community) - Number(a.community === community))) {
    if (p.category.kind !== 'listing' || byId.has(p.category.id)) continue
    byId.set(p.category.id, p)
  }
  const ownListing = own.filter((c) => c.kind === 'listing')
  return [...byId.values()]
    .map(({ category: c }) => {
      const mine = ownListing.find((o) => o.id === c.id || norm(o.pluralLabel) === norm(c.pluralLabel))
      const labels = shownFields(c).filter((f) => !isBasicField(f)).map((f) => f.label)
      return { id: c.id, pluralLabel: c.pluralLabel, line: labels.slice(0, 3).join(', '), ownId: mine?.id ?? null, source: c }
    })
    // One with no fields of its own has nothing to start from.
    .filter((r) => r.line)
    .sort((a, b) => a.pluralLabel.localeCompare(b.pluralLabel))
}

/** A copy of another page to start a new one from: its fields, kind and
 *  questions, but not its photos or the lists it shows nearby (those are
 *  that community's own). */
export function pageToCopy(c: CategoryConfig): CategoryConfig {
  return {
    ...c,
    detailFields: c.detailFields.map((f) => ({ ...f })),
    active: true,
    cardImageUrl: null,
    cardBandImageUrl: null,
    iconImageUrl: null,
    pinColor: null,
    walkList: undefined,
  }
}

/** The page being edited, as far as which fields it already has. */
export type PageHas = { hasAddress: boolean; hasPhone: boolean; fields: Pick<CategoryField, 'key' | 'label' | 'type'>[] }

function pageHasBasic(page: PageHas, kind: BasicKind): boolean {
  if (kind === 'address') return page.hasAddress
  if (kind === 'phone') return page.hasPhone
  if (kind === 'hours') return page.fields.some((f) => f.type === 'hours' && norm(f.label) === 'hours')
  return page.fields.some((f) => f.type === 'url' && norm(f.label) === 'website')
}

/** One identity per field across pages: same name, same kind. */
const fieldId = (f: Pick<CategoryField, 'label' | 'type'>) => `${f.type === 'textarea' ? 'text' : f.type}:${norm(f.label)}`

/** Every field on any page, once each and by name, leaving out the ones
 *  this page already has. With `onPage`, only that page's fields. */
export function readyMadeFields(everywhere: PageEverywhere[], page: PageHas, onPage?: string): ReadyField[] {
  const pages = everywhere.filter((p) => p.category.kind === 'listing')
  const scoped = onPage ? pages.filter((p) => p.category.pluralLabel === onPage) : pages
  const has = new Set(page.fields.map(fieldId))
  const found = new Map<string, ReadyField>()
  for (const { category: c } of scoped) {
    for (const f of shownFields(c)) {
      if (isBasicField(f)) continue
      const id = fieldId(f)
      if (has.has(id)) continue
      const seen = found.get(id)
      if (seen) {
        if (!seen.pages.includes(c.pluralLabel)) seen.pages.push(c.pluralLabel)
        continue
      }
      const companions = f.caveat ? c.detailFields.filter((h) => h.key === f.caveat!.flagField || h.key === f.caveat!.noteField) : undefined
      found.set(id, { id, label: f.label, line: '', pages: [c.pluralLabel], field: f, ...(companions?.length && { companions }) })
    }
  }
  const fields = [...found.values()].map((r) => {
    const word = fieldKindWord(r.field!)
    const sorted = [...r.pages].sort((a, b) => a.localeCompare(b))
    const where = sorted.length > 3 ? `${sorted.slice(0, 3).join(', ')} and ${sorted.length - 3} more` : sorted.join(', ')
    return { ...r, line: word ? `${where} · ${word}` : where }
  })
  const basics = BASICS.filter((b) => !pageHasBasic(page, b.kind))
    // On one page's menu, only the basics that page has.
    .filter((b) => !onPage || scoped.some((p) => pageHasBasic({ hasAddress: p.category.hasAddress !== false, hasPhone: p.category.hasPhone !== false, fields: p.category.detailFields }, b.kind)))
    .map((b) => ({ id: `basic:${b.kind}`, label: b.label, line: b.line, pages: [], basic: b.kind }))
  return [...fields, ...basics].sort((a, b) => a.label.localeCompare(b.label))
}

/** The page menu's pages: every listing page by name, once each. */
export function pageMenu(everywhere: PageEverywhere[]): string[] {
  return [...new Set(everywhere.filter((p) => p.category.kind === 'listing').map((p) => p.category.pluralLabel))].sort((a, b) => a.localeCompare(b))
}

/** A search over the list: every word typed is in the name or the line. */
export function matchesSearch(row: { label: string; line: string }, q: string): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean)
  const text = norm(`${row.label} ${row.line}`)
  return words.every((w) => text.includes(w))
}

/** "Make your own" kinds (board 12), each with its example. */
export const MAKE_OWN_KINDS: { type: FieldType; label: string; like: string }[] = [
  { type: 'select', label: 'Choices', like: 'Like Food Type: Meat, Dairy, Parve' },
  { type: 'boolean', label: 'Yes or no', like: 'Like Shabbat friendly' },
  { type: 'tags', label: 'A list of items', like: 'Like Main dishes' },
  { type: 'textarea', label: 'Text', like: 'Like Delivery Details' },
  { type: 'url', label: 'Link', like: 'Like Join group' },
]
