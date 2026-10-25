'use client'

import { Fragment, useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { sourceKind, sourceProblem } from '@/lib/watchPurposes'
import { placeSourcesText, type WatchedPlace } from '@/lib/watchPlaces'
import { Box, BoxRow, BoxRows, BUTTON, GO, LINK } from './JobBoxes'
import { Groups, UsualRow } from './TimesProposal'
import { Notes, Rows } from './MikvahHours'
import { People } from './HospitalsJob'
import { hoursRows } from '@/lib/hoursSections'
import { groupedRows } from '@/lib/timesProposal'
import { openedPlace, type Change, type Foot, type OpenedBox, type ReadStep } from './openedPlaceBoxes'
import type { Jobs } from './useWatchJobs'

// A place up to date, opened in place on its kind's page (piece 2, Oct 25;
// openedPlaceBoxes.ts says what goes in it). Under its row on a computer, its
// own screen on a phone (FinalPhoneShul3), as PlaceRow opens a job page's.

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
function FootLine({ foot, onChange }: { foot: Foot; onChange?: () => void }) {
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
    </p>
  )
}

/** A page, or an email, typed in: Add a source's box, or a box's Change. */
function SourceForm({ label, email, save, busy, onSave, onCancel }: { label: string; email: boolean; save: string; busy: boolean; onSave: (v: string) => void; onCancel: () => void }) {
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
          An email: read for its times. Subscribe the guide’s inbox to it too.
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

const CHANGE_LABEL: Record<Change['kind'], string> = {
  page: 'The page to read instead',
  newsletter: 'The email its newsletter comes from now',
  menu: 'Its menu page',
  refuah: 'Its page on Refuah',
}

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
  const opened = openedPlace(place.id, jobs, now)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = <T,>(path: string, body: Record<string, unknown>) => fetchJson<T>(withCommunity(path, community), { method: 'POST', headers, body: JSON.stringify(body) }, 'Could not do that.')
  const hoursApi = (job: 'hours' | 'times') => `/api/admin/watches/hours${job === 'times' ? '?job=times' : ''}`

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
    if (s.job === 'refuah') return post('/api/admin/watches', { action: 'check', id: s.watchId })
    if (s.job === 'eruv') return post('/api/admin/eruvim', { id: s.id, action: 'check' })
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
    else await post('/api/admin/watches/hospitals', { action: 'choose', resourceId: place.id, url })
  }

  async function addSource(url: string) {
    const a = opened.add!
    const problem = sourceProblem(a.job === 'times' ? 'times' : 'hours', url)
    if (problem) throw new Error(problem)
    if (a.job === 'dishes') await post('/api/admin/main-dishes', { action: 'link', resourceId: place.id, url })
    else if (sourceKind(url) === 'email') await post('/api/admin/watches', { action: 'add', purpose: 'times', url, resourceId: place.id })
    else await post(hoursApi(a.job), { action: 'give', resourceId: place.id, url })
  }

  const reading = busy === 'read'
  return (
    <li
      role="region"
      aria-label={place.name}
      data-testid="kind-place-open"
      className="flex flex-col gap-3 border-b border-slate-100 px-4 pb-4 pt-3 [&>*]:shrink-0 max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:overflow-y-auto max-sm:border-0 max-sm:bg-slate-100 max-sm:pb-8 max-sm:pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <button type="button" onClick={onClose} className="self-start text-sm font-semibold text-primary hover:underline sm:hidden">
        ‹ {kindLabel}
      </button>
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
          <FootLine foot={b.foot} onChange={b.foot.change && changing !== b.key ? () => setChanging(b.key) : undefined} />
          {b.foot.change && changing === b.key && (
            <SourceForm
              label={CHANGE_LABEL[b.foot.change.kind]}
              email={b.foot.change.kind === 'newsletter'}
              save="Use this"
              busy={busy !== null}
              onCancel={() => setChanging(null)}
              onSave={(url) => void run('change', () => change(b.foot.change!, url)).then((ok) => ok && setChanging(null))}
            />
          )}
        </Box>
      ))}
      {adding && opened.add && (
        <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white" aria-label="Add a source">
          <p className="border-b border-slate-100 px-3.5 py-2.5 text-[15px] font-bold text-slate-900">Add a source</p>
          <div className="px-3.5 pb-3.5 pt-3">
            <SourceForm
              label={opened.add.label}
              email={opened.add.email}
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
        <a href={place.href} target="_blank" rel="noopener noreferrer" className={`py-1 ${LINK}`}>
          Open its listing
        </a>
      </span>
    </li>
  )
}
