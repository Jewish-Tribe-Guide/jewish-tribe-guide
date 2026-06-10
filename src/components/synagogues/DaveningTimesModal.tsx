'use client'

import { useEffect, useState } from 'react'
import type { DirectoryResource } from '@/types'
import {
  type Minyan,
  isMinyanim,
  groupByTefillah,
  groupByDay,
  TEFILLAH_ORDER,
  TEFILLAH_LABELS,
} from '@/lib/davening'

type GroupMode = 'tefillah' | 'day'

type Props = {
  items: DirectoryResource[]
  isOpen: boolean
  onClose: () => void
}

function shulsFromItems(items: DirectoryResource[]) {
  return items
    .filter((item) => isMinyanim(item.minyanim) && (item.minyanim as Minyan[]).length > 0)
    .map((item) => ({
      name: item.name,
      denomination: item.denomination as string | undefined,
      driveMinutes: item.driveMinutes as number | null | undefined,
      walkMinutes: item.walkMinutes as number | null | undefined,
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
export default function DaveningTimesModal({ items, isOpen, onClose }: Props) {
  const [groupMode, setGroupMode] = useState<GroupMode>('tefillah')
  const [denomination, setDenomination] = useState('')

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

  if (!isOpen) return null

  const allShuls = shulsFromItems(items)
  const denominations = Array.from(
    new Set(allShuls.map((s) => s.denomination).filter((d): d is string => !!d)),
  ).sort()

  const filtered = denomination ? allShuls.filter((s) => s.denomination === denomination) : allShuls
  const byTefillah = groupMode === 'tefillah' ? groupByTefillah(filtered) : []
  const byDay = groupMode === 'day' ? groupByDay(filtered) : []
  const hasData = filtered.some((s) => s.minyanim.length > 0)

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
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 shrink-0 flex-wrap">
          <div className="flex rounded-md border border-slate-300 overflow-hidden">
            {([['tefillah', 'By Tefillah'], ['day', 'By Day']] as [GroupMode, string][]).map(([mode, lbl]) => (
              <button
                key={mode}
                onClick={() => setGroupMode(mode)}
                className={[
                  'px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                  groupMode === mode ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {lbl}
              </button>
            ))}
          </div>

          {denominations.length > 1 && (
            <select
              value={denomination}
              onChange={(e) => setDenomination(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              <option value="">All Denominations</option>
              {denominations.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {filtered.length > 0 && (
            <span className="text-xs text-muted ml-auto">
              {filtered.length} shul{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

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
                    {group.rows.map((row, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 py-2 first:pt-0">
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
                        {/* Right: days + time */}
                        <div className="flex items-center gap-2 shrink-0 text-right">
                          {row.daysLabel && (
                            <span className="text-xs text-muted whitespace-nowrap">{row.daysLabel}</span>
                          )}
                          <span className="text-sm font-semibold text-slate-800 whitespace-nowrap min-w-[3.5rem]">
                            {row.time}
                          </span>
                        </div>
                      </div>
                    ))}
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
                              <div key={i} className="flex items-start justify-between gap-3 py-1.5 first:pt-0">
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
                                {/* Right: time only (day is already the section header) */}
                                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap min-w-[3.5rem] shrink-0 text-right">
                                  {row.time}
                                </span>
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
