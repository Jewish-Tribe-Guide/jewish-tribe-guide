'use client'

import { useEffect, useState } from 'react'
import type { DirectoryResource } from '@/types'
import {
  type Minyan,
  type MinyanDayKey,
  isMinyanim,
  groupByDay,
  parseTimeToMinutes,
  TEFILLAH_ORDER,
  TEFILLAH_LABELS,
  ALL_MINYAN_DAYS,
} from '@/lib/davening'
import { useZmanAnchors, geoKey, geoOrCommunityDefault, resolveAnchorTime } from '@/lib/useZmanAnchors'
import DenominationFilter from './DenominationFilter'

const DAY_PILL_LABELS: Record<MinyanDayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  rosh_chodesh: 'Rosh Chodesh',
  holiday: 'Holiday',
}

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
const TIME_COL = 'w-16 shrink-0'

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
 * Bordered-card modal showing all minyanim from every synagogue, grouped by
 * day (each day's rows further sub-grouped by tefillah with a banner, so
 * shacharis / mincha / maariv never appear inline). Drive + walk time sit
 * under the shul name.
 */
export default function DaveningTimesModal({ items, isOpen, onClose, initialDenomination = '' }: Props) {
  const [selectedDenominations, setSelectedDenominations] = useState<string[]>(initialDenomination ? [initialDenomination] : [])
  // Empty = no day filter (show every day). Multiple days can be selected at
  // once; clicking an already-selected chip deselects just that one.
  const [selectedDays, setSelectedDays] = useState<MinyanDayKey[]>([])

  // Sync denomination each time the modal opens so it mirrors the parent's filter
  // (seeds the multi-select with just that one value — the visitor can add more
  // from there without it getting stomped, since this only fires on open).
  useEffect(() => {
    if (isOpen) setSelectedDenominations(initialDenomination ? [initialDenomination] : [])
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

  const toggleDay = (d: MinyanDayKey) => {
    setSelectedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  const allShuls = isOpen ? shulsFromItems(items) : []
  const denominations = Array.from(
    new Set(allShuls.map((s) => s.denomination).filter((d): d is string => !!d)),
  ).sort()

  const filtered = selectedDenominations.length
    ? allShuls.filter((s) => s.denomination && selectedDenominations.includes(s.denomination))
    : allShuls
  const byDay = groupByDay(filtered)
  const hasData = filtered.some((s) => s.minyanim.length > 0)

  const visibleByDay = selectedDays.length === 0 ? byDay : byDay.filter((g) => selectedDays.includes(g.day))
  const noDayMatches = hasData && selectedDays.length > 0 && visibleByDay.length === 0

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
  const hasCalculatedRows = visibleByDay.some((g) => g.rows.some((r) => calcFor(r)))

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
          {denominations.length > 1 && (
            <DenominationFilter
              value={selectedDenominations}
              options={denominations}
              onChange={setSelectedDenominations}
            />
          )}

          {filtered.length > 0 && (
            <span className="text-xs text-muted ml-auto">
              {filtered.length} shul{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Day-of-week pills — one horizontally-scrolling row (no wrap) so
            it stays a single line even with Rosh Chodesh/Holiday added; no
            "All" chip — zero selected means "show every day", clicking a
            selected chip again clears just that one, and any number can be
            active at once. ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 px-5 py-2 border-b border-slate-100 shrink-0 overflow-x-auto">
          {ALL_MINYAN_DAYS.map((d) => {
            const active = selectedDays.includes(d)
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={[
                  'shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                  active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {DAY_PILL_LABELS[d]}
              </button>
            )
          })}
        </div>

        {/* One-time disclaimer, not per-row — only shown when at least one
            visible row is a calculated (not shul-confirmed) time. */}
        {hasCalculatedRows && (
          <p className="px-5 py-1.5 text-[11px] text-muted bg-slate-50 border-b border-slate-100 shrink-0">
            Times marked ≈ are calculated from today&apos;s sunset/candle-lighting and may not exactly match the shul&apos;s posted time.
          </p>
        )}

        {/* ── Content — grouped by day, each day sub-grouped by tefillah ──── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!hasData ? (
            <p className="text-sm text-muted text-center py-16">No structured davening data available yet.</p>
          ) : noDayMatches ? (
            <p className="text-sm text-muted text-center py-16">
              No davening times on {selectedDays.map((d) => DAY_PILL_LABELS[d]).join(', ')}.
            </p>
          ) : (
            <div className="space-y-6">
              {visibleByDay.map((group) => (
                <section key={group.day}>
                  {/* Day header — deliberately louder than the tefillah
                      sub-banners below it (bigger, bolder, darker, thicker
                      rule) so the day reads as the primary heading and
                      tefillah as the secondary one, matching their roles. */}
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3 pb-1.5 border-b-2 border-slate-200">
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
                                {/* Left: name, then denomination, then notes — each
                                    on its own line rather than crammed inline. */}
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-sm text-slate-900">{row.shul}</span>
                                  {row.denomination && (
                                    <p className="text-xs text-muted">{row.denomination}</p>
                                  )}
                                  {row.notes && (
                                    <p className="text-xs text-slate-500 italic">{row.notes}</p>
                                  )}
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
