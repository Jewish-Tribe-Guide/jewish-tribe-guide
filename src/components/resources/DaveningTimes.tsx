'use client'

import { isMinyanim, groupByTefillah, mergeSameDayTimes, SEASON_LABELS } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import { useZmanAnchors, geoKey, geoOrCommunityDefault, resolveAnchorTime, anchorNoun } from '@/lib/useZmanAnchors'
import { currentSeason, isOutOfSeason } from '@/lib/season'
import { useNow } from '@/lib/useNow'
import { community } from '@/community.config'

// Shared davening-times display for any listing with a `minyanim`-type detail
// field (today, just Synagogues) — used by the generic listing card so shuls
// don't need their own bespoke card. Prefers structured minyanim; falls back to
// the legacy flat "Label: time • Label: time" text some older rows still carry.

/** True when there's anything to render — lets the caller decide whether to
 *  show a section header around this component. */
export function hasDaveningTimes(minyanim: unknown, legacyText?: string): boolean {
  return (isMinyanim(minyanim) && (minyanim as Minyan[]).length > 0) || !!legacyText
}

export default function DaveningTimes({
  minyanim,
  legacyText,
  geo,
}: {
  minyanim?: unknown
  legacyText?: string
  /** The shul's coordinates, when known — enables a calculated clock time for
   *  anchor-based (sunset/candle-lighting/havdalah) rows. Falls back to the
   *  community's default location so a calculation still shows without one. */
  geo?: { lat: number; lng: number } | null
}) {
  if (isMinyanim(minyanim) && (minyanim as Minyan[]).length > 0) {
    return <StructuredDaveningTimes minyanim={minyanim as Minyan[]} geo={geo} />
  }
  if (legacyText) return <LegacyDaveningTimes text={legacyText} />
  return null
}

/** Makes the spaces *inside* a day name unbreakable, leaving the ones after a
 *  comma as the only wrap points. `formatDays` builds these labels as a
 *  comma-joined list ("Mon, Thu, Rosh Chodesh"), so the commas are the only
 *  places a break reads as intentional — without this, a capped column breaks
 *  wherever the last word stopped fitting and gives you "Mon, Thu, Rosh" over
 *  "Chodesh". */
function breakOnlyAtCommas(label: string): string {
  return label.replace(/(?<!,) /g, '\u00a0')
}

/**
 * Renders structured minyanim grouped by tefillah for a single listing.
 * Each group: label header + day/time grid. The official rule text (e.g.
 * "20 min before Sunset") stays the primary value shown — this view is also
 * used for general reference, not just today — with a calculated time for
 * today appended and clearly marked, never swapped in as if it were exact.
 */
function StructuredDaveningTimes({ minyanim, geo }: { minyanim: Minyan[]; geo?: { lat: number; lng: number } | null }) {
  // Pass as a single-shul array so groupByTefillah handles dedup + sort.
  const groups = groupByTefillah([{ name: '', minyanim }])
  const hasAnchorRows = minyanim.some((m) => m.anchor)
  const resolvedGeo = hasAnchorRows ? geoOrCommunityDefault(geo) : null
  const anchorMap = useZmanAnchors(resolvedGeo ? [resolvedGeo] : [])
  const anchors = resolvedGeo ? anchorMap[geoKey(resolvedGeo)] : undefined
  // Dimmed, never dropped. A row the shul only runs in the other half of the
  // year is still the answer to "when is mincha in the summer?", which this
  // view is also read for — and if the derived season is wrong, a dimmed row
  // that still says "Winter only" is something a reader can see and discount,
  // where a missing one is not. See season.ts for why the boundary is derived
  // rather than configured, and why being occasionally wrong is affordable
  // precisely because this is the only thing done with the answer.
  const season = currentSeason(useNow(), community.timezone)

  if (groups.length === 0) return null

  return (
    // One grid for the whole card, with each group's rows as a `subgrid` so
    // every tefillah shares the same two columns. Each group used to own its
    // own `grid-cols-[auto_1fr]`, which sized the day column to that group's
    // longest label — so Shacharis (sized to "Mon, Thu, Rosh Chodesh") started
    // its times far right while Mincha (sized to "Sat") started them
    // immediately, and a card of four groups had four different left edges on
    // its values. A reader parses this block as a table, and a ragged column
    // of times is what made it look disordered.
    //
    // `fit-content`, not `auto`, for the day column: shared columns mean the
    // single widest label sets where every time starts, and one
    // "Mon, Thu, Rosh Chodesh" row — an ordinary shul schedule, not an edge
    // case — was pushing all four groups' times ~45px right on its own. The
    // cap lets that one label wrap to two lines and leaves every other row
    // tighter. It sits just above the width of "Rosh Chodesh", which
    // breakOnlyAtCommas keeps as a single unbreakable token, so the wrap
    // lands after a comma. Labels narrower than the cap still size to their
    // content, so a card without a long one loses nothing.
    <div className="grid grid-cols-[fit-content(5.5rem)_1fr] gap-x-4">
      {groups.map((group, gi) => (
        <div key={group.tefillah} className={`col-span-2 grid grid-cols-subgrid ${gi > 0 ? 'mt-3' : ''}`}>
          <p className="col-span-2 text-xs font-semibold text-muted mb-1">{group.label}</p>
          <dl className="col-span-2 grid grid-cols-subgrid gap-y-1">
            {mergeSameDayTimes(group.rows).flatMap((row, i) => {
              const calc = resolveAnchorTime(row, anchors)
              const dim = isOutOfSeason(row.season, season)
              return [
                <dt key={`d${i}`} className={`text-xs text-muted${dim ? ' opacity-45' : ''}`}>
                  {breakOnlyAtCommas(row.daysLabel || 'Daily')}
                </dt>,
                <dd key={`v${i}`} className={`text-xs font-medium text-slate-800${dim ? ' opacity-45' : ''}`}>
                  {row.time}
                  {/* Notes and the calculated time drop to their own line
                      rather than trailing the value. Aligning the columns
                      globally means the widest day label now sets where every
                      time starts, which leaves a long rule like "15 min before
                      Sunset" less room — and these are secondary information
                      that was also doing its own share of the visual noise.
                      No parentheses: they were there to fence the note off
                      from the time inline, and a separate muted line already
                      does that job. */}
                  {(row.notes || calc || row.season) && (
                    <span className="block font-normal">
                      {row.season && <span className="text-muted">{SEASON_LABELS[row.season]}</span>}
                      {row.season && (row.notes || calc) && <span className="text-muted"> · </span>}
                      {row.notes && <span className="text-muted">{row.notes}</span>}
                      {row.notes && calc && <span className="text-muted"> · </span>}
                      {calc && (
                        <span
                          className="text-primary/80"
                          title={
                            row.notBefore || row.notAfter
                              ? `Calculated from today's ${anchorNoun(row.anchor!)}, held within the shul's posted limits — confirm with the shul.`
                              : `Calculated from today's ${anchorNoun(row.anchor!)} — confirm with the shul.`
                          }
                        >
                          ≈ {calc} today
                        </span>
                      )}
                    </span>
                  )}
                </dd>,
              ]
            })}
          </dl>
        </div>
      ))}
    </div>
  )
}

/**
 * Legacy text fallback: parses the flat "Label: time • Label: time" string
 * from the old `davening` text field into a label/time grid.
 */
function LegacyDaveningTimes({ text }: { text: string }) {
  const entries = text
    .split(/\s*•\s*/)
    .map((entry) => {
      const colonIdx = entry.lastIndexOf(':')
      if (colonIdx === -1) return null
      return {
        label: entry.slice(0, colonIdx).trim(),
        time: entry.slice(colonIdx + 1).trim(),
      }
    })
    .filter(Boolean) as { label: string; time: string }[]

  if (entries.length === 0) {
    return <p className="text-sm text-slate-800 whitespace-pre-line">{text}</p>
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {entries.flatMap((d, i) => [
        <dt key={`l${i}`} className="text-sm text-muted whitespace-nowrap">
          {d.label}
        </dt>,
        <dd key={`v${i}`} className="text-sm font-medium text-slate-800">
          {d.time}
        </dd>,
      ])}
    </dl>
  )
}
