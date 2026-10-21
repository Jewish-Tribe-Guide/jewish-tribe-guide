'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { eruvView } from '@/lib/eruv'
import type { AdminEruv } from '@/lib/eruvStore'
import type { FoundStatusPage } from '@/lib/eruvFind'
import { eruvCounts, eruvSection, type EruvSection } from '@/lib/watchJobs'
import { sourceKind, sourceProblem } from '@/lib/watchPurposes'
import EruvKeptEmail from './EruvKeptEmail'

// ── The Watches tab's Eruv status page (step 5, Oct 21) ─────────────────────
// Every eruv, with where its status is read from: its status page, read
// every 15 minutes on Friday afternoons until candle lighting, or its
// emails, read as each arrives. What it says shows on the site at once,
// with no approval, as it always has. Moved here from the Watches tab's
// own list.
//
// "Find it on its website" searches the eruv's website for a page that says
// it's up or down (eruvFind.ts) and offers what it finds: nothing is set
// until the admin picks one, because a page read wrong would go live.

export type EruvimLoaded = { available: boolean; timezone: string; eruvim: AdminEruv[] }

const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')

/** Where its status is read from, in a line. */
function sourceLine(e: AdminEruv): string {
  if (e.statusUrl) return `Read from its status page, ${shortUrl(e.statusUrl)}`
  if (e.statusEmail) return `Read from its emails, from ${e.statusEmail}`
  return 'No source: the site shows no status for it.'
}

type Found = { found: FoundStatusPage[]; error: string | null }

/** "Give its status page, or the address its emails come from", and
 *  "Find it on its website". */
function GiveSource({
  eruv,
  busy,
  label,
  onSave,
  onFind,
  onCancel,
}: {
  eruv: AdminEruv
  busy: boolean
  label: string
  onSave: (source: string, dated: boolean) => void
  onFind: () => Promise<Found | null>
  onCancel?: () => void
}) {
  const [source, setSource] = useState('')
  const [dated, setDated] = useState(eruv.statusDated)
  const [found, setFound] = useState<Found | null>(null)
  const [finding, setFinding] = useState(false)
  const problem = source.trim() ? sourceProblem('eruv', source) : null
  const kind = sourceKind(source)
  const offered = found?.found.filter((p) => p.url !== eruv.statusUrl) ?? []

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="eruv-give-source">
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      {eruv.website && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy || finding}
            onClick={async () => {
              setFinding(true)
              setFound(await onFind())
              setFinding(false)
            }}
            className={BUTTON}
          >
            {finding ? 'Searching its website…' : 'Find it on its website'}
          </button>
          {found &&
            (found.error ? (
              <p className="text-sm text-slate-700">{found.error}.</p>
            ) : offered.length === 0 ? (
              <p className="text-sm text-slate-700">No page on {shortUrl(eruv.website)} says whether it&rsquo;s up. Give its page or its email below.</p>
            ) : (
              <ul className="space-y-2" data-testid="eruv-found">
                {offered.map((p) => (
                  <li key={p.url} className="rounded-md border border-slate-200 bg-white p-2.5 text-sm">
                    <p className="text-slate-800">
                      {p.link ? `Its “${p.link}” page` : 'Its home page'}, {shortUrl(p.url)}, says it&rsquo;s <strong>{p.status}</strong>
                    </p>
                    {p.words && <p className="text-xs text-muted">“{p.words}”</p>}
                    <button type="button" disabled={busy} onClick={() => onSave(p.url, dated)} className="mt-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-50">
                      Read its status from here
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
      <form
        className="space-y-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (source.trim() && !problem) onSave(source.trim(), dated)
        }}
      >
        <label className="block text-xs text-slate-600">
          {eruv.website ? 'Or its status page, or the address its emails come from' : 'Its status page, or the address its emails come from'}
          <input value={source} onChange={(ev) => setSource(ev.target.value)} placeholder="A web address, or an email address" className={`mt-1 ${INPUT}`} />
        </label>
        {problem && <p className="text-xs font-medium text-red-700">{problem}</p>}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={dated} onChange={(ev) => setDated(ev.target.checked)} />
          <span>
            Its page dates each week&rsquo;s post
            <span className="block text-xs text-muted">Then last week&rsquo;s &ldquo;up&rdquo; shows as &ldquo;Not posted yet this week&rdquo;. Leave off for a page whose date is only when it last changed.</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || !source.trim() || !!problem} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {kind === 'email' ? 'Save' : 'Save and read'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className={BUTTON}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function EruvRow({
  eruv: e,
  section,
  timezone,
  now,
  busy,
  onPost,
  onFind,
}: {
  eruv: AdminEruv
  section: EruvSection
  timezone: string
  now: number
  busy: boolean
  onPost: (body: Record<string, unknown>) => Promise<boolean>
  onFind: () => Promise<Found | null>
}) {
  const [open, setOpen] = useState(section === 'no_source')
  const [changing, setChanging] = useState(false)
  const [stopping, setStopping] = useState(false)
  const view = eruvView(e, new Date(now), timezone, null)

  async function save(source: string, dated: boolean) {
    const email = sourceKind(source) === 'email'
    // One source for its status (eruvEdit.ts): the other is emptied.
    const edit = email ? { statusEmail: source, statusUrl: '' } : { statusUrl: source, statusEmail: '', statusDated: dated }
    if (!(await onPost({ action: 'save', edit }))) return
    if (!email) await onPost({ action: 'check' })
    setChanging(false)
  }

  const read =
    section === 'no_source' ? null : section === 'didnt_load' ? (
      <span className="block text-sm font-medium text-red-700">Its page didn&rsquo;t load{e.statusError ? `: ${e.statusError}` : ''}.</span>
    ) : (
      <span className="block text-sm text-slate-600">
        {view.label}
        {view.checked ? ` · ${view.checked}` : ''}
        {!e.active ? ' · hidden on the site' : ''}
      </span>
    )

  return (
    <li className="px-4 py-3" data-testid="eruv-row">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block w-full cursor-pointer text-left">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block font-semibold text-slate-900">{e.name}</span>
            <span className="block text-sm text-slate-700">{sourceLine(e)}</span>
            {read}
          </span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`mt-1 shrink-0 text-slate-400 ${open ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {/* An email it couldn't read waits for the admin, opened or not. */}
      <EruvKeptEmail eruv={e} timezone={timezone} busy={busy} onSays={(says) => void onPost({ action: 'email-says', says })} />
      {open && (
        <div className="mt-2 space-y-2">
          {section === 'no_source' ? (
            <GiveSource eruv={e} busy={busy} label="Give its status page, or the address its emails come from" onSave={save} onFind={onFind} />
          ) : (
            <>
              <p className="text-xs text-muted">
                {e.statusUrl
                  ? 'Read every 15 minutes on Friday afternoon until candle lighting. What it says shows on the site at once.'
                  : 'Read as each email arrives. Up or down shows on the site at once, through that week’s Shabbos.'}
              </p>
              {e.statusWords && <p className="text-xs text-muted">Read from: &ldquo;{e.statusWords}&rdquo;</p>}
              {e.statusUrl && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={e.statusDated} disabled={busy} onChange={(ev) => void onPost({ action: 'save', edit: { statusDated: ev.target.checked } })} />
                  <span>
                    Its page dates each week&rsquo;s post
                    <span className="block text-xs text-muted">Then last week&rsquo;s &ldquo;up&rdquo; shows as &ldquo;Not posted yet this week&rdquo;.</span>
                  </span>
                </label>
              )}
              {changing && <GiveSource eruv={e} busy={busy} label={e.statusUrl ? 'Use a different page' : 'Use a different source'} onSave={save} onFind={onFind} onCancel={() => setChanging(false)} />}
              {stopping ? (
                <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p>Stop reading {e.name}&rsquo;s status? The site shows no status for it until it has a source again.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (await onPost({ action: 'save', edit: { statusUrl: '', statusEmail: '' } })) setStopping(false)
                      }}
                      className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Stop reading
                    </button>
                    <button type="button" onClick={() => setStopping(false)} className={BUTTON}>
                      Keep reading
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {e.statusUrl && (
                    <button type="button" disabled={busy} onClick={() => void onPost({ action: 'check' })} className={BUTTON}>
                      {busy ? 'Checking…' : 'Check now'}
                    </button>
                  )}
                  {!changing && (
                    <button type="button" disabled={busy} onClick={() => setChanging(true)} className={BUTTON}>
                      {e.statusUrl ? 'Use a different page' : 'Use a different source'}
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => setStopping(true)} className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                    Stop reading
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}

export default function EruvJob({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<EruvimLoaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  // An eruv acted on stays in the section it was in until the page reloads.
  const [kept, setKept] = useState<ReadonlyMap<string, EruvSection>>(new Map())
  const headers = { Authorization: `Bearer ${token}` }

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await fetchJson<EruvimLoaded>(withCommunity('/api/admin/eruvim', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the eruvim.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  const post = <T,>(body: unknown) =>
    fetchJson<T>(withCommunity('/api/admin/eruvim', community), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not do that.')

  /** An eruvim action; the eruv comes back as it now is. */
  async function act(e: AdminEruv, section: EruvSection, body: Record<string, unknown>): Promise<boolean> {
    setSaveError(null)
    setBusy(e.id)
    setKept((k) => (k.has(e.id) ? k : new Map(k).set(e.id, section)))
    try {
      const res = await post<{ eruv?: AdminEruv }>({ id: e.id, ...body })
      if (res.eruv) setData((d) => d && { ...d, eruvim: d.eruvim.map((x) => (x.id === e.id ? res.eruv! : x)) })
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function find(e: AdminEruv): Promise<Found | null> {
    setSaveError(null)
    try {
      return await post<Found>({ id: e.id, action: 'find' })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not search its website.')
      return null
    }
  }

  const back = (
    <Link href={`${adminBase(community)}/watches`} className="text-sm font-semibold text-primary hover:underline">
      ‹ Watches
    </Link>
  )
  if (error) return <div className="space-y-3">{back}<p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p></div>
  if (!data) return <div className="space-y-3">{back}<p className="text-sm text-muted">Loading eruvim…</p></div>

  const eruvim = data.available ? [...data.eruvim].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) : []
  const sectionOf = (e: AdminEruv) => kept.get(e.id) ?? eruvSection(e)
  const inSection = (...s: EruvSection[]) => eruvim.filter((e) => s.includes(sectionOf(e)))
  const counts = eruvCounts(eruvim)
  const rows = (list: AdminEruv[]) => (
    <ul className="divide-y divide-slate-100">
      {list.map((e) => (
        <EruvRow
          key={e.id}
          eruv={e}
          section={eruvSection(e)}
          timezone={data.timezone}
          now={now}
          busy={busy === e.id}
          onPost={(body) => act(e, sectionOf(e), body)}
          onFind={() => find(e)}
        />
      ))}
    </ul>
  )
  const section = (title: string, description: string, list: AdminEruv[]) => (
    <section className="bg-white border border-slate-200 rounded-lg shadow-sm" aria-label={title}>
      <h3 className="px-4 pt-3 text-sm font-semibold text-slate-800">
        {title} ({list.length})
      </h3>
      <p className="px-4 pb-2 text-xs text-muted">{description}</p>
      {rows(list)}
    </section>
  )
  const cantRead = inSection('no_source', 'email')
  const didntLoad = inSection('didnt_load')

  return (
    <div className="space-y-4">
      {back}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Eruv status</h2>
        <p className="text-sm text-muted">
          {plural(eruvim.length, 'eruv', 'eruvim')}. Each read from its status page, every 15 minutes on Friday afternoons until candle lighting, or from
          its emails as they arrive. <strong>What it says shows on the site at once</strong>, with no approval.
        </p>
      </div>
      {!data.available && <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">Eruv status needs database migration 074.</p>}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      {data.available && (
        <p className="text-sm font-semibold text-slate-800" data-testid="eruv-counts">
          {counts.checked} read · {counts.cantRead} can&rsquo;t be read · {counts.didntLoad} didn&rsquo;t load
        </p>
      )}
      {cantRead.length > 0 && section('Can’t be read', 'No source, so the site shows no status for it; or an email from it the guide couldn’t make out. Give its page or its email, or find it on its website.', cantRead)}
      {didntLoad.length > 0 && section('Didn’t load', 'Its page didn’t open the last time it was read. The site shows the last status it read, dated.', didntLoad)}
      {inSection('read').length > 0 && section('Read', 'Its status shows on the site as its page or its emails say.', inSection('read'))}
      {data.available && eruvim.length === 0 && <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-muted">No eruvim yet. Add one on the Eruvim tab.</p>}
    </div>
  )
}
