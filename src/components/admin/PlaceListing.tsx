'use client'

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import type { EnrichedSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { AdminPlace } from '@/lib/adminPlaces'
import type { EditorRow } from '@/lib/editorRows'
import { fetchJson } from '@/lib/fetchJson'
import { websiteKeyOf, type CheckedField } from '@/lib/googleJob'
import { dishStatus } from '@/lib/watchJobs'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { shortDay } from '@/lib/todo'
import { withCommunity } from '@/lib/useCommunityData'
import { TrashIcon } from '@/components/icons'
import { SUBMIT_PILL } from '@/components/resources/submitPill'
import type { DirectoryResource } from '@/types'
import { AdminBack, AdminBox, AdminEmpty } from './AdminUI'
import ChangeReview from './ChangeReview'
import ListingEditorScreen from './ListingEditorScreen'
import { listingSources, rowFinding, type GiveSource, type ReadNow, type RowSource, type SourceLine } from './listingSource'
import OpenedPlace from './OpenedPlace'
import { sourceActions, type Attempt } from './sourceActions'
import type { Stop } from './openedPlaceBoxes'
import type { Jobs } from './useWatchJobs'
import { kindsOf } from './WatchKinds'

// A listing as an admin sees it, wherever it's opened from: Places, or a job's
// row with nothing waiting (boards Listing6, States6, Menu5, Change5, Stopped6,
// Restart6, GooglePhone7, Nov 1). Its rows, each naming the job that keeps it;
// opened, one line of where it's read from, and the one thing to do about that.

const button = 'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60'
const primary = `${button} border border-primary bg-primary text-white`
const secondary = `${button} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`
const danger = `${button} border border-red-600 bg-red-600 text-white`
const LINE_LINK = 'cursor-pointer font-semibold text-primary hover:underline disabled:opacity-60'
const INPUT = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900'

/** `send`: an eruv's own way back, which isn't a listing's route. */
export function ArchivedPlace({ place, category, token, onDone, send: own }: { place: AdminPlace; category: CategoryConfig | undefined; token: string; onDone: () => void; send?: { restore: () => Promise<void>; remove: () => Promise<void> } }) {
  const community = useCommunitySlug()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function send(method: 'PATCH' | 'DELETE', fallback: string) {
    setBusy(true)
    setError(null)
    try {
      if (own) await (method === 'PATCH' ? own.restore() : own.remove())
      else await fetchJson(withCommunity(`/api/admin/archived-listings/${place.id}`, community), { method, headers: { Authorization: `Bearer ${token}` } }, fallback)
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
          <span className="text-[13px] text-slate-600">
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

/** On the right of a row: the job that keeps it. */
export function RowJob({ source }: { source: Pick<RowSource, 'job' | 'amber'> }) {
  return (
    <span className={`max-w-[40%] shrink-0 text-right text-[13px] leading-snug ${source.amber ? 'text-amber-800' : 'text-slate-600'}`} data-testid="row-job">
      {source.job}
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

/** "Its menu · Oct 20 · Change": a row's one line, its controls drawn in by the caller. */
export function SourceWords({ line, controls }: { line: Pick<SourceLine, 'text' | 'url' | 'when'> & { red?: boolean }; controls?: ReactNode[] }) {
  return (
    <p className={`m-0 text-[13px] [overflow-wrap:anywhere] ${line.red ? 'font-semibold text-red-700' : 'text-slate-500'}`} data-testid="row-source">
      {line.url ? (
        <a href={line.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
          {line.text}
        </a>
      ) : (
        line.text
      )}
      {line.when && ` · ${line.when}`}
      {controls?.map((c, i) => (
        <Fragment key={i}>
          {' · '}
          {c}
        </Fragment>
      ))}
    </p>
  )
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
        <label className="flex flex-col gap-1.5 text-[13px] text-slate-600">
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
        <button type="button" disabled={busy} onClick={() => void go(async () => { await stop(); await onDone() })} className="min-h-11 cursor-pointer text-center text-[15px] font-bold text-red-700 disabled:opacity-60">
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
  reload: () => Promise<void>
  now: number
  onClose: () => void
  /** Saved or archived or brought back: it's done with here. */
  onSaved: () => void
  backLabel?: string
}) {
  const community = useCommunitySlug()
  const [item, setItem] = useState<DirectoryResource>(place.listing)
  const [patch, setPatch] = useState<Record<string, unknown> | undefined>(undefined)
  const [screen, setScreen] = useState<{ title: string; props: Omit<SourceScreenProps, 'onDone' | 'onTried'> } | null>(null)
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

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = <T,>(path: string, body: Record<string, unknown>) => fetchJson<T>(withCommunity(path, community), { method: 'POST', headers, body: JSON.stringify(body) }, 'Could not do that.')
  const actions = sourceActions(place.id, post)
  // Until every job has answered, nothing can be said of a row.
  const loaded = (['google', 'times', 'hours', 'dishes', 'kosher', 'hospitals', 'links', 'runs'] as const).every((k) => jobs[k] !== undefined)
  const sources = useMemo(() => (loaded && category ? listingSources(place.id, jobs, now, category, item as Record<string, unknown> & { id: string }) : null), [loaded, category, place.id, jobs, now, item])

  if (place.status === 'archived' || !category) {
    return (
      <div className="flex flex-col gap-3">
        <AdminBack back={{ label: backLabel ?? 'Back', onClick: onClose }} title={place.name} />
        {place.status === 'archived' ? <ArchivedPlace place={place} category={category} token={token} onDone={onSaved} /> : <AdminEmpty>Its category is gone, so it can’t be edited here.</AdminEmpty>}
      </div>
    )
  }

  function open(title: string, props: Omit<SourceScreenProps, 'onDone' | 'onTried'>) {
    setScreen({ title, props })
  }

  const give = (add: GiveSource): Attempt => async (url) => {
    if ('kind' in add.run) await actions.change(add.run, url)
    else await actions.addSource(add.run, url)
    return { failed: false }
  }

  async function google(row: EditorRow, action: 'stop_field' | 'use_field', field: CheckedField) {
    setBusy(true)
    setRowError(null)
    try {
      await post('/api/admin/watches/google', { action, id: place.id, field })
      if (action === 'use_field') {
        const got = await fetchJson<{ item: DirectoryResource }>(withCommunity(`/api/admin/watches/google?item=${place.id}`, community), { headers }, 'Could not open its listing.')
        const key = field === 'website' ? websiteKeyOf(category!)! : field
        setItem(got.item)
        setPatch({ [key]: (got.item as Record<string, unknown>)[key] ?? '' })
      }
      await reload()
    } catch (err) {
      setRowError({ row: row.id, text: err instanceof Error ? err.message : 'Could not do that.' })
    } finally {
      setBusy(false)
    }
  }

  type Found = { found: { id: string }[] }
  const foundIds = async () => (await fetchJson<Found>(withCommunity(`/api/admin/listings/${place.id}/found`, community), { headers }, 'Could not see what it found.')).found.map((f) => f.id)

  async function openChange(id: string) {
    const { submissions } = await fetchJson<{ submissions: EnrichedSubmission[] }>(withCommunity('/api/admin/submissions?status=pending', community), { headers }, 'Could not open that.')
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
  async function changeAnswered(updated: boolean) {
    if (updated) {
      const got = await fetchJson<{ item: DirectoryResource }>(withCommunity(`/api/admin/watches/google?item=${place.id}`, community), { headers }, 'Could not open its listing.')
      setItem(got.item)
      setEditorRound((r) => r + 1)
    }
    setChange(null)
    await reload()
  }

  async function answer(id: string, status: 'approved' | 'rejected', reason?: string) {
    setChangeBusy(true)
    setChangeError(null)
    try {
      await fetchJson(withCommunity(`/api/admin/submissions/${id}`, community), { method: 'PATCH', headers, body: JSON.stringify({ status, ...(reason ? { reason } : {}) }) }, 'Failed to update.')
      await changeAnswered(status === 'approved')
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setChangeBusy(false)
    }
  }

  const control = (words: string, onClick: () => void) => (
    <button type="button" disabled={busy || !!reading} onClick={onClick} className={LINE_LINK}>
      {words}
    </button>
  )

  const changeControl = (c: NonNullable<SourceLine['change']>) => {
    const stop: Stop | undefined = c.stop
    return control('Change', () =>
      open('Change', {
        label: c.label,
        value: c.value,
        button: 'Save',
        attempt: async (url) => {
          await actions.change(c.act, url)
          return { failed: false }
        },
        ...(stop ? { stop: () => actions.stopSource(stop) } : {}),
      }),
    )
  }

  function rowSource(row: EditorRow, changed: boolean): ReactNode {
    const source = sources?.(row)
    if (!source) return null
    const { line } = source
    const error = rowError?.row === row.id && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{rowError.text}</p>
    // Typed over or cleared, Google doesn't get it back on saving.
    if (line.googleStop && changed) return <SourceWords line={{ text: 'Google stops keeping this' }} />
    // Back from what a read found without answering: it waits here, and in To do.
    const waiting = rowFinding(place.id, jobs, row)
    if (waiting) return <SourceWords line={{ text: `${waiting.from} has a change` }} controls={[control('Open', () => void openChange(waiting.id))]} />
    const food = row.kind === 'items' && jobs.dishes?.find((p) => p.id === place.id)
    if (food && food.reading?.status === 'proposed' && dishStatus(food) === 'differs') return <SourceWords line={{ text: 'Its menu has a change' }} controls={[control('Open', () => setMenuChange(true))]} />
    const readKey = line.read && JSON.stringify(line.read)
    if (line.read && reading === readKey) return <SourceWords line={{ text: `Reading ${line.read.what}…` }} />
    const failed = readFailed && readFailed.read === readKey && <SourceWords line={{ text: readFailed.text, red: true }} />
    const dated = (l: SourceLine) => (l.read && readJust.includes(JSON.stringify(l.read)) ? { ...l, when: 'just now' } : l)
    const readControl = (l: SourceLine) => (l.read ? [control('Read now', () => void readNow(row, l.read!))] : [])
    const controls: ReactNode[] = [...readControl(line)]
    if (line.change) controls.push(changeControl(line.change))
    if (line.start) {
      const s = line.start
      controls.push(control('Change', () => open('Change', { label: s.label, value: s.value, button: 'Start reading', attempt: actions.startReading(s.again, s.value) })))
    }
    if (line.add) {
      const a = line.add
      controls.push(control('Add a source', () => open('Add a source', { label: a.label, value: '', button: 'Save', attempt: give(a) })))
    }
    if (line.googleStop) {
      const f = line.googleStop
      controls.push(control('Stop', () => void google(row, 'stop_field', f)))
    }
    if (line.useGoogle) {
      const f = line.useGoogle
      controls.push(control('Use Google’s', () => void google(row, 'use_field', f)))
    }
    return (
      <div className="space-y-1">
        {error}
        {failed}
        <SourceWords line={dated(line)} controls={controls} />
        {source.also && <SourceWords line={dated(source.also)} controls={[...readControl(source.also), ...(source.also.change ? [changeControl(source.also.change)] : [])]} />}
      </div>
    )
  }

  async function archive() {
    setArchiving(true)
    setArchiveError(null)
    try {
      await fetchJson(withCommunity(`/api/admin/listings/${place.id}`, community), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }, 'Could not archive it.')
      onSaved()
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not archive it.')
      setArchiving(false)
    }
  }

  const watched = menuChange ? kindsOf(jobs, adminBase(community), now)?.kinds.flatMap((k) => k.places).find((p) => p.id === place.id) : undefined
  return (
    <div>
      {change && (
        <ChangeReview
          key={change.id}
          submission={change}
          category={category}
          position={{ from: 'Back', at: 0, total: 1, back: () => setChange(null) }}
          busy={changeBusy}
          error={changeError}
          token={token}
          onModerate={(id, status, reason) => void answer(id, status, reason)}
          onUpdated={() => void changeAnswered(true)}
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
        overlay={
          screen && {
            title: screen.title,
            back: () => setScreen(null),
            node: (
              <SourceScreen
                {...screen.props}
                onTried={reload}
                onDone={async () => {
                  await reload()
                  setScreen(null)
                }}
              />
            ),
          }
        }
        rowAside={(row: EditorRow) => {
          const source = sources?.(row)
          return source ? <RowJob source={source} /> : null
        }}
        rowSource={rowSource}
        adminSave={{
          label: 'Update the listing',
          via: ({ payload }) =>
            fetch(withCommunity(`/api/admin/listings/${place.id}`, community), {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ payload }),
            }),
          onSaved,
          beside: confirming ? undefined : <ArchiveBin onClick={() => setConfirming(true)} />,
        }}
      />
      {confirming && !screen && (
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
