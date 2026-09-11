import { isOutOfSeason, type Season } from './season'
import { parseTimeToMinutes, TEFILLAH_LABELS, type Minyan, type MinyanDayKey, type Tefillah } from './davening'
import { geoKey, geoOrCommunityDefault, resolveAnchorTime, type AnchorTimes } from './useZmanAnchors'
import type { LatLng } from './geo'

/** One shul's structured minyanim, trimmed to what this needs — a real
 *  DirectoryResource carries far more than this, and this stays independent
 *  of that type so it can be unit-tested with plain literals. */
export type ShulMinyanim = {
  name: string
  geo?: LatLng | null
  minyanim: Minyan[]
}

export type UpcomingDavening = {
  /** "Mincha", or "Mincha & Maariv" on the rare occasion two different
   *  tefillah types land on the exact same minute — see the loop below. */
  label: string
  /** Formatted clock time, e.g. "7:14 PM" — already resolved for anchor-based
   *  rows (sunset/candle-lighting/havdalah), not the rule text. */
  time: string
  /** True once every shul's minyanim for today have passed and this is
   *  tomorrow's earliest instead. Real weekdays only — see the module doc. */
  isTomorrow: boolean
  /** The one shul, when only one has a minyan at this exact minute. */
  shul: { name: string; geo?: LatLng | null } | null
  /** How many distinct shuls share this exact time — 1 means `shul` is set;
   *  more means it collapsed to "at N nearby shuls" instead of naming one. */
  shulCount: number
  /** Every shul geo in the tied group, for the caller to find the nearest
   *  one if it wants to show a distance — this function has no visitor
   *  location to do that itself. */
  shulGeos: Array<LatLng | null | undefined>
}

type Candidate = {
  shulName: string
  shulGeo: LatLng | null | undefined
  tefillah: Tefillah
  minutes: number
  time: string
}

/**
 * The single next minyan across every shul passed in — not grouped by
 * tefillah, literally whichever thing is soonest. Two shuls at the exact
 * same minute collapse into one line ("at N nearby shuls"); two shuls five
 * minutes apart do not, even though a glance might call that "the same
 * time" — only an identical resolved minute collapses, matching the
 * distinction the actual site data forces (Congregation Sons of Israel's
 * 15-minutes-before-sunset Mincha is genuinely five minutes ahead of Lower
 * Merion's and Chabad of the Main Line's identical 10-minutes-before, and
 * showing all three as "the same" would be wrong, not just imprecise).
 *
 * `today`/`tomorrow` are the full set of day keys that apply — a plain
 * weekday plus whichever pseudo-days the caller has already resolved to be
 * true (Rosh Chodesh, Yom Tov, a secular holiday; see calendarDaysFor). A
 * minyan whose `days` don't intersect either set at all is never a
 * candidate. Resolving those pseudo-days is deliberately the caller's job,
 * not this function's — it stays pure and testable with plain arrays,
 * the same reasoning `calendarDaysFor` itself documents for keeping the
 * Jewish-calendar lookup out of the low-level day math.
 *
 * A row this function can't put a number on is never a candidate: an
 * out-of-season row (isOutOfSeason), and a free-text time like "Call to
 * Confirm" that parseTimeToMinutes can't parse. Silently skipping a row
 * here is correct, not a bug — the alternative is a home-screen card
 * confidently naming a time that isn't actually happening.
 *
 * Returns null when nothing today or tomorrow resolves to a real time at
 * all — an empty community, or one where every shul only posts Rosh
 * Chodesh/holiday minyanim. The caller renders nothing in that case, the
 * same way `hasDaveningTimes` already gates the per-listing card.
 */
export function nextUpcomingDavening(
  shuls: ShulMinyanim[],
  opts: {
    /** Every day key that applies to today — the plain weekday plus any
     *  pseudo-days already resolved true (see calendarDaysFor). */
    today: MinyanDayKey[]
    tomorrow: MinyanDayKey[]
    nowMinutes: number
    season: Season | null
    /** Keyed by `geoKey` — see useZmanAnchors. A shul with anchor-based rows
     *  whose location hasn't resolved yet simply contributes no candidates
     *  from those rows until it does; the component re-renders when it does. */
    anchors: Record<string, AnchorTimes>
  },
): UpcomingDavening | null {
  const todayCandidates = collectCandidates(shuls, opts.today, opts.season, opts.anchors)
    .filter((c) => c.minutes >= opts.nowMinutes)
  if (todayCandidates.length > 0) {
    return buildResult(todayCandidates, false)
  }

  const tomorrowCandidates = collectCandidates(shuls, opts.tomorrow, opts.season, opts.anchors)
  if (tomorrowCandidates.length > 0) {
    return buildResult(tomorrowCandidates, true)
  }

  return null
}

function collectCandidates(
  shuls: ShulMinyanim[],
  dayKeys: MinyanDayKey[],
  season: Season | null,
  anchors: Record<string, AnchorTimes>,
): Candidate[] {
  const out: Candidate[] = []
  for (const shul of shuls) {
    for (const row of shul.minyanim) {
      if (!row.days.some((d) => dayKeys.includes(d))) continue
      if (isOutOfSeason(row.season, season)) continue

      let time: string | null = null
      if (row.anchor) {
        const resolvedGeo = geoOrCommunityDefault(shul.geo)
        time = resolveAnchorTime(row, anchors[geoKey(resolvedGeo)])
      } else {
        time = row.time
      }
      if (!time) continue

      const minutes = parseTimeToMinutes(time)
      if (!Number.isFinite(minutes)) continue // free text ("Call to Confirm") — no number to sort by

      out.push({ shulName: shul.name, shulGeo: shul.geo, tefillah: row.tefillah, minutes, time })
    }
  }
  return out
}

function buildResult(candidates: Candidate[], isTomorrow: boolean): UpcomingDavening {
  const minMinutes = Math.min(...candidates.map((c) => c.minutes))
  const group = candidates.filter((c) => c.minutes === minMinutes)

  // Distinct tefillah labels, in canonical order — almost always exactly one;
  // see this module's own doc for the rare tie across different tefillah types.
  const distinctTefillah = [...new Set(group.map((c) => c.tefillah))]
  const label = distinctTefillah.map((t) => TEFILLAH_LABELS[t]).join(' & ')

  // Distinct by NAME, not by row — two rows at a shul that both land at this
  // minute (e.g. a merged Mincha/Maariv pair) are still one shul, not two.
  const shulNames = [...new Set(group.map((c) => c.shulName))]

  return {
    label,
    time: group[0].time,
    isTomorrow,
    shul: shulNames.length === 1 ? { name: shulNames[0], geo: group[0].shulGeo } : null,
    shulCount: shulNames.length,
    shulGeos: group.map((c) => c.shulGeo),
  }
}
