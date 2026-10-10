'use client'

import { useCallback, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { listingChanges } from '@/lib/listingDiff'
import { mergeMinyanimBox, minyanimForBox, type MinyanBox } from '@/lib/minyanimBox'
import type { MinyanWriting } from '@/lib/minyanText'
import { useIsMobile } from '@/lib/useIsMobile'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget from '@/components/TurnstileWidget'
import { CheckIcon } from '@/components/icons'
import ActionDialog from './ActionDialog'
import MobileSheet from './MobileSheet'
import { DetailFieldInput } from './ListingForm'
import { useListingDraft } from './useListingDraft'
import { useListingSubmit } from './useListingSubmit'
import { SUBMIT_PILL } from './submitPill'
import MinyanBoxEditor from './MinyanBoxEditor'

// ── Edit, under one box of a listing (agreed Oct 10, canvas page "edits") ───
// The box's own fields and nothing else: a mikvah section's hours and note,
// a shul's usual Shabbos times, a hotel's Shabbos answer. No AI: whoever
// taps Edit under a box knows what they want to change. It sends the same
// edit the listing's whole editor does (useListingDraft, useListingSubmit),
// for an admin to check.
//
// One task on the screen. "Edit something else here" only comes after Send,
// on the screen that says it's sent: offered while editing, it was one more
// thing to think about (the user, Oct 10).

export type BoxEdit = {
  /** The sheet's title: the box's own ("Women’s hours"). */
  title: string
  fields: CategoryField[]
  /** For a shul's minyanim field: which usual box's times (minyanimBox.ts),
   *  and how the listing writes them. */
  minyanimBox?: MinyanBox
  writing?: MinyanWriting
  /** Values already answered in the box ("Is it Shabbat friendly?" Yes). */
  preset?: Record<string, unknown>
}

export default function BoxEditSheet({
  item,
  category,
  edit,
  onClose,
  onEditElse,
}: {
  item: DirectoryResource
  category: CategoryConfig
  edit: BoxEdit | null
  onClose: () => void
  /** "Edit something else here", once it's sent: the listing's whole edit. */
  onEditElse?: () => void
}) {
  const isMobile = useIsMobile()
  // A step inside the box (a shul's one minyan): its title, and Back to
  // the box's list. The Back in a ref, as AddMinyanSheet keeps its own.
  const [stepTitle, setStepTitle] = useState<string | null>(null)
  const stepBack = useRef<() => void>(() => {})
  const onStep = useCallback((step: { title: string; back: () => void } | null) => {
    stepBack.current = step?.back ?? (() => {})
    setStepTitle(step?.title ?? null)
  }, [])
  const title = stepTitle ?? edit?.title ?? ''
  const onBack = stepTitle ? () => stepBack.current() : undefined
  const body = edit && <BoxEditor key={edit.title} item={item} category={category} edit={edit} onClose={onClose} onEditElse={onEditElse} onStep={onStep} />
  return isMobile ? (
    <MobileSheet isOpen={!!edit} onClose={onClose} title={title} onBack={onBack}>
      {body}
    </MobileSheet>
  ) : (
    <ActionDialog isOpen={!!edit} onClose={onClose} title={title} onBack={onBack}>
      {body}
    </ActionDialog>
  )
}

export function BoxEditor({
  item,
  category,
  edit,
  onClose,
  onEditElse,
  onStep = () => {},
}: {
  item: DirectoryResource
  category: CategoryConfig
  edit: BoxEdit
  onClose: () => void
  onEditElse?: () => void
  /** A shul's one minyan opened, for the sheet's title and Back. */
  onStep?: (step: { title: string; back: () => void } | null) => void
}) {
  const draft = useListingDraft(category, item)
  const { ownTurnstileRef, setOwnTurnstileToken, ...sender } = useListingSubmit({ mode: 'edit', existing: item })
  const { details, setDetail } = draft
  // A preset answer goes in once, as if typed.
  const [presetDone, setPresetDone] = useState(false)
  if (!presetDone && edit.preset) {
    setPresetDone(true)
    for (const [k, v] of Object.entries(edit.preset)) setDetail(k, v)
  }
  // A shul's box: its rows, cut to its days, edited on their own and
  // merged back into the whole list as they change.
  const minyanimField = edit.minyanimBox && edit.writing ? edit.fields.find((f) => f.type === 'minyanim') : undefined
  const allRows: Minyan[] = minyanimField && isMinyanim(item[minyanimField.key]) ? (item[minyanimField.key] as Minyan[]) : []
  // A row stored without an id gets one here, as the old editor gave it
  // (MinyanimInput's initMinyanim): the list opens a minyan by its id.
  const [boxRows] = useState(() => (edit.minyanimBox ? minyanimForBox(allRows, edit.minyanimBox).map((m) => (m.id ? m : { ...m, id: crypto.randomUUID() })) : []))

  const changes = listingChanges(
    item,
    { name: item.name, address: item.address ?? '', phone: item.phone ?? '', details: draft.visibleDetails() },
    edit.fields,
  )
  const nothing = changes.length === 0

  if (sender.done) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-8 text-center" role="status" data-testid="box-edit-sent">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckIcon className="h-8 w-8 text-emerald-700" />
        </span>
        <p className="text-[22px] font-extrabold text-ink">Sent</p>
        <p className="text-[15.5px] text-slate-700">An admin checks it, usually within a day.</p>
        <button type="button" onClick={onClose} className={`${SUBMIT_PILL} mt-6`}>
          Done
        </button>
        {onEditElse && (
          <button type="button" onClick={onEditElse} className="min-h-11 cursor-pointer text-[15px] font-bold text-primary hover:underline">
            Edit something else here
          </button>
        )}
      </div>
    )
  }

  async function send() {
    if (nothing || sender.submitting || sender.verifying) return
    sender.setErrors([])
    await sender.submit(draft.buildSubmission())
  }

  const errors = sender.errors.length > 0 && (
    <ul className="list-inside list-disc space-y-0.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {sender.errors.map((err, i) => (
        <li key={i}>{err}</li>
      ))}
    </ul>
  )
  const sendButton = (label: string) => (
    <button type="button" onClick={send} disabled={nothing || sender.submitting || sender.verifying} className={SUBMIT_PILL}>
      {sender.submitting ? 'Sending…' : nothing ? 'No changes yet' : sender.verifying ? 'Verifying…' : label}
    </button>
  )

  return (
    <div className="space-y-4" data-testid="box-edit">
      <Honeypot value={sender.honeypot} onChange={sender.setHoneypot} />
      {/* The shul's list says it itself, with the box's name once a minyan is open. */}
      {!minyanimField && <p className="-mt-1 text-[14px] text-muted">{item.name}</p>}
      {edit.fields.map((f) =>
        f === minyanimField ? (
          // A shul's box: its minyanim as a list, then one at a time, with
          // its own Send ("Send 2 changes") under the list.
          <MinyanBoxEditor
            key={f.key}
            original={boxRows}
            box={edit.minyanimBox!}
            boxTitle={edit.title}
            place={item.name}
            writing={edit.writing!}
            onStep={onStep}
            onChange={(rows) => setDetail(f.key, mergeMinyanimBox(allRows, edit.minyanimBox!, rows))}
            send={(n) => (
              <>
                {errors}
                {sendButton(`Send ${n} change${n === 1 ? '' : 's'}`)}
              </>
            )}
          />
        ) : (
          // A section's own short name ("Hours", not "Women’s Hours"): the
          // title says whose.
          <DetailFieldInput key={f.key} field={f} labelOverride={f.shortLabel} value={details[f.key]} onChange={(v) => setDetail(f.key, v)} />
        ),
      )}
      {!minyanimField && (
        <>
          {errors}
          {sendButton('Send')}
        </>
      )}
      <TurnstileWidget ref={ownTurnstileRef} onVerify={setOwnTurnstileToken} />
    </div>
  )
}
