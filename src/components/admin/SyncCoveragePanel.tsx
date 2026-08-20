'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import type { SyncCoverage, SyncCheckField } from '@/lib/syncCoverage'

// The Metrics tab's Google Places sync coverage report — three questions an
// admin can't answer today without reading raw `details` JSON:
//   1. Which listings never sync at all (no place id)?
//   2. Which listings have fields the sync is deliberately leaving alone
//      because a person hand-edited them — and what does that field say?
//   3. Which listings' sync is actively failing?
// "Check against Google" (question the ownership rule itself raises: has a
// hand-edited field actually drifted from what Google shows, if anything?)
// is on-demand per listing — the only part of this report that spends a
// live Google Places API call, so it's never run in bulk.

function Section({
  title,
  description,
  count,
  children,
}: {
  title: string
  description: string
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {title} <span className="font-normal text-muted">({count})</span>
          </p>
          <p className="text-xs text-muted mt-0.5">{description}</p>
        </div>
        <span className="text-xs text-muted shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && count > 0 && <div className="border-t border-slate-100 divide-y divide-slate-100">{children}</div>}
    </div>
  )
}

function CheckAgainstGoogle({ token, resourceId }: { token: string; resourceId: string }) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<SyncCheckField[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setChecking(true)
    setError(null)
    try {
      const body = await fetchJson<{ fields: SyncCheckField[] }>(
        '/api/admin/sync-coverage/check',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: resourceId }),
        },
        'Could not check this listing.',
      )
      setResult(body.fields)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check this listing.')
    } finally {
      setChecking(false)
    }
  }

  if (result) {
    return (
      <div className="mt-2 text-xs space-y-1">
        {result.map((f) => (
          <p key={f.field} className={f.matches ? 'text-muted' : 'text-amber-700'}>
            <span className="font-medium">{f.label}:</span> Google says {f.google}
            {f.matches ? ' (matches)' : ' (different from ours)'}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-2">
      <button
        onClick={check}
        disabled={checking}
        className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-2.5 py-1 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
      >
        {checking ? 'Checking…' : 'Check against Google'}
      </button>
      {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
    </div>
  )
}

export default function SyncCoveragePanel({ token }: { token: string }) {
  const [coverage, setCoverage] = useState<SyncCoverage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await fetchJson<{ coverage: SyncCoverage }>(
        '/api/admin/sync-coverage',
        { headers: { Authorization: `Bearer ${token}` } },
        'Failed to load sync coverage.',
      )
      setCoverage(body.coverage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useLoadOnMount(load)

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!coverage) return <p className="text-sm text-muted">Loading sync coverage…</p>

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Google Places auto-sync (hours, phone, name, website) for commercial listings — what it&rsquo;s
        not touching, and why.
      </p>

      <Section
        title="Never synced"
        description="No Google place id — these listings never get touched by the sync at all."
        count={coverage.neverSynced.length}
      >
        {coverage.neverSynced.map((l) => (
          <div key={l.id} className="p-3 text-sm">
            <p>
              <span className="font-medium text-slate-900">{l.name}</span>{' '}
              <span className="text-xs text-muted">{l.categoryLabel}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {l.fields.map((f) => (
                <li key={f.field} className="text-xs text-muted">
                  <span className="font-medium text-slate-700">{f.label}:</span> {f.ourValue}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section
        title="Hand-edited fields"
        description="Have a place id, but these specific fields were manually entered — the sync leaves them alone on purpose."
        count={coverage.protectedFields.length}
      >
        {coverage.protectedFields.map((l) => (
          <div key={l.id} className="p-3 text-sm">
            <p>
              <span className="font-medium text-slate-900">{l.name}</span>{' '}
              <span className="text-xs text-muted">{l.categoryLabel}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {l.fields.map((f) => (
                <li key={f.field} className="text-xs text-muted">
                  <span className="font-medium text-slate-700">{f.label}:</span> {f.ourValue}
                </li>
              ))}
            </ul>
            <CheckAgainstGoogle token={token} resourceId={l.id} />
          </div>
        ))}
      </Section>

      <Section
        title="Failing to sync"
        description="Have a place id, but the Google Places request keeps failing — hours/phone/etc. may be going stale."
        count={coverage.failing.length}
      >
        {coverage.failing.map((l) => (
          <div key={l.id} className="p-3 text-sm">
            <p>
              <span className="font-medium text-slate-900">{l.name}</span>{' '}
              <span className="text-xs text-muted">{l.categoryLabel}</span>
            </p>
            <p className="text-xs text-red-700 mt-0.5">{l.lastSyncError}</p>
            {l.lastSyncFailedAt && (
              <p className="text-xs text-muted">Since {new Date(l.lastSyncFailedAt).toLocaleString()}</p>
            )}
          </div>
        ))}
      </Section>
    </div>
  )
}
