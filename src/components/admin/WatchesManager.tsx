'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { watchHealth, type Watch } from '@/lib/watches'

// ── The "Watches" tab (freshness map, Oct 5) ────────────────────────────────
// The pages the guide reads on its own every morning, whether each is still
// working, and a way to add one. Keystone-K's list files its differences as
// suggestions; any other page is checked for a change. A watch that breaks
// emails the admins once, and shows here in red until it works again.

type Listing = { id: string; name: string; categoryLabel: string }
type Loaded = { available: boolean; watches: Watch[]; listings: Listing[] }

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

function HealthLine({ watch, now }: { watch: Watch; now: number }) {
  const h = watchHealth(watch, now)
  if (h.state === 'paused') return <p className="text-sm text-slate-500">Paused</p>
  if (h.state === 'waiting') return <p className="text-sm text-slate-500">Not checked yet: the first check is tomorrow morning, or press Check now.</p>
  if (h.state === 'stale') {
    return (
      <p className="text-sm font-medium text-red-700">
        Not checked since {day(h.lastRunAt)}. The daily run may have stopped.
      </p>
    )
  }
  if (h.state === 'failing') {
    return (
      <p className="text-sm font-medium text-red-700">
        Not working since {day(h.since)}: {h.error}
      </p>
    )
  }
  return <p className="text-sm text-green-700">Working · read {day(h.since)}</p>
}

function WhatItDoes({ watch }: { watch: Watch }) {
  if (watch.kind === 'keystone_list') {
    return (
      <p className="text-xs text-muted">
        Compared with the guide every morning. Differences go to the moderation queue, quoting the list.
        {watch.lastFiled !== null && ` Last read: ${watch.lastFiled === 0 ? 'nothing new' : `${watch.lastFiled} suggestion${watch.lastFiled === 1 ? '' : 's'}`}.`}
      </p>
    )
  }
  return (
    <p className="text-xs text-muted">
      Checked every morning for a change.{' '}
      {watch.pageChangedAt ? (
        <strong className="text-amber-800">Changed {day(watch.pageChangedAt)}: worth a look.</strong>
      ) : (
        'No change since it was added.'
      )}
    </p>
  )
}

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [listingName, setListingName] = useState('')
  const [label, setLabel] = useState('')
  // Read once per render pass for every row alike; the tab is reloaded to refresh.
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/watches', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the watches.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  const post = (body: unknown) =>
    fetchJson<{ watch?: Watch }>(
      withCommunity('/api/admin/watches', community),
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      'Could not do that.',
    )

  async function act(watch: Watch, action: 'check' | 'pause' | 'resume' | 'remove') {
    if (action === 'remove' && !window.confirm(`Stop watching ${shortUrl(watch.url)}?`)) return
    setSaveError(null)
    setBusy(watch.id)
    try {
      const res = await post({ action, id: watch.id })
      setData((d) =>
        d && {
          ...d,
          watches: action === 'remove' ? d.watches.filter((w) => w.id !== watch.id) : d.watches.map((w) => (w.id === watch.id && res.watch ? res.watch : w)),
        },
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setSaveError(null)
    const listing = listingName.trim() ? data.listings.find((l) => l.name === listingName.trim()) : null
    if (listingName.trim() && !listing) {
      setSaveError('Pick the listing from the list, or leave it empty.')
      return
    }
    setBusy('add')
    try {
      const res = await post({ action: 'add', url, resourceId: listing?.id ?? null, label })
      if (res.watch) setData((d) => d && { ...d, watches: [...d.watches, res.watch!] })
      setUrl('')
      setListingName('')
      setLabel('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not add that page.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading watches…</p>

  const listingOf = new Map(data.listings.map((l) => [l.id, l]))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Pages the guide reads on its own every morning to stay current. <strong>Nothing changes on the site from here:</strong>{' '}
        what a page says goes to the moderation queue for you to approve. If a watch stops working, you&rsquo;re emailed once,
        and again when it works.
      </p>
      {!data.available && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Keeping a list here needs database migration 070. Until it&rsquo;s run, Keystone-K&rsquo;s list is still read every morning.
        </p>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}

      {data.available && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {data.watches.length === 0 && <li className="p-4 text-sm text-muted">No pages watched yet.</li>}
          {data.watches.map((w) => {
            const listing = w.resourceId ? listingOf.get(w.resourceId) : null
            return (
              <li key={w.id} className="p-4" data-testid="watch-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-slate-900">{w.label || shortUrl(w.url)}</p>
                    <a href={w.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary underline">
                      {shortUrl(w.url)}
                    </a>
                    {listing && <p className="text-xs text-slate-600">Keeps current: {listing.name} ({listing.categoryLabel})</p>}
                    <HealthLine watch={w} now={now} />
                    <WhatItDoes watch={w} />
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy !== null || !w.active}
                      onClick={() => void act(w, 'check')}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === w.id ? 'Checking…' : 'Check now'}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void act(w, w.active ? 'pause' : 'resume')}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {w.active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void act(w, 'remove')}
                      className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {data.available && (
        <form onSubmit={add} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Watch a page</p>
          <label className="block text-sm">
            <span className="text-slate-700">Web address</span>
            <input
              type="text"
              inputMode="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. lowermerionsynagogue.org"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">The listing it keeps current (optional)</span>
            <input
              type="text"
              list="watch-listings"
              value={listingName}
              onChange={(e) => setListingName(e.target.value)}
              placeholder="Start typing a name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <datalist id="watch-listings">
              {data.listings.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.categoryLabel}
                </option>
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">Name (optional)</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Lower Merion's weekly times"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null || !url.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'add' ? 'Checking the page…' : 'Watch this page'}
          </button>
          <p className="text-xs text-muted">It&rsquo;s checked once straight away, so you&rsquo;ll see at once whether the guide can read it.</p>
        </form>
      )}
    </div>
  )
}
