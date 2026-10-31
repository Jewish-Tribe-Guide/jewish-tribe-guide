'use client'

import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { isMinyanim, type Minyan } from '@/lib/davening'
import { listingChanges } from '@/lib/listingDiff'
import { boxChangeCount, mergeMinyanimBox, minyanimForBox, type MinyanBox } from '@/lib/minyanimBox'
import { readSchedules, schedulesKey, weekPostDays, weekPostRows, withWeekRows } from '@/lib/schedules'
import type { MinyanWriting } from '@/lib/minyanText'
import { rangeText } from '@/lib/timesProposal'
import { useIsMobile } from '@/lib/useIsMobile'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget from '@/components/TurnstileWidget'
import { CheckIcon } from '@/components/icons'
import ActionDialog from './ActionDialog'
import MobileSheet from './MobileSheet'
import { DetailFieldInput } from './DetailFieldInput'
import { useListingDraft } from './useListingDraft'
import { useListingSubmit, useTurnstileActive } from './useListingSubmit'
import { SUBMIT_PILL } from './submitPill'
import MinyanBoxEditor from './MinyanBoxEditor'
import ListingEditor, { type EditorStep } from './ListingEditor'

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
  /** With minyanimBox 'this_week': the ids of the weeks the shul sent out
   *  (schedules.ts). Their times are edited, not the usual ones; more than
   *  one (a website's this week and next), each under its dates. */
  weeks?: readonly string[]
  /** Values already answered in the box ("Is it Shabbat friendly?" Yes). */
  preset?: Record<string, unknown>
  /** The whole-listing editor's rows for this box (editorRows ids), when
   *  the box is one of those rather than a few fields: the contact box's
   *  address and phone, the dishes, About (Oct 15). Then `fields` is
   *  unused, and the sheet holds that editor, narrowed to these rows. */
  rows?: readonly string[]
  /** With `rows`: an admin's save straight to the listing, in place of
   *  sending an edit (ListingEditor's adminSave). */
  save?: ComponentProps<typeof ListingEditor>['adminSave']
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
  // The editor's own steps (a person in the contacts, a dish list's
  // screen) for the same title and Back; one with no title is the box.
  const onEditorStep = useCallback((step: EditorStep | null) => onStep(step?.title ? { title: step.title, back: step.back } : null), [onStep])
  const title = stepTitle ?? edit?.title ?? ''
  const onBack = stepTitle ? () => stepBack.current() : undefined
  const body =
    edit &&
    (edit.rows ? (
      <ListingEditor key={edit.title} item={item} category={category} onlyRows={edit.rows} onClose={onClose} onStep={onEditorStep} preset={edit.preset} adminSave={edit.save} />
    ) : (
      <BoxEditor key={edit.title} item={item} category={category} edit={edit} onClose={onClose} onEditElse={onEditElse} onStep={onStep} />
    ))
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
  // An admin's own save (Shul times' Edit) goes their way, unchallenged.
  const save = edit.save
  const { ownTurnstileRef, setOwnTurnstileToken, ...sender } = useListingSubmit({ mode: 'edit', existing: item, via: save?.via, onSent: save ? () => save.onSaved() : undefined })
  const verifying = !save && sender.verifying
  // None in the admin console's preview, where nothing is sent.
  const turnstileActive = useTurnstileActive() && !save
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
  // Opened from a preset (Shul times' Edit: the website's times), the box
  // starts from it.
  const base = (k: string): unknown => (edit.preset && k in edit.preset ? edit.preset[k] : item[k])
  const allRows: Minyan[] = minyanimField && isMinyanim(base(minyanimField.key)) ? (base(minyanimField.key) as Minyan[]) : []
  // A row stored without an id gets one here, as the old editor gave it
  // (MinyanimInput's initMinyanim): the list opens a minyan by its id.
  // The weeks the shul sent out: each its own rows, sent back into its
  // schedule. With two (Oct 22: a website's this week and next had no
  // Edit), a list each, one opened at a time, one Save for both.
  const sk = minyanimField ? schedulesKey(minyanimField.key) : ''
  const [weekPosts] = useState(() => (edit.weeks?.length && minyanimField ? readSchedules(base(sk)).filter((s) => edit.weeks!.includes(s.id)) : []))
  const [weekOriginals] = useState(() => weekPosts.map((w) => weekPostRows(w)))
  const [boxRows] = useState(() => (edit.minyanimBox ? minyanimForBox(allRows, edit.minyanimBox).map((m) => (m.id ? m : { ...m, id: crypto.randomUUID() })) : []))
  // The schedules as edited so far, every week's changes in them.
  const schedulesNow = () => readSchedules(sk in details ? details[sk] : base(sk))
  const setWeek = (id: string, rows: Minyan[]) => setDetail(sk, withWeekRows(schedulesNow(), id, rows))
  // The week with a minyan open, the others hidden (kept, with their changes).
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const weekIds = weekPosts.map((w) => w.id).join(' ')
  const weekSteps = useMemo(
    () =>
      new Map(
        weekIds.split(' ').map((id) => [
          id,
          (step: { title: string; back: () => void } | null) => {
            setOpenWeek((was) => (step ? id : was === id ? null : was))
            onStep(step)
          },
        ]),
      ),
    [weekIds, onStep],
  )
  const weekChanges = weekPosts.reduce((n, w, i) => n + boxChangeCount(weekOriginals[i], weekPostRows(schedulesNow().find((s) => s.id === w.id) ?? w)), 0)

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
    if (nothing || sender.submitting || verifying) return
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
    <button type="button" onClick={send} disabled={nothing || sender.submitting || verifying} className={SUBMIT_PILL}>
      {sender.submitting ? (save ? 'Saving…' : 'Sending…') : nothing ? 'No changes yet' : verifying ? 'Verifying…' : (save?.label ?? label)}
    </button>
  )

  return (
    <div className="space-y-4" data-testid="box-edit">
      <Honeypot value={sender.honeypot} onChange={sender.setHoneypot} />
      {/* The shul's list says it itself, with the box's name once a minyan is open. */}
      {!minyanimField && <p className="-mt-1 text-[14px] text-muted">{item.name}</p>}
      {edit.fields.map((f) =>
        f === minyanimField && weekPosts.length > 1 ? (
          <div key={f.key} className="space-y-6">
            {openWeek === null && <p className="-mt-1 text-[14px] text-muted">{item.name}</p>}
            {weekPosts.map((w, i) => (
              <div key={w.id} hidden={openWeek !== null && openWeek !== w.id}>
                <MinyanBoxEditor
                  original={weekOriginals[i]}
                  box={edit.minyanimBox!}
                  boxTitle={rangeText(w.from, w.to)}
                  heading={rangeText(w.from, w.to)}
                  place={item.name}
                  writing={edit.writing!}
                  dayChoices={weekPostDays(w)}
                  onStep={weekSteps.get(w.id)!}
                  onChange={(rows) => setWeek(w.id, rows)}
                  send={() => null}
                />
              </div>
            ))}
            {openWeek === null && (
              <>
                {errors}
                {sendButton(`Send ${weekChanges} change${weekChanges === 1 ? '' : 's'}`)}
              </>
            )}
          </div>
        ) : f === minyanimField ? (
          // A shul's box: its minyanim as a list, then one at a time, with
          // its own Send ("Send 2 changes") under the list.
          <MinyanBoxEditor
            key={f.key}
            original={weekPosts.length ? weekOriginals[0] : boxRows}
            box={edit.minyanimBox!}
            boxTitle={edit.title}
            place={item.name}
            writing={edit.writing!}
            dayChoices={weekPosts.length ? weekPostDays(weekPosts[0]) : undefined}
            onStep={onStep}
            onChange={(rows) => (weekPosts.length ? setWeek(weekPosts[0].id, rows) : setDetail(f.key, mergeMinyanimBox(allRows, edit.minyanimBox!, rows)))}
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
      {turnstileActive && <TurnstileWidget ref={ownTurnstileRef} onVerify={setOwnTurnstileToken} />}
    </div>
  )
}
