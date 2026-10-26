'use client'

import { Fragment, useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { sourceKind, sourceProblem } from '@/lib/watchPurposes'
import { placeSourcesText, type WatchedPlace } from '@/lib/watchPlaces'
import { Box, BoxRow, BoxRows, BUTTON, GO, LINK } from './JobBoxes'
import { Groups, UsualRow } from './TimesProposal'
import { Notes, Rows } from './MikvahHours'
import { People } from './People'
import { hoursRows } from '@/lib/hoursSections'
import { groupedRows } from '@/lib/timesProposal'
import { FindSheet } from './FindSheet'
import { checkedLines, openedPlace, type Again, type Change, type CheckedLine, type Foot, type OpenedBox, type Problem, type ReadStep, type Stop } from './openedPlaceBoxes'
import EruvKeptEmail from './EruvKeptEmail'
import { shortUrl } from './watchText'
import type { FoundStatusPage } from '@/lib/eruvFind'
import type { Jobs } from './useWatchJobs'
import { groupEdit, waitingGroups, type WaitGroup } from './waitingGroups'
import { withSave } from './findingEdits'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import EruvEditor, { type EruvValues } from '@/components/resources/EruvEditor'
import MobileSheet from '@/components/resources/MobileSheet'
import ActionDialog from '@/components/resources/ActionDialog'
import { useIsMobile } from '@/lib/useIsMobile'
import type { AdminEruv } from '@/lib/eruvStore'
import type { EruvFinding } from '@/lib/eruvJob'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'

// A place opened in place on its kind's page (openedPlaceBoxes.ts says what
// goes in it). Under its row on a computer, its own screen on a phone
// (FinalPhoneShul3), as PlaceRow opens a job page's.
//   Up to date (piece 2, Oct 25)   its boxes, each footed with its source.
//   Not checked (piece 3)          a group per problem, lit, with its own
//                                  button (FinalFood3, FinalPhonePlace3,
//                                  FinalStopped2, EruvNotChecked); then
//                                  "2 more checked", a line each.
//   Waiting for you (piece 4)      a group per source, what it would change
//                                  lit with "Was …", its own buttons
//                                  (FinalChanges2, FinalClosed,
//                                  FinalDropped, FinalNewPlace); then "3
//                                  more up to date". Edit opens the box
//                                  its job page's would, right here.

const INPUT = 'w-full rounded-lg border border-slate-400 bg-white px-2.5 py-2 text-sm text-slate-900 min-h-11'

const Mail = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="mr-1 inline-block align-[-1px]">
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="M2.5 4.5l5.5 4 5.5-4" />
  </svg>
)
const Plus = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
)
const Out = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0">
    <path d="M6 3h7v7" />
    <path d="M13 3L5 11" />
  </svg>
)
const Again = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M13 8a5 5 0 1 1-1.5-3.5" />
    <path d="M12.5 2.5v2.5h-2.5" />
  </svg>
)
const Right = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M6 4l4 4-4 4" />
  </svg>
)
const Down = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0 text-slate-400">
    <path d="M4 6l4 4 4-4" />
  </svg>
)

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** What goes in a box: the job page's own rows, as the listing has them. */
function BoxBody({ box }: { box: OpenedBox }) {
  if (box.kind === 'usual') return <Groups groups={groupedRows(box.rows)} row={(r, i) => <UsualRow key={i} r={r} />} />
  if (box.kind === 'week') {
    const w = box.week
    return (
      <>
        {w.none && (
          <BoxRows>
            <BoxRow name="No minyan this week" right={w.range} />
          </BoxRows>
        )}
        <Groups groups={w.days} row={(r, i) => <BoxRow key={i} name={r.what} sub={r.note ?? undefined} right={r.when} />} />
      </>
    )
  }
  if (box.kind === 'section') {
    const s = box.section
    return (
      <>
        {s.hours && <Rows rows={hoursRows(s.now[s.hours])} />}
        {s.notes && <Notes now={text(s.now[s.notes])} next={text(s.now[s.notes])} />}
      </>
    )
  }
  if (box.kind === 'people') return <People box={box.box} />
  return (
    <>
      {box.groups.map((g, i) => (
        <div key={i}>
          {g.head && <h4 className="pb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{g.head}</h4>}
          <BoxRows>
            {g.rows.map((r, j) => (
              <BoxRow key={j} name={r.name} sub={r.sub} right={r.right} />
            ))}
          </BoxRows>
        </div>
      ))}
    </>
  )
}

/** "Same as mekorhabracha.org/davening · read Oct 23 · Change". */
function FootLine({ foot, onChange, onStop }: { foot: Foot; onChange?: () => void; onStop?: () => void }) {
  return (
    <p className="text-[12.5px] text-slate-500 [overflow-wrap:anywhere]" data-testid="box-source">
      {foot.mail && <Mail />}
      {foot.lead}
      {foot.links.map((l, i) => (
        <Fragment key={i}>
          {i > 0 ? ' · ' : ' '}
          {l.url ? (
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
              {l.text}
            </a>
          ) : (
            l.text
          )}
        </Fragment>
      ))}
      {foot.when && ` · ${foot.when}`}
      {onChange && (
        <>
          {' · '}
          <button type="button" onClick={onChange} className={LINK}>
            Change
          </button>
        </>
      )}
      {onStop && (
        <>
          {' · '}
          <button type="button" onClick={onStop} className={LINK}>
            Stop
          </button>
        </>
      )}
    </p>
  )
}

/** "Stop reading its map?", under its box. */
function StopAsk({ what, busy, onStop, onKeep }: { what: string; busy: boolean; onStop: () => void; onKeep: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <span>Stop reading {what}?</span>
      <span className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onStop} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          Stop reading
        </button>
        <button type="button" onClick={onKeep} className={BUTTON}>
          Keep reading
        </button>
      </span>
    </div>
  )
}

/** A page, or an email, typed in: Add a source's box, or a box's Change. */
function SourceForm({ label, email, save, busy, onSave, onCancel, readFor = 'times' }: { label: string; email: boolean; save: string; busy: boolean; onSave: (v: string) => void; onCancel: () => void; readFor?: string }) {
  const [value, setValue] = useState('')
  const isEmail = email && sourceKind(value) === 'email'
  return (
    <form
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSave(value.trim())
      }}
    >
      <label className="flex max-w-lg flex-col gap-1 text-[12.5px] text-slate-600">
        {label}
        <input value={value} onChange={(e) => setValue(e.target.value)} className={INPUT} autoFocus />
      </label>
      {isEmail && (
        <span className="text-[13px] text-slate-600">
          <Mail />
          An email: read for its {readFor}. Subscribe the guide’s inbox to it too.
        </span>
      )}
      <span className="flex gap-2">
        <button type="submit" disabled={busy || !value.trim()} className={GO}>
          {save}
        </button>
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
      </span>
    </form>
  )
}

const FIELDS = 'grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3.5 py-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]'

/** A page, opened in a new tab: "rivkacakes.com ↗". */
function PageLink({ text, url }: { text: string; url: string | null }) {
  if (!url) return <>{text}</>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-[3px] text-primary hover:underline">
      {text}
      <Out />
    </a>
  )
}

/** A checked line: what, the listing's value, its source, Change. */
function CheckedRow({ line, onChange }: { line: CheckedLine; onChange?: () => void }) {
  const f = line.foot
  return (
    <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-baseline gap-3.5 border-b border-slate-100 py-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_auto]" data-testid="checked-line">
      <span>{line.label}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="[overflow-wrap:anywhere]">{line.value}</span>
        {line.marks?.map((m) => (
          <span key={m.name} className="text-[12.5px] text-slate-700 [overflow-wrap:anywhere]" data-testid="checked-mark">
            {m.name} · {m.mark}
          </span>
        ))}
        <span className="text-[12.5px] text-slate-500 [overflow-wrap:anywhere]">
          {f.mail && <Mail />}
          {f.links.length ? (
            f.links.map((l, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                <PageLink {...l} />
              </Fragment>
            ))
          ) : (
            f.lead
          )}
          {f.when && ` · ${f.when}`}
        </span>
      </span>
      {onChange ? (
        <button type="button" onClick={onChange} className={`text-[13px] ${LINK}`}>
          Change
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

const CHANGE_LABEL: Record<Change['kind'], string> = {
  page: 'The page to read instead',
  newsletter: 'The email its newsletter comes from now',
  menu: 'Its menu page',
  refuah: 'Its page on Refuah',
  'eruv-status': 'Its status page, or the address its emails come from',
  'eruv-map': 'Its map',
  keystone: 'Its page on Keystone-K’s list',
}
const changeEmail = (c: Change) => c.kind === 'newsletter' || c.kind === 'eruv-status'
const readFor = (c: Change | null) => (c?.kind === 'eruv-status' ? 'status' : 'times')

export default function OpenedPlace({
  place,
  kindLabel,
  jobs,
  token,
  community,
  now,
  onClose,
  onChanged,
}: {
  place: WatchedPlace
  kindLabel: string
  jobs: Jobs
  token: string
  community: string
  now: number
  onClose: () => void
  /** After a read or a new source: every job read again. */
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [changing, setChanging] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [finding, setFinding] = useState(false)
  const [stopping, setStopping] = useState<string | null>(null)
  const [found, setFound] = useState<{ found: FoundStatusPage[]; error: string | null } | null>(null)
  // Edit's box, open here: `n` the group's finding it's on, `saved` how
  // many of them Save put in.
  const [editing, setEditing] = useState<{ item: DirectoryResource; category: CategoryConfig; edit: BoxEdit; n: number; saved: number } | null>(null)
  const [eruvEditing, setEruvEditing] = useState<{ eruv: AdminEruv; finding: EruvFinding } | null>(null)
  const isMobile = useIsMobile()
  const opened = openedPlace(place.id, jobs, now)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = <T,>(path: string, body: Record<string, unknown>) => fetchJson<T>(withCommunity(path, community), { method: 'POST', headers, body: JSON.stringify(body) }, 'Could not do that.')
  const hoursApi = (job: 'hours' | 'times') => `/api/admin/watches/hours${job === 'times' ? '?job=times' : ''}`

  /** Photos of a menu, read for its dishes (the Dishes page's). */
  function menuPhotos(files: File[]) {
    const body = new FormData()
    body.append('action', 'photos')
    body.append('resourceId', place.id)
    for (const f of files) body.append('file', f)
    return fetchJson(withCommunity('/api/admin/main-dishes', community), { method: 'POST', headers: { Authorization: headers.Authorization }, body }, 'Could not read those photos.')
  }

  async function run(what: string, work: () => Promise<unknown>) {
    setError(null)
    setBusy(what)
    try {
      await work()
      await onChanged()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
      return false
    } finally {
      setBusy(null)
    }
  }

  // Each of its jobs read, one after another; a shul's or mikvah's pages
  // one request each, as its job page reads them.
  async function readStep(s: ReadStep) {
    if (s.job === 'dishes') return post('/api/admin/main-dishes', { action: 'read', resourceId: s.resourceId })
    if (s.job === 'refuah' || s.job === 'watch') return post('/api/admin/watches', { action: 'check', id: s.watchId })
    if (s.job === 'eruv') return post('/api/admin/eruvim', { id: s.id, action: 'check' })
    // Its website, given its watch first when the daily run hasn't yet.
    if (s.job === 'eruv-site') return post('/api/admin/watches/eruv', { action: 'read', id: s.id })
    const res = await post<{ read?: string[] }>(hoursApi(s.job), { action: 'check', resourceId: s.resourceId })
    for (const id of res.read ?? []) await post(hoursApi(s.job), { action: 'check', resourceId: s.resourceId, id })
  }

  async function change(c: Change, url: string) {
    if (c.kind === 'page') await post(hoursApi(c.job), { action: 'give', resourceId: place.id, url, replaces: c.replaces })
    else if (c.kind === 'newsletter') {
      const problem = sourceKind(url) === 'email' ? null : 'Give the email address its newsletter comes from.'
      if (problem) throw new Error(problem)
      await post('/api/admin/watches', { action: 'add', purpose: 'times', url, resourceId: place.id })
      await post('/api/admin/watches', { action: 'remove', id: c.replaces })
    } else if (c.kind === 'menu') await post('/api/admin/main-dishes', { action: 'link', resourceId: place.id, url })
    else if (c.kind === 'eruv-status') await eruvSource(url)
    else if (c.kind === 'eruv-map') {
      const problem = sourceProblem('hours', url)
      if (problem) throw new Error(problem)
      await post('/api/admin/eruvim', { id: place.id, action: 'save', edit: { lineUrl: url } })
      await post('/api/admin/eruvim', { id: place.id, action: 'check' })
    } else if (c.kind === 'keystone') await post('/api/admin/watches/kosher', { action: 'page', resourceId: place.id, url })
    else await post('/api/admin/watches/hospitals', { action: 'choose', resourceId: place.id, url })
  }

  /** An eruv's one source for its status (eruvEdit.ts): a page or the
   *  address its emails come from, the other emptied; a page read now. */
  async function eruvSource(source: string, dated?: boolean) {
    const problem = sourceProblem('eruv', source)
    if (problem) throw new Error(problem)
    const email = sourceKind(source) === 'email'
    const edit = email ? { statusEmail: source, statusUrl: '' } : { statusUrl: source, statusEmail: '', ...(dated === undefined ? {} : { statusDated: dated }) }
    await post('/api/admin/eruvim', { id: place.id, action: 'save', edit })
    if (!email) await post('/api/admin/eruvim', { id: place.id, action: 'check' })
  }

  async function stopSource(s: Stop) {
    if (s.kind === 'watch') await post('/api/admin/watches', { action: 'pause', id: s.watchId })
    else if (s.kind === 'page') await post(hoursApi(s.job), { action: 'stop', resourceId: place.id, id: s.watchId })
    else if (s.kind === 'menu') await post('/api/admin/main-dishes', { action: s.action, resourceId: place.id })
    else if (s.kind === 'refuah') await post('/api/admin/watches/hospitals', { action: 'stop', resourceId: place.id })
    else await post('/api/admin/eruvim', { id: s.id, action: 'save', edit: s.kind === 'eruv-status' ? { statusUrl: '', statusEmail: '' } : { lineUrl: '' } })
  }

  /** Read it again: a source turned off or stopped, read from now on. */
  async function readAgain(a: Again) {
    if (a.kind === 'place') await post(hoursApi(a.job), { action: 'on', resourceId: place.id })
    else if (a.kind === 'page') await post(hoursApi(a.job), { action: 'again', resourceId: place.id, id: a.watchId })
    else if (a.kind === 'refuah') await post('/api/admin/watches/hospitals', { action: 'on', resourceId: place.id })
    else if (a.kind === 'menu') await post('/api/admin/main-dishes', { action: 'undo_no_menu', resourceId: place.id })
    else await post('/api/admin/watches', { action: 'resume', id: a.watchId })
  }

  // What isn't read, each with Read it again (the job pages' Turn back on).
  const notRead = opened.again.length > 0 && (
    <section aria-label="Not read" className="flex flex-col">
      {opened.again.map((a) => (
        <span key={a.key} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-slate-100 py-2 text-[13.5px]">
          <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">Not read · {a.what}</span>
          <button type="button" disabled={busy !== null} onClick={() => void run(`again-${a.key}`, () => readAgain(a))} className={LINK}>
            {busy === `again-${a.key}` ? 'Reading…' : 'Read it again'}
          </button>
        </span>
      ))}
    </section>
  )

  async function addSource(url: string) {
    const a = opened.add!
    if (a.job === 'eruv') return eruvSource(url)
    const problem = sourceProblem(a.job === 'times' ? 'times' : 'hours', url)
    if (problem) throw new Error(problem)
    if (a.job === 'dishes') await post('/api/admin/main-dishes', { action: 'link', resourceId: place.id, url })
    else if (sourceKind(url) === 'email') await post('/api/admin/watches', { action: 'add', purpose: 'times', url, resourceId: place.id })
    else await post(hoursApi(a.job), { action: 'give', resourceId: place.id, url })
  }

  /** Edit: the box each of the group's findings changes, one after
   *  another, saved straight to the listing. */
  async function openEdit(g: WaitGroup) {
    const e = groupEdit(g, place.id, jobs)
    if (!e) return
    setError(null)
    if (e.kind === 'eruv') return setEruvEditing({ eruv: e.eruv, finding: e.finding })
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`/api/admin/watches/google?item=${place.id}`, community), { headers }, 'Could not open its listing.')
      const edits = e.makers.map((m) => m(item, category)).filter((x) => x !== null)
      if (!edits.length) throw new Error('Could not open its box.')
      const open = (n: number) => {
        const fe = edits[n]
        if (!fe) {
          setEditing(null)
          return void onChanged()
        }
        setEditing({ item, category, n, saved: n, edit: withSave(fe, { community, token, onSaved: () => open(n + 1) }) })
      }
      open(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open its listing.')
    }
  }
  function closeEdit() {
    if (editing?.saved) void onChanged()
    setEditing(null)
  }
  const Sheet = isMobile ? MobileSheet : ActionDialog
  const editSheets = (
    <>
      {editing && <BoxEditSheet key={editing.n} item={editing.item} category={editing.category} edit={editing.edit} onClose={closeEdit} />}
      <Sheet isOpen={!!eruvEditing} onClose={() => setEruvEditing(null)} title="Details">
        {eruvEditing && (
          <EruvEditor
            eruv={eruvEditing.eruv}
            onClose={() => setEruvEditing(null)}
            adminSave={{
              label: 'Save to the listing',
              values: { hotline: eruvEditing.finding.hotline ?? '', alertsUrl: eruvEditing.finding.alertsUrl ?? '' },
              onSave: async (values: EruvValues) => {
                try {
                  await fetchJson(withCommunity(`/api/admin/submissions/${eruvEditing.finding.id}`, community), { method: 'PATCH', headers, body: JSON.stringify({ status: 'approved', payload: values }) }, 'Could not save that.')
                } catch (err) {
                  return [err instanceof Error ? err.message : 'Could not save that.']
                }
                void onChanged()
                return null
              },
            }}
          />
        )}
      </Sheet>
    </>
  )

  const reading = busy === 'read'
  const notChecked = place.state === 'not_checked' && opened.problems.length > 0
  const shell =
    'flex flex-col gap-3 border-b border-slate-100 px-4 pb-4 pt-3 [&>*]:shrink-0 max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:overflow-y-auto max-sm:border-0 max-sm:bg-slate-100 max-sm:pb-8 max-sm:pt-[max(1rem,env(safe-area-inset-top))]'
  const phoneBack = (
    <button type="button" onClick={onClose} className="self-start text-sm font-semibold text-primary hover:underline sm:hidden">
      ‹ {kindLabel}
    </button>
  )
  const listing = place.listing && (
    <a href={place.listing} target="_blank" rel="noopener noreferrer" className={`self-start py-1 text-[13.5px] ${LINK}`}>
      Open its listing
    </a>
  )

  if (place.state === 'waiting') {
    const w = waitingGroups(place.id, jobs, now)
    const patch = (id: string, body: Record<string, unknown>) => fetchJson(withCommunity(`/api/admin/submissions/${id}`, community), { method: 'PATCH', headers, body: JSON.stringify(body) }, 'Could not do that.')
    const each = (ids: readonly string[], body: (id: string) => Record<string, unknown>) => async () => {
      for (const id of ids) await patch(id, body(id))
    }
    const google = (body: Record<string, unknown>) => () => post('/api/admin/watches/google', { ...body, id: place.id })
    const menu = (action: 'use' | 'skip') => () => post('/api/admin/main-dishes', { action, resourceId: place.id })
    // Bring it back: the guide's archived listing restored, with the list's
    // hechsher once its new place is filed.
    const restore = (archivedId: string, id?: string) => () => post('/api/admin/watches/kosher', { action: 'restore', resourceId: archivedId, ...(id ? { id } : {}) })
    // Each group's buttons, the first its main one, as drawn.
    const buttons = (g: WaitGroup): { label: string; work: () => Promise<unknown> }[] => {
      const d = g.decide
      if (d.kind === 'later') return d.archivedId ? [{ label: 'Bring it back', work: restore(d.archivedId) }] : []
      if (d.kind === 'closure') return [{ label: 'Keep closed', work: google({ action: 'open', open: false }) }, { label: 'Show as open', work: google({ action: 'open', open: true }) }]
      if (d.kind === 'new')
        return [
          ...(d.archivedId ? [{ label: 'Bring it back', work: restore(d.archivedId, d.id) }] : []),
          { label: 'Add as new', work: each([d.id], () => ({ status: 'approved' })) },
          { label: 'Don’t add', work: each([d.id], () => ({ status: 'rejected' })) },
        ]
      if (d.kind === 'off' || d.kind === 'archive')
        return [
          { label: 'Remove the listing', work: d.kind === 'off' ? each([d.id], () => ({ status: 'approved' })) : () => post('/api/admin/watches/kosher', { action: 'archive', id: d.id }) },
          { label: 'Keep it', work: each([d.id], () => ({ status: 'rejected' })) },
          ...(d.kind === 'off' && d.renamed ? [{ label: `It’s ${d.renamed} now`, work: () => post('/api/admin/watches/kosher', { action: 'renamed', id: d.id }) }] : []),
        ]
      // Wrong place: Google matched another place. The match goes, and the
      // place opens again on Find it on Google or Not on Google.
      if (d.kind === 'google')
        return [
          { label: 'Accept', work: google({ action: 'use' }) },
          { label: 'Keep as is', work: google({ action: 'keep' }) },
          { label: 'Wrong place', work: google({ action: 'wrong_place' }) },
        ]
      if (d.kind === 'menu') return [{ label: 'Accept', work: menu('use') }, { label: 'Keep as is', work: menu('skip') }]
      return [
        { label: 'Accept', work: each(d.ids, (id) => ({ status: 'approved', ...(d.only?.[id] ? { only: d.only[id] } : {}) })) },
        { label: 'Keep as is', work: each(d.ids, () => ({ status: 'rejected' })) },
      ]
    }
    // Edit: the box its job page's Edit opens, here.
    const edit = (g: WaitGroup) =>
      groupEdit(g, place.id, jobs) && (
        <button type="button" disabled={busy !== null} onClick={() => void openEdit(g)} className={BUTTON}>
          Edit
        </button>
      )
    return (
      <li role="region" aria-label={place.name} data-testid="kind-place-open" className={shell}>
        {phoneBack}
        <button type="button" aria-expanded="true" onClick={onClose} className="flex items-center gap-2.5 text-left max-sm:pointer-events-none">
          <span className="max-sm:hidden">
            <Down />
          </span>
          <span className="min-w-0 flex-1 text-[15.5px] font-bold text-slate-900 max-sm:text-[19px]">{place.name}</span>
          {place.pill && (
            <span className={`whitespace-nowrap rounded-full border px-2 py-px text-xs font-semibold ${place.red ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{place.pill}</span>
          )}
        </button>
        <div className="flex flex-col rounded-[10px] border border-slate-200 bg-white px-3.5 pb-3.5 pt-1">
          {w.groups.map((g) => {
            const [main, ...rest] = buttons(g)
            const key = `wait:${g.key}`
            const act = (b: { work: () => Promise<unknown> }) => () => void run(key, b.work)
            return (
              <div key={g.key} className="flex flex-col border-b border-slate-100 pb-3 pt-2.5" data-testid="waiting-group">
                <span className="pb-1 text-[13px] font-semibold text-slate-600">
                  From {g.page ? <PageLink {...g.page} /> : 'its source'}
                  {g.when && ` · ${g.when}`}
                </span>
                {g.lines.length > 0 && (
                  <div className="-mx-2 flex flex-col rounded-md bg-amber-50 px-2">
                    {g.lines.map((l, i) => (
                      <span key={i} className={FIELDS}>
                        <span>{l.label}</span>
                        <span className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
                          <span className="font-semibold">{l.value}</span>
                          {l.old !== null && <span className="text-[12.5px] text-slate-500">Was {l.old}</span>}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {g.facts.map((x) => (
                  <span key={x.label} className={`${FIELDS} border-t border-slate-100`}>
                    <span>{x.label}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{x.url ? <PageLink text={x.value} url={x.url} /> : x.value}</span>
                  </span>
                ))}
                {g.note && <span className="border-t border-slate-100 pb-0.5 pt-2.5 text-[12.5px] text-slate-500">{g.note}</span>}
                {main && (
                  <div className="flex flex-wrap items-center gap-2 pt-2.5">
                    <button type="button" disabled={busy !== null} onClick={act(main)} className={GO}>
                      {busy === key ? 'Saving…' : main.label}
                    </button>
                    {g.decide.kind !== 'off' && g.decide.kind !== 'archive' && edit(g)}
                    {rest.map((b) => (
                      <button key={b.label} type="button" disabled={busy !== null} onClick={act(b)} className={BUTTON}>
                        {b.label}
                      </button>
                    ))}
                    {(g.decide.kind === 'off' || g.decide.kind === 'archive') && edit(g)}
                  </div>
                )}
              </div>
            )
          })}
          {/* A page that differs with nothing filed from it yet: read it
              again, to file what it says. */}
          {w.groups.length === 0 && opened.reads.length > 0 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run('read', async () => {
                  for (const s of opened.reads) await readStep(s)
                })
              }
              className={`self-start py-2.5 text-[13.5px] ${LINK}`}
            >
              {busy === 'read' ? 'Reading…' : opened.pages === 1 ? 'Read it again' : 'Read them again'}
            </button>
          )}
          {w.checked.length > 0 && (
            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex items-center gap-1.5 pb-1 pt-2.5 text-left text-[13.5px] text-slate-500">
              {more ? <Down /> : <Right />}
              {w.checked.length} more up to date
            </button>
          )}
          {more && w.checked.map((l) => <CheckedRow key={l.key} line={l} />)}
          {notRead}
          {error && <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {listing && <span className="pt-1">{listing}</span>}
        </div>
        {editSheets}
      </li>
    )
  }

  if (notChecked) {
    const lines = checkedLines(opened.checked)
    const googlePlace = jobs.google?.places.find((g) => g.id === place.id)
    const googlePost = (body: Record<string, unknown>) => post<{ place?: never; found?: never }>('/api/admin/watches/google', body)
    const fix = (p: Problem) => {
      const f = p.fix
      if (!f) return null
      const key = `fix:${p.key}`
      if (f.kind === 'google')
        return (
          <>
            <button type="button" disabled={busy !== null || !googlePlace} onClick={() => setFinding(true)} className={GO}>
              Find it on Google
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void run(key, () => googlePost({ action: 'not_on_google', id: place.id }))} className={BUTTON}>
              Not on Google
            </button>
          </>
        )
      if (f.kind === 'read')
        return (
          <button type="button" disabled={busy !== null} onClick={() => void run(key, () => readStep(f.step))} className={`inline-flex items-center gap-1.5 ${GO}`}>
            <Again />
            {busy === key ? 'Reading…' : (f.pages ?? 1) > 1 ? 'Read them now' : 'Read it now'}
          </button>
        )
      if (f.kind === 'link')
        return (
          <button type="button" disabled={busy !== null} onClick={() => void run(key, () => post('/api/admin/watches/links', { action: 'check', resourceId: f.resourceId, key: f.key }))} className={`inline-flex items-center gap-1.5 ${GO}`}>
            <Again />
            {busy === key ? 'Checking…' : 'Check it again'}
          </button>
        )
      if (f.kind === 'google-check')
        return (
          <button type="button" disabled={busy !== null} onClick={() => void run(key, () => googlePost({ action: 'check', id: place.id }))} className={GO}>
            {busy === key ? 'Checking…' : 'Check it against Google'}
          </button>
        )
      if (f.kind === 'eruv-email') {
        const e = jobs.eruvim?.eruvim.find((x) => x.id === f.id)
        return e ? <EruvKeptEmail eruv={e} timezone={jobs.eruvim!.timezone} busy={busy !== null} onSays={(says) => void run(key, () => post('/api/admin/eruvim', { id: f.id, action: 'email-says', says }))} /> : null
      }
      if (f.kind === 'eruv-find')
        return (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(key, async () => {
                  setFound(await post<{ found: FoundStatusPage[]; error: string | null }>('/api/admin/eruvim', { id: f.id, action: 'find' }))
                })
              }
              className={GO}
            >
              {busy === key ? 'Searching its website…' : 'Find its status page'}
            </button>
            {changing !== key && (
              <button type="button" disabled={busy !== null} onClick={() => setChanging(key)} className={BUTTON}>
                Add a source
              </button>
            )}
          </>
        )
      if (changing === key) return null
      const label = f.kind === 'add' ? 'Add a source' : f.label
      return (
        <>
          <button type="button" disabled={busy !== null || (f.kind === 'add' && !opened.add)} onClick={() => setChanging(key)} className={GO}>
            {label}
          </button>
          {/* A hospital Refuah doesn't have: said so, as its job page's Reads did. */}
          {f.kind === 'change' && f.change.kind === 'refuah' && (
            <button type="button" disabled={busy !== null} onClick={() => void run(key, () => post('/api/admin/watches/hospitals', { action: 'none', resourceId: place.id }))} className={BUTTON}>
              Not on Refuah
            </button>
          )}
          {/* A menu that can't be read: photos of it, or none online, as
              its job page's Reads had them. */}
          {f.kind === 'change' && f.change.kind === 'menu' && (
            <>
              <label className={`cursor-pointer ${BUTTON} ${busy !== null ? 'pointer-events-none opacity-50' : ''}`}>
                Photos of the menu
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])]
                    e.target.value = ''
                    if (files.length) void run(key, () => menuPhotos(files))
                  }}
                />
              </label>
              <button type="button" disabled={busy !== null} onClick={() => void run(key, () => post('/api/admin/main-dishes', { action: 'no_menu', resourceId: place.id }))} className={BUTTON}>
                No menu online
              </button>
            </>
          )}
        </>
      )
    }
    const form = (p: Problem) => {
      const f = p.fix
      const key = `fix:${p.key}`
      const e = f?.kind === 'eruv-find' ? jobs.eruvim?.eruvim.find((x) => x.id === f.id) : null
      const offered = e && found ? found.found.filter((x) => x.url !== e.statusUrl) : []
      const pages = e && found && (
        <div className="flex flex-col gap-2 pt-2.5 text-sm text-slate-700" data-testid="eruv-found">
          {found.error ? (
            <span>{found.error}.</span>
          ) : offered.length === 0 ? (
            <span>No page on {shortUrl(e.website ?? '')} says whether it’s up.</span>
          ) : (
            offered.map((x) => (
              <span key={x.url} className="flex flex-col gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                <span>
                  {x.link ? `Its “${x.link}” page` : 'Its home page'}, <PageLink text={shortUrl(x.url)} url={x.url} />, says it’s <strong>{x.status}</strong>
                </span>
                {x.words && <span className="text-xs text-slate-500">“{x.words}”</span>}
                <button type="button" disabled={busy !== null} onClick={() => void run(key, () => eruvSource(x.url, e.statusDated)).then((ok) => ok && setFound(null))} className={`self-start pt-1 ${LINK}`}>
                  Read its status from here
                </button>
              </span>
            ))
          )}
        </div>
      )
      if (changing !== key || !f || (f.kind !== 'add' && f.kind !== 'change' && f.kind !== 'eruv-find')) return pages || null
      const a = opened.add
      if (f.kind === 'eruv-find')
        return (
          <>
            {pages}
            <SourceForm label={a?.label ?? ''} email save="Add" busy={busy !== null} readFor="status" onCancel={() => setChanging(null)} onSave={(url) => void run(key, () => addSource(url)).then((ok) => ok && setChanging(null))} />
          </>
        )
      return (
        <SourceForm
          readFor={f.kind === 'change' ? readFor(f.change) : opened.add?.job === 'eruv' ? 'status' : 'times'}
          label={f.kind === 'add' ? (a?.label ?? '') : CHANGE_LABEL[f.change.kind]}
          email={f.kind === 'add' ? !!a?.email : changeEmail(f.change)}
          save={f.kind === 'add' ? 'Add' : 'Use this'}
          busy={busy !== null}
          onCancel={() => setChanging(null)}
          onSave={(url) => void run(key, () => (f.kind === 'add' ? addSource(url) : change(f.change, url))).then((ok) => ok && setChanging(null))}
        />
      )
    }
    return (
      <li role="region" aria-label={place.name} data-testid="kind-place-open" className={shell}>
        {phoneBack}
        <button type="button" aria-expanded="true" onClick={onClose} className="flex items-center gap-2.5 text-left max-sm:pointer-events-none">
          <span className="max-sm:hidden">
            <Down />
          </span>
          <span className="min-w-0 flex-1 text-[15.5px] font-bold text-slate-900 max-sm:text-[19px]">{place.name}</span>
          {place.pill && <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-px text-xs font-semibold text-amber-800">{place.pill}</span>}
        </button>
        <div className="flex flex-col rounded-[10px] border border-slate-200 bg-white px-3.5 pb-3.5 pt-1">
          {opened.problems.map((p) => (
            <div key={p.key} className="flex flex-col border-b border-slate-100 pb-3 pt-2.5" data-testid="problem">
              <span className="flex flex-wrap items-baseline gap-1 pb-1 text-[13px] font-semibold text-amber-800">
                {p.page && (
                  <>
                    <PageLink {...p.page} />
                    <span>·</span>
                  </>
                )}
                <span>{p.says}</span>
              </span>
              {p.fields.length > 0 && (
                <div className="-mx-2 flex flex-col rounded-md bg-amber-50 px-2">
                  {p.fields.map((f) => (
                    <span key={f.label} className={FIELDS}>
                      <span>{f.label}</span>
                      <span className="min-w-0 [overflow-wrap:anywhere]">{f.value}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-2.5">
                {fix(p)}
                {/* A page that doesn't load: no longer read, asked first. */}
                {p.stop && stopping !== p.key && (
                  <button type="button" disabled={busy !== null} onClick={() => setStopping(p.key)} className={BUTTON}>
                    Stop
                  </button>
                )}
              </div>
              {p.stop && stopping === p.key && (
                <StopAsk what={p.stop.what} busy={busy !== null} onKeep={() => setStopping(null)} onStop={() => void run('stop', () => stopSource(p.stop!)).then((ok) => ok && setStopping(null))} />
              )}
              {form(p)}
            </div>
          ))}
          {lines.length > 0 && (
            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex items-center gap-1.5 pb-1 pt-2.5 text-left text-[13.5px] text-slate-500">
              {more ? <Down /> : <Right />}
              {lines.length} more checked
            </button>
          )}
          {more &&
            lines.map((l) => {
              const c = l.foot.change
              const key = `line:${l.key}`
              return (
                <Fragment key={l.key}>
                  <CheckedRow line={l} onChange={c && changing !== key ? () => setChanging(key) : undefined} />
                  {c && changing === key && (
                    <div className="py-2.5">
                      <SourceForm
                        label={CHANGE_LABEL[c.kind]}
                        email={changeEmail(c)}
                        readFor={readFor(c)}
                        save="Use this"
                        busy={busy !== null}
                        onCancel={() => setChanging(null)}
                        onSave={(url) => void run('change', () => change(c, url)).then((ok) => ok && setChanging(null))}
                      />
                    </div>
                  )}
                </Fragment>
              )
            })}
          {notRead}
          {error && <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {listing && <span className="pt-1">{listing}</span>}
        </div>
        {finding && googlePlace && (
          <FindSheet
            place={googlePlace}
            post={googlePost}
            onClose={() => setFinding(false)}
            onPicked={() => {
              setFinding(false)
              void onChanged()
            }}
          />
        )}
      </li>
    )
  }

  return (
    <li role="region" aria-label={place.name} data-testid="kind-place-open" className={shell}>
      {phoneBack}
      <button type="button" aria-expanded="true" onClick={onClose} className="flex items-center gap-2.5 text-left max-sm:pointer-events-none">
        <span className="max-sm:hidden">
          <Down />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15.5px] font-bold text-slate-900 max-sm:text-[19px]">{place.name}</span>
          {place.sources.length > 0 && <span className="text-[13px] text-muted">{placeSourcesText(place.sources)}</span>}
        </span>
      </button>
      {opened.boxes.map((b) => (
        <Box key={b.key} name={b.title} defaultOpen>
          <BoxBody box={b} />
          {b.dated && (
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={b.dated.on} disabled={busy !== null} onChange={(ev) => void run('dated', () => post('/api/admin/eruvim', { id: b.dated!.id, action: 'save', edit: { statusDated: ev.target.checked } }))} />
              Its page dates each week’s post
            </label>
          )}
          <FootLine
            foot={b.foot}
            onChange={b.foot.change && changing !== b.key ? () => setChanging(b.key) : undefined}
            onStop={b.foot.stop && stopping !== b.key ? () => setStopping(b.key) : undefined}
          />
          {b.foot.stop && stopping === b.key && (
            <StopAsk what={b.foot.stop.what} busy={busy !== null} onKeep={() => setStopping(null)} onStop={() => void run('stop', () => stopSource(b.foot.stop!)).then((ok) => ok && setStopping(null))} />
          )}
          {b.foot.change && changing === b.key && (
            <SourceForm
              label={CHANGE_LABEL[b.foot.change.kind]}
              email={changeEmail(b.foot.change)}
              readFor={readFor(b.foot.change)}
              save="Use this"
              busy={busy !== null}
              onCancel={() => setChanging(null)}
              onSave={(url) => void run('change', () => change(b.foot.change!, url)).then((ok) => ok && setChanging(null))}
            />
          )}
        </Box>
      ))}
      {notRead}
      {adding && opened.add && (
        <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white" aria-label="Add a source">
          <p className="border-b border-slate-100 px-3.5 py-2.5 text-[15px] font-bold text-slate-900">Add a source</p>
          <div className="px-3.5 pb-3.5 pt-3">
            <SourceForm
              label={opened.add.label}
              email={opened.add.email}
              readFor={opened.add.job === 'eruv' ? 'status' : 'times'}
              save="Add"
              busy={busy !== null}
              onCancel={() => setAdding(false)}
              onSave={(url) => void run('add', () => addSource(url)).then((ok) => ok && setAdding(false))}
            />
          </div>
        </section>
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <span className="flex flex-wrap items-center gap-x-[18px] gap-y-1 text-[13.5px]">
        {opened.add && !adding && (
          <button type="button" disabled={busy !== null} onClick={() => setAdding(true)} className={`inline-flex items-center gap-1.5 py-1 ${LINK}`}>
            <Plus />
            Add a source
          </button>
        )}
        {/* None for a place read only from Google and a newsletter: nothing
            of its own to read now (agreed Oct 24). */}
        {opened.reads.length > 0 && opened.pages > 0 && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run('read', async () => {
                for (const s of opened.reads) await readStep(s)
              })
            }
            className={`py-1 ${LINK}`}
          >
            {reading ? 'Reading…' : opened.pages === 1 ? 'Read it now' : 'Read them now'}
          </button>
        )}
        {place.listing && (
          <a href={place.listing} target="_blank" rel="noopener noreferrer" className={`py-1 ${LINK}`}>
            Open its listing
          </a>
        )}
      </span>
    </li>
  )
}
