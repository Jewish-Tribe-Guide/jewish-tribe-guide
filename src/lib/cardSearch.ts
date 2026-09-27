import { conceptCategories, parseAsk, termMatches, termsRequired, words } from './ask'
import type { CategoryConfig } from './categories'

// ── What a home card answers to ──────────────────────────────────────────────
// The home screen's search matches its cards (a category, the Hospitals,
// Zmanim and Eruv pages) as well as listings: "eruv" finds the Eruv page even
// though no listing says it. Kept out of the card components so the server
// can ask the same question — the admin's missed-searches list re-runs each
// search, and a search the Eruv card answers isn't a gap in the guide.

/** The part of a card the search reads. */
export type SearchableCard = { id?: string; title: string; keywords?: string[] }

// Hidden synonyms for the well-known categories — the words people type that
// won't appear in a category's label or description. Keyed by category id.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  synagogue: ['shul', 'shuls', 'minyan', 'minyanim', 'davening', 'shtiebel', 'beis medrash'],
  mikvah: ['mikveh', 'mikvaos', 'immersion'],
  grocery: ['groceries', 'supermarket', 'market', 'food shopping'],
  restaurant: ['restaurants', 'dining', 'eat out', 'takeout', 'bakery', 'bakeries', 'cafe', 'cafes', 'coffee', 'ice cream', 'dessert', 'sweets', 'donuts', 'pastry', 'bagel'],
  hotel: ['hotels', 'motel', 'lodging', 'place to stay'],
  whatsapp: ['whatsapp', 'group chat', 'community group', 'chat'],
}

const MEDICAL_KEYWORDS = [
  'hospital', 'hospitals', 'about your hospital', 'chaplain', 'rabbi', 'prayer room',
  'prayer space', 'shabbat elevator', 'shabbos elevator', 'kosher cafeteria',
  'jewish doctor', 'medical staff', 'bikur cholim room', 'shabbos accommodations',
  'hup', 'penn', 'university of pennsylvania', 'jefferson', 'chop', 'childrens hospital',
  'temple', 'einstein',
]

const ZMANIM_KEYWORDS = [
  'zmanim', 'zman', 'candle lighting', 'candles', 'havdalah', 'shabbat times', 'shabbos',
  'shabbat', 'sunset', 'sunrise', 'shkia', 'netz', 'hebrew date', 'davening times', 'shema',
  'mincha', 'maariv', 'shacharis', 'parsha', 'molad',
]

const ERUV_KEYWORDS = [
  'eruv', 'carry', 'carrying', 'eruv map', 'eruv status', 'eruv hotline', 'shabbat boundary',
  'techum', 'stroller on shabbos',
]

// Words pulled from a category's own label + description, so newly added
// categories are searchable without touching this file.
function labelWords(c: CategoryConfig): string[] {
  return `${c.pluralLabel} ${c.description}`
    .toLowerCase()
    .split(/[^a-z'’]+/)
    .filter((w) => w.length >= 3)
}

export type CategoryCard = SearchableCard & {
  id: string
  category: CategoryConfig
  /** The page it opens: a category's id, or 'hospitals' / 'zmanim' / 'eruv'. */
  view: string
}

/** One card per live category, plus the Hospitals, Zmanim and Eruv pages
 *  when the community has them, in the order categories came in. */
export function categoryCards(categories: readonly CategoryConfig[]): CategoryCard[] {
  const medical = categories.find((c) => c.kind === 'medical')
  const zmanim = categories.find((c) => c.kind === 'zmanim')
  const eruv = categories.find((c) => c.kind === 'eruv')
  return [
    ...(medical ? [{ id: 'medical', view: 'hospitals', title: medical.pluralLabel, category: medical, keywords: MEDICAL_KEYWORDS }] : []),
    ...categories
      .filter((c) => c.kind === 'listing')
      .map((c) => ({
        id: c.id,
        view: c.id,
        title: c.pluralLabel,
        category: c,
        keywords: [...new Set([...labelWords(c), ...(CATEGORY_KEYWORDS[c.id] ?? []), c.id.replaceAll('-', ' ')])],
      })),
    ...(zmanim ? [{ id: 'zmanim', view: 'zmanim', title: zmanim.pluralLabel, category: zmanim, keywords: ZMANIM_KEYWORDS }] : []),
    ...(eruv ? [{ id: 'eruv', view: 'eruv', title: eruv.pluralLabel, category: eruv, keywords: ERUV_KEYWORDS }] : []),
  ]
}

/** Does a card match the typed query? Read the same way as the listing
 *  search (see ask.ts): a category card matches when the question names its
 *  kind of place ("where can I eat" → the food card), and any card matches
 *  when its title or hidden keywords hold the question's words. */
export function cardMatches(card: SearchableCard, query: string, categories: readonly CategoryConfig[] = []): boolean {
  const q = parseAsk(query)
  if (!q.raw) return true
  const resolved = q.concepts.map((c) => ({ ...c, ids: conceptCategories(c.concept, categories) }))
  if (card.id && resolved.some(({ ids }) => ids.includes(card.id!))) return true
  // "Is the eruv up" has no words left to look for (see AskQuery.eruv), and
  // the Eruv page is still the page it's about.
  if (q.eruv && card.id === 'eruv') return true
  // A kind of place this community has no category for is still a word to
  // look for in titles and keywords. One it does have isn't: "kosher food"
  // means the food card, not every card whose keywords mention food (the
  // grocery card's say "food shopping").
  const terms = [...q.terms, ...resolved.filter(({ ids }) => ids.length === 0).map((c) => c.word)]
  if (terms.length === 0) return false
  const hay = words([card.title, ...(card.keywords ?? [])].join(' '))
  const required = q.partial ? terms.filter((t) => t !== q.partial) : terms
  const matched = required.filter((t) => termMatches(t, hay)).length
  return matched >= termsRequired(required.length) && (required.length > 0 || termMatches(q.partial ?? '', hay, 1))
}
