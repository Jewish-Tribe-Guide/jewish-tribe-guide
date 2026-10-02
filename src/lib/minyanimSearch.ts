import { parseAsk, termMatches, words, type MinyanWhen } from './ask'
import { TEFILLAH_LABELS, type Tefillah } from './davening'
import type { DateFacts } from './schedules'
import type { DirectoryResource } from '@/types'

// ── Searching on the Minyanim tab (the user's note 4, Oct 1) ────────────────
// The Synagogues page's Minyanim tab has its own search ("in Minyanim"),
// and typing stays there, narrowing the minyanim instead of dropping back
// to the list of shuls: a tefillah ("mincha"), a day ("shabbos", "hoshana
// rabbah", "tomorrow"), a shul ("mekor"), a denomination ("orthodox"), or
// "near me". Read by the same question parser as every search
// (ask.ts parseAsk), as a minyan question: on this tab, every search is
// one, so "shabbos" alone is a day, not a word in a listing.

/** The tab's suggested searches. Each is something the tab answers by
 *  narrowing: the next minyan is already its first line. */
export const MINYANIM_EXAMPLES = ['mincha tonight', 'shacharis tomorrow', 'Shabbos morning', 'maariv near me']

export type MinyanimSearch = {
  /** The tefillos asked about, or null for every one. */
  tefillos: Tefillah[] | null
  /** Whether a tefillah was named ("mincha"), rather than meant by a part
   *  of the day ("Shabbos morning" is Shacharis and Mussaf). */
  named: boolean
  /** The day asked about, or null for whatever day is picked. */
  when: MinyanWhen | null
  nearMe: boolean
  /** Words a shul's name, denomination or address has to have. */
  terms: string[]
}

export function readMinyanimSearch(text: string): MinyanimSearch | null {
  if (!text.trim()) return null
  const q = parseAsk(`minyan ${text}`)
  const minyan = q.minyan
  const asked = minyan?.tefillos ?? null
  // "Shabbos" is Friday night and Shabbos day: the one a tefillah asked
  // about is held on ("kabbalas shabbos" is Friday's), else the whole day.
  const whens = minyan?.when ?? []
  const when =
    (asked ? whens.find((w) => w.tefillos === null || w.tefillos.some((t) => asked.includes(t))) : whens.find((w) => w.tefillos === null)) ?? whens[0] ?? null
  return {
    tefillos: asked ?? when?.tefillos ?? null,
    named: !!asked,
    when,
    nearMe: q.nearMe,
    terms: q.terms.filter((t) => t !== 'minyan'),
  }
}

/** Which of the week's days a search names: -1 for none it can find. */
export function dayIndexFor(when: MinyanWhen | null, days: readonly DateFacts[]): number {
  if (!when) return -1
  const d = when.day
  if (d === 'tomorrow') return days.length > 1 ? 1 : -1
  if (typeof d === 'string') return days.findIndex((x) => x.weekday === d)
  // A day the calendar names; its night is the evening before.
  const i = days.findIndex((x) => x.name === d.name || (d.festival && x.festival === d.name))
  if (i === -1) return -1
  return d.night ? Math.max(0, i - 1) : i
}

/** Whether a shul is one the search names: its name, address or one of
 *  its pick-list values (`extra`: "Orthodox (Ashkenazi)") has every word
 *  typed. */
export function shulMatches(item: DirectoryResource, terms: readonly string[], extra = ''): boolean {
  if (terms.length === 0) return true
  const haystack = words([item.name, extra, item.address ?? ''].join(' '))
  return terms.every((t) => termMatches(t, haystack))
}

/** "Mincha", "Mincha & Maariv", or "Minyanim", for the answer. */
export function tefillosLabel(tefillos: readonly Tefillah[] | null): string {
  if (!tefillos || tefillos.length === 0) return 'Minyanim'
  const own = tefillos.filter((t) => t !== 'mincha_maariv')
  return (own.length ? own : tefillos).map((t) => TEFILLAH_LABELS[t]).join(' & ')
}
