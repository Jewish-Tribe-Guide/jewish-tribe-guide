'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { hoursCounts, hoursSection, type HoursSection } from '@/lib/hoursJob'
import { watchHealth, type Watch } from '@/lib/watches'
import CollapsibleSection from './CollapsibleSection'

// ── The Watches tab's Mikvah hours page (the user, Oct 21) ──────────────────
// Every place whose category has named weekly hours (a mikvah's women's,
// men's and keilim hours), read every morning from the pages on its own
// website that give them: found by the morning's search (hoursJobRun.ts),
// or given here by hand. Grouped by what the last reads found, what needs
// the admin first. One that can't be read says why, and can be given its
// hours page or said to have no hours online; any can be turned off and
// back on.
//
// What a page has that the listing doesn't still goes to the moderation
// queue, as before: Compare on the job page is a later step.

type Page = { watch: Watch; source: string }
export type HoursPlace = {
  id: string
  name: string
  href: string
  website: string | null
  pages: Page[]
  off: boolean
  offSince: string | null
  reason: string | null
  pending: number
  fields: string[]
}
type Loaded = { available: boolean; name: string; places: HoursPlace[] }
type Saved = { pages?: Page[]; off?: boolean; reason?: string; watch?: Watch }

const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm'

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const listed = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const asPlace = (p: HoursPlace) => ({ pages: p.pages.map((x) => x.watch), off: p.off })

/** A page's address without its scheme, for its link. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/** What one page's last read found, in a line. */
function pageLine(w: Watch, now: number): string {
  if (!w.active) return 'Not read: turned off.'
  const state = watchHealth(w, now).state
  if (state === 'failing' || state === 'stale') return `Didn’t load${w.lastError ? `: ${w.lastError}` : ''}.`
  const c = w.lastCheck
  if (!w.lastRunAt || !c) return 'Not read yet. Read tomorrow morning, or Check now.'
  const when = `Read ${day(c.at)}: `
  if (c.result === 'nothing' || c.result === 'unreadable') return `${when}no weekly hours on it.`
  // Whether it's in the moderation queue is the place's line to say.
  if (c.result === 'differs') return `${when}${c.differences.length ? plural(c.differences.length, 'difference') : 'differences'} from the listing.`
  if (c.result === 'unsure') return `${when}hours it couldn’t set beside the listing.`
  return `${when}as on the listing${c.read.length ? `: ${c.read.join('; ')}` : ''}.`
}

/** What the place's pages found, together, in a line. */
function placeLine(p: HoursPlace, section: HoursSection): string | null {
  if (section === 'off') return p.pages.length ? 'Turned off: not read.' : 'No hours online: not read.'
  if (section === 'cant_read') return p.reason
  if (section === 'waiting') return 'Not read yet. Read tomorrow morning.'
  const checks = p.pages.map((x) => x.watch.lastCheck).filter((c) => c != null)
  const at = checks.map((c) => c.at).sort().at(-1)
  const when = at ? `Read ${day(at)}: ` : ''
  if (section === 'to_check') {
    const n = checks.reduce((sum, c) => sum + c.differences.length, 0)
    const queued = p.pending > 0 || checks.some((c) => c.queue === 'filed' || c.queue === 'waiting')
    return `${when}${n ? plural(n, 'difference') : 'something to check'} from the listing${queued ? ', in the moderation queue' : ''}.`
  }
  return `${when}the same hours as the listing.`
}

function GivePage({ busy, onGive, onCancel }: { busy: boolean; onGive: (url: string) => void; onCancel?: () => void }) {
  const [url, setUrl] = useState('')
  return (
    <form
      className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (url.trim()) onGive(url.trim())
      }}
    >
      <label className="min-w-0 flex-1 text-xs text-slate-600">
        Its hours page
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="its-website.org/hours" className={`mt-1 ${INPUT}`} />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={busy || !url.trim()} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          Save and read
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={BUTTON}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function PageRow({ page: { watch: w, source }, now, busy, onAct }: { page: Page; now: number; busy: boolean; onAct: (body: Record<string, unknown>) => void }) {
  const c = w.lastCheck
  const lines = c && c.result !== 'nothing' && c.result !== 'unreadable' ? [...c.differences, ...(c.unread ?? [])] : []
  return (
    <li className="space-y-1 rounded-md border border-slate-200 p-3" data-testid="hours-page">
      <p className="text-sm">
        <a href={w.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
          {shortUrl(w.url)}
        </a>
        <span className="text-slate-500"> · {source}</span>
      </p>
      <p className="text-sm text-slate-700">{pageLine(w, now)}</p>
      {lines.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">
          {lines.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {w.active && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => onAct({ action: 'check', id: w.id })} className={BUTTON}>
            {busy ? 'Reading…' : 'Check now'}
          </button>
          {source === 'Added by hand' && (
            <button type="button" disabled={busy} onClick={() => onAct({ action: 'remove', id: w.id })} className={BUTTON}>
              Stop reading this page
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function PlaceRow({
  place: p,
  section,
  now,
  busy,
  queueHref,
  showFields,
  onAct,
}: {
  place: HoursPlace
  section: HoursSection
  now: number
  showFields: boolean
  busy: boolean
  queueHref: string
  onAct: (body: Record<string, unknown>) => void
}) {
  const [open, setOpen] = useState(false)
  const [giving, setGiving] = useState(false)
  const line = placeLine(p, section)
  return (
    <li className="px-4 py-3" data-testid="hours-place">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block w-full cursor-pointer text-left">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block font-semibold text-slate-900">{p.name}</span>
            {showFields && p.fields.length > 0 && <span className="block text-sm text-slate-700">{p.fields.join(' · ')}</span>}
            {line && <span className={`block text-sm ${section === 'cant_read' ? 'font-medium text-red-700' : 'text-slate-600'}`}>{line}</span>}
          </span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`mt-1 shrink-0 text-slate-400 ${open ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {p.pages.length > 0 && (
            <ul className="space-y-2">
              {p.pages.map((x) => (
                <PageRow key={x.watch.id} page={x} now={now} busy={busy} onAct={onAct} />
              ))}
            </ul>
          )}
          {section === 'to_check' && (
            <p className="text-sm text-slate-700">
              {p.pending ? (
                <Link href={queueHref} className="font-semibold text-primary hover:underline">
                  Approve or reject it in the moderation queue
                </Link>
              ) : (
                'Filed to the moderation queue before, and settled there.'
              )}
            </p>
          )}
          {section === 'cant_read' && (
            <p className="text-sm text-slate-700">
              <a href={p.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                Fill it in yourself
              </a>
            </p>
          )}
          {section !== 'off' && (section === 'cant_read' || giving) && <GivePage busy={busy} onGive={(url) => onAct({ action: 'give', url })} onCancel={section === 'cant_read' ? undefined : () => setGiving(false)} />}
          <div className="flex flex-wrap gap-2">
            {section === 'off' ? (
              <button type="button" disabled={busy} onClick={() => onAct({ action: 'on' })} className={BUTTON}>
                {busy ? 'Reading…' : 'Turn back on'}
              </button>
            ) : (
              <>
                {section !== 'cant_read' && !giving && (
                  <button type="button" disabled={busy} onClick={() => setGiving(true)} className={BUTTON}>
                    Give another hours page
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => onAct({ action: 'off' })} className={BUTTON}>
                  {section === 'cant_read' ? 'No hours online' : 'Turn off this place'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function HoursJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  // A row acted on stays in the section it was in until the page reloads,
  // so it doesn't jump away under the admin's hand.
  const [kept, setKept] = useState<ReadonlyMap<string, HoursSection>>(new Map())

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/watches/hours', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the places.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  async function act(p: HoursPlace, section: HoursSection, body: Record<string, unknown>) {
    setSaveError(null)
    setBusy(p.id)
    setKept((k) => (k.has(p.id) ? k : new Map(k).set(p.id, section)))
    try {
      // Check now and Stop reading are the Watches tab's own; the rest are this page's.
      const own = body.action === 'check' || body.action === 'remove'
      const res = await fetchJson<Saved>(
        withCommunity(own ? '/api/admin/watches' : '/api/admin/watches/hours', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(own ? body : { resourceId: p.id, ...body }) },
        'Could not do that.',
      )
      const next = (x: HoursPlace): HoursPlace => {
        if (body.action === 'check') return { ...x, pages: x.pages.map((pg) => (pg.watch.id === body.id && res.watch ? { ...pg, watch: res.watch } : pg)) }
        if (body.action === 'remove') return { ...x, pages: x.pages.filter((pg) => pg.watch.id !== body.id) }
        return { ...x, pages: res.pages ?? x.pages, off: res.off ?? x.off, reason: res.reason ?? (res.pages?.length ? null : x.reason) }
      }
      setData((d) => d && { ...d, places: d.places.map((x) => (x.id === p.id ? next(x) : x)) })
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
  if (!data) return <div className="space-y-3">{back}<p className="text-sm text-muted">Loading places…</p></div>

  const sectionOf = (p: HoursPlace) => kept.get(p.id) ?? hoursSection(asPlace(p), now)
  const inSection = (s: HoursSection) => data.places.filter((p) => sectionOf(p) === s)
  const counts = hoursCounts(data.places.map(asPlace), now)
  const off = inSection('off')
  const waiting = inSection('waiting')
  const cantRead = inSection('cant_read')
  const queueHref = adminBase(community)
  // What's read, said once above when it's the same for every place.
  const fields = data.places[0]?.fields ?? []
  const sameFields = data.places.every((p) => p.fields.join('|') === fields.join('|'))
  const rows = (list: HoursPlace[]) => (
    <ul className="divide-y divide-slate-100">
      {list.map((p) => (
        // Placed by where it was; its line and buttons say what it is now.
        <PlaceRow key={p.id} place={p} section={hoursSection(asPlace(p), now)} now={now} busy={busy === p.id} queueHref={queueHref} showFields={!sameFields} onAct={(body) => void act(p, sectionOf(p), body)} />
      ))}
    </ul>
  )
  const section = (title: string, description: string, list: HoursPlace[], empty = 'None right now.') => (
    <section className="bg-white border border-slate-200 rounded-lg shadow-sm" aria-label={title}>
      <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">
        {title} ({list.length})
      </h3>
      <p className="px-4 pb-2 text-xs text-muted">{description}</p>
      {list.length > 0 ? rows(list) : <p className="px-4 pb-3 text-sm text-slate-600">{empty}</p>}
    </section>
  )

  return (
    <div className="space-y-4">
      {back}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{data.name}</h2>
        <p className="text-sm text-muted">
          {plural(data.places.length, 'place')}.{' '}
          {sameFields && fields.length > 0 ? `${listed(fields)}, each read` : 'Each read'} every morning from the pages on its own website that give
          them. What differs from the listing goes to the moderation queue for you to approve.
        </p>
      </div>
      {!data.available && <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">Reading websites needs database migration 070.</p>}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      <p className="text-sm font-semibold text-slate-800" data-testid="hours-counts">
        {counts.checked} checked · {counts.toCheck} to check · {counts.cantRead} can&rsquo;t be read
        {waiting.length > 0 && <> · {waiting.length} not read yet</>}
        {off.length > 0 && <> · {off.length} off</>}
      </p>
      {section('To check', 'A page gives hours the listing doesn’t, or different ones.', inSection('to_check'))}
      {cantRead.length > 0 &&
        section('Can’t be read', 'No page on its website gives its weekly hours, or its pages didn’t load. Give its hours page, or say it has no hours online.', cantRead)}
      {waiting.length > 0 && section('Not read yet', 'Not compared with the listing yet. Read tomorrow morning, or open one and Check now.', waiting)}
      {section('Checked', 'Its pages agree with the listing.', inSection('checked'))}
      {off.length > 0 && (
        <CollapsibleSection title="Off" description="Not read. Turn one back on and it’s read straight away." count={off.length} contentClassName="">
          {rows(off)}
        </CollapsibleSection>
      )}
    </div>
  )
}
