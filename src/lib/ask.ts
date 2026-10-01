import type { CategoryConfig } from '@/lib/categories'
import type { Tefillah } from '@/lib/davening'
import type { DayKey } from '@/lib/hours'
import { MILES_PER_MINUTE } from '@/lib/geo'

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
  'know', 'knows', 'knew', 'recommend', 'recommended', 'recommendation', 'recommendations', 'rated', 'highest', 'highly', 'suggest', 'suggestion', 'suggestions',
  'good', 'best', 'better', 'top', 'popular', 'great', 'nice', 'decent', 'reliable', 'reputable', 'favorite', 'favourite',
  // Every listing here is kosher, so asking for "a good hechsher" narrows
  // nothing; a named one ("OU") is still searched for.
  'hechsher', 'hechsherim', 'hashgacha', 'certified', 'certification',
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
export type Concept = 'food' | 'synagogue' | 'grocery' | 'hotel' | 'mikvah' | 'hospital' | 'school' | 'childcare' | 'cemetery' | 'sukkah'

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
  // A sukkah listing is a family name and an address: nothing in it says
  // "sukkah" but its category. Only there around Sukkos (a campaign puts
  // it up); the rest of the year the word is searched for as usual.
  sukkah: { words: ['sukkah', 'sukkahs', 'sukka', 'succah', 'sukkot', 'sukkos', 'succot'], category: ['sukkah', 'succah'] },
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

/** The question's words as typed, each with the term it became (or null
 *  for a filler or kind-of-place word) — for loosening a question one
 *  searched word at a time. */
export function typedWords(raw: string, terms: readonly string[]): { word: string; term: string | null }[] {
  return plainWords(raw).map((w) => {
    const f = fold(w)
    return { word: w, term: terms.includes(f) ? f : null }
  })
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
  /** "open after 6", "open past 9pm", "open until 10", "open at 8am": a
   *  time today the place has to be open around. Never set together with
   *  `openNow` or `openToday`. */
  openAt: OpenAt | null
  /** "best", "better", "top", "favorite", "most popular", "recommend": a
   *  ranking, which the guide can only give from neighbors' upvotes. */
  best: boolean
  /** A question about the guide itself: what's on it ("contents"), what to
   *  ask ("ask"), who runs it ("about"), how to add to it ("add"). */
  meta: MetaAsk | null
  /** A question about a time of day or of Shabbos, which the zmanim answer
   *  rather than any listing: "when is candle lighting" (candles), "when
   *  does Shabbos end" (havdalah), "Shabbos times" (shabbos: both), "when
   *  is shkia" (a daily zman, by its label in ZmanimData). */
  times: TimesAsk | null
  /** A question about the eruv itself ("is the eruv up", "can I carry this
   *  Shabbos"), which no listing answers: each eruv posts its own status.
   *  Not set when it's one word of a search for something else ("a hotel
   *  inside the eruv"), which the listings can answer. */
  eruv: boolean
  /** "within 2 miles", "within a 15 minute drive", "10 minute walk": the
   *  farthest a result may be, in straight-line miles (see WITHIN). */
  within: Within | null
  /** "than Giant", "besides ShopRite", "other than Trader Joe's": a place
   *  the asker already knows and wants something else than — its name's
   *  words, folded. A listing whose name has all of them is left out. One
   *  of the questions actually asked in the group: "a better place for
   *  kosher wine than Giant". */
  excluding: string[]
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
  /** The day or days asked about ("Shacharis tomorrow", "Friday night
   *  minyan", "Shabbos"), each with the tefillos its part of the day means
   *  when none was named; null for the next ones from now. */
  when: MinyanWhen[] | null
}

/** One day a minyan question is about: today, tomorrow or a weekday, how
 *  the answer names it, and the tefillos that part of the day means
 *  ("morning" is Shacharis) when the question named none. */
export type MinyanWhen = { day: 'tomorrow' | DayKey; label: string; tefillos: Tefillah[] | null }

const MORNING: Tefillah[] = ['shacharis', 'shabbos_mussaf']
const AFTERNOON: Tefillah[] = ['mincha', 'mincha_maariv']
const EVENING: Tefillah[] = ['mincha', 'mincha_maariv', 'maariv', 'kabbalas_shabbos']
const PARTS: Record<string, { label: string; tefillos: Tefillah[] }> = {
  morning: { label: 'morning', tefillos: MORNING },
  afternoon: { label: 'afternoon', tefillos: AFTERNOON },
  evening: { label: 'evening', tefillos: EVENING },
  night: { label: 'night', tefillos: EVENING },
}
const WEEKDAYS: Record<string, DayKey> = { sunday: 'sun', monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat' }
const capital = (w: string) => w[0].toUpperCase() + w.slice(1)

/** The days in a minyan question, and the question without them. Only
 *  read when the question is about minyanim: "open friday" is a store's
 *  hours, not davening. Shabbos is its evening and its day, Friday night
 *  its own evening, Motzei Shabbos Saturday's Maariv. */
function readMinyanWhen(text: string): { when: MinyanWhen[] | null; rest: string } {
  const part = '(?:\\s+(morning|afternoon|evening|night))?'
  const rules: [RegExp, (m: RegExpMatchArray) => MinyanWhen[]][] = [
    [/\b(?:friday night|erev (?:shabbos|shabbat)|leil (?:shabbos|shabbat))\b/, () => [{ day: 'fri', label: 'Friday night', tefillos: EVENING }]],
    [/\bmotzei (?:shabbos|shabbat)\b/, () => [{ day: 'sat', label: 'Motzei Shabbos', tefillos: ['maariv', 'mincha_maariv'] }]],
    [/\b(?:shabbos|shabbat|saturday) (?:morning|day)\b/, () => [{ day: 'sat', label: 'Shabbos morning', tefillos: MORNING }]],
    [/\b(?:shabbos|shabbat) (afternoon|mincha)\b/, () => [{ day: 'sat', label: 'Shabbos afternoon', tefillos: AFTERNOON }]],
    [/\b(?:shabbos|shabbat)\b/, () => [{ day: 'fri', label: 'Friday night', tefillos: ['kabbalas_shabbos', 'maariv', 'mincha_maariv'] }, { day: 'sat', label: 'Shabbos', tefillos: null }]],
    [new RegExp(`\\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)${part}\\b`), (m) => [{ day: WEEKDAYS[m[1]], label: m[2] ? `${capital(m[1])} ${PARTS[m[2]].label}` : capital(m[1]), tefillos: m[2] ? PARTS[m[2]].tefillos : null }]],
    [new RegExp(`\\btomorrow${part}\\b`), (m) => [{ day: 'tomorrow', label: m[1] ? `tomorrow ${PARTS[m[1]].label}` : 'tomorrow', tefillos: m[1] ? PARTS[m[1]].tefillos : null }]],
  ]
  // "Today" and "tonight" aren't read as a day: the next minyanim from now
  // answer them already, and when tonight's are over, say when tomorrow's
  // first is, which a day's list wouldn't.
  for (const [re, when] of rules) {
    const m = text.match(re)
    if (m) return { when: when(m), rest: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim() }
  }
  return { when: null, rest: text }
}

const TEFILLAH_WORDS: Record<string, Tefillah[] | null> = {
  shacharis: ['shacharis'],
  mincha: ['mincha', 'mincha_maariv'],
  maariv: ['maariv', 'mincha_maariv'],
  mussaf: ['shabbos_mussaf'],
  musaf: ['shabbos_mussaf'],
  minyan: null,
  minyanim: null,
  daven: null,
  davening: null,
  service: null,
  // "kabbalas" and "kabbalat" as fold() leaves them.
  kabbala: ['kabbalas_shabbos'],
  kabbalat: ['kabbalas_shabbos'],
  kabbolas: ['kabbalas_shabbos'],
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

/** "open after 6" and its kin: how the time was asked, and the time. */
export type OpenAt = {
  /** after: open at some point after it ("open after 6", "open past 9").
   *  until: open right up to it ("open until 10", "open till midnight").
   *  at: open at that moment ("open at 8am", "open by 7").
   *  before: opens before it ("open before 8am"). */
  how: 'after' | 'until' | 'at' | 'before'
  /** Minutes after midnight today; 1440 is midnight tonight. */
  minutes: number
}

const OPEN_AT =
  /\b(?:(?:whats|what's|what is|anything|something|who is|whos|who's|is there anything|still)\s+)*open(?:s|ed)?\s+(past|after|later than|until|till|til|at|by|around|before)\s+(?:(midnight|noon)|(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?)(?:\s+(?:today|tonight|this evening))?\b/i

const OPEN_HOW: Record<string, OpenAt['how']> = {
  past: 'after', after: 'after', 'later than': 'after',
  until: 'until', till: 'until', til: 'until',
  at: 'at', by: 'at', around: 'at',
  before: 'before',
}

/** The time in "open after 6". A bare hour is read the way people mean it:
 *  asking what's open after or until 6 is asking about the evening, so it's
 *  6 PM, and midnight for 12; asking what's open at or before 8 is usually
 *  the morning, so 5 to 11 are AM and 1 to 4 PM. An answer always says the
 *  time it used ("open after 6:00 PM"), so a wrong guess shows. */
function readOpenAt(input: string): { openAt: OpenAt | null; rest: string } {
  const m = input.match(OPEN_AT)
  if (!m) return { openAt: null, rest: input }
  const how = OPEN_HOW[m[1].toLowerCase().replace(/\s+/g, ' ')]
  let minutes: number
  if (m[2]) {
    minutes = m[2].toLowerCase() === 'noon' ? 720 : 1440
  } else {
    const hour = Number(m[3])
    const minute = Number(m[4] ?? 0)
    const said = (m[5] ?? '').toLowerCase().replace(/\./g, '')
    if (hour > 23 || minute > 59) return { openAt: null, rest: input }
    let h: number
    if (said === 'pm') h = (hour % 12) + 12
    else if (said === 'am') h = hour === 12 ? 24 : hour
    else if (hour === 0 || hour > 12) h = hour
    else if (how === 'after' || how === 'until') h = hour === 12 ? 24 : hour + 12
    else h = hour === 12 ? 12 : hour <= 4 ? hour + 12 : hour
    minutes = h * 60 + minute
  }
  return { openAt: { how, minutes: Math.min(minutes, 1440) }, rest: input.replace(m[0], ' ') }
}

/** The question without its "open at 8am": what's left can say where
 *  ("near HUP") without "at 8am" reading as a place. */
export function withoutOpenAt(input: string): string {
  return readOpenAt(input).rest
}

/** "6:00 PM", "midnight", "noon": a time from OpenAt, as answers say it. */
export function formatOpenAtTime(minutes: number): string {
  if (minutes === 1440 || minutes === 0) return 'midnight'
  if (minutes === 720) return 'noon'
  const h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
}

export type Within = {
  /** Straight-line miles — what the guide can measure without a paid lookup. */
  miles: number
  /** How it was asked, so an answer can say so ("about a 15-minute drive"). */
  asked: { minutes: number; by: 'drive' | 'walk' } | null
}


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

// "than Giant", "besides ShopRite": what follows names a place to leave out.
const EXCLUDING = /\b(?:other than|better than|rather than|instead of|apart from|besides|except|than)\s+(.+)$/

/** Takes a "than X" off the end of the text: the words of X, up to the first
 *  filler or kind-of-place word ("than giant near center city" leaves out
 *  only Giant). */
function readExcluding(text: string): { excluding: string[]; rest: string } {
  const m = text.match(EXCLUDING)
  if (!m) return { excluding: [], rest: text }
  const after = m[1].split(' ')
  const name: string[] = []
  for (const w of after) {
    if (STOPWORDS.has(w) || CONCEPT_BY_WORD.has(fold(w))) break
    name.push(w)
  }
  if (name.length === 0) return { excluding: [], rest: text }
  const rest = `${text.slice(0, m.index)} ${after.slice(name.length).join(' ')}`
  return { excluding: name.map(fold), rest }
}

const DATE_OUT = /\b(?:for a date|date night|date (?=restaurants?\b|places?\b|spots?\b|food\b|ideas?\b))/g

const BEST = /\b(?:best|better|top|favou?rite|most popular|highest rated|highly rated|top rated|recommend(?:ed|ation|ations)?)\b/

export type MetaAsk = 'contents' | 'ask' | 'about' | 'add'

// Read off the plain words (lower case, apostrophes gone: "what's" is
// "whats"). Checked in this order: "how do I add" before "what's on".
const META: [MetaAsk, RegExp][] = [
  ['add', /\b(?:how (?:do|can|would) (?:i|we|you) (?:add|submit|suggest|list|update|edit|correct|fix|change)|(?:add|submit|suggest) (?:a |my |our )?(?:new )?(?:listing|place|business|store|shul|restaurant))\b/],
  ['about', /\b(?:who (?:runs|made|built|maintains|owns|keeps|updates|is behind|are you)|about (?:this|the) (?:site|website|guide|app)|is this (?:site |website |guide )?(?:reliable|accurate|official|up to date))\b/],
  ['ask', /\b(?:what (?:can|should|do) (?:i|you) (?:ask|search|type)|how (?:does|do i use) (?:this|the) (?:search|site|guide|app)|how do i (?:use|search) (?:this|it))\b/],
  ['contents', /\b(?:(?:whats|what is) (?:on |in )?(?:here|this (?:site|website|guide|app)|the (?:site|website|guide|app))|what (?:does|do) (?:this|the|you) (?:site |website |guide |app )?(?:have|has|cover|include|list)|what can (?:i|you) find (?:here|on (?:this|the) (?:site|website|app)|in (?:this|the) guide))\b/],
]

export type TimesAsk = 'candles' | 'havdalah' | 'shabbos' | 'Sunrise' | 'Latest Shema' | 'Sunset' | 'Nightfall'

// Words that name a daily zman, by the label ZmanimData gives it. Folded.
const DAILY_ZMAN: Record<string, TimesAsk> = {
  sunrise: 'Sunrise', netz: 'Sunrise', hanetz: 'Sunrise',
  sunset: 'Sunset', shkia: 'Sunset', shkiah: 'Sunset', shkiya: 'Sunset', shekia: 'Sunset',
  shema: 'Latest Shema', shma: 'Latest Shema',
  nightfall: 'Nightfall', tzeis: 'Nightfall', tzais: 'Nightfall', tzeit: 'Nightfall', tzet: 'Nightfall',
}
// What can come with them without making it a question about something
// else: "when is candle lighting this Friday". Folded.
const TIMES_CONTEXT = new Set([
  'candle', 'lighting', 'licht', 'bentchen', 'bentching', 'benching', 'havdalah', 'havdala', 'motzei', 'motzash',
  'shabbos', 'start', 'begin', 'end', 'over', 'out', 'time', 'zman', 'zmanim', 'latest', 'sof',
  'today', 'tonight', 'friday', 'saturday', 'this', 'week', 'weekend', 'day', 'when',
])

/** What time a question asks for, from its searched words, or null when
 *  it's about something else ("shabbos candles" is the item). */
function readTimes(terms: readonly string[], plain: string): TimesAsk | null {
  if (terms.length === 0 || !terms.every((t) => TIMES_CONTEXT.has(t) || t in DAILY_ZMAN)) return null
  const has = (...ws: string[]) => ws.some((w) => terms.includes(w))
  // Candles without the lighting are the candles: "havdalah candles" is
  // something to buy, not a time.
  if (has('candle') && !has('lighting', 'licht', 'bentchen', 'bentching', 'benching')) return null
  const daily = terms.find((t) => t in DAILY_ZMAN)
  if (daily) return DAILY_ZMAN[daily]
  if (has('havdalah', 'havdala', 'motzei', 'motzash') || (has('shabbos') && has('end', 'over', 'out'))) return 'havdalah'
  if (has('lighting', 'licht', 'bentchen', 'bentching', 'benching') || (has('shabbos') && has('start', 'begin'))) return 'candles'
  // "When is Shabbos", "Shabbos times": not "shabbos" alone, which is as
  // often Shabbos food or a Shabbos-friendly hotel.
  if (has('shabbos') && (/\bwhen\b/.test(plain) || /\b(times?|zmanim)\b/.test(plain))) return 'shabbos'
  return null
}

// The words of a question about the eruv, and the ones that can come with
// them without making it about something else. Folded (see fold).
const ERUV_WORDS = new Set(['eruv', 'eruvin', 'eruvim', 'eiruv', 'techum'])
const ERUV_CONTEXT = new Set([
  'status', 'up', 'down', 'working', 'map', 'boundary', 'boundaries', 'border', 'area',
  'shabbos', 'shabbat', 'today', 'tonight', 'week', 'weekend', 'this', 'still', 'check',
])

export const NEAR_ME = /\b(?:(?:near|close to|closest to|nearest to|around|by|next to) (?:me|here|us)|nearby|near by|close by)\b/g
const OPEN_TODAY = /\b(?:open (?:today|tonight|later(?: today| tonight)?|this (?:evening|afternoon))|still open (?:today|tonight))\b/g
const OPEN_NOW = /\b(?:open (?:right now|now|late|on sunday|on friday)|(?:whats|what is|anything|something|who is|whos) open|open)\b/g

/** The question with "open now" / "open today" taken out, for judging it
 *  without the clock: what the guide has, whatever the hour. */
export function withoutOpenWords(input: string): string {
  return plainWords(readOpenAt(input).rest).join(' ').replace(OPEN_TODAY, ' ').replace(OPEN_NOW, ' ').replace(/\s+/g, ' ').trim()
}

/** Reads a query into its parts. It never loses the query entirely: if only
 *  filler was typed ("kosher", "where"), those words are kept as terms, since
 *  searching for them beats showing nothing. */
export function parseAsk(input: string): AskQuery {
  const raw = input.trim()
  // A time is read off the text first: once punctuation becomes spaces,
  // "6:45" is just two numbers that no listing contains.
  // "Open after 6" before anything else reads a time: it isn't a minyan
  // at 6, and "6pm" isn't a word to look for.
  const openAtRead = readOpenAt(raw)
  const openAt = openAtRead.openAt
  const within = readWithin(openAtRead.rest)
  const clock = readClock(within.rest)
  // Compared by what `replace` removed rather than with `.test()`: both
  // patterns are global, and a global regex's `.test()` keeps its position
  // between calls, so the next query would be checked from the wrong place.
  const typed = plainWords(clock.rest).join(' ')
  const withoutNear = typed.replace(NEAR_ME, ' ')
  const nearMe = withoutNear !== typed
  const withoutToday = withoutNear.replace(OPEN_TODAY, ' ')
  const openToday = !openAt && withoutToday !== withoutNear
  const withoutOpen = withoutToday.replace(OPEN_NOW, ' ')
  const openNow = !openAt && !openToday && withoutOpen !== withoutToday
  const { excluding, rest: excludedOut } = readExcluding(withoutOpen.replace(/\s+/g, ' ').trim())
  // "A date restaurant", "for a date", "date night": a kind of outing, not
  // the fruit, and nothing a listing says — "date" alone is still dates.
  const outing = excludedOut.replace(DATE_OUT, ' ')
  // A minyan question's days ("Friday night", "tomorrow") are when, not
  // words for a shul's listing to have.
  const aboutMinyanim = outing.split(' ').some((w) => w && TEFILLAH_WORDS[fold(w)] !== undefined)
  const minyanWhen = aboutMinyanim ? readMinyanWhen(outing) : { when: null, rest: outing }
  const plain = minyanWhen.rest

  const terms: string[] = []
  const concepts: AskQuery['concepts'] = []
  let asksMinyan = false
  let tefillos: Tefillah[] | null = null
  for (const w of plain.split(' ').filter(Boolean)) {
    const tefillah = TEFILLAH_WORDS[fold(w)]
    if (tefillah !== undefined) {
      asksMinyan = true
      if (tefillah) tefillos = [...new Set([...(tefillos ?? []), ...tefillah])]
      // Every tefillah word means shuls, whether or not it's also one of
      // their everyday words: "kabbalas" isn't, and as a word to look for
      // it found no shul at all.
      if (!concepts.some((c) => c.concept === 'synagogue')) concepts.push({ concept: 'synagogue', word: fold(w) })
      continue
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

  const meta = META.find(([, re]) => re.test(plain))?.[0] ?? null
  if (meta) terms.length = 0
  const times = concepts.length === 0 && !asksMinyan ? readTimes(terms, plain) : null
  if (times) terms.length = 0

  // "Is the eruv up", "can I carry this Shabbos": nothing asked but the
  // eruv. "Carry" is otherwise filler ("who carries challah"), so it only
  // counts with nothing else to look for, which the check below makes sure of.
  const plainWordsFolded = plain.split(' ').filter(Boolean).map(fold)
  const mentionsEruv = plainWordsFolded.some((w) => ERUV_WORDS.has(w)) || /\bcarry(?:ing)?\b/.test(plain)
  const eruv =
    mentionsEruv && concepts.length === 0 && terms.every((t) => ERUV_WORDS.has(t) || ERUV_CONTEXT.has(t))
  if (eruv) terms.length = 0

  const minyan: MinyanAsk | null = asksMinyan && !times ? { tefillos, at: clock.at, when: minyanWhen.when } : null
  const withinAsked = within.within
  // Read before "better than Giant" is taken out: that's still asking
  // for a better one.
  const best = BEST.test(typed)
  const typing = raw !== '' && !/\s$/.test(input)
  const last = plainWords(raw).at(-1)
  if (terms.length === 0 && concepts.length === 0 && !nearMe && !openNow && !openToday && !openAt && !eruv && !times && !meta) {
    const all = words(raw)
    return { raw, terms: all, concepts, nearMe, openNow, openToday, openAt, best, eruv, times, meta, excluding, within: withinAsked, minyan, partial: typing && all.length > 1 ? (all.at(-1) ?? null) : null }
  }
  // Only the word under the cursor, and only if it survived as a term.
  const partial = typing && last !== undefined && terms.at(-1) === fold(last) && terms.length > 1 ? (terms.at(-1) ?? null) : null
  return { raw, terms, concepts, nearMe, openNow, openToday, openAt, best, eruv, times, meta, excluding, within: withinAsked, minyan, partial }
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
