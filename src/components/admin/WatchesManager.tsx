'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { MENU_WATCH_CREATOR, watchHealth, type Watch } from '@/lib/watches'
import { refuahHospitalId } from '@/lib/refuahWatch'
import { isMekorList } from '@/lib/mekorWatch'
import { isListingPageWatch } from '@/lib/listingPageWatch'
import { groupWatches, watchGroupOf, type WatchGroup, type WatchGroupKey, type WatchRank, type WatchRow } from '@/lib/watchGroups'
import { isIgnoredSender, isNewsletterWatch } from '@/lib/newsletter'

// ── The "Watches" tab (freshness map, Oct 5) ────────────────────────────────
// The pages the guide reads on its own every morning, whether each is still
// working, and a way to add one. Keystone-K's list files its differences as
// suggestions; any other page is checked for a change. A watch that breaks
// emails the admins once, and shows here in red until it works again.
// A shul's newsletter is watched by its sender's address (newsletter.ts),
// added here with its shul. A sender left without one (from before the
// Gmail script sent only these, Oct 18) can still be tied to its shul.

type Listing = { id: string; name: string; categoryLabel: string }
type Loaded = { available: boolean; watches: Watch[]; listings: Listing[] }
type Action = 'check' | 'pause' | 'resume' | 'remove' | 'link' | 'ignore'

/** A group longer than this starts closed, showing only what needs a look. */
const OPEN_UP_TO = 4
const collapsible = (g: WatchGroup) => g.rows.length > OPEN_UP_TO

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shortUrl(url: string): string {
  return url.replace(/^mailto:/i, '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
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
  const lastRead = watch.lastFiled !== null && ` Last read: ${watch.lastFiled === 0 ? 'nothing new' : `${watch.lastFiled} suggestion${watch.lastFiled === 1 ? '' : 's'}`}.`
  if (isIgnoredSender(watch)) return <p className="text-xs text-muted">Not a shul: its emails are skipped. Remove this to read them again.</p>
  // A shul's newsletter, read as it comes in (newsletter.ts).
  if (isNewsletterWatch(watch)) {
    return (
      <p className="text-xs text-muted" data-testid="newsletter-watch">
        Its newsletters, read as they come in. Changed times, and anything else it says about a place in the guide, go to the moderation queue with the
        email beside them. You&rsquo;re emailed if none comes for a month.{' '}
        {watch.pageChangedAt ? `Last newsletter ${day(watch.pageChangedAt)}.` : 'No newsletter read yet.'}
        {watch.pageChangedAt && lastRead}
      </p>
    )
  }
  if (watch.kind === 'keystone_list') {
    return (
      <p className="text-xs text-muted">
        Compared with the guide every morning. Differences go to the moderation queue, quoting the list.
        {lastRead}
      </p>
    )
  }
  // Mekor Habracha's kosher list, read place by place (mekorWatch.ts).
  if (isMekorList(watch.url)) {
    return (
      <p className="text-xs text-muted" data-testid="mekor-watch">
        Compared with the guide every morning. A place it lists that the guide lacks, and any hechsher the guide shows that it doesn&rsquo;t (IKC
        above all), go to the moderation queue, quoting the list. Nothing is taken off without you.
        {lastRead}
      </p>
    )
  }
  // A hospital's page on Refuah is read from its data and compared with the
  // hospital's listing (refuahWatch.ts), like Keystone-K's list.
  if (refuahHospitalId(watch.url)) {
    return (
      <p className="text-xs text-muted">
        Compared with the hospital every morning. A new contact, or a changed phone, email or website, goes to the moderation queue as from Refuah.
        {lastRead}
      </p>
    )
  }
  // A food place's menu, given its watch by the daily run (menuWatch.ts).
  if (watch.createdBy === MENU_WATCH_CREATOR) {
    return (
      <p className="text-xs text-muted" data-testid="menu-watch">
        Its menu link, checked every morning. When the menu changes, the AI reads it, and dishes the listing doesn’t have wait on the Main dishes tab. Added for every place with a menu link: pause it to stop it.{' '}
        {watch.pageChangedAt ? `Last changed ${day(watch.pageChangedAt)}.` : 'No change since it was added.'}
        {watch.lastFiled ? ` Last read: new dishes for the Main dishes tab.` : ''}
      </p>
    )
  }
  // A shul's or mikvah's own page, read by the AI when it changes
  // (listingPageWatch.ts).
  if (isListingPageWatch(watch)) {
    return (
      <p className="text-xs text-muted" data-testid="listing-page-watch">
        Checked every morning. When the page changes, the AI reads it, and davening times or hours that differ from the listing go to the
        moderation queue with the page beside them. A page that agrees changes nothing, not even the listing&rsquo;s date.{' '}
        {watch.pageChangedAt ? `Last changed ${day(watch.pageChangedAt)}.` : 'No change since it was added.'}
        {watch.pageChangedAt && lastRead}
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

/** One group: a heading that says how many and what needs doing, and its
 *  rows. A long group starts closed, but a row that needs a look (or one
 *  the admin just acted on) shows anyway, so nothing broken hides. */
function WatchGroupSection({ group, open, onToggle, children }: { group: WatchGroup; open: boolean; onToggle: () => void; children: (row: WatchRow) => React.ReactNode }) {
  const { toLink, notWorking, paused } = group.counts
  const shown = open ? group.rows : group.rows.filter((r) => r.needsLook || r.keepShown)
  const notes = [
    toLink > 0 && <span key="link" className="text-amber-800">{toLink} to link</span>,
    notWorking > 0 && <span key="broken" className="text-red-700">{notWorking} not working</span>,
    paused > 0 && <span key="paused" className="text-slate-500">{paused} paused</span>,
  ].filter(Boolean)
  const heading = (
    <>
      <span className="font-semibold text-slate-900">{group.label}</span>{' '}
      <span className="text-slate-500">{group.rows.length}</span>{' '}
      {notes.length > 0 && <span className="font-medium">{notes.flatMap((n, i) => (i ? [', ', n] : [n]))}</span>}
    </>
  )
  return (
    <section className="rounded-lg border border-slate-200 bg-white" data-testid="watch-group" aria-label={group.label}>
      <h3 className="text-sm">
        {collapsible(group) ? (
          <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-left">
            {heading}{' '}
            <span className="ml-auto text-xs font-medium text-primary">{open ? 'Hide' : `Show all ${group.rows.length}`}</span>
          </button>
        ) : (
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3">{heading}</span>
        )}
      </h3>
      {shown.length > 0 && <ul className="divide-y divide-slate-100 border-t border-slate-100">{shown.map(children)}</ul>}
    </section>
  )
}

/** A newsletter sender no one has tied to its shul yet: pick the shul, or
 *  say it isn't one. */
function NewsletterLink({ listings, busy, onLink, onIgnore }: { listings: Listing[]; busy: boolean; onLink: (id: string) => void; onIgnore: () => void }) {
  const [name, setName] = useState('')
  const listing = listings.find((l) => l.name === name.trim())
  return (
    <div className="space-y-2" data-testid="newsletter-unlinked">
      <p className="text-sm font-medium text-amber-800">Not linked to a shul yet. Its emails wait in the guide&rsquo;s inbox until it is.</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          list="watch-listings"
          aria-label="The shul it’s from"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The shul it’s from"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={busy || !listing}
          onClick={() => listing && onLink(listing.id)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Link
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onIgnore}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Not a shul
        </button>
      </div>
    </div>
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
  const [forListing, setForListing] = useState(false)
  // Read once per render pass for every row alike; the tab is reloaded to refresh.
  const [now] = useState(() => Date.now())
  // Long groups the admin has opened, and the rows they've acted on.
  const [opened, setOpened] = useState<ReadonlySet<WatchGroupKey>>(new Set())
  const [kept, setKept] = useState<ReadonlyMap<string, WatchRank>>(new Map())
  const toggle = (key: WatchGroupKey) =>
    setOpened((o) => {
      const next = new Set(o)
      if (!next.delete(key)) next.add(key)
      return next
    })

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

  async function actOn(watch: Watch, action: Action, resourceId?: string) {
    if (action === 'remove' && !window.confirm(`Stop watching ${shortUrl(watch.url)}?`)) return
    setSaveError(null)
    setBusy(watch.id)
    try {
      const res = await post({ action, id: watch.id, ...(resourceId ? { resourceId } : {}) })
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
    if (forListing && !listing) {
      setSaveError('Pick the shul or mikvah this page is for.')
      return
    }
    setBusy('add')
    try {
      const res = await post({ action: 'add', url, resourceId: listing?.id ?? null, label, ...(forListing ? { forListing: true } : {}) })
      if (res.watch) {
        const added = res.watch
        setData((d) => d && { ...d, watches: [...d.watches, added] })
        // Show it, even when its group is a long, closed one.
        setOpened((o) => new Set(o).add(watchGroupOf(added)))
      }
      setUrl('')
      setListingName('')
      setLabel('')
      setForListing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not add that page.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading watches…</p>

  const listings = data.listings
  const listingOf = new Map(listings.map((l) => [l.id, l]))
  // Acting on a row keeps it where it was (watchGroups.ts).
  const act = (row: WatchRow, action: Action, resourceId?: string) => {
    setKept((k) => (k.has(row.watch.id) ? k : new Map(k).set(row.watch.id, row.rank)))
    void actOn(row.watch, action, resourceId)
  }

  function renderRow(row: WatchRow) {
    const w = row.watch
    const listing = w.resourceId ? listingOf.get(w.resourceId) : null
    const unlinked = isNewsletterWatch(w) && !w.resourceId
    const ignored = isIgnoredSender(w)
    return (
      <li key={w.id} className="p-4" data-testid="watch-row">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold text-slate-900">{w.label || shortUrl(w.url)}</p>
            {w.url.startsWith('mailto:') ? (
              <p className="truncate text-xs text-slate-600">Newsletter from {shortUrl(w.url)}</p>
            ) : (
              <a href={w.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary underline">
                {shortUrl(w.url)}
              </a>
            )}
            {listing && <p className="text-xs text-slate-600">Keeps current: {listing.name} ({listing.categoryLabel})</p>}
            {unlinked ? (
              <NewsletterLink listings={listings} busy={busy !== null} onLink={(id) => act(row, 'link', id)} onIgnore={() => act(row, 'ignore')} />
            ) : (
              <>
                {!ignored && <HealthLine watch={w} now={now} />}
                <WhatItDoes watch={w} />
              </>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {!unlinked && !ignored && (
              <>
                <button
                  type="button"
                  disabled={busy !== null || !w.active}
                  onClick={() => act(row, 'check')}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === w.id ? 'Checking…' : 'Check now'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act(row, w.active ? 'pause' : 'resume')}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {w.active ? 'Pause' : 'Resume'}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act(row, 'remove')}
              className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      </li>
    )
  }

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

      {data.available && data.watches.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-muted">No pages watched yet.</p>
      )}
      {data.available &&
        groupWatches(data.watches, now, kept).map((g) => (
          <WatchGroupSection key={g.key} group={g} open={!collapsible(g) || opened.has(g.key)} onToggle={() => toggle(g.key)}>
            {renderRow}
          </WatchGroupSection>
        ))}

      {data.available && (
        <form onSubmit={add} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Watch a page</p>
          <label className="block text-sm">
            <span className="text-slate-700">Web address, or a shul newsletter&rsquo;s email address</span>
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
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={forListing} onChange={(e) => setForListing(e.target.checked)} className="mt-1" />
            <span className="text-slate-700">
              It&rsquo;s the listing&rsquo;s own page of davening times or hours: when it changes, read it and send what differs to the queue
            </span>
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
          <p className="text-xs text-muted">
            A page is checked once straight away, so you&rsquo;ll see at once whether the guide can read it. A newsletter needs the shul it&rsquo;s from;
            one the guide&rsquo;s inbox gets from a new sender shows up above on its own, to be linked.
          </p>
        </form>
      )}
    </div>
  )
}
