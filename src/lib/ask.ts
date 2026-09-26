import type { CategoryConfig } from '@/lib/categories'
import type { Tefillah } from '@/lib/davening'

// ── Understanding a question typed into search ───────────────────────────────
// Search used to need every typed word to appear in a listing. That worked for
// someone typing a store's name and for no one else: "where can I buy cholov
// yisroel milk" found nothing (no listing contains "where", "can" or "buy"),
// and neither did "cholov yisroel milk" on its own, because the item is tagged
// "Chalav". Two people trying the redesign prototype showed both halves of it:
// one typed short words, the other typed whole questions, as into Google.
//
// This module reads what someone typed into the parts that can be matched:
//   • spellings folded to one form on BOTH sides (cholov/chalav, yisrael/
//     yisroel, shabbat/shabbos …), so neither the visitor nor whoever wrote
//     the listing has to guess the other's transliteration;
//   • question and filler words dropped ("where can I buy", "is there any");
//   • everyday words for a kind of place ("food", "eat", "shul", "daven")
//     read as that category rather than searched for as text;
//   • "near me" and "open now" read as instructions, not words to find.
// Matching then counts how many of the remaining words a listing has, allows
// a typo, and lets a word be a prefix while it's still being typed.
//
// Pure and synchronous: it runs on every keystroke, against listings the page
// already holds, with no request and nothing that can make up an answer.

/** Spellings of one word. Every variant folds to the group's first entry, on
 *  the query and on listing text alike. */
const SPELLING_GROUPS: string[][] = [
  ['chalav', 'cholov', 'cholev', 'cholav', 'chalev', 'chalov', 'halav'],
  ['yisroel', 'yisrael', 'yisroeil', 'yisreal', 'yisrail'],
  ['pas', 'pat', 'paas'],
  ['shabbos', 'shabbat', 'shabbes', 'shabbis', 'shabbas', 'shabos', 'shabat', 'sabbath'],
  ['challah', 'challa', 'chala', 'chalah', 'hallah', 'halla', 'challot', 'challos', 'challahs'],
  ['kosher', 'kasher'],
  ['mikvah', 'mikveh', 'mikva', 'mikve', 'mikvaot', 'mikvot', 'mikvahs'],
  ['mincha', 'minchah', 'minha'],
  ['maariv', 'arvit', 'mariv'],
  ['shacharis', 'shacharit', 'shachris', 'shachrit'],
  ['minyan', 'minyanim', 'minyon', 'minyonim', 'minyans'],
  ['daven', 'davening', 'davven', 'davens'],
  ['parve', 'pareve', 'parev', 'parveh'],
  ['fleishig', 'fleishigs', 'fleishik', 'fleishedik'],
  ['milchig', 'milchigs', 'milchik', 'milchidik'],
  ['hechsher', 'hechsherim', 'hashgacha', 'hashgocha'],
  ['eruv', 'eiruv', 'eruvim'],
  ['shul', 'shule', 'shuls', 'shtiebel', 'shtibel', 'shteibel', 'shtiebl', 'shtiebels'],
  ['glatt', 'glat'],
  ['sukkah', 'succah', 'sukka', 'succa'],
  ['sukkos', 'sukkot', 'succot', 'succos'],
  ['chanukah', 'hanukkah', 'hanukah', 'chanuka', 'channukah', 'channuka', 'chanukkah'],
  ['pesach', 'passover', 'peisach'],
  ['bikur', 'bikkur'],
  ['cholim', 'holim'],
]

/** Short forms people write for a two-word item. */
const ABBREVIATIONS: Record<string, string[]> = {
  cy: ['chalav', 'yisroel'],
  py: ['pas', 'yisroel'],
}

const SPELLING = new Map<string, string>()
for (const group of SPELLING_GROUPS) for (const v of group) SPELLING.set(v, group[0])

/** Words that carry no meaning in a search: question words, filler, and the
 *  verbs of wanting something. Compared as typed, before folding. "kosher"
 *  and "jewish" are here because nearly every listing is one or the other, so
 *  requiring them only ever loses results ("kosher wine" means wine). */
const STOPWORDS = new Set([
  'where', 'wheres', 'what', 'whats', 'when', 'whens', 'which', 'who', 'whos', 'how', 'why',
  'can', 'could', 'would', 'should', 'will', 'may', 'might',
  'i', 'im', 'ive', 'id', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'someone', 'somebody',
  'anyone', 'anybody', 'everyone', 'people', 'friend', 'family',
  'a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'from', 'with', 'about', 'into',
  'and', 'or', 'but', 'so', 'if', 'than', 'then', 'also', 'too', 'just', 'really', 'very',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'isnt', 'arent',
  'there', 'theres', 'here', 'this', 'that', 'these', 'those', 'it', 'its', 'thing', 'things',
  'any', 'some', 'all', 'more', 'most', 'other', 'another', 'each', 'every',
  'do', 'does', 'did', 'done', 'doing', 'dont', 'doesnt',
  'get', 'gets', 'got', 'getting', 'buy', 'buys', 'buying', 'bought', 'purchase',
  'find', 'finding', 'found', 'look', 'looking', 'search', 'searching', 'see',
  'need', 'needs', 'needed', 'want', 'wants', 'wanted', 'like', 'love', 'try', 'trying',
  'sell', 'sells', 'selling', 'sold', 'carry', 'carries', 'carrying', 'stock', 'stocks', 'offer', 'offers',
  'have', 'has', 'had', 'having', 'go', 'goes', 'going', 'went', 'come', 'coming', 'take',
  'know', 'knows', 'knew', 'recommend', 'recommendation', 'recommendations', 'suggest', 'suggestion', 'suggestions',
  'good', 'best', 'great', 'nice', 'decent', 'reliable', 'favorite', 'favourite',
  'please', 'pls', 'thanks', 'thank', 'hi', 'hey', 'hello', 'help',
  'place', 'places', 'spot', 'spots', 'option', 'options', 'somewhere', 'anywhere', 'location', 'locations',
  'store', 'stores', 'shop', 'shops',
  'area', 'around', 'close', 'closest', 'nearest', 'near', 'nearby', 'local', 'locally',
  'today', 'tonight', 'tomorrow', 'week', 'weekend', 'now', 'right',
  'next', 'upcoming', 'still', 'later', 'soon', 'left', 'anymore', 'yet', 'time', 'times', 'schedule', 'list', 'pull', 'up', 'show', 'give', 'tell',
  'kosher', 'kasher', 'jewish', 'frum',
])

/** Everyday words for a kind of place. A word here is matched against the
 *  community's own categories (id and labels), not searched for as text — so
 *  "food" means the food category whatever an admin called it, as long as its
 *  name says restaurant or food. */
export type Concept = 'food' | 'synagogue' | 'grocery' | 'hotel' | 'mikvah' | 'hospital' | 'school' | 'childcare' | 'cemetery'

const CONCEPTS: Record<Concept, { words: string[]; category: string[] }> = {
  food: {
    words: ['food', 'foods', 'eat', 'eats', 'eating', 'restaurant', 'restaurants', 'lunch', 'dinner', 'breakfast',
      'brunch', 'supper', 'meal', 'meals', 'takeout', 'dine', 'dining', 'cafe', 'hungry', 'eatery'],
    category: ['restaurant', 'food', 'eatery', 'dining'],
  },
  synagogue: {
    words: ['shul', 'synagogue', 'synagogues', 'daven', 'minyan', 'mincha', 'maariv', 'shacharis', 'pray',
      'praying', 'prayer', 'prayers', 'mussaf', 'musaf', 'service', 'services'],
    category: ['synagogue', 'shul'],
  },
  grocery: {
    words: ['grocery', 'groceries', 'supermarket', 'supermarkets', 'shopping'],
    category: ['grocery', 'groceries'],
  },
  hotel: {
    words: ['hotel', 'hotels', 'stay', 'staying', 'sleep', 'lodging', 'motel', 'accommodation', 'accommodations'],
    category: ['hotel', 'lodging'],
  },
  mikvah: { words: ['mikvah'], category: ['mikvah'] },
  hospital: { words: ['hospital', 'hospitals'], category: ['hospital'] },
  school: { words: ['school', 'schools', 'yeshiva', 'yeshivas', 'cheder'], category: ['school'] },
  childcare: {
    words: ['childcare', 'daycare', 'babysitter', 'babysitting', 'nanny', 'preschool', 'playgroup'],
    category: ['childcare', 'daycare'],
  },
  cemetery: { words: ['cemetery', 'cemeteries', 'burial', 'funeral'], category: ['cemetery', 'burial'] },
}

/** One word, in the form both sides are compared in: spelling-folded, and
 *  with a plural "s" dropped so "restaurants" meets "restaurant". Applied the
 *  same way to the query and to listing text, so the plural rule never has to
 *  be linguistically right — only consistent. */
function fold(word: string): string {
  const spelled = SPELLING.get(word)
  if (spelled) return spelled
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) {
    const singular = word.slice(0, -1)
    return SPELLING.get(singular) ?? singular
  }
  return word
}

const CONCEPT_BY_WORD = new Map<string, Concept>()
for (const [concept, { words: ws }] of Object.entries(CONCEPTS) as [Concept, (typeof CONCEPTS)[Concept]][]) {
  for (const w of ws) CONCEPT_BY_WORD.set(fold(w), concept)
}

/** Lowercase, accents removed, apostrophes dropped ("Trader Joe's" → "trader
 *  joes"), anything else that isn't a letter or digit treated as a space. */
function plainWords(text: string): string[] {
  const plain = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return plain ? plain.split(' ') : []
}

/** The words of `raw` that became `terms`, as they were typed: "cheeses" for
 *  the term "cheese". For an answer to use the asker's own word for a thing
 *  when the listings each word it differently. */
export function termsAsTyped(raw: string, terms: readonly string[]): string {
  return plainWords(raw)
    .filter((w) => terms.includes(fold(w)))
    .join(' ')
}

/** Text as the list of folded words it's matched on. Used for listing text. */
export function words(text: string): string[] {
  const out: string[] = []
  for (const w of plainWords(text)) {
    const abbreviation = ABBREVIATIONS[w]
    if (abbreviation) out.push(...abbreviation)
    else out.push(fold(w))
  }
  return out
}

export type AskQuery = {
  /** What was typed, trimmed. */
  raw: string
  /** The words that have to be found in a listing, folded. */
  terms: string[]
  /** Kinds of place asked for ("food", "shul"), each with the word that
   *  named it, so one this community has no category for can fall back to
   *  being a plain term. */
  concepts: { concept: Concept; word: string }[]
  /** "near me", "close to me", "nearby" — closest to the visitor first. */
  nearMe: boolean
  /** "open now", "open late", "what's open" — only places open right now. */
  openNow: boolean
  /** "open today", "open tonight", "open later": open now or opening later
   *  today. A mikvah asked about at 7 AM that opens at 8 PM answers "is there
   *  a mikvah open today"; only reading it as "open now" said no. Never set
   *  together with `openNow`. */
  openToday: boolean
  /** "within 2 miles", "within a 15 minute drive", "10 minute walk": the
   *  farthest a result may be, in straight-line miles (see WITHIN). */
  within: Within | null
  /** Set when the question is about minyan times ("next maariv", "is there
   *  a mincha at 1:30", "upcoming minyanim"), for the answer to be worked out
   *  from the schedules rather than from listing text. */
  minyan: MinyanAsk | null
  /** The last term, when the query doesn't end in a space: a word still
   *  being typed. It can raise a result but never rule one out — "trader jo"
   *  must not lose Trader Joe's for want of three letters, and "challah th"
   *  (on its way to "the") must not lose every store with challah. */
  partial: string | null
}

export type MinyanAsk = {
  /** The tefillos asked about, or null for any minyan. Mincha and Maariv
   *  include the combined Mincha & Maariv, which answers either. */
  tefillos: Tefillah[] | null
  /** A clock time asked about ("at 6:45"), with am/pm only when it was said;
   *  the answer resolves a bare "6:45" against the tefillah and the clock. */
  at: { hour: number; minute: number; meridiem: 'am' | 'pm' | null } | null
}

const TEFILLAH_WORDS: Record<string, Tefillah[] | null> = {
  shacharis: ['shacharis'],
  mincha: ['mincha', 'mincha_maariv'],
  maariv: ['maariv', 'mincha_maariv'],
  mussaf: ['shabbos_mussaf'],
  musaf: ['shabbos_mussaf'],
  minyan: null,
  daven: null,
  service: null,
}

// A time someone typed: "6:45", "6:45pm", "7 pm", "at 7". A bare number
// counts only after "at", so "1500 walnut" or "20th street" isn't a time.
const CLOCK = /(?:\bat\s+)?\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?|\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)|\bat\s+(\d{1,2})\b(?!:)/i

function readClock(input: string): { at: MinyanAsk['at']; rest: string } {
  const m = input.match(CLOCK)
  if (!m) return { at: null, rest: input }
  const hour = Number(m[1] ?? m[4] ?? m[6])
  const minute = Number(m[2] ?? 0)
  const said = (m[3] ?? m[5] ?? '').toLowerCase().replace(/\./g, '')
  if (hour > 23 || minute > 59) return { at: null, rest: input }
  const meridiem = said === 'am' || said === 'pm' ? said : hour > 12 ? 'pm' : null
  return { at: { hour: hour > 12 ? hour - 12 : hour, minute, meridiem }, rest: input.replace(m[0], ' ') }
}

export type Within = {
  /** Straight-line miles — what the guide can measure without a paid lookup. */
  miles: number
  /** How it was asked, so an answer can say so ("about a 15-minute drive"). */
  asked: { minutes: number; by: 'drive' | 'walk' } | null
}

// Minutes of travel to straight-line miles. The guide measures distance as
// the crow flies, not by road (drive and walk times would be a paid Google
// lookup per place), so these are deliberately rough: walking at about 3 mph
// over roughly a quarter more path than the straight line, and driving at an
// average of about 24 mph once lights, turns and parking are in. Answers say
// "about", never a promise.
const MILES_PER_MINUTE = { walk: 1 / 25, drive: 0.4 }

const WITHIN =
  /\b(?:within|under|less than|no more than|up to)\s+(?:a\s+|an\s+)?(\d+(?:\.\d+)?)\s*(?:-\s*)?(miles?|mi|minutes?|mins?)\b(?:\s+(drive|driving|walk|walking|by car|on foot))?|\b(\d+)\s*(?:-\s*)?(?:minutes?|mins?)\s+(drive|driving|walk|walking)\b/i

function readWithin(input: string): { within: Within | null; rest: string } {
  const m = input.match(WITHIN)
  if (!m) return { within: null, rest: input }
  const rest = input.replace(m[0], ' ')
  const byWord = (m[3] ?? m[5] ?? '').toLowerCase()
  const by: 'drive' | 'walk' = byWord.startsWith('walk') || byWord === 'on foot' ? 'walk' : 'drive'
  if (m[4]) {
    const minutes = Number(m[4])
    return { within: { miles: minutes * MILES_PER_MINUTE[by], asked: { minutes, by } }, rest }
  }
  const n = Number(m[1])
  if (/^mi/.test(m[2].toLowerCase()) && !/^min/.test(m[2].toLowerCase())) return { within: { miles: n, asked: null }, rest }
  return { within: { miles: n * MILES_PER_MINUTE[by], asked: { minutes: n, by } }, rest }
}

const NEAR_ME = /\b(?:(?:near|close to|closest to|nearest to|around|by|next to) (?:me|here|us)|nearby|near by|close by)\b/g
const OPEN_TODAY = /\b(?:open (?:today|tonight|later(?: today| tonight)?|this (?:evening|afternoon))|still open (?:today|tonight))\b/g
const OPEN_NOW = /\b(?:open (?:right now|now|late|on sunday|on friday)|(?:whats|what is|anything|something|who is|whos) open|open)\b/g

/** Reads a query into its parts. It never loses the query entirely: if only
 *  filler was typed ("kosher", "where"), those words are kept as terms, since
 *  searching for them beats showing nothing. */
export function parseAsk(input: string): AskQuery {
  const raw = input.trim()
  // A time is read off the text first: once punctuation becomes spaces,
  // "6:45" is just two numbers that no listing contains.
  const within = readWithin(raw)
  const clock = readClock(within.rest)
  // Compared by what `replace` removed rather than with `.test()`: both
  // patterns are global, and a global regex's `.test()` keeps its position
  // between calls, so the next query would be checked from the wrong place.
  const typed = plainWords(clock.rest).join(' ')
  const withoutNear = typed.replace(NEAR_ME, ' ')
  const nearMe = withoutNear !== typed
  const withoutToday = withoutNear.replace(OPEN_TODAY, ' ')
  const openToday = withoutToday !== withoutNear
  const plain = withoutToday.replace(OPEN_NOW, ' ')
  const openNow = !openToday && plain !== withoutToday

  const terms: string[] = []
  const concepts: AskQuery['concepts'] = []
  let asksMinyan = false
  let tefillos: Tefillah[] | null = null
  for (const w of plain.split(' ').filter(Boolean)) {
    const tefillah = TEFILLAH_WORDS[fold(w)]
    if (tefillah !== undefined) {
      asksMinyan = true
      if (tefillah) tefillos = [...new Set([...(tefillos ?? []), ...tefillah])]
    }
    const abbreviation = ABBREVIATIONS[w]
    if (abbreviation) {
      terms.push(...abbreviation)
      continue
    }
    const folded = fold(w)
    const concept = CONCEPT_BY_WORD.get(folded)
    if (concept) {
      if (!concepts.some((c) => c.concept === concept)) concepts.push({ concept, word: folded })
      continue
    }
    if (STOPWORDS.has(w) || STOPWORDS.has(folded)) continue
    terms.push(folded)
  }

  const minyan: MinyanAsk | null = asksMinyan ? { tefillos, at: clock.at } : null
  const withinAsked = within.within
  const typing = raw !== '' && !/\s$/.test(input)
  const last = plainWords(raw).at(-1)
  if (terms.length === 0 && concepts.length === 0 && !nearMe && !openNow && !openToday) {
    const all = words(raw)
    return { raw, terms: all, concepts, nearMe, openNow, openToday, within: withinAsked, minyan, partial: typing && all.length > 1 ? (all.at(-1) ?? null) : null }
  }
  // Only the word under the cursor, and only if it survived as a term.
  const partial = typing && last !== undefined && terms.at(-1) === fold(last) && terms.length > 1 ? (terms.at(-1) ?? null) : null
  return { raw, terms, concepts, nearMe, openNow, openToday, within: withinAsked, minyan, partial }
}

/** The categories a concept stands for in this community: those whose id or
 *  labels contain one of the concept's category words. */
export function conceptCategories(concept: Concept, categories: readonly CategoryConfig[]): string[] {
  const wanted = CONCEPTS[concept].category.map(fold)
  return categories
    .filter((c) => {
      const names = words(`${c.id} ${c.label} ${c.pluralLabel}`)
      return wanted.some((w) => names.includes(w))
    })
    .map((c) => c.id)
}

/** Optimal-string-alignment distance (insert, delete, substitute, swap two
 *  neighbours), giving up as soon as it passes `max` so a typo check on every
 *  word stays cheap. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let before: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1)
      cur[j] = d
      rowMin = Math.min(rowMin, d)
    }
    if (rowMin > max) return max + 1
    before = prev
    prev = cur
  }
  return prev[b.length]
}

/** How many typos a word of this length may have and still count. Short words
 *  get none: three letters one off is a different word ("pas", "pat", "gas"). */
function typosAllowed(term: string): number {
  if (term.length >= 8) return 2
  if (term.length >= 5) return 1
  return 0
}

/** Whether a typed term is among these words: the same word, the start of one
 *  while it's still being typed ("chal" → "challah"), or one typo away. Pass
 *  `allowTypos: false` for text where a near-miss is more likely a different
 *  word than a mistake — a street name one letter from "giant" is Grant Ave. */
export function termMatches(term: string, haystack: readonly string[], minPrefix = 3, allowTypos = true): boolean {
  const typos = allowTypos ? typosAllowed(term) : 0
  for (const w of haystack) {
    if (w === term) return true
    if (term.length >= minPrefix && w.startsWith(term)) return true
    if (typos > 0 && editDistance(term, w, typos) <= typos) return true
  }
  return false
}

/** Whether one word of text, as written, is a match for any of the terms —
 *  what a page bolds to show why a result is there. Same matching as the
 *  search itself, so it bolds exactly what was found. */
export function wordMatches(word: string, terms: readonly string[], allowTypos = false): boolean {
  const ws = words(word)
  return ws.length > 0 && terms.some((t) => termMatches(t, ws, 3, allowTypos))
}

/** How many of the terms a listing needs to count as a match: all of them for
 *  one or two words; for longer questions most of them, so "cholov yisroel
 *  milk in center city" still finds the milk. */
export function termsRequired(count: number): number {
  if (count <= 2) return count
  return Math.ceil(count * 0.6)
}

/** Initials of a name, the way people shorten hospitals and institutions:
 *  "hup" for the Hospital of the University of Pennsylvania, "chop" for
 *  Children's Hospital of Philadelphia. Both with and without the small
 *  words, since people keep "of" in some and drop it in others. Anything
 *  after " - " (a building, a branch) is left out. */
export function initialisms(name: string): string[] {
  const base = name.split(/\s[-–—|]\s/)[0]
  const all = plainWords(base)
  if (all.length < 2) return []
  const small = new Set(['of', 'the', 'and', 'at', 'for', 'in'])
  const every = all.map((w) => w[0]).join('')
  const significant = all.filter((w) => !small.has(w)).map((w) => w[0]).join('')
  return [...new Set([every, significant])].filter((s) => s.length >= 2)
}
