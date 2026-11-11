'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { EnrichedSubmission, ResourceSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { diffLines } from '@/lib/submissionDiff'
import { onlyExtras, scheduleChange, usualBoxChange, type ChangeGroup, type ChangeLine } from '@/lib/changeLines'
import { boxChangeCount, minyanimForBox, type MinyanBox } from '@/lib/minyanimBox'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { readSchedules } from '@/lib/schedules'
import { useEditWeek } from '@/lib/useEditWeek'
import { useEditorSteps, useStepsInAddress } from './useStepsInAddress'
import { reviewParts } from '@/lib/reviewParts'
import { markTimes, submissionSource } from '@/lib/submissionSource'
import { normalizeRow } from '@/lib/resourceShape'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import ListingEditor from '@/components/resources/ListingEditor'
import { AdminBack } from './AdminUI'
import { TheOriginal, fieldKeyFor } from './SubmissionReview'
import ThingSwitches from './ThingSwitches'
import { changeEdit } from './changeEdit'

// A change opened from To do (boards 3 and 20, Oct 29; one list since Oct 31,
// the user: "drop original vs now"): what's new highlighted and what's going
// crossed out, where the change came from, and three answers. "Update the listing" takes it as it came; "Edit, then
// update" opens the rows it changes in the site's own editor (a shul's
// times in its minyan editor, boards 20b and 20c) and updating saves what
// the admin left there; "Leave it" turns it down. On a phone the answers
// sit in a bar over the tabs, in reach of a thumb.
//
// A change with more than one part (a phone and the hours, a shul's weekday
// and Shabbos times) is answered a part at a time (reviewParts.ts, the user,
// Nov 2): switches over the parts, the open one shown alone, its answers
// for it only. One answered is ticked; the last one decides the change.

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** `from`: opened from somewhere else than To do's list (Read now on a saved
 *  place), which goes back there and has no place in a list to show. */
export type QueuePosition = { from?: string; at: number; total: number; back: () => void; next?: () => void }

export default function ChangeReview({
  submission: s,
  category,
  position,
  busy,
  error,
  token,
  onModerate,
  onUpdated,
  inPlace,
}: {
  submission: EnrichedSubmission
  category: CategoryConfig
  position: QueuePosition
  busy?: boolean
  error?: string | null
  token: string
  /** `part`: that part of it only. Resolves `partial` when the rest still waits. */
  onModerate: (id: string, status: 'approved' | 'rejected', reason?: string, part?: string) => Promise<'partial' | 'whole' | 'failed'> | void
  /** Saved from "Edit, then update": it's approved and gone from the list,
   *  or with `partial`, that part went on and the rest still waits. */
  onUpdated: (id: string, partial?: boolean) => void
  /** Opened as one of the things waiting at a place (To do, Nov 2): the
   *  place's switches in place of the change's own, `part` the one open
   *  (none: the change whole), and whether its Edit is open. */
  inPlace?: { part?: string; switches: ReactNode; onEditing: (editing: boolean) => void }
}) {
  const community = useCommunitySlug()
  const fields = category.detailFields
  const whole = s.payload as unknown as ResourceSubmission
  // Its parts, in the order first shown; answered ones stay, ticked.
  const parts = s.current ? reviewParts(s.current, whole, category) : []
  const [order] = useState(() => parts.map((p) => ({ id: p.id, label: p.label })))
  const [done, setDone] = useState<string[]>([])
  const savedPart = useRef(false)
  const [on, setOn] = useState<string | null>(null)
  // The switches stay till the change is decided, the answered ones ticked.
  const part = inPlace
    ? parts.length > 1
      ? parts.find((p) => p.id === inPlace.part)
      : undefined
    : order.length > 1 && parts.length > 0
      ? (parts.find((p) => p.id === on && !done.includes(p.id)) ?? parts.find((p) => !done.includes(p.id)) ?? parts[0])
      : undefined
  const weeks = useEditWeek(fields.some((f) => f.type === 'minyanim'))
  const { sent, changed, rows: onlyRows, preset } = changeEdit(s, category, part, weeks)
  const things = [...order, ...parts.filter((p) => !order.some((o) => o.id === p.id))].map((p) => ({ ...p, done: done.includes(p.id) }))
  const decided = (id: string) => {
    setDone((d) => [...d, id])
    setOn(parts.find((p) => p.id !== id && !done.includes(p.id))?.id ?? null)
  }
  async function decide(status: 'approved' | 'rejected', reason?: string) {
    if ((await onModerate(s.id, status, reason, part?.id)) === 'partial' && part) {
      decided(part.id)
      setLeaving(false)
    }
  }
  const source = submissionSource(s)
  const [editing, setEditing] = useState(false)
  const { step, path: editorPath, onStep, reopen, ask } = useEditorSteps()
  const [leaving, setLeaving] = useState(false)
  const [reason, setReason] = useState('')
  // Edit, and each row open in it, has an address and an entry: Back
  // closes it, Forward and a reload open it again.
  useStepsInAddress(
    'edit',
    editing ? ['edit', ...editorPath] : [],
    (to) => {
      setEditing(to.length > 0)
      ask(to.slice(1))
    },
    { owner: s.id.slice(0, 8) },
  )
  const onEditing = inPlace?.onEditing
  useEffect(() => {
    onEditing?.(editing)
    return () => onEditing?.(false)
  }, [editing, onEditing])

  const name = sent.name || s.current?.name || '(unknown listing)'
  const before = (s.current?.details ?? {}) as Record<string, unknown>
  // A shul's times by the box they changed in, as the listing has them
  // (board 20): the weekday times, Shabbos's.
  const boxesFor = (key: string | null) => {
    const f = key ? fields.find((x) => x.key === key) : undefined
    if (f?.type !== 'minyanim') return null
    const was = isMinyanim(before[f.key]) ? (before[f.key] as Minyan[]) : []
    const now = isMinyanim(sent.details[f.key]) ? (sent.details[f.key] as Minyan[]) : []
    const boxes = MINYAN_BOXES.map((b) => ({ ...b, was: minyanimForBox(was, b.box), now: minyanimForBox(now, b.box) })).filter((b) => boxChangeCount(b.was, b.now) > 0)
    return boxes.length > 0 ? boxes : null
  }
  // A shul's dated schedule, by the days it changes.
  const daysFor = (key: string) => (key.endsWith('_schedules') ? scheduleChange(readSchedules(before[key]), readSchedules(sent.details[key])) : [])
  const what = changed
    .flatMap((r) => {
      const boxes = boxesFor(fieldKeyFor(r.key, fields) === r.key ? r.key : null)
      if (boxes) return boxes.map((b) => (onlyExtras(usualBoxChange(b.was, b.now, b.box)) ? `notes in the ${b.title.toLowerCase()}` : b.title))
      const days = daysFor(r.key)
      return [days.length === 0 ? r.label : onlyExtras(days) ? 'notes in the schedule' : 'the schedule']
    })
    .join(', ')
  const who = source.readBy === 'person' && (s.submitted_by?.name || s.submitted_by?.email) ? s.submitted_by.name || s.submitted_by.email : source.from
  const marked = source.readBy === 'ai' && source.original ? markTimes(source.original, sent.details) : null

  if (editing && s.current) {
    const title = step?.title ?? (onlyRows?.length === 1 ? onlyRows[0].title : name)
    return (
      <div className="flex flex-col gap-4">
        <AdminBack back={{ label: step ? 'Back' : 'The change', onClick: step ? step.back : () => setEditing(false) }} title={title} />
        {/* The edit is kept while another thing at the place is open. */}
        {!step && inPlace?.switches}
        <ListingEditor
          item={normalizeRow(s.current)}
          category={category}
          onClose={() => setEditing(false)}
          onStep={onStep}
          reopen={reopen}
          onlyRows={onlyRows?.map((r) => r.id)}
          preset={preset}
          adminSave={{
            label: 'Update the listing',
            via: async ({ payload }) => {
              const res = await fetch(withCommunity(`/api/admin/submissions/${s.id}`, community), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: 'approved', payload, ...(part ? { part: part.id } : {}) }),
              })
              savedPart.current = res.ok && !!((await res.clone().json().catch(() => null)) as { partial?: boolean } | null)?.partial
              return res
            },
            onSaved: () => {
              const partial = savedPart.current
              if (partial && part) {
                decided(part.id)
                setEditing(false)
              }
              onUpdated(s.id, partial)
            },
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="change-review">
      <AdminBack
        back={{ label: position.from ?? 'To do', onClick: position.back }}
        title={name}
        right={
          <span className="flex items-center gap-3 md:-mt-3">
            {!position.from && (
              <span className="text-[13.5px] text-slate-600 whitespace-nowrap">
                {position.at + 1} of {position.total}
              </span>
            )}
            {position.next && (
              <button type="button" onClick={position.next} className="max-md:hidden min-h-11 text-sm font-semibold text-primary cursor-pointer">
                Next ›
              </button>
            )}
          </span>
        }
      />
      <p className="m-0 -mt-2 text-[14px] text-slate-600 md:-mt-4">
        {[s.categoryLabel, what && `a change to ${what}`].filter(Boolean).join(' · ')}
      </p>
      {inPlace ? inPlace.switches : part && <ThingSwitches things={things} on={part.id} onPick={setOn} />}

      {changed.map((row) => {
        // Its own key, not the field it's edited with: a schedule isn't the usual times.
        const boxes = boxesFor(fieldKeyFor(row.key, fields) === row.key ? row.key : null)
        if (boxes) {
          return boxes.map((b) => (
            <section key={`${row.key}:${b.box}`} aria-label={b.title} className="flex flex-col gap-3">
              {(changed.length > 1 || boxes.length > 1) && <h2 className="m-0 text-[15px] font-bold text-slate-900">{b.title}</h2>}
              <ChangeGroups groups={usualBoxChange(b.was, b.now, b.box)} />
            </section>
          ))
        }
        const days = daysFor(row.key)
        if (days.length > 0) {
          return (
            <section key={row.key} aria-label="The schedule" className="flex flex-col gap-3">
              {changed.length > 1 && <h2 className="m-0 text-[15px] font-bold text-slate-900">The schedule</h2>}
              <ChangeGroups groups={days} />
            </section>
          )
        }
        return (
          <section key={row.key} aria-label={row.label} className="flex flex-col gap-2">
            {changed.length > 1 && <h2 className="m-0 text-[15px] font-bold text-slate-900">{row.label}</h2>}
            <div className="bg-white border border-slate-200 rounded-[10px] px-4 py-3">
              <Lines lines={fieldLines(row.before, row.after)} />
            </div>
          </section>
        )
      })}
      {changed.length === 0 && <p className="m-0 text-[15px] text-slate-600">Nothing differs from the listing as it is now.</p>}

      <section aria-label="Where it came from" className="bg-white border border-slate-200 rounded-[10px] p-4 flex flex-col gap-2">
        <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600">
          From {who}, {dateFormatter.format(new Date(s.created_at))}
          {source.readBy === 'ai' && <span className="text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5">Read by AI</span>}
        </p>
        {(source.original || source.photoUrl) && <TheOriginal source={source} marked={marked} />}
        {source.note && <p className={`m-0 whitespace-pre-wrap break-words ${source.original ? 'text-xs text-slate-500' : 'text-[14.5px] text-slate-800'}`}>{source.note}</p>}
      </section>

      {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}

      <div
        role="group"
        aria-label="Decide"
        className="max-md:sticky max-md:bottom-[var(--admin-tabs,0px)] max-md:z-20 max-md:-mx-4 max-md:bg-white max-md:border-t max-md:border-slate-200 max-md:px-4 max-md:py-3 flex flex-col gap-2 md:flex-row md:flex-wrap"
      >
        {leaving ? (
          <>
            <label htmlFor="leave-reason" className="text-[13px] font-semibold text-slate-700 md:basis-full">
              Why, for whoever sent it (optional)
            </label>
            <textarea id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full md:basis-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] resize-none" />
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void decide('rejected', reason.trim() || undefined)} className={`${BUTTON} flex-1 md:flex-none border-red-600 bg-red-600 text-white`}>
                {busy ? 'Leaving it…' : 'Leave it'}
              </button>
              <button type="button" disabled={busy} onClick={() => setLeaving(false)} className={`${BUTTON} flex-1 md:flex-none border-slate-300 bg-white text-slate-900`}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || changed.length === 0} onClick={() => void decide('approved')} className={`${BUTTON} border-primary bg-primary text-white`}>
              {busy ? 'Updating…' : 'Update the listing'}
            </button>
            <div className="flex gap-2">
              {s.current && (
                <button type="button" disabled={busy} onClick={() => setEditing(true)} className={`${BUTTON} flex-1 md:flex-none border-slate-300 bg-white text-slate-900`}>
                  Edit, then update
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => (part ? void decide('rejected') : setLeaving(true))} className={`${BUTTON} flex-1 md:flex-none border-slate-300 bg-white text-slate-900`}>
                Leave it
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const MINYAN_BOXES: { box: MinyanBox; title: string }[] = [
  { box: 'weekday', title: 'Usual weekday times' },
  { box: 'shabbos', title: 'Usual Shabbos times' },
]

const BUTTON = 'min-h-11 px-5 rounded-lg border text-[15px] font-semibold disabled:opacity-60 cursor-pointer'

/** A field's change as lines: a multi-line value (hours, say) a line each,
 *  only the ones that differ marked. Nothing on a side ("—") isn't a line. */
function fieldLines(before: string, after: string): ChangeLine[] {
  return diffLines(before, after)
    .filter((l) => l.text !== '—')
    .map((l, i) => ({ key: String(i), text: l.text, kind: l.kind === 'added' ? 'new' : l.kind === 'removed' ? 'gone' : 'same' }))
}

function ChangeGroups({ groups }: { groups: ChangeGroup[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-[10px] px-4 py-3 flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="m-0 mb-1 text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-slate-600">{g.label}</p>
          <Lines lines={g.lines} />
        </div>
      ))}
    </div>
  )
}

function Lines({ lines }: { lines: ChangeLine[] }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
      {lines.map((l) => {
        // Only its note changes: the time plain, the note's old words
        // crossed out above its new ones, and what changes said.
        if (l.extras) {
          return (
            <li key={l.key} className="text-[15.5px] py-1 text-slate-900">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="break-words">{l.text}</span>
                <span className="text-xs font-semibold text-amber-900 bg-amber-100 rounded-full px-2 py-0.5">{l.extras.says}</span>
              </span>
              {l.extras.was && <del className="block text-[13.5px] text-slate-500">{l.extras.was}</del>}
              {l.extras.now && <ins className="block -mx-2 px-2 rounded bg-green-100 text-[13.5px] font-semibold text-green-950 no-underline">{l.extras.now}</ins>}
            </li>
          )
        }
        const body = (
          <>
            <span className="block break-words whitespace-pre-wrap">{l.text}</span>
            {l.sub && <span className="block text-[13.5px] font-normal">{l.sub}</span>}
          </>
        )
        return (
          <li key={l.key} className="text-[15.5px]">
            {l.kind === 'new' ? (
              <ins className="block -mx-2 px-2 py-1 rounded bg-green-100 font-semibold text-green-950 no-underline">{body}</ins>
            ) : l.kind === 'gone' ? (
              <del className="block py-1 text-slate-500">{body}</del>
            ) : (
              <span className="block py-1 text-slate-900">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
