// ── What the Jewish calendar says about a day (step 4) ──────────────────────
// Hebcal names each day of a festival ("Sukkot I", "Sukkot VI (CH’’M)",
// "Sukkot VII (Hoshana Raba)", "Shmini Atzeret"). This reads those titles
// into what a shul's schedule turns on: whether the day is Yom Tov (work
// forbidden: a shul's Yom Tov times), Chol HaMoed (the intermediate days),
// and what to call it, in the guide's own spelling, as it already writes
// Shabbos and Shacharis (agreed Oct 1): Sukkos, Shemini Atzeres, Simchas
// Torah, Hoshana Rabbah.
//
// Three titles used to be misread as Yom Tov, and are the reason this is
// its own module with its own tests: Chol HaMoed, which Hebcal marks with
// two apostrophes ("CH’’M") where the old check expected one; Hoshana
// Rabbah, which starts "Sukkot" but is the last day of Chol HaMoed; and
// names that merely begin like a festival's ("Yom Kippur Katan", "Pesach
// Sheni").

export type DayFacts = {
  yomTov: boolean
  cholHamoed: boolean
  /** The day's own name: "Chol HaMoed", "Hoshana Rabbah", "Shemini
   *  Atzeres", "Sukkos", "Erev Pesach". */
  name: string
  /** The festival it belongs to: "Sukkos" for Shemini Atzeres and
   *  Simchas Torah too, as a shul's Sukkos schedule covers them. */
  festival: string
}

/** Hebcal's festival names, as the guide writes them. Order matters:
 *  the longer name first ("Shmini Atzeret" isn't "Sukkot"). */
const FESTIVALS: { hebcal: string; name: string; festival: string }[] = [
  { hebcal: 'Rosh Hashana', name: 'Rosh Hashanah', festival: 'Rosh Hashanah' },
  { hebcal: 'Yom Kippur', name: 'Yom Kippur', festival: 'Yom Kippur' },
  { hebcal: 'Shmini Atzeret', name: 'Shemini Atzeres', festival: 'Sukkos' },
  { hebcal: 'Simchat Torah', name: 'Simchas Torah', festival: 'Sukkos' },
  { hebcal: 'Sukkot', name: 'Sukkos', festival: 'Sukkos' },
  { hebcal: 'Pesach', name: 'Pesach', festival: 'Pesach' },
  { hebcal: 'Shavuot', name: 'Shavuos', festival: 'Shavuos' },
]

/** Chol HaMoed as Hebcal marks it: "(CH’’M)", "(CH''M)" or "(CH’M)". */
const CHOL_HAMOED = /\(CH['’]{1,2}M\)/i
const HOSHANA_RABBAH = /Hoshana Rab/i

/** A Hebcal title read as a day of a festival, or null for anything else
 *  (Rosh Chodesh, Chanukah, a fast, a parsha, "Yom Kippur Katan"). */
export function readHebcalDay(title: string): DayFacts | null {
  const erev = title.startsWith('Erev ')
  const rest = erev ? title.slice(5) : title
  const f = FESTIVALS.find((x) => rest === x.hebcal || rest.startsWith(`${x.hebcal} `))
  if (!f) return null
  // What follows the name: a day number ("II"), a year ("5787"), a
  // marker ("(CH’’M)"). Anything else ("Katan", "Sheni") is another day.
  const tail = rest.slice(f.hebcal.length).trim()
  if (tail && !/^((I|II|III|IV|V|VI|VII|VIII)\b|\d{4}\b|\()/.test(tail)) return null
  if (erev) return { yomTov: false, cholHamoed: false, name: `Erev ${f.name}`, festival: f.festival }
  if (HOSHANA_RABBAH.test(tail)) return { yomTov: false, cholHamoed: true, name: 'Hoshana Rabbah', festival: f.festival }
  if (CHOL_HAMOED.test(tail)) return { yomTov: false, cholHamoed: true, name: 'Chol HaMoed', festival: f.festival }
  return { yomTov: true, cholHamoed: false, name: f.name, festival: f.festival }
}

/** One day ahead, as the calendar has it. */
export type CalendarDay = DayFacts & { date: string }

/**
 * Each day from `from` to `to` (YYYY-MM-DD, inclusive) that the calendar
 * names as part of a festival, from a Hebcal date-range response's
 * `holiday` items. A day with no entry is an ordinary day, within the range
 * asked for; outside it, nothing is known, and callers mustn't read a
 * missing day as an ordinary one.
 */
export function calendarDaysFrom(items: readonly { category: string; title: string; date: string }[], from: string, to: string): CalendarDay[] {
  const out = new Map<string, CalendarDay>()
  for (const i of items) {
    if (i.category !== 'holiday') continue
    const date = i.date.slice(0, 10)
    if (date < from || date > to) continue
    const facts = readHebcalDay(i.title)
    if (!facts) continue
    const had = out.get(date)
    // A day with two entries keeps the weightier: Yom Tov over the rest.
    if (!had || (facts.yomTov && !had.yomTov)) out.set(date, { date, ...facts })
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date))
}
