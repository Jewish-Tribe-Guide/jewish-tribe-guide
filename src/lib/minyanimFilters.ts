import { words } from './ask'
import type { Tefillah } from './davening'
import { readMinyanimSearch } from './minyanimSearch'
import { minyanimOn, type MinyanSlot } from './upcomingDavening'
import { dayKeysFor, type MinyanSchedule } from './useMinyanSchedule'

// ── The Minyanim view's own Filters (Oct 15, canvas "Synagogues & Minyanim
// sketch") ────────────────────────────────────────────────────────────────
// Tefillah and How far, in the same Filters sheet as the page's own
// (Denomination, which narrows the shuls the view is given). Chips in the
// order a day goes, not A to Z.
//
// Mincha takes in Mincha & Maariv, and Maariv too: someone after either
// davens at a shul that does both together.

export const TEFILLAH_CHOICES: readonly { label: string; tefillos: readonly Tefillah[] }[] = [
  { label: 'Shacharis', tefillos: ['shacharis'] },
  { label: 'Mincha', tefillos: ['mincha', 'mincha_maariv'] },
  { label: 'Maariv', tefillos: ['maariv', 'mincha_maariv'] },
  { label: 'Kabbalas Shabbos', tefillos: ['kabbalas_shabbos'] },
  { label: 'Mussaf', tefillos: ['shabbos_mussaf'] },
]

/** How far, one at a time: from the visitor's location, else the
 *  community's centre, as every row measures it. */
export const WITHIN_CHOICES: readonly { label: string; miles: number }[] = [
  { label: 'Within ½ mi', miles: 0.5 },
  { label: 'Within 1 mi', miles: 1 },
  { label: 'Within 3 mi', miles: 3 },
]

/** The tefillos the chosen chips take in; null when none is chosen. */
export function tefillosChosen(labels: readonly string[]): Tefillah[] | null {
  const chosen = TEFILLAH_CHOICES.filter((c) => labels.includes(c.label)).flatMap((c) => c.tefillos)
  return chosen.length > 0 ? [...new Set(chosen)] : null
}

/** The Tefillah chips a search ticks ("mincha", "kabbalas shabbos"), as a
 *  word an admin taught ticks its filter everywhere else (the user, Oct 15):
 *  each with the words unticking it takes out of the search. */
export function typedTefillahChoices(search: string): Map<string, string> {
  const out = new Map<string, string>()
  const tokens = search.split(/\s+/).filter(Boolean)
  tokens.forEach((token, i) => {
    const said = readMinyanimSearch(token)
    if (!said?.named || !said.tefillos) return
    const next = tokens[i + 1]
    for (const c of TEFILLAH_CHOICES) {
      if (!c.tefillos.every((t) => said.tefillos!.includes(t))) continue
      // "Kabbalas Shabbos" goes as one: left behind, "shabbos" is a day.
      const both = c.tefillos.includes('kabbalas_shabbos') && next && /^shabb?[oa][st]$/i.test(next)
      out.set(c.label, words(both ? `${token} ${next}` : token).join(' '))
    }
  })
  return out
}

export function milesChosen(label: string | null): number | null {
  return WITHIN_CHOICES.find((c) => c.label === label)?.miles ?? null
}

/** A day's minyanim (0 today, 1 tomorrow…) as the Minyanim view lists
 *  them with no filters of its own: a Yom Tov's unposted regular times
 *  folded away. */
export function listedMinyanim(schedule: MinyanSchedule, dayIndex: number): MinyanSlot[] {
  const day = schedule.week[dayIndex]
  if (!day) return []
  const slots = minyanimOn(schedule.shuls, dayKeysFor(day), schedule.season, schedule.anchors)
  return day.yomTov ? slots.filter((s) => schedule.posting[s.shulId ?? '']?.[day.date]?.kind !== 'not-posted') : slots
}

/** How many minyanim are still ahead today, for the Synagogues page's way
 *  in. */
export function minyanimLeftToday(schedule: MinyanSchedule): number {
  return minyanimAhead(schedule).today.length
}

/** What's still ahead today, and tomorrow's for when nothing is (a hotel's
 *  minyanim within a walk, Oct 15). */
export function minyanimAhead(schedule: MinyanSchedule): { today: MinyanSlot[]; tomorrow: MinyanSlot[] } {
  return {
    today: listedMinyanim(schedule, 0).filter((s) => s.minutes >= schedule.nowMinutes),
    tomorrow: listedMinyanim(schedule, 1),
  }
}
