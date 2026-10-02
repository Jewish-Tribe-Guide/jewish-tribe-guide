'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { useCategories } from '@/lib/useCategories'
import { useNow } from '@/lib/useNow'
import { routes } from '@/lib/routes'
import { changeDay, changeTime, type Change } from '@/lib/whatChanged'
import ChangeRow from '@/components/changes/ChangeRow'

// ── What changed, for the admin (step 7a) ───────────────────────────────────
// Every change visitors see on What changed and Today's "This week", and the
// hidden ones, newest first. Hide one that shouldn't be shown, e.g. an
// approval made by mistake and then fixed; Show again undoes it. Hiding
// changes only what's shown: the listing and the log are untouched.

type Loaded = { changes: Change[]; timezone: string }

export default function WhatChangedAdmin({ token }: { token: string }) {
  const community = useCommunitySlug()
  const categories = useCategories() ?? []
  const now = useNow()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/changes', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the changes.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  async function setHidden(change: Change, hidden: boolean) {
    setSaveError(null)
    setBusy(change.id)
    try {
      await fetchJson(
        withCommunity('/api/admin/changes', community),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIds: change.rowIds, hidden }),
        },
        'Could not save.',
      )
      setData((d) => d && { ...d, changes: d.changes.map((c) => (c.id === change.id ? { ...c, hidden } : c)) })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data || now === null) return <p className="text-sm text-muted">Loading the changes…</p>

  const days: { day: string; changes: Change[] }[] = []
  for (const change of data.changes) {
    const day = changeDay(change.at, now, data.timezone)
    if (days.at(-1)?.day === day) days.at(-1)!.changes.push(change)
    else days.push({ day, changes: [change] })
  }

  return (
    <div className="space-y-4" data-testid="what-changed-admin">
      <p className="text-sm text-muted">
        Every change visitors can see on{' '}
        <a href={routes.changes(community)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          What changed
        </a>{' '}
        and on Today, newest first: places added, edited or taken out. Hide one that shouldn&rsquo;t be shown, e.g. an approval you made by mistake and then fixed. Hiding changes only what&rsquo;s shown; the listing itself is untouched. Show again undoes it.
      </p>
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      {days.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing has changed yet.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white px-4 pb-2 shadow-sm">
          {days.map(({ day, changes }) => (
            <section key={day} className="pt-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{day}</h3>
              <ul className="mt-1">
                {changes.map((change) => (
                  <ChangeRow
                    key={change.id}
                    change={change}
                    categories={categories}
                    communitySlug={community}
                    when={`${changeTime(change.at, data.timezone)} · ${change.kind === 'google' ? 'from Google' : 'an approved edit'}`}
                    end={
                      <button
                        type="button"
                        disabled={busy === change.id}
                        onClick={() => void setHidden(change, !change.hidden)}
                        aria-label={`${change.hidden ? 'Show again' : 'Hide'}: ${change.listing.name}`}
                        className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {change.hidden ? 'Show again' : 'Hide'}
                      </button>
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
