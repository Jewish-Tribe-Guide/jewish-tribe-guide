'use client'

import { isMinyanim, groupByTefillah, mergeSameDayTimes } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import { useZmanAnchors, geoKey, geoOrCommunityDefault, resolveAnchorTime, anchorNoun } from '@/lib/useZmanAnchors'

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
    <div className="grid grid-cols-[auto_1fr] gap-x-4">
      {groups.map((group, gi) => (
        <div key={group.tefillah} className={`col-span-2 grid grid-cols-subgrid ${gi > 0 ? 'mt-3' : ''}`}>
          <p className="col-span-2 text-xs font-semibold text-muted mb-1">{group.label}</p>
          <dl className="col-span-2 grid grid-cols-subgrid gap-y-1">
            {mergeSameDayTimes(group.rows).flatMap((row, i) => {
              const calc = resolveAnchorTime(row, anchors)
              return [
                <dt key={`d${i}`} className="text-xs text-muted whitespace-nowrap">
                  {row.daysLabel || 'Daily'}
                </dt>,
                <dd key={`v${i}`} className="text-xs font-medium text-slate-800">
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
                  {(row.notes || calc) && (
                    <span className="block font-normal">
                      {row.notes && <span className="text-muted">{row.notes}</span>}
                      {row.notes && calc && <span className="text-muted"> · </span>}
                      {calc && (
                        <span
                          className="text-primary/80"
                          title={`Calculated from today's ${anchorNoun(row.anchor!)} — confirm with the shul.`}
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
