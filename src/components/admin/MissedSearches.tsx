'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import type { ClassifiedMiss } from '@/lib/missedSearches'
import CollapsibleSection from './CollapsibleSection'

// ── The "Missed searches" tab: the seeding to-do list ───────────────────────
// Searches on the site that found nothing, most asked first, each re-run
// through today's search (see missedSearches.ts). Adding the answer moves a
// search to "Found now" on the next load, so nothing has to be ticked off
// by hand. Dismiss is for what the guide will never have.

type Addable = { id: string; label: string }
type Loaded = { searches: ClassifiedMiss[]; total: number; addable: Addable[]; dismissalsAvailable: boolean }

/** "Sep 26" from the community's own YYYY-MM-DD, read as that calendar day
 *  wherever the admin is. */
function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function AddListing({ search, addable }: { search: ClassifiedMiss; addable: Addable[] }) {
  const community = useCommunitySlug()
  const [category, setCategory] = useState(search.askedCategory ?? '')
  if (addable.length === 0) return null
  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label={`Category to add “${search.term}” to`}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="text-xs border border-slate-300 rounded-md px-1.5 py-1 bg-white"
      >
        <option value="">Add a listing to…</option>
        {addable.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {category && (
        <a
          href={`${routes.slug(community, category)}?form=create`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-primary hover:underline"
        >
          Add
        </a>
      )}
    </span>
  )
}

function SearchRow({
  search,
  addable,
  onDismiss,
  busy,
}: {
  search: ClassifiedMiss
  addable: Addable[]
  onDismiss: ((dismissed: boolean) => void) | null
  busy: boolean
}) {
  const community = useCommunitySlug()
  const { verdict } = search
  const actionable = !search.dismissedAt && verdict.kind !== 'found'
  return (
    <li className="px-4 py-3" data-testid="missed-search">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-slate-900">“{search.term}”</p>
        <p className="text-xs text-muted">
          {search.count} {search.count === 1 ? 'time' : 'times'} · last {formatDay(search.lastDay)}
        </p>
      </div>
      {verdict.kind !== 'missing' && (
        <p className="text-sm text-slate-600 mt-1">
          {verdict.summary}
          {verdict.places.length > 0 && (
            <>
              {' '}
              {verdict.places.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <a
                    href={routes.listing(community, p.category, listingSlug(p))}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {p.name}
                  </a>
                </span>
              ))}
            </>
          )}
        </p>
      )}
      {(actionable || search.dismissedAt) && (
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {actionable && <AddListing search={search} addable={addable} />}
          {onDismiss && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDismiss(!search.dismissedAt)}
              className="text-xs font-medium text-muted hover:text-slate-800 disabled:opacity-50"
            >
              {search.dismissedAt ? 'Restore' : 'Dismiss'}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default function MissedSearches({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(
        await fetchJson<Loaded>(
          withCommunity('/api/admin/missed-searches', community),
          { headers: { Authorization: `Bearer ${token}` } },
          'Failed to load missed searches.',
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  async function setDismissed(term: string, dismissed: boolean) {
    setSaveError(null)
    setBusy(term)
    try {
      await fetchJson(
        withCommunity('/api/admin/missed-searches', community),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ term, dismissed }),
        },
        'Could not save.',
      )
      setData((d) =>
        d && {
          ...d,
          searches: d.searches.map((s) => (s.term === term ? { ...s, dismissedAt: dismissed ? new Date().toISOString() : null } : s)),
        },
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading missed searches…</p>

  const open = data.searches.filter((s) => !s.dismissedAt)
  const missing = open.filter((s) => s.verdict.kind === 'missing')
  const close = open.filter((s) => s.verdict.kind === 'close')
  const found = open.filter((s) => s.verdict.kind === 'found')
  const dismissed = data.searches.filter((s) => s.dismissedAt)

  const rows = (list: ClassifiedMiss[]) => (
    <ul className="divide-y divide-slate-100">
      {list.map((s) => (
        <SearchRow
          key={s.term}
          search={s}
          addable={data.addable}
          busy={busy === s.term}
          onDismiss={data.dismissalsAvailable ? (d) => void setDismissed(s.term, d) : null}
        />
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Searches on the site that found nothing, most asked first. Each one is run through today&rsquo;s search again, so
        once you add the answer it moves to &ldquo;Found now&rdquo; by itself. Only the words and a daily count are kept,
        never who searched.
      </p>
      {!data.dismissalsAvailable && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Dismiss isn&rsquo;t available until database migration 058 is applied.
        </p>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      {data.searches.length === 0 ? (
        <p className="text-sm text-slate-600">No missed searches yet.</p>
      ) : (
        <>
          <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">Not in the guide ({missing.length})</h3>
            <p className="px-4 pb-2 text-xs text-muted">Nothing matches, and nothing close does either.</p>
            {missing.length > 0 ? rows(missing) : <p className="px-4 pb-3 text-sm text-slate-600">None right now.</p>}
          </section>
          <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">Something close is listed ({close.length})</h3>
            <p className="px-4 pb-2 text-xs text-muted">
              Nothing matches as asked, but dropping a word does. Either the item is missing from a place that&rsquo;s
              listed, or the wording beat the search.
            </p>
            {close.length > 0 ? rows(close) : <p className="px-4 pb-3 text-sm text-slate-600">None right now.</p>}
          </section>
          <CollapsibleSection
            title="Found now"
            description="Today's search answers these: added since, or found on a different page than the one searched."
            count={found.length}
            contentClassName=""
          >
            {rows(found)}
          </CollapsibleSection>
          <CollapsibleSection title="Dismissed" count={dismissed.length} contentClassName="">
            {rows(dismissed)}
          </CollapsibleSection>
          {data.total > data.searches.length && (
            <p className="text-xs text-muted">Showing the {data.searches.length} most searched of {data.total}.</p>
          )}
        </>
      )}
    </div>
  )
}
