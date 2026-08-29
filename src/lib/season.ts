// Which half of the year it is, for minyanim a shul only runs in one of them.
//
// The boundary is DERIVED, never configured. That's the whole design: an
// admin who has to know and maintain each shul's changeover date doesn't
// scale past the shuls they personally know, and it decays the moment nobody
// re-checks it next year. So this reads the community's own timezone — which
// community.config already carries and validates — and asks whether it is
// currently observing daylight saving. Standard time is winter, daylight is
// summer. Nothing to set up, correct for any future community automatically.
//
// It will sometimes be wrong. Shuls don't all switch on the same day: most
// track the clock change (a fixed 6:30pm maariv works in winter and stops
// making sense in summer, so they revert to sunset-anchored), but some switch
// at Pesach and Sukkos instead. That is affordable ONLY because of what the
// UI does with the answer — dim the row and keep its "Winter only" label,
// never hide it. A few weeks of a slightly-dimmed row that is still perfectly
// readable is a cosmetic error, not a misinformation one. If this ever drives
// something louder than emphasis, the tradeoff has to be revisited.
//
// Returns null rather than guessing for a zone with no DST at all (Phoenix,
// much of Africa and Asia). Callers treat null as "don't dim anything", the
// same never-narrow-on-missing-data rule calendarDays.ts follows. A community
// there would need a real boundary — equinox, or Pesach–Sukkos — and this is
// where it would go.

export type Season = 'winter' | 'summer'

/** Minutes east of UTC for `tz` at `date`, e.g. -240 for New York in July. */
function offsetMinutes(tz: string, date: Date): number | null {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value
  // "GMT-04:00", or plain "GMT" at exactly UTC.
  const m = formatted?.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return formatted === 'GMT' ? 0 : null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/**
 * The community's current season, or null when its timezone doesn't observe
 * DST (so there is no clock change to derive a boundary from).
 *
 * January and July are sampled rather than assuming which is which, so this
 * is correct in the southern hemisphere too: whichever offset is further east
 * is the daylight one either way.
 */
export function currentSeason(now: number, timezone: string): Season | null {
  const year = new Date(now).getFullYear()
  const jan = offsetMinutes(timezone, new Date(Date.UTC(year, 0, 1, 12)))
  const jul = offsetMinutes(timezone, new Date(Date.UTC(year, 6, 1, 12)))
  const today = offsetMinutes(timezone, new Date(now))
  if (jan === null || jul === null || today === null) return null
  if (jan === jul) return null // no DST in this zone
  return today === Math.max(jan, jul) ? 'summer' : 'winter'
}

/** Whether a minyan tagged for one season is out of season right now.
 *  False for an all-year minyan, and false whenever the season is unknown. */
export function isOutOfSeason(season: Season | undefined, current: Season | null): boolean {
  return !!season && current !== null && season !== current
}
