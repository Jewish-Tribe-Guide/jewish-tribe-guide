'use client'

import { useEffect, useState } from 'react'
import type { DirectoryResource } from '@/types'
import {
  type Minyan,
  isMinyanim,
  groupByTefillah,
  groupByDay,
  parseTimeToMinutes,
  TEFILLAH_ORDER,
  TEFILLAH_LABELS,
} from '@/lib/davening'
import { useZmanAnchors, geoKey, geoOrCommunityDefault, resolveAnchorTime } from '@/lib/useZmanAnchors'
import DenominationFilter from './DenominationFilter'

type GroupMode = 'tefillah' | 'day'

// Most `time` values are a clock time ("7:30am"), which reads fine bold and
// right-aligned next to the days. Some are relative/freeform text instead
// ("10 minutes before sundown", "Please call to confirm…") — bolding and
// right-aligning a whole sentence produces a ragged, hard-to-read block, so
// those get lighter weight and left-aligned text instead (still right-
// anchored as a block, so it doesn't jump around relative to other rows).
const isClockTime = (time: string) => Number.isFinite(parseTimeToMinutes(time))

// Both a plain clock time and a calculated time share this same FIXED width
// (not just a minimum) so the days label beside it lands at the same x
// position on every row in a section, whether or not that particular row
// happens to be calculated — a calculated row's rule text ("20 min before
// Sunset") is otherwise long enough to widen its column and shove the days
// label further left than on a plain clock-time row. Fixed width means the
// rule text wraps onto its own second (or third) line instead.
const TIME_COL = 'w-20 shrink-0'

// A row anchored to a zman (sunset/candle-lighting/havdalah) with a resolved
// calculated time gets that time in the normal bold/right-aligned clock slot
// (it IS today's real time, just derived) — the official rule text drops into
// the secondary/italic slot beneath it, prefixed "≈" so it never reads as an
// exact, shul-confirmed time.
function TimeValue({ time, calculated }: { time: string; calculated?: string | null }) {
  if (calculated) {
    return (
      <span className={`flex flex-col items-end ${TIME_COL}`}>
        <span className="text-sm font-semibold text-slate-800 text-right">{calculated}</span>
        <span className="text-[11px] text-muted italic text-right leading-snug">≈ {time}</span>
      </span>
    )
  }
  return (
    <span
      className={[
        'text-sm font-semibold text-slate-800',
        isClockTime(time) ? `${TIME_COL} text-right` : 'max-w-[220px] sm:max-w-xs text-left',
      ].join(' ')}
    >
      {time}
    </span>
  )
}

type Props = {
  items: DirectoryResource[]
  isOpen: boolean
  onClose: () => void
  /** Pre-select a denomination when the modal opens (mirrors the parent's filter). */
  initialDenomination?: string
}

function shulsFromItems(items: DirectoryResource[]) {
  return items
    .filter((item) => isMinyanim(item.minyanim) && (item.minyanim as Minyan[]).length > 0)
    .map((item) => ({
      name: item.name,
      denomination: item.denomination as string | undefined,
      driveMinutes: item.driveMinutes as number | null | undefined,
      walkMinutes: item.walkMinutes as number | null | undefined,
      geo: item.geo,
      minyanim: item.minyanim as Minyan[],
    }))
}

/** Drive + walk chips rendered below the shul name. */
function TravelLine({
  driveMinutes,
  walkMinutes,
}: {
  driveMinutes?: number | null
  walkMinutes?: number | null
}) {
  if (driveMinutes == null && walkMinutes == null) return null
  return (
    <div className="flex items-center gap-2 mt-0.5">
      {driveMinutes != null && (
        <span className="text-xs text-muted">🚗 {driveMinutes} min</span>
      )}
      {walkMinutes != null && (
        <span className="text-xs text-muted">🚶 {walkMinutes} min</span>
      )}
    </div>
  )
}

/**
 * Bordered-card modal showing all minyanim from every synagogue.
 * Default: group by tefillah. Toggle: group by day (rows further sub-grouped
 * by tefillah with a banner, so shacharis / mincha / maariv never appear inline).
 * Drive + walk time sit under the shul name.
 */
export default function DaveningTimesModal({ items, isOpen, onClose, initialDenomination = '' }: Props) {
  const [groupMode, setGroupMode] = useState<GroupMode>('tefillah')
  const [denomination, setDenomination] = useState(initialDenomination)

  // Sync denomination each time the modal opens so it mirrors the parent's filter.
  useEffect(() => {
    if (isOpen) setDenomination(initialDenomination)
  }, [isOpen, initialDenomination])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const allShuls = isOpen ? shulsFromItems(items) : []
  const denominations = Array.from(
    new Set(allShuls.map((s) => s.denomination).filter((d): d is string => !!d)),
  ).sort()

  const filtered = denomination ? allShuls.filter((s) => s.denomination === denomination) : allShuls
  const byTefillah = groupMode === 'tefillah' ? groupByTefillah(filtered) : []
  const byDay = groupMode === 'day' ? groupByDay(filtered) : []
  const hasData = filtered.some((s) => s.minyanim.length > 0)

  // Only shuls with at least one anchor-based minyan need a location resolved
  // — most shuls are plain clock times and shouldn't trigger a fetch at all.
  const shulGeo = new Map(
    filtered
      .filter((s) => s.minyanim.some((m) => m.anchor))
      .map((s) => [s.name, geoOrCommunityDefault(s.geo)] as const),
  )
  const anchorMap = useZmanAnchors(Array.from(shulGeo.values()))
  const calcFor = (row: { shul: string; anchor?: Minyan['anchor']; offsetMinutes?: number }) => {
    const geo = shulGeo.get(row.shul)
    if (!geo) return null
    return resolveAnchorTime(row, anchorMap[geoKey(geo)])
  }
  const hasCalculatedRows =
    groupMode === 'tefillah'
      ? byTefillah.some((g) => g.rows.some((r) => calcFor(r)))
      : byDay.some((g) => g.rows.some((r) => calcFor(r)))

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="All davening times"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">All Davening Times</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-slate-700 transition-colors cursor-pointer p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Controls ────────────────────────────────────────────────────── */}
        {/* relative + z so the denomination dropdown overlays the scrolling list. */}
        <div className="relative z-20 flex items-center gap-2 px-5 py-3 border-b border-slate-100 shrink-0 flex-wrap">
          {/* Toggle + denomination filter stay on one line together; on mobile the
              toggle labels drop "By " so the denomination control fits beside them. */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-slate-300 overflow-hidden">
              {([['tefillah', 'By Tefillah', 'Tefillah'], ['day', 'By Day', 'Day']] as [GroupMode, string, string][]).map(([mode, lbl, shortLbl]) => (
                <button
                  key={mode}
                  onClick={() => setGroupMode(mode)}
                  className={[
                    'px-2.5 sm:px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                    groupMode === mode ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className="sm:hidden">{shortLbl}</span>
                  <span className="hidden sm:inline">{lbl}</span>
                </button>
              ))}
            </div>

            {denominations.length > 1 && (
              <DenominationFilter
                value={denomination}
                options={denominations}
                onChange={setDenomination}
              />
            )}
          </div>

          {filtered.length > 0 && (
            <span className="text-xs text-muted ml-auto">
              {filtered.length} shul{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* One-time disclaimer, not per-row — only shown when at least one
            visible row is a calculated (not shul-confirmed) time. */}
        {hasCalculatedRows && (
          <p className="px-5 py-1.5 text-[11px] text-muted bg-slate-50 border-b border-slate-100 shrink-0">
            Times marked ≈ are calculated from today&apos;s sunset/candle-lighting and may not exactly match the shul&apos;s posted time.
          </p>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!hasData ? (
            <p className="text-sm text-muted text-center py-16">No structured davening data available yet.</p>
          ) : groupMode === 'tefillah' ? (

            /* ── By Tefillah ─────────────────────────────────────────────── */
            <div className="space-y-6">
              {byTefillah.map((group) => (
                <section key={group.tefillah}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 pb-1.5 border-b border-slate-100">
                    {group.label}
                  </h3>
                  <div className="divide-y divide-slate-50">
                    {group.rows.map((row, i) => {
                      const calc = calcFor(row)
                      return (
                      // flex-wrap + the right block's ml-auto: a long shul name or day
                      // label wraps the times onto their own line instead of forcing
                      // the row (and the modal) wider than the viewport — that overflow
                      // was what let the whole modal be dragged left/right on mobile.
                      <div key={i} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 first:pt-0">
                        {/* Left: name + denomination + travel */}
                        <div className="min-w-0 flex-1">
                          <div>
                            <span className="font-medium text-sm text-slate-900">{row.shul}</span>
                            {row.denomination && (
                              <span className="ml-2 text-xs text-muted">({row.denomination})</span>
                            )}
                          </div>
                          {row.notes && (
                            <p className="text-xs text-slate-500 italic">{row.notes}</p>
                          )}
                          <TravelLine driveMinutes={row.driveMinutes} walkMinutes={row.walkMinutes} />
                        </div>
                        {/* Right: days + time. `time` sometimes carries a long
                            freeform note instead of a short time — no nowrap/shrink-0
                            here, or that note alone forces the row (and the whole
                            modal) wider than the screen. A freeform note drops to its
                            own line below the days (see TimeValue) instead of jamming
                            inline next to them. */}
                        <div
                          className={[
                            'ml-auto flex max-w-full gap-x-2 gap-y-0.5',
                            // A calculated row's TimeValue stacks two lines
                            // (calculated time + rule text underneath) — centering
                            // the days label against that whole two-line block
                            // shifts it down off the top line, so it no longer
                            // lines up with a plain row's single-line days label.
                            // items-start keeps it flush with the top (bold) line.
                            calc ? 'flex-wrap items-start justify-end' : isClockTime(row.time) ? 'flex-wrap items-center justify-end' : 'flex-col items-end',
                          ].join(' ')}
                        >
                          {row.daysLabel && (
                            <span className="text-xs text-muted whitespace-nowrap">{row.daysLabel}</span>
                          )}
                          <TimeValue time={row.time} calculated={calc} />
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>

          ) : (

            /* ── By Day (sub-grouped by tefillah with banners) ───────────── */
            <div className="space-y-6">
              {byDay.map((group) => (
                <section key={group.day}>
                  {/* Day header */}
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 pb-1.5 border-b border-slate-100">
                    {group.label}
                  </h3>

                  {/* Sub-group each day's rows by tefillah */}
                  <div className="space-y-3">
                    {TEFILLAH_ORDER
                      .map((t) => ({
                        tefillah: t,
                        label: TEFILLAH_LABELS[t],
                        rows: group.rows.filter((r) => r.tefillah === t),
                      }))
                      .filter((sub) => sub.rows.length > 0)
                      .map((sub) => (
                        <div key={sub.tefillah}>
                          {/* Tefillah sub-banner — label centered, rule on both sides */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="flex-1 border-b border-slate-100" />
                            <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                              {sub.label}
                            </span>
                            <div className="flex-1 border-b border-slate-100" />
                          </div>

                          {/* Rows — no tefillah label needed on each row */}
                          <div className="divide-y divide-slate-50">
                            {sub.rows.map((row, i) => (
                              <div key={i} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-1.5 first:pt-0">
                                {/* Left: name + denomination + travel */}
                                <div className="min-w-0 flex-1">
                                  <div>
                                    <span className="font-medium text-sm text-slate-900">{row.shul}</span>
                                    {row.denomination && (
                                      <span className="ml-2 text-xs text-muted">({row.denomination})</span>
                                    )}
                                    {row.notes && (
                                      <span className="ml-2 text-xs text-slate-500 italic">{row.notes}</span>
                                    )}
                                  </div>
                                  <TravelLine driveMinutes={row.driveMinutes} walkMinutes={row.walkMinutes} />
                                </div>
                                {/* Right: time only (day is already the section header).
                                    No nowrap/shrink-0 — `time` sometimes carries a long
                                    freeform note instead of a short time (see TimeValue). */}
                                <div className="ml-auto max-w-full">
                                  <TimeValue time={row.time} calculated={calcFor(row)} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </div>

          )}
        </div>
      </div>
    </div>
  )
}
