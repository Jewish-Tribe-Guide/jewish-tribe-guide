'use client'

import { stickerOf, type LineState } from './rowSticker'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { EnrichedSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { AdminPlace } from '@/lib/adminPlaces'
import type { EditorRow } from '@/lib/editorRows'
import { websiteKeyOf, type CheckedField } from '@/lib/googleJob'
import { dishStatus } from '@/lib/watchJobs'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { shortDay } from '@/lib/todo'
import { TrashIcon } from '@/components/icons'
import { SUBMIT_PILL } from '@/components/resources/submitPill'
import type { DirectoryResource } from '@/types'
import { AdminBack, AdminBox, AdminEmpty } from './AdminUI'
import { ChangeOnItsOwn } from './TodoChange'
import ListingEditorScreen from './ListingEditorScreen'
import { listingSources, rowFinding, type GiveSource, type ReadNow, type RowSource, type SourceLine } from './listingSource'
import OpenedPlace from './OpenedPlace'
import { sourceActions, type Attempt } from './sourceActions'
import type { Stop } from './openedPlaceBoxes'
import { jobsChangedBy, type Jobs } from './useWatchJobs'
import { kindsOf } from './WatchKinds'
import { useStepsInAddress } from './useStepsInAddress'
import { sourcePlaceholder, useSourceFields, type FieldSpec } from './useSourceFields'
import { useAdminApi } from './useAdminApi'
import ReadFrom from './ReadFrom'
import { listingReadFrom } from './readFromFacts'
import { editSubmission } from '@/lib/editSubmission'
import { MENU_LINK_KEY } from '@/lib/menuLink'

// A listing as an admin sees it, wherever it's opened from: Places, or a job's
// row with nothing waiting (boards Listing6, States6, Menu5, Change5, Stopped6,
// Restart6, GooglePhone7, Nov 1). Its rows, each naming the job that keeps it;
// opened, one line of where it's read from, and the one thing to do about that.

const button = 'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`
const danger = `${button} border border-red-600 bg-red-600 text-white`
const LINE_LINK = 'cursor-pointer font-semibold text-primary hover:underline disabled:opacity-60'
const INPUT = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[0.9375rem] text-slate-900'

/** `send`: an eruv's own way back, which isn't a listing's route. */
export function ArchivedPlace({ place, category, token, onDone, send: own }: { place: AdminPlace; category: CategoryConfig | undefined; token: string; onDone: () => void; send?: { restore: () => Promise<void>; remove: () => Promise<void> } }) {
  const api = useAdminApi(token)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function send(method: 'PATCH' | 'DELETE', fallback: string) {
    setBusy(true)
    setError(null)
    try {
      if (own) await (method === 'PATCH' ? own.restore() : own.remove())
      else await api.send(method, `/api/admin/archived-listings/${place.id}`, undefined, fallback)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
      setBusy(false)
    }
  }

  return (
    <AdminBox>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-lg font-bold text-slate-900">{place.name}</h2>
          <span className="text-[0.8125rem] text-slate-600">
            {[category?.label, `Archived ${shortDay(place.changedAt)}`].filter(Boolean).join(' · ')}
          </span>
          {place.listing.address && <span className="text-sm text-slate-700">{place.listing.address}</span>}
        </div>
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="m-0 text-sm text-red-800">Delete {place.name} for good? This can’t be undone.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void send('DELETE', 'Could not delete it.')} className={danger}>
                {busy ? 'Deleting…' : 'Delete it'}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={secondary}>
                Leave it
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void send('PATCH', 'Could not bring it back.')} className={primary}>
              {busy ? 'Bringing it back…' : 'Bring it back'}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={secondary}>
              Delete for good
            </button>
          </div>
        )}
        {error && <p className="m-0 text-sm text-red-700">{error}</p>}
      </div>
    </AdminBox>
  )
}

/** On the right of a row, and in its header once open: whether something
 *  keeps it current (rowSticker). The job itself is the source line's to
 *  name; `data-job` keeps it for tests. */
export function RowJob({ source, checking }: { source: Pick<RowSource, 'job' | 'amber' | 'unchecked'> & { lines?: { text: string; state?: LineState }[] }; checking?: boolean }) {
  const sticker = checking ? stickerOf({ job: source.job, amber: false, lines: [{ text: '…', state: 'checking' }] }) : stickerOf(source)
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.78125rem] font-bold whitespace-nowrap ${sticker.tone === 'green' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
      data-testid="row-job"
      data-job={source.job}
    >
      {sticker.text}
    </span>
  )
}

/** The round red bin, on Update the listing's line, as the site's edit bar has it. */
export function ArchiveBin({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Archive it"
      onClick={onClick}
      className="flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-red-600 shadow-lg transition-colors hover:bg-red-50 active:scale-[0.96]"
    >
      <TrashIcon className="h-5 w-5" />
    </button>
  )
}

/** "From its menu · Oct 20 · Change": a row's one line, its controls drawn
 *  in by the caller. With no text, just its controls. */
export function SourceWords({ line, controls }: { line: Pick<SourceLine, 'text' | 'url' | 'when'> & { red?: boolean }; controls?: ReactNode[] }) {
  const parts: ReactNode[] = [
    ...(line.text
      ? [
          line.url ? (
            <a href={line.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
              {line.text}
            </a>
          ) : (
            line.text
          ),
        ]
      : []),
    ...(line.when ? [line.when] : []),
    ...(controls ?? []),
  ]
  return (
    <p className={`m-0 text-[0.8125rem] [overflow-wrap:anywhere] ${line.red ? 'font-semibold text-red-700' : 'text-slate-500'}`} data-testid="row-source">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {p}
        </Fragment>
      ))}
    </p>
  )
}

/** A source line's words as the opened row says them (board L2, Nov 25):
 *  "From Google", "From its website", "From kesher.example/davening".
 *  Nothing reading it has no words: the sticker says Not checked, and the
 *  field under the line is what to do about it. */
export function fromWords(text: string): string {
  if (!text || text === 'Nothing reads this') return ''
  if (text === 'Stopped' || /^(From|Reading|Couldn’t|No |Looking|Not found)/.test(text)) return text
  if (text === 'Link check') return 'From the weekly link check'
  return `From ${text.startsWith('Its ') ? `its ${text.slice(4)}` : text}`
}

export type SourceScreenProps = {
  label: string
  value: string
  button: string
  attempt: Attempt
  stop?: () => Promise<void>
  /** Under the address: an eruv's "Its page dates each week's post". */
  extra?: ReactNode
  placeholder?: string
  /** It's been tried already, and couldn't be read. */
  failedAtFirst?: boolean
  onDone: () => Promise<void> | void
  /** After a try that didn't read: the source is in by then. */
  onTried: () => Promise<void> | void
}

/** Change, and Add a source: where it's read from, filled in; Save, or Start
 *  reading once it's stopped, which reads at once and says if it couldn't. */
export function SourceScreen({ label, value: first, button: words, attempt: firstAttempt, stop, extra, placeholder, failedAtFirst = false, onDone, onTried }: SourceScreenProps) {
  const [value, setValue] = useState(first)
  const [attempt, setAttempt] = useState<{ run: Attempt }>({ run: firstAttempt })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(failedAtFirst)
  const [error, setError] = useState<string | null>(null)

  async function go(work: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setFailed(false)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="source-screen"
      onSubmit={(e) => {
        e.preventDefault()
        void go(async () => {
          const result = await attempt.run(value.trim())
          if (!result.failed) return void (await onDone())
          setFailed(true)
          if (result.next) setAttempt({ run: result.next })
          await onTried()
        })
      }}
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1.5 text-[0.8125rem] text-slate-600">
          {label}
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className={INPUT} autoFocus />
        </label>
        {extra}
      </div>
      {failed && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">Couldn’t read that page</p>}
      {error && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !value.trim()} className={SUBMIT_PILL}>
        {busy ? 'Reading…' : words}
      </button>
      {stop && (
        <button type="button" disabled={busy} onClick={() => void go(async () => { await stop(); await onDone() })} className="min-h-11 cursor-pointer text-center text-[0.9375rem] font-bold text-red-700 disabled:opacity-60">
          Stop reading it
        </button>
      )}
    </form>
  )
}

export default function PlaceListing({
  place,
  category,
  token,
  jobs,
  reload,
  now,
  onClose,
  onSaved,
  backLabel,
}: {
  place: AdminPlace
  category: CategoryConfig | undefined
  token: string
  jobs: Jobs
  reload: (changed?: readonly (keyof Jobs)[]) => Promise<void>
  now: number
  onClose: () => void
  /** Saved or archived or brought back: it's done with here. */
  onSaved: () => void
  backLabel?: string
}) {
  const community = useCommunitySlug()
  const [item, setItem] = useState<DirectoryResource>(place.listing)
  const [patch, setPatch] = useState<Record<string, unknown> | undefined>(undefined)
  // `key`: which it is, for the address (the row, then which of its line's
  // controls opened it).
  // A row's source given or changed in the row itself, saved by its Done.
  const fields = useSourceFields()
  const [rowError, setRowError] = useState<{ row: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  // Read now (SavedRead15, ReadChange16, Nov 1): the read under way, those done
  // here, one that failed; what it found opens over the listing, which stays
  // mounted underneath with whatever's been typed in it.
  const [reading, setReading] = useState<string | null>(null)
  const [readJust, setReadJust] = useState<readonly string[]>([])
  const [readFailed, setReadFailed] = useState<{ read: string; text: string } | null>(null)
  const [change, setChange] = useState<EnrichedSubmission | null>(null)
  const [changeBusy, setChangeBusy] = useState(false)
  const [changeError, setChangeError] = useState<string | null>(null)
  const [menuChange, setMenuChange] = useState(false)
  const [editorRound, setEditorRound] = useState(0)
  // What it found opens from wherever the row was, and starts at its top.
  const foundOpen = !!change || menuChange
  useEffect(() => {
    if (foundOpen) window.scrollTo?.(0, 0)
  }, [foundOpen])

  const api = useAdminApi(token)
  const post = <T,>(path: string, body: Record<string, unknown>) => api.post<T>(path, body)
  const actions = sourceActions(place.id, post)
  // Until every job has answered, nothing can be said of a row.
  const loaded = (['google', 'times', 'hours', 'dishes', 'kosher', 'hospitals', 'links', 'runs'] as const).every((k) => jobs[k] !== undefined)
  const sources = useMemo(() => (loaded && category ? listingSources(place.id, jobs, now, category, item as Record<string, unknown> & { id: string }) : null), [loaded, category, place.id, jobs, now, item])

  const give = (add: GiveSource): Attempt => async (url) => {
    if ('kind' in add.run) await actions.change(add.run, url)
    else await actions.addSource(add.run, url)
    return { failed: false }
  }
  /** The fields a row's source line opens, by which control opens them
   *  (board N4, Nov 25). Each reads the listing again once it's tried. */
  function fieldSpecs(row: EditorRow): Partial<Record<'change' | 'start' | 'add' | 'also', FieldSpec>> {
    const source = sources?.(row)
    if (!source) return {}
    const { line } = source
    const placeholder = sourcePlaceholder(row)
    const then = (run: Attempt): Attempt => async (url) => {
      const result = await run(url)
      await reload()
      return result
    }
    const changeSpec = (key: 'change' | 'also', c: NonNullable<SourceLine['change']>): FieldSpec => {
      const stop: Stop | undefined = c.stop
      return {
        key,
        value: c.value,
        placeholder,
        attempt: then(async (url) => {
          await actions.change(c.act, url)
          return { failed: false }
        }),
        ...(stop ? { stop: async () => { await actions.stopSource(stop); await reload() } } : {}),
      }
    }
    const s = line.start
    const a = line.add
    return {
      ...(line.change && { change: changeSpec('change', line.change) }),
      ...(s && { start: { key: 'start', value: s.value, placeholder, attempt: then(actions.startReading(s.again, s.value)) } }),
      ...(a && { add: { key: 'add', value: '', placeholder, attempt: then(give(a)) } }),
      ...(source.also?.change && { also: changeSpec('also', source.also.change) }),
    }
  }

  // What a read found (a change, a menu), and a source's Change or Add a
  // source over the listing, each have an address and an entry: Back closes
  // it, Forward and a reload open it again. A change's own Edit is inside
  // what was found, and goes with it.
  useStepsInAddress(
    'found',
    change ? [change.id] : menuChange ? ['menu'] : [],
    ([to]) => {
      setMenuChange(to === 'menu')
      if (!to || to === 'menu') return setChange(null)
      if (change?.id !== to) void openChange(to).catch(() => {})
    },
    { inner: ['step'] },
  )
  if (place.status === 'archived' || !category) {
    return (
      <div className="flex flex-col gap-3">
        <AdminBack back={{ label: backLabel ?? 'Back', onClick: onClose }} title={place.name} />
        {place.status === 'archived' ? <ArchivedPlace place={place} category={category} token={token} onDone={onSaved} /> : <AdminEmpty>Its category is gone, so it can’t be edited here.</AdminEmpty>}
      </div>
    )
  }

  async function google(row: EditorRow, action: 'stop_field' | 'use_field', field: CheckedField) {
    setBusy(true)
    setRowError(null)
    try {
      await post('/api/admin/watches/google', { action, id: place.id, field })
      if (action === 'use_field') {
        const got = await api.get<{ item: DirectoryResource }>(`/api/admin/watches/google?item=${place.id}`, 'Could not open its listing.')
        const key = field === 'website' ? websiteKeyOf(category!)! : field
        setItem(got.item)
        setPatch({ [key]: (got.item as Record<string, unknown>)[key] ?? '' })
      }
      await reload(jobsChangedBy('/api/admin/watches/google'))
    } catch (err) {
      setRowError({ row: row.id, text: err instanceof Error ? err.message : 'Could not do that.' })
    } finally {
      setBusy(false)
    }
  }

  type Found = { found: { id: string }[] }
  const foundIds = async () => (await api.get<Found>(`/api/admin/listings/${place.id}/found`, 'Could not see what it found.')).found.map((f) => f.id)

  async function openChange(id: string) {
    const { submissions } = await api.get<{ submissions: EnrichedSubmission[] }>('/api/admin/submissions?status=pending', 'Could not open that.')
    const found = submissions.find((s) => s.id === id)
    if (found) setChange(found)
  }

  async function readNow(row: EditorRow, read: ReadNow) {
    const key = JSON.stringify(read)
    const couldnt = `Couldn’t read ${read.what}`
    setReading(key)
    setReadFailed(null)
    try {
      const before = await foundIds()
      const result = await actions.readSource(read)
      await reload()
      if (result.failed) {
        const text = result.emailState === 'no-email' ? 'No email from it yet' : result.emailState === 'no-gmail' ? 'The guide’s Gmail isn’t connected yet' : couldnt
        setReadFailed({ read: key, text })
        return
      }
      setReadJust((done) => [...done, key])
      if (result.changedMenu) return setMenuChange(true)
      const fresh = (await foundIds()).find((id) => !before.includes(id))
      if (fresh) await openChange(fresh)
    } catch {
      setReadFailed({ read: key, text: couldnt })
    } finally {
      setReading(null)
    }
  }

  /** Answered: Update the listing changed what the editor started from. */
  async function partAnswered(id: string, updated: boolean) {
    if (updated) {
      const got = await api.get<{ item: DirectoryResource }>(`/api/admin/watches/google?item=${place.id}`, 'Could not open its listing.')
      setItem(got.item)
      setEditorRound((r) => r + 1)
    }
    await openChange(id)
  }

  async function changeAnswered(updated: boolean) {
    if (updated) {
      const got = await api.get<{ item: DirectoryResource }>(`/api/admin/watches/google?item=${place.id}`, 'Could not open its listing.')
      setItem(got.item)
      setEditorRound((r) => r + 1)
    }
    setChange(null)
    await reload()
  }

  // `part`: one part of the change; the rest still waits, read again.
  async function answer(id: string, status: 'approved' | 'rejected', reason?: string, part?: string): Promise<'partial' | 'whole' | 'failed'> {
    setChangeBusy(true)
    setChangeError(null)
    try {
      const res = await api.send<{ partial?: boolean }>('PATCH', `/api/admin/submissions/${id}`, { status, ...(reason ? { reason } : {}), ...(part ? { part } : {}) }, 'Failed to update.')
      if (res?.partial) {
        await partAnswered(id, status === 'approved')
        return 'partial'
      }
      await changeAnswered(status === 'approved')
      return 'whole'
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Something went wrong.')
      return 'failed'
    } finally {
      setChangeBusy(false)
    }
  }

  const control = (words: string, onClick: () => void) => (
    <button type="button" disabled={busy || !!reading} onClick={onClick} className={LINE_LINK}>
      {words}
    </button>
  )

  function rowSource(row: EditorRow, changed: boolean): ReactNode {
    const source = sources?.(row)
    if (!source) return null
    const { line } = source
    const error = rowError?.row === row.id && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{rowError.text}</p>
    // Typed over or cleared, Google doesn't get it back on saving.
    if (line.googleStop && changed) return <SourceWords line={{ text: 'Google stops keeping this' }} />
    const readKey = line.read && JSON.stringify(line.read)
    if (line.read && reading === readKey) return <SourceWords line={{ text: `Reading ${line.read.what}…` }} />
    // Back from what a read found without answering: it waits here, and in To do.
    const waiting = rowFinding(place.id, jobs, row)
    if (waiting) return <SourceWords line={{ text: `${waiting.from} has a change` }} controls={[control('Open', () => void openChange(waiting.id))]} />
    const food = row.kind === 'items' && jobs.dishes?.find((p) => p.id === place.id)
    if (food && food.reading?.status === 'proposed' && dishStatus(food) === 'differs') return <SourceWords line={{ text: 'Its menu has a change' }} controls={[control('Open', () => setMenuChange(true))]} />
    const failed = readFailed && readFailed.read === readKey && <SourceWords line={{ text: readFailed.text, red: true }} />
    const said = (l: SourceLine) => ({ ...l, text: fromWords(l.text), ...(l.read && readJust.includes(JSON.stringify(l.read)) ? { when: 'just now' } : {}) })
    const readControl = (l: SourceLine) => (l.read ? [control('Read now', () => void readNow(row, l.read!))] : [])
    const specs = fieldSpecs(row)
    // Change: the field, filled in, under the line; its link goes once it's open.
    const changeOf = (which: 'change' | 'start' | 'also') => {
      const spec = specs[which]
      return spec && !fields.isOpen(row, which) ? [control('Change', () => fields.reveal(row, spec))] : []
    }
    const controls: ReactNode[] = [...readControl(line), ...changeOf('change'), ...changeOf('start')]
    // Google keeps several rows: what's typed over stops it for that one.
    if (line.useGoogle) {
      const f = line.useGoogle
      controls.push(control('Use Google’s', () => void google(row, 'use_field', f)))
    }
    const words = said(line)
    return (
      <div className="space-y-1.5">
        {error}
        {failed}
        {(words.text || controls.length > 0) && <SourceWords line={words} controls={controls} />}
        {specs.change && fields.field(row, specs.change)}
        {specs.start && fields.field(row, specs.start)}
        {specs.add && fields.field(row, specs.add, true)}
        {source.also && <SourceWords line={said(source.also)} controls={[...readControl(source.also), ...changeOf('also')]} />}
        {specs.also && fields.field(row, specs.also)}
      </div>
    )
  }

  /** A row's Done: what its field holds, saved first. */
  const rowDone = (row: EditorRow) => {
    const add = fieldSpecs(row).add
    return fields.done(row, add ? [add] : [])
  }

  async function archive() {
    setArchiving(true)
    setArchiveError(null)
    try {
      await api.send('DELETE', `/api/admin/listings/${place.id}`, undefined, 'Could not archive it.')
      onSaved()
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not archive it.')
      setArchiving(false)
    }
  }

  /** A Read from row's Save: one field of the listing, saved as an admin's
   *  edit, and the editor starting again from it. */
  async function saveField(key: string, url: string) {
    await api.send('PATCH', `/api/admin/listings/${place.id}`, { payload: editSubmission(category!, item, { [key]: url }) }, 'Could not save it.')
    const got = await api.get<{ item: DirectoryResource }>(`/api/admin/watches/google?item=${place.id}`, 'Could not open its listing.')
    setItem(got.item)
    setEditorRound((r) => r + 1)
  }
  const readFrom = loaded ? listingReadFrom(place.id, jobs, category, item as Record<string, unknown>) : null
  const websiteKey = websiteKeyOf(category)

  const watched = menuChange ? kindsOf(jobs, adminBase(community), now)?.kinds.flatMap((k) => k.places).find((p) => p.id === place.id) : undefined
  return (
    <div>
      {change && (
        <ChangeOnItsOwn
          key={change.id}
          submission={change}
          category={category}
          back={() => setChange(null)}
          busy={changeBusy}
          error={changeError}
          token={token}
          onModerate={(id, status, part) => void answer(id, status, undefined, part)}
          onUpdated={(id, partial) => void (partial ? partAnswered(id, true) : changeAnswered(true))}
        />
      )}
      {/* Dishes wait on the screen To do opens for a menu. */}
      {watched && !change && (
        <div className="space-y-3.5">
          <AdminBack back={{ label: 'Back', onClick: () => setMenuChange(false) }} title={place.name} />
          <OpenedPlace place={watched} jobs={jobs} token={token} community={community} now={now} onChanged={reload} />
        </div>
      )}
      <div className={change || watched ? 'hidden' : undefined}>
      <ListingEditorScreen
        key={`${place.id}-${editorRound}`}
        heading={place.name}
        backLabel={backLabel}
        item={item}
        category={category}
        onClose={onClose}
        splitContact
        patch={patch}
        top={
          readFrom && (
            <ReadFrom
              key={`${place.id}-${editorRound}`}
              placeId={place.id}
              token={token}
              {...readFrom}
              saveWebsite={(url) => saveField(websiteKey!, url)}
              saveMenu={(url) => saveField(MENU_LINK_KEY, url)}
              linkEmail={async (w) => void (await post('/api/admin/watches', { action: 'link', id: w.id, resourceId: place.id }))}
              onChanged={() => reload()}
            />
          )
        }
        rowAside={(row: EditorRow) => {
          const source = sources?.(row)
          return source ? <RowJob source={source} checking={!!source.line.read && reading === JSON.stringify(source.line.read)} /> : null
        }}
        rowSource={rowSource}
        rowDone={rowDone}
        adminSave={{
          label: 'Update the listing',
          via: ({ payload }) =>
            api.fetch(`/api/admin/listings/${place.id}`, { method: 'PATCH', body: { payload } }),
          onSaved,
          beside: confirming ? undefined : <ArchiveBin onClick={() => setConfirming(true)} />,
        }}
      />
      {confirming && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="m-0 text-sm text-red-800">Take {place.name} off the site? It stays under Archived.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={archiving} onClick={() => void archive()} className={danger}>
              {archiving ? 'Archiving…' : 'Archive it'}
            </button>
            <button type="button" disabled={archiving} onClick={() => setConfirming(false)} className={secondary}>
              Leave it
            </button>
          </div>
          {archiveError && <p className="m-0 text-sm text-red-700">{archiveError}</p>}
        </div>
      )}
      </div>
    </div>
  )
}
