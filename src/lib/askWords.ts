import type { CategoryConfig } from './categories'
import { termMatches, words } from './ask'
import { filterFields, passesFields, type CategoryFilters } from './mapFilters'
import type { Reading } from './questionReader'
import type { DirectoryResource } from '@/types'

// ── Words the search has been taught (decided Sep 30) ──────────────────────
// Our own search reads a question's leftover words as text to look for:
// "IKC dairy" finds every place that mentions IKC or dairy anywhere, 27 of
// them, where what was meant is two filters (Kosher Cert: IKC, Food Type:
// Dairy) and 2 places. The AI reader gets that right, but it's slower, it
// costs, and it's the AI. So what it reads becomes something a person can
// teach the search itself, a word at a time: on the admin's Read questions
// tab, the reading of "IKC dairy places" proposes "ikc" means Kosher Cert:
// IKC, and an admin who agrees teaches it (question_word, migration 063).
// From then on our own search reads "ikc" as that filter, in every
// question, instantly, and doesn't ask the AI at all when that was all it
// didn't understand. The search gets better, and the AI is asked less.
//
// A taught word is a person's rule, never the AI's: nothing here is used
// until an admin teaches it, and each says who taught it and from which
// question. They come to the page on the categories (listCategories), so
// every search box has them without asking for them.

/** A word taught to mean one of a category's own filters, or (with no
 *  field) the category itself. `word` is folded, as `words` folds it. */
export type AskWord = { word: string; field?: string; value?: string }

/** A taught word with the category it belongs to. */
export type TaughtWord = AskWord & { categoryId: string }

/** A word as it's taught and matched: folded, space-separated ("cy" is
 *  "chalav yisroel", as when it's typed). */
export function askWordKey(text: string): string {
  return words(text).join(' ')
}

/** What a taught word means, in the guide's own words: "Food · Kosher
 *  Cert: IKC", "Food". Null when the category or field is gone. */
export function askWordLabel(rule: TaughtWord, categories: readonly CategoryConfig[]): string | null {
  const category = categories.find((c) => c.id === rule.categoryId)
  if (!category) return null
  if (!rule.field) return category.pluralLabel
  const field = category.detailFields.find((f) => f.key === rule.field)
  if (!field) return null
  const name = field.filterLabel ?? field.label
  if (field.type === 'boolean') return `${category.pluralLabel} · ${name}`
  const option = field.options?.find((o) => o.value === rule.value)?.label ?? rule.value
  return `${category.pluralLabel} · ${name}: ${option}`
}

/** What a taught word does to a listing, in the shape the Map page's
 *  filters have (mapFilters.ts): one pick in a field is any of them, and
 *  every field must pass. */
function filtersOf(rules: readonly TaughtWord[]): Map<string, CategoryFilters> {
  const out = new Map<string, CategoryFilters>()
  for (const r of rules) {
    if (!r.field) continue
    const f = out.get(r.categoryId) ?? {}
    if (r.value === undefined) f.bool = [...new Set([...(f.bool ?? []), r.field])]
    else f.select = { ...f.select, [r.field]: [...new Set([...(f.select?.[r.field] ?? []), r.value])] }
    out.set(r.categoryId, f)
  }
  return out
}

export type Taught = {
  /** The words left to look for as text. */
  terms: string[]
  /** The kinds of place asked about, with the taught words' own added. */
  categoryIds: string[] | null
  /** The taught words the question used. */
  used: TaughtWord[]
  /** Whether a listing passes their filters. */
  passes: (item: DirectoryResource) => boolean
}

/** Reads the taught words out of a question's words (`terms`, folded).
 *  Only in the kinds of place it's about, when it named any ("IKC grocery"
 *  doesn't use Food's "ikc"), or on a category page, that category's own.
 *  A word taught as a phrase ("chalav yisroel") needs all its words. And
 *  not when the words are a listing's own name being looked up: "dairy
 *  queen" is the place, not dairy places called Queen (`lookingUp`). */
export function readTaught(
  terms: readonly string[],
  categories: readonly CategoryConfig[],
  { categoryIds, categoryId, lookingUp = false }: { categoryIds: string[] | null; categoryId?: string; lookingUp?: boolean },
): Taught {
  const none: Taught = { terms: [...terms], categoryIds, used: [], passes: () => true }
  if (lookingUp || terms.length === 0) return none
  const inScope = categories.filter((c) => (categoryId ? c.id === categoryId : !categoryIds || categoryIds.includes(c.id)))
  const rules = inScope.flatMap((c) => (c.askWords ?? []).map((w) => ({ ...w, categoryId: c.id })))
  if (rules.length === 0) return none
  // The longest first, so "chalav yisroel" wins over a "yisroel" of its own.
  rules.sort((a, b) => b.word.split(' ').length - a.word.split(' ').length)
  const left = [...terms]
  const used: TaughtWord[] = []
  for (const rule of rules) {
    const ws = rule.word.split(' ')
    if (!ws.every((w) => left.includes(w))) continue
    for (const w of ws) left.splice(left.indexOf(w), 1)
    used.push(rule)
  }
  if (used.length === 0) return none
  const filters = filtersOf(used)
  const byId = new Map(categories.map((c) => [c.id, c]))
  return {
    terms: left,
    categoryIds: categoryId ? categoryIds : (categoryIds ?? [...new Set(used.map((r) => r.categoryId))]),
    used,
    passes: (item) => {
      const f = filters.get(item.category)
      return !f || !byId.has(item.category) || passesFields(item as unknown as Record<string, unknown>, f)
    },
  }
}

/** A word a reading suggests teaching: what the AI read a word the search
 *  didn't understand as. */
export type WordProposal = TaughtWord & { label: string }

/** What a reading suggests teaching, from the words our own search left
 *  over (`left`, AskResult's `terms`). A word that names one of the
 *  reading's filters ("ikc" and the pick IKC, "dairy" and Dairy) is that
 *  filter. Then, if one filter of the reading is still unexplained and up
 *  to three words are, those words are it ("milchig" read as Dairy). And a
 *  kind of place the reading added, with no filters on it at all, is the
 *  one word left ("bakery" read as Food). Naming a filter means all of
 *  what it's called: "shabbos" alone isn't Shabbat friendly. Only filters a category offers on
 *  its own page, so a taught word always means something a visitor could
 *  pick. Never a guess past that: anything else isn't proposed. */
export function proposeWords(
  left: readonly string[],
  reading: Reading,
  categories: readonly CategoryConfig[],
  named: readonly string[] | null,
): WordProposal[] {
  if (left.length === 0) return []
  const byId = new Map(categories.map((c) => [c.id, c]))
  type Candidate = { rule: TaughtWord; words: string[] }
  const candidates: Candidate[] = []
  for (const entry of reading.categories) {
    const category = byId.get(entry.id)
    if (!category) continue
    const offered = new Map(filterFields(category).map((f) => [f.key, f]))
    for (const key of entry.bool ?? []) {
      const field = offered.get(key)
      if (field?.type === 'boolean') candidates.push({ rule: { categoryId: entry.id, word: '', field: key }, words: words(field.filterLabel ?? field.label) })
    }
    for (const [key, values] of Object.entries(entry.select ?? {})) {
      const field = offered.get(key)
      if (field?.type !== 'select') continue
      for (const value of values) {
        const label = field.options?.find((o) => o.value === value)?.label ?? value
        candidates.push({ rule: { categoryId: entry.id, word: '', field: key, value }, words: [...new Set([...words(label), ...words(value)])] })
      }
    }
  }

  const out: TaughtWord[] = []
  const unexplained = new Set(left)
  const unmatched: Candidate[] = []
  for (const c of candidates) {
    // All of what it's called: "shabbos" alone isn't Shabbat friendly.
    const said = left.filter((t) => termMatches(t, c.words, 3, false))
    if (said.length === 0 || !c.words.every((w) => said.some((t) => termMatches(t, [w], 3, false)))) {
      unmatched.push(c)
      continue
    }
    for (const t of said) unexplained.delete(t)
    out.push({ ...c.rule, word: said.join(' ') })
  }
  const rest = left.filter((t) => unexplained.has(t))
  if (rest.length > 0 && rest.length <= 3 && unmatched.length === 1) {
    out.push({ ...unmatched[0].rule, word: rest.join(' ') })
  } else if (rest.length === 1 && unmatched.length === 0) {
    const added = reading.categories.filter((c) => !named?.includes(c.id) && byId.has(c.id) && !c.bool?.length && !Object.keys(c.select ?? {}).length)
    if (added.length === 1) out.push({ categoryId: added[0].id, word: rest[0] })
  }

  // In the question's own order.
  const at = (rule: TaughtWord) => left.indexOf(rule.word.split(' ')[0])
  out.sort((a, b) => at(a) - at(b))
  const seen = new Set<string>()
  return out.flatMap((rule) => {
    const label = askWordLabel(rule, categories)
    if (!label || seen.has(rule.word)) return []
    seen.add(rule.word)
    return [{ ...rule, label }]
  })
}

/** A reading with the taught words the question used put into it: our own
 *  search's, which the AI's reading can add to but never take away
 *  (readingSearch.ts). A person taught them, so where the reading picked
 *  something else in the same filter ("Meat" for a word taught as Dairy),
 *  the taught one stands. */
export function withTaught(reading: Reading, taught: readonly TaughtWord[] = []): Reading {
  if (taught.length === 0) return reading
  const categories = reading.categories.map((c) => ({ ...c }))
  const each: [string, CategoryFilters][] = [...filtersOf(taught), ...taught.filter((t) => !t.field).map((t): [string, CategoryFilters] => [t.categoryId, {}])]
  for (const [id, f] of each) {
    let c = categories.find((x) => x.id === id)
    if (!c) categories.push((c = { id }))
    if (f.bool?.length) c.bool = [...new Set([...(c.bool ?? []), ...f.bool])]
    if (f.select) c.select = { ...c.select, ...f.select }
  }
  return { ...reading, categories }
}
