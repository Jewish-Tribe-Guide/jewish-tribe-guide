import { parseTimeToMinutes, type Minyan } from './davening'
import { isOutOfSeason, type Season } from './season'
import { sameCrowd } from './schedules'
import { resolveAnchorTime, type AnchorTimes } from './useZmanAnchors'

// ── Summer and winter by the zman, not the clock change ─────────────────────
// A shul's one-season times usually come in pairs: Mekor's Friday Mincha &
// Maariv is 7:00 PM in summer and at candle lighting in winter; its weekday
// one is 15 min before sunset in summer and Maariv 6:30 PM in winter. Shuls
// switch when the zman passes the clock time, not on the clock change, so
// in late October (candle lighting 5:58 PM, clocks not yet back) "7:00 PM ·
// Summer" was still shown as Friday's minyan (the user, Oct 23: seasons
// follow candle lighting). For such a pair it's summer while the zman is
// later than the clock time. Anything else, or a zman not known, keeps the
// clock change's season (season.ts).

type Row = Pick<Minyan, 'tefillah' | 'days' | 'time' | 'season' | 'anchor' | 'offsetMinutes' | 'notBefore' | 'notAfter'>

/** The season a one-season minyan is judged by: its pair's (one clock time,
 *  one zman, the other season, the same crowd on a shared day), else
 *  `season`. */
export function seasonFor(row: Row, all: readonly Row[], season: Season | null, anchors: AnchorTimes | undefined): Season | null {
  if (!row.season) return season
  const partner = all.find(
    (m) => m !== row && m.season && m.season !== row.season && !m.anchor !== !row.anchor && sameCrowd(m.tefillah, row.tefillah) && m.days.some((d) => row.days.includes(d)),
  )
  if (!partner) return season
  const [zman, clock] = row.anchor ? [row, partner] : [partner, row]
  const at = resolveAnchorTime(zman, anchors)
  const z = at ? parseTimeToMinutes(at) : NaN
  const c = parseTimeToMinutes(clock.time)
  if (!Number.isFinite(z) || !Number.isFinite(c)) return season
  return z > c ? 'summer' : 'winter'
}

/** Whether a minyan is out of season (isOutOfSeason), its pair deciding. */
export function outOfSeason(row: Row, all: readonly Row[], season: Season | null, anchors: AnchorTimes | undefined): boolean {
  return isOutOfSeason(row.season, seasonFor(row, all, season, anchors))
}
