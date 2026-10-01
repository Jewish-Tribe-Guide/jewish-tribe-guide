'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import CollapsibleSection from './CollapsibleSection'

// ── The "Main dishes" tab: each food place's dishes, read off its menu ───────
// (agreed Oct 1). The AI reads a place's own menu page or PDF once, when
// asked, and proposes up to ten main dishes, each with the menu's own words
// it read it from. Nothing shows on the site until an admin approves it:
// untick what's wrong, add what's missing, approve. Approved dishes say "on
// its menu Oct 2" on the listing until a visitor says "Still served".

type Dish = { name: string; quote: string; checked: boolean; named?: boolean }
type Reading = {
  status: 'proposed' | 'approved' | 'skipped' | 'failed'
  sourceUrl: string | null
  dishes: Dish[]
  note: string | null
  model: string | null
  readAt: string
  decidedAt: string | null
  decidedBy: string | null
}
type Place = { id: string; name: string; categoryLabel: string; facts: string[]; website: string | null; dishes: string[]; reading: Reading | null }
type Loaded = { places: Place[]; available: boolean; readerOn: boolean }

const BATCH = 5

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** A menu read somewhere other than the place's own site, and not a PDF
 *  it links to: its website may have moved, lapsed or been taken over
 *  (one in Philly's guide now sends visitors to a gambling site). */
function elsewhere(place: Place): boolean {
  const source = place.reading?.sourceUrl
  if (!source || !place.website || /\.pdf($|\?)/i.test(source)) return false
  const a = hostOf(source)
  const b = hostOf(place.website)
  return !!a && !!b && a !== b && !a.endsWith(`.${b}`) && !b.endsWith(`.${a}`)
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

function PlaceCard({
  place,
  busy,
  readerOn,
  onRead,
  onApprove,
  onSkip,
}: {
  place: Place
  busy: boolean
  readerOn: boolean
  onRead: () => void
  onApprove: (dishes: string[]) => void
  onSkip: () => void
}) {
  const r = place.reading
  const proposed = r?.dishes ?? []
  const [off, setOff] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<string[]>([])
  const [typing, setTyping] = useState('')
  const kept = [...proposed.map((d) => d.name).filter((n) => !off.has(n)), ...added]
  const toggle = (name: string) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const add = () => {
    const name = typing.trim().replace(/\s+/g, ' ')
    if (name.length >= 2 && !kept.some((k) => k.toLowerCase() === name.toLowerCase())) setAdded((a) => [...a, name])
    setTyping('')
  }
  const pill = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold'

  return (
    <li className="px-4 py-3" data-testid="dish-place">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-slate-900">
          {place.name}
          {place.facts.length > 0 && <span className="font-normal text-muted"> · {place.facts.join(' · ')}</span>}
        </p>
        {r && (
          <p className="text-xs text-muted">
            {r.status === 'approved' ? `Approved ${formatDay(r.decidedAt ?? r.readAt)}${r.decidedBy ? ` by ${r.decidedBy}` : ''}` : r.status === 'skipped' ? 'Skipped' : `Read ${formatDay(r.readAt)}`}
          </p>
        )}
      </div>
      {place.dishes.length > 0 && <p className="mt-0.5 text-xs text-slate-600">Listed now: {place.dishes.join(', ')}</p>}
      {r?.sourceUrl && (
        <p className="mt-1 text-xs text-slate-600">
          Read from{' '}
          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
            {shortUrl(r.sourceUrl)} ↗
          </a>
        </p>
      )}
      {elsewhere(place) && (
        <p className="mt-1 text-xs font-semibold text-amber-800" data-testid="dish-elsewhere">
          Its website ({shortUrl(place.website!)}) sent the reader to another site. Check the listing’s website.
        </p>
      )}
      {!place.website && !r && <p className="mt-1 text-xs text-muted">No website to read.</p>}
      {r?.status === 'failed' && <p className="mt-1 text-xs text-amber-800">{r.note ?? 'Couldn’t read a menu.'}</p>}

      {r && r.status !== 'failed' && proposed.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {proposed.map((d) => {
              const on = !off.has(d.name)
              return (
                <button
                  key={d.name}
                  type="button"
                  aria-pressed={on}
                  disabled={busy || r.status === 'approved'}
                  onClick={() => toggle(d.name)}
                  title={`“${d.quote}”`}
                  className={`${pill} ${on ? 'border-primary/40 bg-primary/5 text-primary' : 'border-slate-200 bg-white text-slate-400 line-through'} disabled:cursor-default`}
                >
                  <span aria-hidden="true">{on ? '✓' : ''}</span>
                  {d.name}
                </button>
              )
            })}
            {added.map((name) => (
              <span key={name} className={`${pill} border-primary/40 bg-primary/5 text-primary`}>
                ✓ {name}
                <button type="button" aria-label={`Take ${name} off`} onClick={() => setAdded((a) => a.filter((x) => x !== name))} className="text-slate-400 hover:text-slate-700">
                  ×
                </button>
              </span>
            ))}
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            {proposed.map((d) => (
              <li key={d.name}>
                <span className="font-semibold text-slate-700">{d.name}</span> from “{d.quote}”
                {!d.checked && <span className="text-amber-800"> (from a PDF: open the menu to check)</span>}
                {d.checked && d.named === false && <span className="text-amber-800"> (these words don’t name it: check)</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
        {r && r.status === 'proposed' && (
          <>
            <input
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
              placeholder="Add a dish"
              aria-label={`Add a dish at ${place.name}`}
              maxLength={60}
              className="h-8 w-36 rounded-md border border-slate-300 px-2 text-xs"
            />
            <button type="button" onClick={add} disabled={busy} className="font-semibold text-primary hover:underline disabled:opacity-50">
              + Add
            </button>
            <button
              type="button"
              disabled={busy || kept.length === 0}
              onClick={() => onApprove(kept)}
              className="rounded-md bg-primary px-3 py-1.5 font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              Approve {kept.length} {kept.length === 1 ? 'dish' : 'dishes'}
            </button>
            <button type="button" disabled={busy} onClick={onSkip} className="font-medium text-muted hover:text-slate-800 disabled:opacity-50">
              Skip for now
            </button>
          </>
        )}
        {place.website && readerOn && (
          <button type="button" disabled={busy} onClick={onRead} className="font-semibold text-primary hover:underline disabled:opacity-50">
            {busy ? 'Reading…' : r ? 'Read again' : 'Read its menu'}
          </button>
        )}
        {r?.model && <span className="text-muted">Read by {r.model}</span>}
      </div>
    </li>
  )
}

export default function MainDishes({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/main-dishes', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the food places.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  const mark = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const patch = (id: string, p: Partial<Place>) => setData((d) => d && { ...d, places: d.places.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const post = (body: unknown) =>
    fetchJson<{ reading?: Reading; dishes?: string[] }>(
      withCommunity('/api/admin/main-dishes', community),
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      'Could not do that.',
    )

  async function read(id: string) {
    setSaveError(null)
    mark(id, true)
    try {
      const { reading } = await post({ action: 'read', resourceId: id })
      if (reading) patch(id, { reading })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not read that menu.')
    } finally {
      mark(id, false)
    }
  }

  async function decide(place: Place, action: 'approve' | 'skip', dishes: string[] = []) {
    setSaveError(null)
    mark(place.id, true)
    try {
      const res = await post({ action, resourceId: place.id, dishes })
      const now = new Date().toISOString()
      patch(place.id, {
        dishes: action === 'approve' ? (res.dishes ?? dishes).reduce((all, d) => (all.some((x) => x.toLowerCase() === d.toLowerCase()) ? all : [...all, d]), place.dishes) : place.dishes,
        reading: place.reading && { ...place.reading, status: action === 'approve' ? 'approved' : 'skipped', decidedAt: now, decidedBy: 'you' },
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      mark(place.id, false)
    }
  }

  async function readNext(list: Place[]) {
    setBatch(true)
    for (const p of list.slice(0, BATCH)) await read(p.id)
    setBatch(false)
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading food places…</p>

  const of = (status: Reading['status']) => data.places.filter((p) => p.reading?.status === status)
  const toCheck = of('proposed')
  const unread = data.places.filter((p) => !p.reading && p.website)
  const failed = [...of('failed'), ...data.places.filter((p) => !p.reading && !p.website)]
  const done = [...of('approved'), ...of('skipped')]
  const rows = (list: Place[]) => (
    <ul className="divide-y divide-slate-100">
      {list.map((p) => (
        <PlaceCard
          key={`${p.id}:${p.reading?.readAt ?? ''}`}
          place={p}
          busy={busy.has(p.id)}
          readerOn={data.readerOn}
          onRead={() => void read(p.id)}
          onApprove={(dishes) => void decide(p, 'approve', dishes)}
          onSkip={() => void decide(p, 'skip')}
        />
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        The AI reads each food place&rsquo;s own menu page once, when you ask, and picks its main dishes, showing the
        menu&rsquo;s own words it read each from. A dish whose words aren&rsquo;t on the page is dropped before you see it.
        <strong> Nothing shows on the site until you approve it.</strong> Untick what&rsquo;s wrong, add what&rsquo;s missing.
        Approved dishes say &ldquo;on its menu&rdquo; with the date, until a visitor says they&rsquo;re still served.
      </p>
      {!data.available && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">Reading menus needs database migration 065.</p>
      )}
      {!data.readerOn && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">The AI reader isn&rsquo;t set up here (no OPENAI_API_KEY).</p>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      {/* Said up top: these are usually in "Couldn't be read", folded away,
          and a listing sending visitors somewhere else matters more than
          its dishes. */}
      {data.places.some(elsewhere) && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900" data-testid="dish-moved-sites">
          <p className="font-semibold">Websites that sent the reader to another site:</p>
          <ul className="mt-1 list-disc pl-5">
            {data.places.filter(elsewhere).map((p) => (
              <li key={p.id}>
                {p.name}: {shortUrl(p.website!)} → {shortUrl(p.reading!.sourceUrl!)}
              </li>
            ))}
          </ul>
          <p className="mt-1">The site may have lapsed or been taken over. Check each listing’s website.</p>
        </div>
      )}
      <p className="text-sm font-semibold text-slate-800" data-testid="dish-counts">
        {of('approved').length} of {data.places.length} approved · {toCheck.length} to check · {unread.length} not read yet · {failed.length} couldn&rsquo;t be read
      </p>
      {data.available && (
        <>
          <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">To check ({toCheck.length})</h3>
            <p className="px-4 pb-2 text-xs text-muted">Read by the AI, not yet checked by a person.</p>
            {toCheck.length > 0 ? rows(toCheck) : <p className="px-4 pb-3 text-sm text-slate-600">None right now.</p>}
          </section>
          <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3">
              <h3 className="text-sm font-semibold text-slate-800">Not read yet ({unread.length})</h3>
              {data.readerOn && unread.length > 0 && (
                <button type="button" disabled={batch} onClick={() => void readNext(unread)} className="text-xs font-semibold text-primary hover:underline disabled:opacity-50">
                  {batch ? 'Reading…' : `Read the next ${Math.min(BATCH, unread.length)}`}
                </button>
              )}
            </div>
            <p className="px-4 pb-2 text-xs text-muted">Each takes a few seconds: the AI reads the place&rsquo;s own website.</p>
            {unread.length > 0 ? rows(unread) : <p className="px-4 pb-3 text-sm text-slate-600">All read.</p>}
          </section>
          <CollapsibleSection title="Couldn’t be read" description="No website, or no menu on it the reader could read." count={failed.length} contentClassName="">
            {rows(failed)}
          </CollapsibleSection>
          <CollapsibleSection title="Approved and skipped" description="Read again any time; approving again only adds and re-dates." count={done.length} contentClassName="">
            {rows(done)}
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
