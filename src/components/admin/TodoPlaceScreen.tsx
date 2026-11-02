'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { ResourceSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { fetchJson } from '@/lib/fetchJson'
import { placePath } from '@/lib/placeLink'
import { shortDay } from '@/lib/todo'
import type { TodoFilter, TodoPlace, TodoThing } from '@/lib/todoPlaces'
import { firstThing } from '@/lib/todoPlaces'
import { withCommunity } from '@/lib/useCommunityData'
import { updateTodo } from '@/lib/useTodo'
import { AdminBack, AdminBox } from './AdminUI'
import ChangeReview, { type QueuePosition } from './ChangeReview'
import { SubmissionCard } from './SubmissionCard'
import { SubmissionReview } from './SubmissionReview'
import ThingSwitches from './ThingSwitches'

// A place opened from To do (the "one tap per place" boards, approved
// Nov 2): everything waiting there behind switches at the top, opened on
// the first of the kind the filter picked, changes before broken checks.
// Answering one ticks it and opens the next; once none is left the place
// is done and To do moves on (ModerationQueue). A change opens as itself
// (ChangeReview); a job's reading or a broken check opens the place's own
// screen, where it's decided; feedback is Done, or a reply first.

type Moderate = (id: string, status: 'approved' | 'rejected', reason?: string, payload?: ResourceSubmission, part?: string) => Promise<'partial' | 'whole' | 'failed'>

const button = 'inline-flex items-center justify-center min-h-11 px-5 rounded-lg border text-[15px] font-semibold cursor-pointer disabled:opacity-60'

export default function TodoPlaceScreen({
  place,
  filters,
  position,
  categoriesById,
  token,
  busyId,
  error,
  moderate,
  onUpdated,
  onEditing,
}: {
  place: TodoPlace
  /** The list's filter, which picks the thing it opens on. */
  filters: TodoFilter[]
  position: QueuePosition
  categoriesById: Map<string, CategoryConfig>
  token: string
  busyId: string | null
  error: string | null
  moderate: Moderate
  onUpdated: (id: string, partial?: boolean) => void
  /** A change's Edit opened or closed, so leaving can ask first. */
  onEditing: (thingId: string, editing: boolean) => void
}) {
  const community = useCommunitySlug()
  // As first opened: answered ones stay, ticked.
  const [order] = useState(() => place.things.map((t) => ({ id: t.id, label: t.label })))
  const [on, setOn] = useState(() => firstThing(place, filters).id)
  const [editing, setEditing] = useState<string[]>([])
  const present = new Map(place.things.map((t) => [t.id, t]))
  const all = [...order, ...place.things.filter((t) => !order.some((o) => o.id === t.id))]
  // The one picked, or once it's answered, the next one still waiting.
  const at = all.findIndex((t) => t.id === on)
  const current = [...all.slice(at), ...all.slice(0, at)].map((t) => present.get(t.id)).find(Boolean) ?? place.things[0]
  const switches = <ThingSwitches things={all.map((t) => ({ id: t.id, label: t.label, done: !present.has(t.id) }))} on={current.id} onPick={setOn} />

  // One handler per thing, kept, since a change reports through an effect
  // (`onEditing` is the parent's, and keeps too).
  const [handlers] = useState(() => new Map<string, (e: boolean) => void>())
  const editingChanged = (id: string) => {
    let h = handlers.get(id)
    if (!h) {
      h = (e: boolean) => {
        setEditing((list) => (e ? (list.includes(id) ? list : [...list, id]) : list.includes(id) ? list.filter((x) => x !== id) : list))
        onEditing(id, e)
      }
      handlers.set(id, h)
    }
    return h
  }

  const body = (t: TodoThing): ReactNode => {
    const shell = (children: ReactNode) => (
      <div className="flex flex-col gap-4">
        <Header place={place} position={position} />
        {switches}
        {children}
      </div>
    )
    if (t.kind === 'submission') {
      const s = t.submission
      const categoryId = (s.payload as Partial<ResourceSubmission>).category ?? s.current?.category
      const category = categoryId ? categoriesById.get(categoryId) : undefined
      const reviewable = s.target_type === 'listing' && s.operation !== 'delete'
      if (reviewable && s.operation === 'update' && category && s.current) {
        return (
          <ChangeReview
            submission={s}
            category={category}
            position={position}
            busy={busyId === s.id}
            error={error}
            token={token}
            onModerate={(id, status, reason, part) => moderate(id, status, reason, undefined, part)}
            onUpdated={onUpdated}
            inPlace={{ part: t.part, switches, onEditing: editingChanged(t.id) }}
          />
        )
      }
      return shell(
        reviewable ? (
          <SubmissionReview submission={s} category={category} busy={busyId === s.id} error={error} onModerate={moderate} />
        ) : (
          <>
            <SubmissionCard submission={s} busy={busyId === s.id} onModerate={moderate} categoriesById={categoriesById} />
            {error && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}
          </>
        ),
      )
    }
    if (t.kind === 'feedback') return shell(<Feedback key={t.id} thing={t} token={token} community={community} />)
    // Decided on the place's own screen, its rows and where each is read from.
    return shell(
      <AdminBox>
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="m-0 text-[15px] font-semibold text-slate-900">{t.label}</p>
          <Link href={`${adminBase(community)}/watches/${placePath(place.placeId ?? place.key, 'todo')}`} className={`${button} border-primary bg-primary text-white`}>
            Open {place.name}
          </Link>
        </div>
      </AdminBox>,
    )
  }

  // An edit left open on another thing stays as it was, out of sight.
  return (
    <div className="flex flex-col gap-4" data-testid="todo-place">
      {place.things
        .filter((t) => t.id === current.id || editing.includes(t.id))
        .map((t) => (
          <div key={t.id} hidden={t.id !== current.id}>
            {body(t)}
          </div>
        ))}
    </div>
  )
}

function Header({ place, position }: { place: TodoPlace; position: QueuePosition }) {
  return (
    <AdminBack
      back={{ label: 'To do', onClick: position.back }}
      title={place.name}
      right={
        <span className="flex items-center gap-3 md:-mt-3">
          <span className="text-[13.5px] text-slate-600 whitespace-nowrap">
            {position.at + 1} of {position.total}
          </span>
          {position.next && (
            <button type="button" onClick={position.next} className="max-md:hidden min-h-11 text-sm font-semibold text-primary cursor-pointer">
              Next ›
            </button>
          )}
        </span>
      }
    />
  )
}

/** Feedback, all it says. Done whether it was fixed or was only kind
 *  words; Reply first when they left an email. */
function Feedback({ thing, token, community }: { thing: Extract<TodoThing, { kind: 'feedback' }>; token: string; community: string }) {
  const r = thing.response
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function done() {
    setBusy(true)
    setError(null)
    try {
      await fetchJson(
        withCommunity(`/api/admin/responses/${r.id}`, community),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'handled' }) },
        'Could not mark it done.',
      )
      updateTodo((d) => ({ ...d, responses: d.responses.filter((x) => x.id !== r.id) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark it done.')
      setBusy(false)
    }
  }
  return (
    <>
      <AdminBox>
        <div className="flex flex-col gap-2 p-4">
          <span className="text-[13px] font-semibold text-slate-600">{[r.email, shortDay(r.createdAt)].filter(Boolean).join(' · ')}</span>
          {(r.text?.length ? r.text : [r.line]).map((p, i) => (
            <p key={i} className="m-0 whitespace-pre-wrap break-words text-[15px] text-slate-900">
              {p}
            </p>
          ))}
        </div>
      </AdminBox>
      {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void done()} className={`${button} flex-1 md:flex-none border-primary bg-primary text-white`}>
          {busy ? 'Marking it done…' : 'Done'}
        </button>
        {r.email && (
          <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: your ${r.title.toLowerCase()}`)}`} className={`${button} flex-1 md:flex-none border-slate-300 bg-white text-slate-900`}>
            Reply
          </a>
        )}
      </div>
    </>
  )
}
