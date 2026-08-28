'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import type { SubmissionFunnelStats } from '@/lib/submissionStore'
import { ADMIN_BASE } from '@/lib/adminNav'
import SyncCoveragePanel from './SyncCoveragePanel'

// The 'metrics' tab in /admin: how many submissions are waiting, the
// approve/reject split, and how long an approved one sits in the queue
// before a human acts on it. Every number here already lives in the
// `submission` table — this is a read-only view of it, not new tracking.

function formatHours(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${hours.toFixed(1)} hr`
  return `${(hours / 24).toFixed(1)} days`
}

function formatPercent(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

function StatTile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </>
  )
  const cls = 'bg-white border border-slate-200 rounded-lg shadow-sm p-4'
  // Only Pending/Approved/Rejected link anywhere — the rate and timing tiles
  // are derived numbers with no list of their own to show.
  if (!href) return <div className={cls}>{body}</div>
  return (
    <Link href={href} className={`${cls} block hover:border-primary hover:shadow-md transition-shadow`}>
      {body}
    </Link>
  )
}

export default function MetricsPanel({ token }: { token: string }) {
  const [stats, setStats] = useState<SubmissionFunnelStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await fetchJson<{ stats: SubmissionFunnelStats }>(
        '/api/admin/metrics',
        { headers: { Authorization: `Bearer ${token}` } },
        'Failed to load metrics.',
      )
      setStats(body.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useLoadOnMount(load)

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!stats) return <p className="text-sm text-muted">Loading metrics…</p>

  const decided = stats.approved + stats.rejected

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        The submission moderation queue, all time — how much is waiting, and how it&rsquo;s been handled.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Pending" value={String(stats.pending)} href={ADMIN_BASE} />
        <StatTile label="Approved" value={String(stats.approved)} href={`${ADMIN_BASE}/history/approved`} />
        <StatTile label="Rejected" value={String(stats.rejected)} href={`${ADMIN_BASE}/history/rejected`} />
        <StatTile
          label="Approval rate"
          value={formatPercent(stats.approvalRate)}
          sub={decided > 0 ? `of ${decided} decided` : 'nothing decided yet'}
        />
        <StatTile label="Avg. time to approval" value={formatHours(stats.avgHoursToApproval)} />
        <StatTile label="Median time to approval" value={formatHours(stats.medianHoursToApproval)} />
      </div>

      <div className="pt-2">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Google sync coverage</h3>
        <SyncCoveragePanel token={token} />
      </div>

    </div>
  )
}
