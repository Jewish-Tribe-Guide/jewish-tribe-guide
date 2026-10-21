'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { KOSHER_LIST_NAMES, kosherSection, listWho, type FiledState, type KosherList, type KosherPlace, type KosherSection, type NewOnList } from '@/lib/kosherJob'
import type { JobCounts } from '@/lib/watchJobs'
import type { Watch } from '@/lib/watches'
import CollapsibleSection from './CollapsibleSection'
import { checkLine } from './WatchesManager'

// ── The Watches tab's Kosher certification page (step 5, Oct 21) ────────────
// Every food place in the guide, with what Keystone-K's and Mekor
// Habracha's lists say about it next to what the listing says
// (kosherJob.ts), and the places a list has that the guide doesn't. The
// lists are read now, as each morning's read does. What differs still goes
// to the moderation queue from that read, so each difference says where it
// is: waiting there, decided there before, or filed tomorrow morning.
// The lists themselves are at the top: Check now, Pause, or start reading
// one this guide doesn't read yet.

export type KosherListState = { list: KosherList; url: string; watch: Watch | null; error: string | null; entries: number | null; updated: string | null }
export type KosherLoaded = {
  available: boolean
  lists: KosherListState[]
  counts: JobCounts & { notListed: number }
  places: (KosherPlace & { href: string })[]
  newPlaces: NewOnList[]
}

const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const FILED: Record<FiledState, string> = {
  queued: 'in the moderation queue',
  next: 'filed with tomorrow morning’s read',
  decided: 'decided in the queue before',
}

/** What the listing says about its kosher certification, in a line. */
function listingSays(p: KosherPlace): string {
  const certs = p.certs.length ? p.certs.join(', ') : 'no hechsher'
  return `The listing says ${certs}${p.levels.length ? ` · ${p.levels.join(', ')}` : ''}`
}

/** What a list says now, or why it says nothing. */
function listLine(l: KosherListState): string {
  if (!l.watch) return 'Not read for this guide.'
  if (!l.watch.active) return 'Paused: not read.'
  if (l.error) return `Didn’t load just now: ${l.error}`
  return `${plural(l.entries ?? 0, 'place')} on it now${l.updated ? `, updated ${listDay(l.updated)}` : ''}.`
}

/** Mekor's "Last Updated: 2026-10-12" as the rest of the page says a day. */
function listDay(updated: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) return updated
  return new Date(`${updated}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function ListRow({ list: l, busy, onAct }: { list: KosherListState; busy: boolean; onAct: (body: Record<string, unknown>) => void }) {
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid="kosher-list">
      <span className="min-w-0 flex-1 space-y-0.5">
        <a href={l.url} target="_blank" rel="noopener noreferrer" className="block font-semibold text-slate-900 hover:underline">
          {KOSHER_LIST_NAMES[l.list]}
        </a>
        <span className={`block text-sm ${l.error ? 'font-medium text-red-700' : 'text-slate-600'}`}>{listLine(l)}</span>
        {/* What its morning read compared and filed. */}
        {l.watch?.lastCheck ? (
          <span className="block text-sm text-slate-600">{checkLine(l.watch.lastCheck)}</span>
        ) : l.watch?.lastOkAt ? (
          <span className="block text-sm text-slate-600">Read {day(l.watch.lastOkAt)}</span>
        ) : null}
      </span>
      <span className="flex flex-wrap gap-2">
        {l.watch ? (
          <>
            {l.watch.active && (
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'check', id: l.watch!.id })} className={BUTTON}>
                {busy ? 'Reading…' : 'Check now'}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => onAct({ action: l.watch!.active ? 'pause' : 'resume', id: l.watch!.id })} className={BUTTON}>
              {l.watch.active ? 'Pause' : 'Resume'}
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => onAct({ action: 'add', purpose: 'kosher', url: l.url })} className={BUTTON}>
            {busy ? 'Reading…' : 'Read it every morning'}
          </button>
        )}
      </span>
    </li>
  )
}

function PlaceRow({ place: p, section, queueHref }: { place: KosherPlace & { href: string }; section: KosherSection; queueHref: string }) {
  const [open, setOpen] = useState(false)
  const shown = section === 'to_check' ? p.differences.filter((d) => d.filed !== 'decided') : p.differences
  return (
    <li className="px-4 py-3" data-testid="kosher-place">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block w-full cursor-pointer text-left">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block font-semibold text-slate-900">{p.name}</span>
            <span className="block text-sm text-slate-600">{listingSays(p)}</span>
            {shown.map((d) => (
              <span key={`${d.list}:${d.line}`} className={`block text-sm ${section === 'to_check' ? 'text-amber-800' : 'text-slate-700'}`}>
                {d.line} · {FILED[d.filed]}
              </span>
            ))}
            {section === 'checked' && <span className="block text-sm text-slate-700">{p.on.map((o) => listWho(o.list)).join(' and ')} agree{p.on.length === 1 ? 's' : ''}</span>}
          </span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`mt-1 shrink-0 text-slate-400 ${open ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          {p.on.length > 0 ? (
            <ul className="space-y-0.5 text-slate-700">
              {p.on.map((o) => (
                <li key={o.list}>
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    {listWho(o.list)}
                  </a>{' '}
                  says: &ldquo;{o.says || 'nothing about its certification'}&rdquo;
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-700">On neither list.</p>
          )}
          {shown.some((d) => d.filed === 'queued') && (
            <Link href={queueHref} className="block font-semibold text-primary hover:underline">
              Approve or reject it in the moderation queue
            </Link>
          )}
          {section === 'decided' && <p className="text-slate-700">Not filed again until the list or the listing changes.</p>}
          <a href={p.href} target="_blank" rel="noopener noreferrer" className="block font-semibold text-primary hover:underline">
            Open its listing
          </a>
        </div>
      )}
    </li>
  )
}

function NewRow({ place: n, queueHref }: { place: NewOnList; queueHref: string }) {
  return (
    <li className="space-y-0.5 px-4 py-3 text-sm" data-testid="kosher-new">
      <p className="font-semibold text-slate-900">{n.name}</p>
      {n.address && <p className="text-slate-600">{n.address}</p>}
      {n.on.map((o) => (
        <p key={o.list} className="text-slate-700">
          On{' '}
          <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {KOSHER_LIST_NAMES[o.list]}
          </a>
          {o.says ? `: “${o.says}”` : ''}
        </p>
      ))}
      {n.archived && <p className="text-slate-700">The guide has it archived, as &ldquo;{n.archived}&rdquo;.</p>}
      {n.filed === 'queued' ? (
        <Link href={queueHref} className="font-semibold text-primary hover:underline">
          Approve or reject it in the moderation queue
        </Link>
      ) : (
        <p className="text-slate-600">{n.filed === 'next' ? 'Filed with tomorrow morning’s read, unless Google says it has closed.' : 'Decided in the queue before.'}</p>
      )}
    </li>
  )
}

export default function KosherJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<KosherLoaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<KosherList | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<KosherLoaded>(withCommunity('/api/admin/watches/kosher', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the kosher lists.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  async function act(list: KosherList, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(list)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        'Could not do that.',
      )
      // A read files what differs: where each difference is now is the server's to say.
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  const back = (
    <Link href={`${adminBase(community)}/watches`} className="text-sm font-semibold text-primary hover:underline">
      ‹ Watches
    </Link>
  )
  if (error) return <div className="space-y-3">{back}<p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p></div>
  if (!data) return <div className="space-y-3">{back}<p className="text-sm text-muted">Reading the kosher lists…</p></div>

  const queueHref = adminBase(community)
  const inSection = (s: KosherSection) => data.places.filter((p) => kosherSection(p) === s)
  const fresh = data.newPlaces.filter((n) => n.filed !== 'decided')
  const freshDecided = data.newPlaces.filter((n) => n.filed === 'decided')
  const rows = (list: (KosherPlace & { href: string })[], s: KosherSection) => (
    <ul className="divide-y divide-slate-100">
      {list.map((p) => (
        <PlaceRow key={p.id} place={p} section={s} queueHref={queueHref} />
      ))}
    </ul>
  )
  const toCheck = inSection('to_check')
  const { counts } = data

  return (
    <div className="space-y-4">
      {back}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Kosher certification</h2>
        <p className="text-sm text-muted">
          {plural(data.places.length, 'food place')}, compared every morning with Keystone-K&rsquo;s and Mekor Habracha&rsquo;s lists. What a list says that a
          listing doesn&rsquo;t goes to the moderation queue for you to approve. Nothing is taken off without you.
        </p>
      </div>
      {!data.available && <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">Keeping a list here needs database migration 070.</p>}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      <section className="bg-white border border-slate-200 rounded-lg shadow-sm" aria-label="Lists">
        <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">Lists</h3>
        <ul className="divide-y divide-slate-100">
          {data.lists.map((l) => (
            <ListRow key={l.list} list={l} busy={busy === l.list} onAct={(body) => void act(l.list, body)} />
          ))}
        </ul>
      </section>
      <p className="text-sm font-semibold text-slate-800" data-testid="kosher-counts">
        {counts.checked} checked · {counts.toCheck} to check · {counts.notListed} on neither list
        {counts.didntLoad > 0 && <> · {plural(counts.didntLoad, 'list')} didn&rsquo;t load</>}
      </p>
      <section className="bg-white border border-slate-200 rounded-lg shadow-sm" aria-label="To check">
        <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">To check ({toCheck.length})</h3>
        <p className="px-4 pb-2 text-xs text-muted">A list says something about its certification the listing doesn&rsquo;t.</p>
        {toCheck.length > 0 ? rows(toCheck, 'to_check') : <p className="px-4 pb-3 text-sm text-slate-600">None right now.</p>}
      </section>
      {fresh.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm" aria-label="On a list, not in the guide">
          <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">On a list, not in the guide ({fresh.length})</h3>
          <p className="px-4 pb-2 text-xs text-muted">Each is suggested as a new listing, once Google says it&rsquo;s open.</p>
          <ul className="divide-y divide-slate-100">
            {fresh.map((n) => (
              <NewRow key={n.name} place={n} queueHref={queueHref} />
            ))}
          </ul>
        </section>
      )}
      <CollapsibleSection title="Checked" description="On a list, and the list agrees with the listing." count={inSection('checked').length} contentClassName="">
        {rows(inSection('checked'), 'checked')}
      </CollapsibleSection>
      {(inSection('decided').length > 0 || freshDecided.length > 0) && (
        <CollapsibleSection title="Decided before" description="A list differs, and that was approved or rejected in the queue. Not filed again until the list or the listing changes." count={inSection('decided').length + freshDecided.length} contentClassName="">
          {rows(inSection('decided'), 'decided')}
          {freshDecided.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {freshDecided.map((n) => (
                <NewRow key={n.name} place={n} queueHref={queueHref} />
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}
      <CollapsibleSection title="On neither list" description="Its hechsher is one neither list covers, or it names none. Nothing to compare." count={inSection('not_listed').length} contentClassName="">
        {rows(inSection('not_listed'), 'not_listed')}
      </CollapsibleSection>
    </div>
  )
}
