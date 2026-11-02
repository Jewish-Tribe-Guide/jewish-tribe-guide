'use client'

import { useState, type ReactNode } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { statusPill } from '@/lib/eruvJob'
import type { AdminPlace } from '@/lib/adminPlaces'
import type { AdminEruv } from '@/lib/eruvStore'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { withCommunity } from '@/lib/useCommunityData'
import type { CategoryConfig } from '@/lib/categories'
import { sourceKind, sourceProblem, type WatchPurpose } from '@/lib/watchPurposes'
import { EditorAddLine, EditorEmptyRows, EditorOpenCard, EditorRowCard, editorFieldLabel, editorInputClass } from '@/components/resources/editorParts'
import { SignUpLine } from './AddPlace'
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
type AddEruvRow = RowId
const WHERE_ITS_MAP = 'Where its map is'
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

type StatusRead =
  | { state: 'reading' | 'failed' | 'no-gmail' }
  | { state: 'done'; words: string; on?: string }
  | { state: 'no-email'; account: string | null }
  | { state: 'unclear'; on: string }

/** Add a place, an eruv (boards AddEruv12, EruvStatusField12, AddEruvFilled12):
 *  the same Add screen, with no Google step. What's given goes on as it's added. */
export function AddEruv({ token, onBack, onAdded }: { token: string; onBack: () => void; onAdded: () => Promise<void> | void }) {
  const community = useCommunitySlug()
  const [draft, setDraft] = useState({ name: '', covers: '', status: '', map: '', hotline: '', alertsUrl: '', website: '' })
  const [openRow, setOpenRow] = useState<AddEruvRow | null>(null)
  const [screen, setScreen] = useState<{ title: string; label: string; key: 'status' | 'map'; kind: WatchPurpose } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusRead, setStatusRead] = useState<StatusRead | null>(null)
  const title = screen?.title ?? 'Add a place'
  const back = screen ? () => setScreen(null) : openRow ? () => setOpenRow(null) : onBack
  useSetScreenHeader(true, title, back)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = <T,>(body: Record<string, unknown>) => fetchJson<T>(withCommunity('/api/admin/eruvim', community), { method: 'POST', headers, body: JSON.stringify(body) }, 'Could not add it.')

  /** Read now (EruvRead13, EruvEmailNow14): what its page or its latest email
   *  says, and nothing's saved. */
  async function readStatusNow() {
    const email = sourceKind(draft.status) === 'email'
    setStatusRead({ state: 'reading' })
    const reply = await fetchJson<{ state?: string; status?: string; words?: string | null; on?: string; account?: string | null }>(
      withCommunity('/api/admin/read-now', community),
      { method: 'POST', headers, body: JSON.stringify({ slot: email ? 'eruv-email' : 'eruv', url: draft.status.trim() }) },
      'Could not read that.',
    ).catch(() => null)
    const says = reply?.words || (reply?.status === 'up' ? 'Up' : 'Down')
    if (reply?.state === 'done') setStatusRead({ state: 'done', words: says })
    else if (reply?.state === 'found') setStatusRead({ state: 'done', words: says, on: reply.on })
    else if (reply?.state === 'no-email') setStatusRead({ state: 'no-email', account: reply.account ?? null })
    else if (reply?.state === 'no-gmail') setStatusRead({ state: 'no-gmail' })
    else if (reply?.state === 'no-times') setStatusRead({ state: 'unclear', on: reply.on ?? '' })
    else setStatusRead({ state: 'failed' })
  }

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const { eruv } = await post<{ eruv: AdminEruv }>({ action: 'add', name: draft.name.trim() })
      const statusAt = draft.status.trim() ? (sourceKind(draft.status) === 'email' ? { statusEmail: draft.status.trim() } : { statusUrl: draft.status.trim() }) : {}
      const edit = {
        ...statusAt,
        ...(draft.map.trim() ? { lineUrl: draft.map.trim() } : {}),
        ...Object.fromEntries((['covers', 'hotline', 'alertsUrl', 'website'] as const).filter((k) => draft[k].trim()).map((k) => [k, draft[k].trim()])),
      }
      if (Object.keys(edit).length) await post({ action: 'save', id: eruv.id, edit })
      // A page or a map is read as it's added.
      if ('statusUrl' in statusAt || draft.map.trim()) await post({ action: 'check', id: eruv.id })
      await onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it.')
      setBusy(false)
    }
  }

  const given = (v: string, key: 'status' | 'map', label: string, kind: WatchPurpose, none: string) => {
    const open = (t: string) => () => setScreen({ title: t, label, key, kind })
    const link = (words: string, onClick: () => void) => (
      <button type="button" onClick={onClick} className={LINE_LINK}>
        {words}
      </button>
    )
    return {
      word: v.trim() ? 'Read when it’s added' : '',
      job: v.trim() ? (sourceKind(v) === 'email' ? 'Email' : 'Website') : 'Nothing',
      none,
      line: v.trim() ? <SourceWords line={{ text: shortUrl(v.trim()) }} controls={[link('Change', open('Change'))]} /> : <SourceWords line={{ text: 'Nothing reads this' }} controls={[link('Add a source', open('Add a source'))]} />,
    }
  }
  const input = (key: 'name' | 'covers' | 'hotline' | 'alertsUrl' | 'website', label: string, long = false) => (
    <div>
      <label htmlFor={`eruv-new-${key}`} className={editorFieldLabel}>
        {label}
      </label>
      {long ? (
        <textarea id={`eruv-new-${key}`} rows={3} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={`${editorInputClass} h-auto py-2.5`} />
      ) : (
        <input id={`eruv-new-${key}`} autoFocus={key === 'name' && !draft.name} type="text" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={editorInputClass} />
      )}
    </div>
  )
  const status = given(draft.status, 'status', 'Its status page, or the address its emails come from', 'eruv', 'No status yet')
  if (draft.status.trim()) {
    const source = draft.status.trim()
    const email = sourceKind(source) === 'email'
    const page = email ? source : shortUrl(source)
    const link = (words: string, onClick: () => void) => (
      <button type="button" onClick={onClick} className={LINE_LINK}>
        {words}
      </button>
    )
    const change = link('Change', () => setScreen({ title: 'Change', label: 'Its status page, or the address its emails come from', key: 'status', kind: 'eruv' }))
    const idle = <SourceWords line={{ text: page }} controls={[link('Read now', () => void readStatusNow()), change]} />
    if (statusRead?.state === 'done') status.word = statusRead.words
    const r = statusRead
    status.line =
      r?.state === 'reading' ? (
        <SourceWords line={{ text: email ? 'Looking in the guide’s Gmail…' : `Reading ${page}…` }} />
      ) : r?.state === 'done' ? (
        <SourceWords line={{ text: page, when: r.on ?? 'just now' }} controls={[change]} />
      ) : r?.state === 'no-email' ? (
        <>
          <SourceWords line={{ text: `No emails from ${source} yet` }} controls={[change]} />
          <SignUpLine account={r.account} />
        </>
      ) : r?.state === 'unclear' ? (
        <SourceWords line={{ text: `${source}’s ${r.on} email didn’t say` }} controls={[change]} />
      ) : r?.state === 'no-gmail' ? (
        <>
          <SourceWords line={{ text: 'The guide’s Gmail isn’t set up' }} controls={[<a key="gmail" href={`${adminBase(community)}/watches/newsletters`} target="_blank" rel="noopener noreferrer" className={LINE_LINK}>Set it up</a>]} />
          <SourceWords line={{ text: page, when: 'within the hour' }} controls={[change]} />
        </>
      ) : r?.state === 'failed' ? (
        <>
          <SourceWords line={{ text: email ? 'Couldn’t reach the guide’s Gmail' : 'Couldn’t read that page', red: true }} />
          {idle}
        </>
      ) : (
        idle
      )
  }
  const map = given(draft.map, 'map', WHERE_ITS_MAP, 'hours', 'No map yet')
  const read = (job: string, line: ReactNode) => ({ source: { job, amber: job === 'Nothing' }, line })
  const websiteRead = draft.website.trim() ? read('Website', <SourceWords line={{ text: 'Its website' }} />) : read('Nothing', <SourceWords line={{ text: 'Nothing reads this' }} />)
  const rows: { id: AddEruvRow; title: string; summary: string; filled: boolean; source?: { job: string; amber: boolean }; line?: ReactNode; body: ReactNode }[] = [
    { id: 'name', title: draft.name.trim() || 'Name', summary: draft.covers.trim(), filled: true, body: <>{input('name', 'Name')}{input('covers', 'What it covers', true)}</> },
    { id: 'status', title: 'Status', summary: status.word, filled: !!draft.status.trim(), ...read(status.job, status.line), body: <p className="m-0 text-[15px] text-slate-500">{status.none}</p> },
    { id: 'map', title: 'Map', summary: map.word, filled: !!draft.map.trim(), ...read(map.job, map.line), body: <p className="m-0 text-[15px] text-slate-500">{map.none}</p> },
    { id: 'hotline', title: 'Hotline', summary: draft.hotline.trim(), filled: !!draft.hotline.trim(), ...websiteRead, body: input('hotline', 'Hotline') },
    { id: 'alertsUrl', title: 'Alerts', summary: draft.alertsUrl.trim() && shortUrl(draft.alertsUrl.trim()), filled: !!draft.alertsUrl.trim(), ...websiteRead, body: input('alertsUrl', 'Alerts') },
    { id: 'website', title: 'Website', summary: draft.website.trim() && shortUrl(draft.website.trim()), filled: !!draft.website.trim(), ...read('Nothing', <SourceWords line={{ text: 'Nothing reads this' }} />), body: input('website', 'Website') },
  ]
  const opened = (r: (typeof rows)[number]) => (
    <EditorOpenCard testId={`editor-open-${r.id}`} title={r.title} onClose={() => setOpenRow(null)} source={r.line ? { line: r.line } : undefined}>
      {r.body}
    </EditorOpenCard>
  )
  const empty = rows.filter((r) => !r.filled)

  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: 'Back', onClick: back }} title={title} />
      {screen ? (
        <SourceScreen
          label={screen.label}
          value={draft[screen.key]}
          button="Save"
          attempt={async (url) => {
            const problem = sourceProblem(screen.kind, url)
            if (problem) throw new Error(problem)
            setDraft((d) => ({ ...d, [screen.key]: url }))
            if (screen.key === 'status') setStatusRead(null)
            return { failed: false }
          }}
          onTried={() => {}}
          onDone={() => setScreen(null)}
        />
      ) : (
        <div className="space-y-4" data-testid="editor-list">
          <p className="-mt-1 text-[14px] text-muted">Goes live as soon as you add it, with no review.</p>
          <ul className="space-y-2">
            {rows
              .filter((r) => r.filled)
              .map((r) => (
                <li key={r.id}>
                  {openRow === r.id ? (
                    opened(r)
                  ) : (
                    <EditorRowCard onOpen={() => setOpenRow(r.id)} testId={`editor-row-${r.id}`} opens="here" title={r.title} summary={r.summary} aside={r.source ? <RowJob source={r.source} /> : undefined} />
                  )}
                </li>
              ))}
          </ul>
          {empty.length > 0 && (
            <EditorEmptyRows>
              {empty.map((r) => (
                <li key={r.id}>{openRow === r.id ? opened(r) : <EditorAddLine onOpen={() => setOpenRow(r.id)} testId={`editor-add-${r.id}`} opens="here" title={r.title} />}</li>
              ))}
            </EditorEmptyRows>
          )}
          {error && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
          <button type="button" disabled={busy || !draft.name.trim()} onClick={() => void add()} className={SUBMIT_PILL}>
            {busy ? 'Adding…' : draft.name.trim() ? 'Add listing' : 'Still needed: Name'}
          </button>
        </div>
      )}
    </div>
  )
}
