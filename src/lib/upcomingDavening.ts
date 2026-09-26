import { isOutOfSeason, type Season } from './season'
import { parseTimeToMinutes, TEFILLAH_LABELS, type Minyan, type MinyanDayKey, type Tefillah } from './davening'
import { geoKey, geoOrCommunityDefault, resolveAnchorTime, type AnchorTimes } from './useZmanAnchors'
import type { LatLng } from './geo'

/** One shul's structured minyanim, trimmed to what this needs — a real
 *  DirectoryResource carries far more than this, and this stays independent
 *  of that type so it can be unit-tested with plain literals. */
export type ShulMinyanim = {
  /** The listing's id, when the caller has one — carried through to
   *  `MinyanSlot` so an answer can open the shul it names. */
  id?: string
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
  /** `time`, as minutes since local midnight of the day it falls on (today
   *  or tomorrow, per `isTomorrow`) — not minutes-from-now. Filled from the
   *  same resolved candidate `time` comes from, so the two never disagree.
   *  Feeds formatStartsIn's own "In N min"/"In N hr M min" countdown, which
   *  needs a plain number to do arithmetic on rather than re-parsing the
   *  formatted clock string. */
  minutes: number
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
  shulId?: string
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

      out.push({ shulId: shul.id, shulName: shul.name, shulGeo: shul.geo, tefillah: row.tefillah, minutes, time })
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
    minutes: minMinutes,
    isTomorrow,
    shul: shulNames.length === 1 ? { name: shulNames[0], geo: group[0].shulGeo } : null,
    shulCount: shulNames.length,
    shulGeos: group.map((c) => c.shulGeo),
  }
}

/** One minyan on one day, resolved to a clock time. */
export type MinyanSlot = {
  shulId?: string
  shulName: string
  shulGeo: LatLng | null | undefined
  tefillah: Tefillah
  /** "7:14 PM", or the row's own clock text ("7:00am") for a fixed time. */
  time: string
  /** Minutes since local midnight of its own day. */
  minutes: number
}

/**
 * Every minyan today and tomorrow that resolves to a real time, earliest
 * first — the full list nextUpcomingDavening picks its one answer from, for a
 * search that asks about more than the next minyan ("is there a maariv at
 * 6:45", "upcoming minyanim"). Same rules for what counts: the day keys the
 * caller resolved, in season, and a time that parses (see
 * nextUpcomingDavening's own doc). Not filtered by the clock: the caller
 * decides whether a minyan earlier today still matters to the question.
 */
export function listMinyanim(
  shuls: ShulMinyanim[],
  opts: { today: MinyanDayKey[]; tomorrow: MinyanDayKey[]; season: Season | null; anchors: Record<string, AnchorTimes> },
): { today: MinyanSlot[]; tomorrow: MinyanSlot[] } {
  const sorted = (c: Candidate[]) => c.sort((a, b) => a.minutes - b.minutes || a.shulName.localeCompare(b.shulName))
  return {
    today: sorted(collectCandidates(shuls, opts.today, opts.season, opts.anchors)),
    tomorrow: sorted(collectCandidates(shuls, opts.tomorrow, opts.season, opts.anchors)),
  }
}

/** "In 12 min" / "In 1 hr 12 min" / "In 2 hr" / "Now" — a plain-language
 *  countdown to `target` (minutes since local midnight of the day it falls
 *  on), from `nowMinutes` (minutes since local midnight of TODAY). When
 *  `isTomorrow`, `target` is added to 1440 first so the subtraction still
 *  lands on a positive count regardless of how far past midnight `nowMinutes`
 *  is — this is never called with a `target` that's actually further than 24h
 *  out (nextUpcomingDavening never looks past tomorrow), so there's no
 *  ">24h" case to format.
 *
 *  Exactly 0 minutes away reads as "Now", not "In 0 min" — the card is
 *  naming something happening at this instant, and "In 0 min" reads as a
 *  bug, not a countdown. */
export function formatStartsIn(nowMinutes: number, target: number, isTomorrow: boolean): string {
  const targetFromNow = isTomorrow ? target + 24 * 60 : target
  const delta = Math.max(0, targetFromNow - nowMinutes)
  if (delta === 0) return 'Now'
  const hours = Math.floor(delta / 60)
  const minutes = delta % 60
  if (hours === 0) return `In ${minutes} min`
  if (minutes === 0) return `In ${hours} hr`
  return `In ${hours} hr ${minutes} min`
}
