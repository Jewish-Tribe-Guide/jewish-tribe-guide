'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { statusPill } from '@/lib/eruvJob'
import type { AdminPlace } from '@/lib/adminPlaces'
import type { AdminEruv } from '@/lib/eruvStore'
import { useCommunitySlug } from '@/lib/communityContext'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { withCommunity } from '@/lib/useCommunityData'
import type { CategoryConfig } from '@/lib/categories'
import { EditorOpenCard, EditorRowCard, editorFieldLabel, editorInputClass } from '@/components/resources/editorParts'
import { SUBMIT_PILL } from '@/components/resources/submitPill'
import { AdminBack } from './AdminUI'
import { Pill } from './JobBoxes'
import { eruvSources, type RowSource } from './listingSource'
import { ArchiveBin, ArchivedPlace, RowJob, SourceScreen, SourceWords, type SourceScreenProps } from './PlaceListing'
import { sourceActions, type Attempt } from './sourceActions'
import type { Jobs } from './useWatchJobs'
import { shortUrl } from './watchText'

// An eruv as Places opens it (boards PlacesEruv4, EruvListing6, EruvStatus5,
// Nov 1), the same rows as any listing: each names the job that keeps it, and
// opened, says where it's read from. What only an eruv has (its map's colour,
// what's left out of it) stays on the category's own page.

const LINE_LINK = 'cursor-pointer font-semibold text-primary hover:underline disabled:opacity-60'

type Draft = { name: string; covers: string; hotline: string; alertsUrl: string; website: string }
type RowId = 'name' | 'status' | 'map' | 'hotline' | 'alertsUrl' | 'website'
const draftOf = (e: AdminEruv): Draft => ({ name: e.name, covers: e.covers ?? '', hotline: e.hotline ?? '', alertsUrl: e.alertsUrl ?? '', website: e.website ?? '' })

export default function EruvListing({
  place,
  eruv,
  category,
  token,
  jobs,
  reload,
  now,
  onClose,
  onSaved,
  backLabel = 'Back',
}: {
  place: AdminPlace
  eruv: AdminEruv
  category: CategoryConfig | undefined
  token: string
  jobs: Jobs
  reload: () => Promise<void>
  now: number
  onClose: () => void
  onSaved: () => void
  backLabel?: string
}) {
  const community = useCommunitySlug()
  const [draft, setDraft] = useState<Draft>(() => draftOf(eruv))
  const [openRow, setOpenRow] = useState<RowId | null>(null)
  const [screen, setScreen] = useState<{ title: string; props: Omit<SourceScreenProps, 'onDone' | 'onTried'> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = <T,>(path: string, body: Record<string, unknown>) => fetchJson<T>(withCommunity(path, community), { method: 'POST', headers, body: JSON.stringify(body) }, 'Could not do that.')
  const save = (edit: Record<string, unknown>) => post('/api/admin/eruvim', { action: 'save', id: eruv.id, edit })
  const actions = sourceActions(eruv.id, post)
  const sources = eruvSources(eruv.id, jobs, now)

  const title = screen?.title ?? place.name
  const back = screen ? () => setScreen(null) : openRow ? () => setOpenRow(null) : onClose
  useSetScreenHeader(true, title, back)

  if (!eruv.active) {
    return (
      <div className="flex flex-col gap-3">
        <AdminBack back={{ label: backLabel, onClick: onClose }} title={place.name} />
        <ArchivedPlace
          place={place}
          category={category}
          token={token}
          onDone={onSaved}
          send={{
            restore: async () => void (await save({ active: true })),
            remove: async () => void (await post('/api/admin/eruvim', { action: 'remove', id: eruv.id })),
          }}
        />
      </div>
    )
  }

  const was = draftOf(eruv)
  const changes = (Object.keys(draft) as (keyof Draft)[]).filter((k) => draft[k].trim() !== was[k].trim())
  const changedRow = (id: RowId) => (id === 'name' ? changes.includes('name') || changes.includes('covers') : (changes as string[]).includes(id))

  async function update() {
    setBusy(true)
    setError(null)
    try {
      await save(Object.fromEntries(changes.map((k) => [k, draft[k].trim()])))
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
      setBusy(false)
    }
  }

  async function archive() {
    setBusy(true)
    setError(null)
    try {
      await save({ active: false })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive it.')
      setBusy(false)
    }
  }

  const control = (words: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={LINE_LINK}>
      {words}
    </button>
  )
  function lineOf(source: RowSource | null | undefined): ReactNode {
    if (!source) return null
    const { line } = source
    const controls: ReactNode[] = []
    if (line.change) {
      const c = line.change
      const stop = c.stop
      controls.push(
        control('Change', () =>
          setScreen({
            title: 'Change',
            props: {
              label: c.label,
              value: c.value,
              button: 'Save',
              attempt: async (url) => {
                await actions.change(c.act, url)
                return { failed: false }
              },
              ...(stop ? { stop: () => actions.stopSource(stop) } : {}),
            },
          }),
        ),
      )
    }
    if (line.start) {
      const s = line.start
      controls.push(control('Change', () => setScreen({ title: 'Change', props: { label: s.label, value: s.value, button: 'Start reading', attempt: actions.startReading(s.again, s.value) } })))
    }
    if (line.add) {
      const a = line.add
      const attempt: Attempt = async (url) => {
        if ('kind' in a.run) await actions.change(a.run, url)
        else await actions.addSource(a.run, url)
        return { failed: false }
      }
      controls.push(control('Add a source', () => setScreen({ title: 'Add a source', props: { label: a.label, value: '', button: 'Save', attempt } })))
    }
    return <SourceWords line={line} controls={controls} />
  }

  const pill = statusPill(eruv, new Date(now), jobs.eruvim?.timezone ?? 'America/New_York')
  const input = (key: keyof Draft, label: string, long = false) => (
    <div>
      <label htmlFor={`eruv-${key}`} className={editorFieldLabel}>
        {label}
      </label>
      {long ? (
        <textarea id={`eruv-${key}`} rows={3} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={`${editorInputClass} h-auto py-2.5`} />
      ) : (
        <input id={`eruv-${key}`} type="text" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={editorInputClass} />
      )}
    </div>
  )

  const rows: { id: RowId; title: string; summary: string; source: RowSource | null; body: ReactNode }[] = [
    { id: 'name', title: draft.name.trim() || 'Name', summary: draft.covers.trim(), source: null, body: <>{input('name', 'Name')}{input('covers', 'What it covers', true)}</> },
    {
      id: 'status',
      title: 'Status',
      summary: eruv.status ? pill.text : '',
      source: sources.status,
      body: (
        <>
          {eruv.status && (
            <div className="flex flex-col items-start gap-1.5">
              <Pill tone={pill.tone}>{pill.text}</Pill>
              {eruv.statusWords && <p className="m-0 text-sm text-slate-700">{eruv.statusWords}</p>}
            </div>
          )}
          {eruv.statusUrl && (
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input
                type="checkbox"
                checked={eruv.statusDated}
                onChange={(e) => {
                  const on = e.target.checked
                  void save({ statusDated: on }).then(reload)
                }}
              />
              Its page dates each week’s post
            </label>
          )}
        </>
      ),
    },
    { id: 'map', title: 'Map', summary: eruv.lineUrl ? (eruv.lineError ? 'As last read' : 'On the map') : 'None', source: sources.map, body: null },
    { id: 'hotline', title: 'Hotline', summary: draft.hotline.trim() || 'None', source: sources.details, body: input('hotline', 'Hotline') },
    { id: 'alertsUrl', title: 'Alerts', summary: draft.alertsUrl.trim() ? shortUrl(draft.alertsUrl.trim()) : 'None', source: sources.details, body: input('alertsUrl', 'Alerts') },
    { id: 'website', title: 'Website', summary: draft.website.trim() ? shortUrl(draft.website.trim()) : 'None', source: sources.website, body: input('website', 'Website') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: screen || openRow ? 'Back' : backLabel, onClick: back }} title={title} />
      {screen ? (
        <SourceScreen
          {...screen.props}
          onTried={reload}
          onDone={async () => {
            await reload()
            setScreen(null)
          }}
        />
      ) : (
        <div className="space-y-4" data-testid="editor-list">
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                {openRow === r.id ? (
                  <EditorOpenCard testId={`editor-open-${r.id}`} title={r.title} onClose={() => setOpenRow(null)} source={{ line: lineOf(r.source) }}>
                    {r.body}
                  </EditorOpenCard>
                ) : (
                  <EditorRowCard onOpen={() => setOpenRow(r.id)} testId={`editor-row-${r.id}`} opens="here" changed={changedRow(r.id)} title={r.title} summary={r.summary} aside={r.source ? <RowJob source={r.source} /> : null} />
                )}
              </li>
            ))}
          </ul>
          {error && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
          <div className="flex items-center gap-2.5">
            <button type="button" disabled={busy || changes.length === 0} onClick={() => void update()} className={`${SUBMIT_PILL} min-w-0 flex-1`}>
              {changes.length === 0 ? 'No changes yet' : 'Update the listing'}
            </button>
            {!confirming && <ArchiveBin onClick={() => setConfirming(true)} />}
          </div>
          {confirming && (
            <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="m-0 text-sm text-red-800">Take {place.name} off the site? It stays under Archived.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void archive()} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-red-600 bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? 'Archiving…' : 'Archive it'}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 disabled:opacity-60">
                  Leave it
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Add a place, an eruv: its name, then it opens like any other. */
export function AddEruv({ token, onBack, onAdded }: { token: string; onBack: () => void; onAdded: (id: string) => Promise<void> | void }) {
  const community = useCommunitySlug()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useSetScreenHeader(true, 'Add a place', onBack)

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { eruv } = await fetchJson<{ eruv: AdminEruv }>(withCommunity('/api/admin/eruvim', community), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', name }) }, 'Could not add it.')
      await onAdded(eruv.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: 'Back', onClick: onBack }} title="Add a place" />
      <form onSubmit={(e) => void add(e)} className="flex flex-col gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label htmlFor="eruv-new-name" className={editorFieldLabel}>
            Name
          </label>
          <input id="eruv-new-name" value={name} onChange={(e) => setName(e.target.value)} className={editorInputClass} autoFocus />
        </div>
        {error && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()} className={SUBMIT_PILL}>
          {busy ? 'Adding…' : 'Add it'}
        </button>
      </form>
    </div>
  )
}
