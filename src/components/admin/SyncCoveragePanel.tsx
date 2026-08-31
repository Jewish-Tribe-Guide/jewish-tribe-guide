'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import type { SyncCoverage, SyncCheckField, ClosureReport, PendingFirstSyncReport } from '@/lib/syncCoverage'
import type { BusinessStatus } from '@/lib/hours'

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

// One field's "Resume syncing" action — only ever shown once a check has
// already reported a match, but resumeSyncField re-verifies live anyway
// (see its own comment), so a stale match by the time this is clicked just
// comes back as `matches: false` and the row quietly stays protected.
function ResumeSyncButton({
  token,
  community,
  resourceId,
  field,
  onResumed,
}: {
  token: string
  community: string
  resourceId: string
  field: SyncCheckField['field']
  onResumed: (field: SyncCheckField['field'], matched: boolean) => void
}) {
  const [resuming, setResuming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function resume() {
    setResuming(true)
    setError(null)
    try {
      const body = await fetchJson<{ result: SyncCheckField }>(
        withCommunity('/api/admin/sync-coverage/resume', community),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: resourceId, field }),
        },
        'Could not resume syncing this field.',
      )
      onResumed(field, body.result.matches)
      if (!body.result.matches) setError('No longer matches Google — still protected.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resume syncing this field.')
    } finally {
      setResuming(false)
    }
  }

  return (
    <span className="inline-flex items-baseline gap-2">
      <button
        onClick={resume}
        disabled={resuming}
        className="text-xs font-medium text-primary hover:underline disabled:opacity-60 cursor-pointer"
      >
        {resuming ? 'Resuming…' : 'Resume syncing'}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  )
}

function CheckAgainstGoogle({
  token,
  community,
  resourceId,
  onFieldResumed,
}: {
  token: string
  community: string
  resourceId: string
  onFieldResumed: (field: SyncCheckField['field']) => void
}) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<SyncCheckField[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setChecking(true)
    setError(null)
    try {
      const body = await fetchJson<{ fields: SyncCheckField[] }>(
        withCommunity('/api/admin/sync-coverage/check', community),
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
            {f.matches && (
              <>
                {' — '}
                <ResumeSyncButton
                  token={token}
                  community={community}
                  resourceId={resourceId}
                  field={f.field}
                  onResumed={(field, matched) => {
                    if (matched) onFieldResumed(field)
                  }}
                />
              </>
            )}
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

const STATUS_WORDS: Record<BusinessStatus, string> = {
  OPERATIONAL: 'Open',
  CLOSED_TEMPORARILY: 'Temporarily closed',
  CLOSED_PERMANENTLY: 'Permanently closed',
}

/**
 * Corrects what the public sees about one listing when Google has it wrong.
 *
 * This is the only exit from three states that were otherwise permanent:
 * Google stops returning a status (the sync skips the write and the old badge
 * persists), the listing's sync starts failing, or its place id is cleared so
 * it leaves the sync query altogether. In each, a wrong badge was frozen on a
 * live listing with nothing able to clear it.
 *
 * "Follow Google again" clears the override rather than writing Google's
 * current answer into it — the difference matters, because the listing then
 * keeps tracking Google going forward instead of freezing on today's value.
 */
function ClosureRow({
  listing,
  token,
  community,
  onChanged,
}: {
  listing: ClosureReport
  token: string
  community: string
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(status: BusinessStatus | null) {
    setBusy(true)
    setError(null)
    try {
      await fetchJson(withCommunity('/api/admin/sync-coverage/override', community), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: listing.id, status }),
      }, 'Could not save the override.')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const shown = listing.override ?? listing.googleStatus

  return (
    <div className="p-3 text-sm">
      <p>
        <span className="font-medium text-slate-900">{listing.name}</span>{' '}
        <span className="text-xs text-muted">{listing.categoryLabel}</span>
      </p>
      <p className="text-xs text-muted mt-0.5">
        Google says{' '}
        <span className="font-medium text-slate-700">
          {listing.googleStatus ? STATUS_WORDS[listing.googleStatus] : 'nothing'}
        </span>
        {listing.changedAt && <> · changed {new Date(listing.changedAt).toLocaleDateString()}</>}
      </p>
      {listing.override ? (
        <p className="text-xs text-amber-700 mt-0.5">
          Overridden — visitors see <span className="font-medium">{STATUS_WORDS[listing.override]}</span>
        </p>
      ) : (
        <p className="text-xs text-muted mt-0.5">
          Visitors see <span className="font-medium text-slate-700">{shown ? STATUS_WORDS[shown] : '—'}</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.keys(STATUS_WORDS) as BusinessStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy || listing.override === status}
            onClick={() => save(status)}
            className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default cursor-pointer"
          >
            Show as {STATUS_WORDS[status].toLowerCase()}
          </button>
        ))}
        {listing.override && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save(null)}
            className="rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40 cursor-pointer"
          >
            Follow Google again
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
    </div>
  )
}

export default function SyncCoveragePanel({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [coverage, setCoverage] = useState<SyncCoverage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await fetchJson<{ coverage: SyncCoverage }>(
        withCommunity('/api/admin/sync-coverage', community),
        { headers: { Authorization: `Bearer ${token}` } },
        'Failed to load sync coverage.',
      )
      setCoverage(body.coverage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

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
            <CheckAgainstGoogle token={token} community={community} resourceId={l.id} onFieldResumed={() => load()} />
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

      <Section
        title="Awaiting a first sync"
        description="Have a place id but no sync has ever touched them. Should normally be empty — a listing syncs the moment it's approved."
        count={coverage.pendingFirstSync.length}
      >
        {coverage.pendingFirstSync.map((l: PendingFirstSyncReport) => (
          <ClosureRow
            key={l.id}
            listing={{ ...l, googleStatus: l.addedStatus, override: null, changedAt: null }}
            token={token}
            community={community}
            onChanged={() => load()}
          />
        ))}
      </Section>

      <Section
        title="Closed or overridden"
        description="Google reports these as closed, or an admin has overruled what it says. Listed together because they're the same question seen from either side."
        count={coverage.closures.length}
      >
        {coverage.closures.map((l) => (
          <ClosureRow key={l.id} listing={l} token={token} community={community} onChanged={() => load()} />
        ))}
      </Section>
    </div>
  )
}
