'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { shortDay, type ReportPeriod } from '@/lib/reports'
import type { Report } from '@/lib/reportsStore'
import { AdminBox, AdminRow } from './AdminUI'

// Reports (the admin redesign's board "Reports"): a week, a month or a year
// of listing views, the places opened most, what was decided, and the way
// to the searches that found nothing and to the history of decisions.

const PERIODS: { period: ReportPeriod; label: string }[] = [
  { period: 'week', label: 'Week' },
  { period: 'month', label: 'Month' },
  { period: 'year', label: 'Year' },
]

const DECIDED: { key: keyof Report['decided']; label: string }[] = [
  { key: 'newPlaces', label: 'New places' },
  { key: 'changes', label: 'Changes' },
  { key: 'removals', label: 'Removals' },
]

export default function ReportsPanel({ token }: { token: string }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [report, setReport] = useState<{ period: ReportPeriod; report: Report } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (p: ReportPeriod) => {
      setError(null)
      try {
        const body = await fetchJson<{ report: Report }>(
          withCommunity(`/api/admin/reports?period=${p}`, community),
          { headers: { Authorization: `Bearer ${token}` } },
          'Failed to load the reports.',
        )
        setReport({ period: p, report: body.report })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    },
    [token, community],
  )
  useLoadOnMount(useCallback(() => load('month'), [load]))

  function choose(p: ReportPeriod) {
    setPeriod(p)
    load(p)
  }

  // What's on screen is the period asked for, once it's in.
  const shown = report?.period === period ? report.report : null

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Over" className="self-start inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.period}
            type="button"
            aria-pressed={period === p.period}
            onClick={() => choose(p.period)}
            className={`min-h-10 px-3.5 rounded-md text-sm font-semibold cursor-pointer ${period === p.period ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
      ) : !shown ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <AdminBox
            title="Listing views"
            action={shown.views.since && <span className="text-[13px] text-slate-600">{`${shown.views.total} since ${shortDay(shown.views.since)}`}</span>}
          >
            <ViewChart bars={shown.views.bars} />
          </AdminBox>

          <div className="grid gap-4 md:grid-cols-2 items-start">
            <AdminBox title="Most viewed places">
              {shown.topPlaces.length === 0 ? (
                <p className="m-0 px-4 py-3.5 text-sm text-slate-600">None opened {shown.words}.</p>
              ) : (
                <ol className="m-0 p-0 list-none">
                  {shown.topPlaces.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3 min-h-12 border-t border-slate-100 first:border-t-0">
                      <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900">{p.name}</span>
                      <span className="text-[13px] text-slate-600 tabular-nums">{p.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </AdminBox>

            <AdminBox title={`Decided ${shown.words}`}>
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="text-[12.5px] text-slate-500">
                    <th className="px-4 pt-2.5 pb-1.5 text-left font-normal">
                      <span className="sr-only">What</span>
                    </th>
                    <th className="pt-2.5 pb-1.5 text-right font-normal w-20">Taken</th>
                    <th className="px-4 pt-2.5 pb-1.5 text-right font-normal w-20">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {DECIDED.map((d) => (
                    <tr key={d.key} className="border-t border-slate-100">
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-900">
                        {d.label}
                      </th>
                      <td className="py-3 text-right tabular-nums text-slate-900">{shown.decided[d.key].taken}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">{shown.decided[d.key].left}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-100">
                <AdminRow href={`${base}/searches`} name="Searches nobody found" line={`${shown.missedSearches} ${shown.words}`} />
              </div>
              <div className="border-t border-slate-100">
                <AdminRow href={`${base}/history/approved`} name="History" line="Who decided what, and when" />
              </div>
            </AdminBox>
          </div>
        </>
      )}
    </div>
  )
}

/** A bar a day (a month, for a year), each with its count above it. */
function ViewChart({ bars }: { bars: Report['views']['bars'] }) {
  if (bars.length === 0) return <p className="m-0 px-4 py-3.5 text-sm text-slate-600">Nothing counted yet.</p>
  const most = Math.max(1, ...bars.map((b) => b.count))
  return (
    <figure className="m-0 px-4 pt-4 pb-3" aria-label="Listing views">
      <ol className="m-0 p-0 list-none flex items-end gap-1 sm:gap-3 h-44 border-b border-slate-200">
        {bars.map((b, i) => (
          <li key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" aria-label={`${b.label}: ${b.count}`}>
            <span aria-hidden="true" className="text-[11px] text-slate-600 tabular-nums">
              {b.count}
            </span>
            <span aria-hidden="true" className="w-full max-w-8 bg-primary rounded-t-[3px]" style={{ height: `${(b.count / most) * 80}%`, minHeight: b.count ? 2 : 0 }} />
          </li>
        ))}
      </ol>
      <ol aria-hidden="true" className="m-0 p-0 list-none flex gap-1 sm:gap-3 pt-1.5">
        {bars.map((b, i) => (
          <li key={i} className="flex-1 min-w-0 text-center text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">
            {b.label}
          </li>
        ))}
      </ol>
    </figure>
  )
}
