'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { EnrichedSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { listingSlug } from '@/lib/listingSlug'
import { normalizeRow } from '@/lib/resourceShape'
import { reviewParts } from '@/lib/reviewParts'
import { routes } from '@/lib/routes'
import { markTimes, submissionSource } from '@/lib/submissionSource'
import { useCommunitySlug } from '@/lib/communityContext'
import { useEditWeek } from '@/lib/useEditWeek'
import { withCommunity } from '@/lib/useCommunityData'
import ListingEditor, { type EditorControl } from '@/components/resources/ListingEditor'
import { itemLists } from '@/components/resources/ItemsEditor'
import PlaceFrame, { PlaceButtons, SourceCard, placeSubline, type PlaceButton, type PlacePosition } from './PlaceFrame'
import { TheOriginal, fieldKeyFor } from './SubmissionReview'
import { changeEdit } from './changeEdit'
import { changeAnswers, oneMinyanTime } from './changeView'
import { useEditorSteps, useStepsInAddress } from './useStepsInAddress'

// A change on To do, in the listing's own editor (boards E1Times, R5Link,
// R1Women, R6After): the rows it changes, filled in as it would leave them,
// each changed thing marked yellow with what it was; where it came from,
// folded under; and two answers that name the change. The first takes the
// card as it is then, an edit in it included; the second leaves the
// listing as it was. A change in parts is answered a part at a time.

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export default function TodoChange({
  submission: s,
  category,
  part: partId,
  name,
  position,
  switches,
  busy,
  error,
  token,
  onModerate,
  onUpdated,
  onEditing,
}: {
  submission: EnrichedSubmission
  category: CategoryConfig
  /** The part open, when it's answered a part at a time. */
  part?: string
  name: string
  position: PlacePosition
  switches: ReactNode
  busy?: boolean
  error?: string | null
  token: string
  /** "Don't update": `part`, that part of it only. */
  onModerate: (id: string, status: 'rejected', part?: string) => void
  /** Taken, as the card had it; `partial`, the rest of it still waits. */
  onUpdated: (id: string, partial?: boolean) => void
  /** Something typed in the card, so leaving can ask first. */
  onEditing: (editing: boolean) => void
}) {
  const community = useCommunitySlug()
  const fields = category.detailFields
  const current = s.current!
  const parts = reviewParts(current, s.payload as never, category)
  const part = parts.length > 1 ? parts.find((p) => p.id === partId) : undefined
  const weeks = useEditWeek(fields.some((f) => f.type === 'minyanim'))
  const { sent, changed, rows, preset, keys: changedKeys } = changeEdit(s, category, part, weeks)

  const control = useRef<EditorControl | null>(null)
  const [edit, setEdit] = useState({ changed: false, edited: false, sending: false })
  const onControl = useCallback((c: EditorControl) => {
    control.current = c
    setEdit((e) => (e.changed === c.changed && e.edited === c.edited && e.sending === c.sending ? e : { changed: c.changed, edited: c.edited, sending: c.sending }))
  }, [])
  useEffect(() => {
    onEditing(edit.edited)
    return () => onEditing(false)
  }, [edit.edited, onEditing])
  const { step, path, onStep, reopen, ask } = useEditorSteps()
  // An open row or a minyan in it has an address and an entry, as in
  // Places' editor: Back closes it rather than leaving the place, Forward
  // and a reload open it again. Its own, among the other things here.
  useStepsInAddress('step', path, ask, { owner: `${s.id.slice(0, 8)}${partId ? `.${partId}` : ''}` })
  const savedPart = useRef(false)

  // The answers, named by what it changes.
  const before = current.details as Record<string, unknown>
  const keys = new Set(changed.map((d) => fieldKeyFor(d.key, fields)))
  const only = keys.size === 1 ? fields.find((f) => keys.has(f.key)) : undefined
  const minyans = (d: Record<string, unknown>, key: string) => (isMinyanim(d[key]) ? (d[key] as Minyan[]) : [])
  const minyan = only?.type === 'minyanim' && changed.every((d) => d.key === only.key) ? oneMinyanTime(minyans(before, only.key), minyans(sent.details, only.key)) : null
  const itemRow = rows?.length === 1 && rows[0].kind === 'items' ? rows[0].fields[0] : undefined
  const items = (() => {
    if (!itemRow || only?.key !== itemRow.key) return null
    const all = (d: Record<string, unknown>) => {
      const l = itemLists(d, itemRow.key)
      return [...l.always, ...l.sometimes]
    }
    const was = all(before).map((x) => x.toLowerCase())
    const now = all(sent.details)
    const lower = now.map((x) => x.toLowerCase())
    return { added: now.filter((x) => !was.includes(x.toLowerCase())), removed: was.filter((x) => !lower.includes(x)), noun: /dish/i.test(itemRow.label) ? ('dish' as const) : ('item' as const) }
  })()
  const answers = changeAnswers({ changed, fields, rows: (rows ?? []).map((r) => r.title), minyan, items })

  const sending = busy || edit.sending
  const buttons: PlaceButton[] = [
    {
      // Edited, it's no longer the change as it came.
      label: edit.edited ? 'Update the listing' : answers.yes,
      busy: edit.sending && 'Updating…',
      disabled: sending || !edit.changed,
      onClick: () => void control.current?.send(),
    },
    { label: answers.no, busy: busy && !edit.sending && 'Saving…', disabled: sending, onClick: () => onModerate(s.id, 'rejected', part?.id) },
  ]
  const inStep = !!step?.title

  return (
    <PlaceFrame
      name={name}
      subline={placeSubline(s.categoryLabel ?? category.label, routes.listing(community, category.id, listingSlug(normalizeRow(current))))}
      position={position}
      onBack={inStep ? step!.back : undefined}
      switches={inStep ? null : switches}
      source={!inStep && <SubmissionSourceCard submission={s} details={sent.details} />}
      error={error}
      foot={!inStep && <PlaceButtons buttons={buttons} />}
    >
      {changed.length === 0 ? (
        <p className="m-0 text-[15px] text-slate-600">Nothing differs from the listing as it is now.</p>
      ) : (
        <ListingEditor
          key={`${s.id}-${part?.id ?? ''}`}
          item={normalizeRow(current)}
          category={category}
          onClose={() => {}}
          onStep={onStep}
          reopen={reopen}
          onlyRows={rows?.map((r) => r.id)}
          preset={preset}
          hosted={{ onControl, marks: true, onlyFields: changedKeys }}
          adminSave={{
            label: answers.yes,
            via: async ({ payload }) => {
              const res = await fetch(withCommunity(`/api/admin/submissions/${s.id}`, community), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: 'approved', payload, ...(part ? { part: part.id } : {}) }),
              })
              savedPart.current = res.ok && !!((await res.clone().json().catch(() => null)) as { partial?: boolean } | null)?.partial
              return res
            },
            onSaved: () => onUpdated(s.id, savedPart.current),
          }}
        />
      )}
    </PlaceFrame>
  )
}

/** Where it came from, folded: who sent it and when; opened, what they
 *  sent, an AI's reading of it marked against `details`. */
export function SubmissionSourceCard({ submission: s, details }: { submission: EnrichedSubmission; details: Record<string, unknown> }) {
  const source = submissionSource(s)
  const who = source.readBy === 'person' && (s.submitted_by?.name || s.submitted_by?.email) ? (s.submitted_by.name || s.submitted_by.email)! : source.from
  const marked = source.readBy === 'ai' && source.original ? markTimes(source.original, details) : null
  const opened = (source.original || source.photoUrl || source.note) && (
    <>
      {source.readBy === 'ai' && <span className="self-start text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5">Read by AI</span>}
      {(source.original || source.photoUrl) && <TheOriginal source={source} marked={marked} />}
      {source.note && <p className={`m-0 whitespace-pre-wrap break-words ${source.original ? 'text-xs text-slate-500' : 'text-slate-800'}`}>{source.note}</p>}
    </>
  )
  return (
    <SourceCard name={who[0].toUpperCase() + who.slice(1)} rest={` · ${dateFormatter.format(new Date(s.created_at))}`}>
      {opened || undefined}
    </SourceCard>
  )
}
