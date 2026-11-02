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
import type { QueuePosition } from './ChangeReview'
import { SubmissionCard } from './SubmissionCard'
import { SubmissionReview } from './SubmissionReview'
import ThingSwitches from './ThingSwitches'
import TodoBroken from './TodoBroken'
import TodoChange from './TodoChange'
import TodoNewPlace from './TodoNewPlace'
import TodoReading from './TodoReading'
import PlaceFrame, { PlaceButtons, PlaceCard, type PlaceButton } from './PlaceFrame'
import type { Jobs } from './useWatchJobs'

// A place opened from To do (the "one tap per place" boards, approved
// Nov 2): everything waiting there behind switches at the top, opened on
// the first of the kind the filter picked, changes before broken checks.
// Answering one ticks it and opens the next; once none is left the place
// is done and To do moves on (ModerationQueue). A change opens as itself
// in the listing's own editor (TodoChange); a job's reading or a broken check opens the place's own
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
  jobs,
  reload,
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
  /** The jobs' readings, for a broken check's source and answers; null
   *  until they've answered. */
  jobs: Jobs | null
  /** To do and the jobs read again, after a broken check's answer. */
  reload: () => Promise<void>
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
          <TodoChange
            key={`${t.id}-${t.part ?? ''}`}
            submission={s}
            category={category}
            part={t.part}
            name={place.name}
            position={position}
            switches={switches}
            busy={busyId === s.id}
            error={error}
            token={token}
            onModerate={(id, status, part) => void moderate(id, status, undefined, undefined, part)}
            onUpdated={onUpdated}
            onEditing={editingChanged(t.id)}
          />
        )
      }
      if (reviewable && s.operation === 'create' && category) {
        return (
          <TodoNewPlace
            key={t.id}
            submission={s}
            category={category}
            name={place.name}
            position={position}
            switches={switches}
            busy={busyId === s.id}
            error={error}
            token={token}
            onModerate={(id, status) => void moderate(id, status)}
            onUpdated={onUpdated}
            onEditing={editingChanged(t.id)}
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
    if (t.kind === 'feedback') return <Feedback key={t.id} thing={t} name={place.name} position={position} switches={switches} token={token} community={community} />
    // A broken check, fixed right here (R3Site, R2Menu, R2Google).
    if (t.kind === 'broken' && jobs && place.placeId) {
      return <TodoBroken key={t.id} placeId={place.placeId} name={place.name} label={t.label} jobs={jobs} token={token} community={community} position={position} switches={switches} reload={reload} />
    }
    // A job's reading, decided right here too.
    if (t.kind === 'waiting' && jobs && place.placeId) {
      return <TodoReading key={t.id} placeId={place.placeId} name={place.name} jobs={jobs} token={token} community={community} position={position} switches={switches} reload={reload} />
    }
    // Until the jobs have answered: the place's own screen.
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

const sentAt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Feedback, all it says, and who and when under it (L5Feedback). Done
 *  whether it was fixed or was only kind words; Reply first when they
 *  left an email. */
function Feedback({
  thing,
  name,
  position,
  switches,
  token,
  community,
}: {
  thing: Extract<TodoThing, { kind: 'feedback' }>
  name: string
  position: QueuePosition
  switches: ReactNode
  token: string
  community: string
}) {
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
  const [first, ...more] = r.text?.length ? r.text : [r.line]
  const buttons: PlaceButton[] = [
    { label: 'Done', busy: busy && 'Marking it done…', onClick: () => void done() },
    ...(r.email ? [{ label: 'Reply', href: `mailto:${r.email}?subject=${encodeURIComponent(`Re: your ${r.title.toLowerCase()}`)}` }] : []),
  ]
  return (
    <PlaceFrame name={name} subline={shortDay(r.createdAt)} position={position} switches={switches} error={error} foot={<PlaceButtons buttons={buttons} />}>
      <PlaceCard>
        <p className="m-0 whitespace-pre-wrap break-words text-[17px] font-bold text-slate-900">“{first}”</p>
        {more.map((p, i) => (
          <p key={i} className="m-0 whitespace-pre-wrap break-words text-[15px] text-slate-900">
            {p}
          </p>
        ))}
        <p className="m-0 text-[13.5px] text-slate-500">{[r.name ?? 'No name given', r.email, sentAt.format(new Date(r.createdAt))].filter(Boolean).join(' · ')}</p>
      </PlaceCard>
    </PlaceFrame>
  )
}
