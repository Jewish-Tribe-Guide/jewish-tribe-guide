'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DEFAULT_CONTACT_STEPS, type FormConfig, type FormContent, type FormStep, type StepCondition } from '@/lib/forms'
import Wizard from '@/components/wizard/Wizard'
import FormStepEditor from './FormStepEditor'
import FormPreview, { resolvePreviewSteps } from './FormPreview'
import { IconField } from './CategoryFormFields'
import { fetchJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { useIsDesktop } from '@/lib/useIsMobile'
import { AdminBox, AdminField, AdminRow, AdminSwitch, MoreToggle, adminInputClass } from './AdminUI'
import { PreviewBeside } from './SitePreview'
import SaveBar, { LEAVE_QUESTION, changesLabel, useLeaveGuard } from './SaveBar'

// One form (the admin redesign's board "Forms"): its questions as rows, each
// opening to its own screen, what it says after sending, and the form itself
// beside them on a phone. Forms keep Draft and Publish, because a half-made
// form shouldn't go live: every edit is kept as a draft by itself (a moment
// after the last one), and nothing reaches a visitor until Publish. "On the
// site" applies at once, draft or not.
//
// `form: null` is a form not made yet: nothing is sent until Publish, which
// makes it, already published (there's no row to keep a draft on before then).

const NEW_FORM_DEFAULTS: FormContent = {
  title: 'New form',
  submitLabel: 'Submit',
  successTitle: 'All set',
  successMessage: 'Thanks — we’ll be in touch.',
  steps: DEFAULT_CONTACT_STEPS,
  icon: '',
}

/** Support and Volunteer are wired into their own screens, so they can be
 *  hidden but never deleted (see formStore's deleteForm). */
const PROTECTED_FORM_IDS = new Set(['support', 'volunteer'])

/** How long after the last edit the draft is kept. */
export const DRAFT_KEEP_DELAY_MS = 1500

function published(f: FormConfig | null): FormContent {
  if (!f) return NEW_FORM_DEFAULTS
  return { title: f.title, submitLabel: f.submitLabel, successTitle: f.successTitle, successMessage: f.successMessage, steps: f.steps, icon: f.icon }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '')

/** How many things the draft changes from what's on the site: each piece of
 *  text, and each question that differs. */
export function countFormChanges(live: FormContent, draft: FormContent): number {
  const text = (['title', 'submitLabel', 'successTitle', 'successMessage', 'icon'] as const).filter((k) => !same(live[k], draft[k])).length
  const n = Math.max(live.steps.length, draft.steps.length)
  let steps = 0
  for (let i = 0; i < n; i++) if (!same(live.steps[i], draft.steps[i])) steps++
  return text + steps
}

const KIND_WORDS: Record<FormStep['kind'], string> = {
  single: 'Pick one',
  multi: 'Pick any',
  text: 'Short answer',
  textarea: 'Long answer',
  tel: 'Phone',
  number: 'Number',
  date: 'Date',
  contact: 'Phone or email',
}

/** A section's name without the emoji it may start with. */
export function sectionName(section: string | undefined): string {
  return (section ?? '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim()
}

function conditionWords(c: StepCondition, steps: FormStep[]): string {
  const asked = steps.find((s) => s.id === c.field)
  if (c.op === 'includes' || c.op === 'notIncludes') {
    const label = asked?.options?.find((o) => o.value === c.value)?.label ?? c.value ?? ''
    return `${c.op === 'includes' ? 'picked' : 'didn’t pick'} ${label}`
  }
  // The contact screen writes `phone` and `email`, which no step is named.
  if (c.field === 'phone' || c.field === 'email') {
    return c.op === 'notEmpty' ? `gave ${c.field === 'email' ? 'an' : 'a'} ${c.field}` : `no ${c.field}`
  }
  const what = asked?.question ?? c.field
  return c.op === 'notEmpty' ? `answered “${what}”` : `skipped “${what}”`
}

/** The line under a question's row: what kind of answer it takes, then
 *  when it's asked, or else its choices. */
export function questionLine(step: FormStep, steps: FormStep[]): string {
  const parts = [KIND_WORDS[step.kind]]
  if (step.when?.length) parts.push(`only if they ${step.when.map((c) => conditionWords(c, steps)).join(' and ')}`)
  else if (step.optionsSource === 'hospitals') parts.push('The hospitals')
  else if (step.options?.length) parts.push(step.options.map((o) => o.label).join(', '))
  return parts.join(' · ')
}

/** The questions shown before "N more". */
const QUESTIONS_SHOWN = 6

export default function FormEditor({
  token,
  form,
  responsesHref,
  onPublished,
  onBack,
  onChanged,
}: {
  token: string
  form: FormConfig | null
  /** Where its responses are read. */
  responsesHref?: string
  onPublished: () => void
  onBack: () => void
  /** Something was saved that the list shows (on the site, deleted). */
  onChanged: () => void
}) {
  const isNew = form === null
  const community = useCommunitySlug()
  const live = published(form)
  const [draft, setDraft] = useState<FormContent>(() => form?.draft ?? live)
  // What the server holds as the draft: kept in step with `draft` below.
  const [kept, setKept] = useState<FormContent | null>(form?.draft ?? null)
  const [active, setActive] = useState(form?.active !== false)
  const [publishing, setPublishing] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [openStep, setOpenStep] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [allQuestions, setAllQuestions] = useState(false)
  const [askingDelete, setAskingDelete] = useState(false)
  const wide = useIsDesktop('(max-width: 1023px)')

  const changes = isNew ? Math.max(1, countFormChanges(live, draft)) : countFormChanges(live, draft)
  // The draft to keep: none once it's back to what's on the site.
  const wanted = isNew || changes === 0 ? null : draft
  const unkept = !isNew && !same(wanted, kept)
  useLeaveGuard(isNew ? countFormChanges(live, draft) > 0 : unkept)

  async function keepDraft(next: FormContent | null) {
    if (!form) return
    try {
      await fetchJson(
        withCommunity(next ? `/api/admin/forms/${form.id}` : `/api/admin/forms/${form.id}/draft`, community),
        next
          ? { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(next) }
          : { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Could not keep the draft.',
      )
      setKept(next)
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Could not keep the draft.'])
    }
  }

  // Keeps the draft a moment after the last edit, or drops it once the
  // edits are all undone. A draft the server would refuse (no name, no
  // questions) waits until it's whole again; Publish says what's missing.
  const keepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!form || !unkept || publishing) return
    if (wanted && (!wanted.title.trim() || wanted.steps.length === 0)) return
    keepTimer.current = setTimeout(() => void keepDraft(wanted), DRAFT_KEEP_DELAY_MS)
    return () => {
      if (keepTimer.current) clearTimeout(keepTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, kept, publishing])

  // The preview and a question's screen each get their own history entry,
  // so Back lands on this screen rather than the list.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { editorPreview?: boolean; formStep?: number } | null
      setPreviewing(!!state?.editorPreview)
      setOpenStep(state?.formStep ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function showStep(i: number) {
    setOpenStep(i)
    history.pushState({ ...(window.history.state ?? {}), formStep: i }, '')
    window.scrollTo?.(0, 0)
  }

  function set<K extends keyof FormContent>(key: K, value: FormContent[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors([])
  }

  function updateStep(i: number, patch: Partial<FormStep>) {
    setDraft((d) => ({ ...d, steps: d.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }))
    setErrors([])
  }

  function addStep() {
    const i = draft.steps.length
    setDraft((d) => ({ ...d, steps: [...d.steps, { id: '', kind: 'text', question: '' }] }))
    showStep(i)
  }

  function removeStep(i: number) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }))
    history.back()
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= draft.steps.length) return
    setDraft((d) => {
      const next = [...d.steps]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...d, steps: next }
    })
    setOpenStep(j)
    history.replaceState({ ...(window.history.state ?? {}), formStep: j }, '')
  }

  function validate(): string[] {
    const errs: string[] = []
    if (!draft.title.trim()) errs.push('Give it a name.')
    if (draft.steps.length === 0) errs.push('It needs at least one question.')
    draft.steps.forEach((s, i) => {
      const n = i + 1
      if (!s.question.trim()) errs.push(`Question ${n} needs its words.`)
      else if (!s.id.trim()) errs.push(`Question ${n} needs a letter or a number in it.`)
      const needsOptions = (s.kind === 'single' || s.kind === 'multi') && !s.optionsSource
      if (needsOptions && !(s.options && s.options.length > 0)) errs.push(`“${s.question || `Question ${n}`}” needs at least one choice.`)
    })
    return errs
  }

  async function publish() {
    const errs = validate()
    if (errs.length) {
      setErrors(errs)
      return
    }
    setErrors([])
    setPublishing(true)
    if (keepTimer.current) clearTimeout(keepTimer.current)
    const json = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    try {
      if (!form) {
        await fetchJson(withCommunity('/api/admin/forms', community), { method: 'POST', headers: json, body: JSON.stringify(draft) }, 'Could not make the form.')
      } else {
        await fetchJson(withCommunity(`/api/admin/forms/${form.id}`, community), { method: 'PATCH', headers: json, body: JSON.stringify(draft) }, 'Could not keep the draft.')
        await fetchJson(
          withCommunity(`/api/admin/forms/${form.id}/publish`, community),
          { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
          'Publish failed.',
        )
      }
      onPublished()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Publish failed.'])
      setPublishing(false)
    }
  }

  function throwAway() {
    if (isNew) return onBack()
    if (keepTimer.current) clearTimeout(keepTimer.current)
    setDraft(live)
    setErrors([])
  }

  async function toggleActive(on: boolean) {
    if (!form) return
    setActive(on)
    try {
      await fetchJson(
        withCommunity(`/api/admin/forms/${form.id}/active`, community),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ active: on }) },
        'Could not change that.',
      )
      onChanged()
    } catch (err) {
      setActive(!on)
      setErrors([err instanceof Error ? err.message : 'Could not change that.'])
    }
  }

  async function remove() {
    if (!form) return
    try {
      await fetchJson(withCommunity(`/api/admin/forms/${form.id}`, community), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }, 'Could not delete it.')
      onChanged()
      onBack()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Could not delete it.'])
    }
  }

  function leave() {
    if (isNew && countFormChanges(live, draft) > 0 && !window.confirm(LEAVE_QUESTION)) return
    onBack()
  }

  if (previewing) return <FormPreview content={draft} onClose={() => history.back()} />

  const name = draft.title.trim() || (isNew ? 'New form' : live.title)
  const backLink = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="self-start inline-flex items-center min-h-11 -mt-3 text-sm font-semibold text-primary cursor-pointer">
      ‹ {label}
    </button>
  )

  const step = openStep !== null ? draft.steps[openStep] : undefined
  let screen: React.ReactNode
  if (step && openStep !== null) {
    // A question's own screen.
    const i = openStep
    screen = (
      <>
        {backLink(name, () => history.back())}
        <h2 className="m-0 text-[26px] font-bold text-slate-900">{step.question.trim() || 'New question'}</h2>
        <FormStepEditor
          step={step}
          index={i}
          total={draft.steps.length}
          onChange={(patch) => updateStep(i, patch)}
          onRemove={() => removeStep(i)}
          onMove={(dir) => moveStep(i, dir)}
        />
      </>
    )
  } else {
    const shown = allQuestions ? draft.steps : draft.steps.slice(0, QUESTIONS_SHOWN)
    const more = draft.steps.length - QUESTIONS_SHOWN
    screen = (
      <>
        {backLink('Forms', leave)}
        <header className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="m-0 text-[26px] font-bold text-slate-900">{name}</h2>
            {responsesHref && (
              <Link href={responsesHref} className="text-sm font-semibold text-primary">
                Responses
              </Link>
            )}
          </div>
          {!isNew && (
            <span className="flex items-center gap-2.5 pt-1.5 text-[15px] font-semibold text-slate-900">
              <AdminSwitch checked={active} onChange={toggleActive} label="On the site" />
              <span aria-hidden="true">On the site</span>
            </span>
          )}
        </header>

        <AdminBox
          title="Questions"
          action={
            <button type="button" onClick={addStep} className="text-sm font-semibold text-primary cursor-pointer">
              + Add a question
            </button>
          }
        >
          {shown.map((s, i) => {
            const section = sectionName(s.section)
            const heading = section && section !== sectionName(draft.steps[i - 1]?.section) ? section : null
            return (
              <div key={i}>
                {heading && <p className="m-0 px-4 pt-3 pb-1.5 border-b border-slate-100 text-[13px] font-semibold text-slate-600">{heading}</p>}
                <AdminRow onClick={() => showStep(i)} name={s.question.trim() || 'New question'} line={questionLine(s, draft.steps)} />
              </div>
            )
          })}
          {more > 0 && <MoreToggle open={allQuestions} more={more} onToggle={() => setAllQuestions((a) => !a)} />}
        </AdminBox>

        <AdminBox title="After sending">
          <div className="flex flex-col gap-4 p-4">
            <AdminField label="Send button">
              <input value={draft.submitLabel} onChange={(e) => set('submitLabel', e.target.value)} className={adminInputClass} />
            </AdminField>
            <AdminField label="Title">
              <input value={draft.successTitle} onChange={(e) => set('successTitle', e.target.value)} className={adminInputClass} />
            </AdminField>
            <AdminField label="Message">
              <textarea rows={2} value={draft.successMessage} onChange={(e) => set('successMessage', e.target.value)} className={adminInputClass} />
            </AdminField>
          </div>
        </AdminBox>

        <AdminBox title="Its tile">
          <div className="flex flex-col gap-4 p-4">
            <AdminField label="Name">
              <input value={draft.title} onChange={(e) => set('title', e.target.value)} className={adminInputClass} />
            </AdminField>
            <IconField icon={draft.icon ?? ''} onChange={(v) => set('icon', v)} />
          </div>
        </AdminBox>

        {form && !PROTECTED_FORM_IDS.has(form.id) &&
          (askingDelete ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[15px] text-slate-900">Delete {live.title} and every response to it?</span>
              <button type="button" onClick={remove} className="min-h-11 px-4 rounded-lg bg-red-600 text-white text-[15px] font-semibold cursor-pointer">
                Delete it
              </button>
              <button type="button" onClick={() => setAskingDelete(false)} className="min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-[15px] font-semibold text-slate-900 cursor-pointer">
                Leave it
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAskingDelete(true)} className="self-start min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-[15px] font-semibold text-red-700 cursor-pointer">
              Delete this form
            </button>
          ))}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-5">{screen}</div>
        {wide && (
          <aside aria-label="Preview" className="shrink-0 sticky top-8 self-start">
            <PreviewBeside initialDevice="phone" onOpen={openPreview}>
              {() => (
                <div className="px-5 py-8">
                  <Wizard
                    steps={resolvePreviewSteps(draft.steps)}
                    onSubmit={async () => {}}
                    onClose={() => {}}
                    submitLabel={draft.submitLabel}
                    successTitle={draft.successTitle}
                    successMessage={draft.successMessage}
                  />
                </div>
              )}
            </PreviewBeside>
          </aside>
        )}
      </div>
      {errors.length > 1 && (
        <ul className="m-0 list-none rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex flex-col gap-1">
          {errors.slice(1).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <SaveBar
        changes={changes}
        saving={publishing}
        error={errors[0] ?? null}
        onUndo={throwAway}
        onSave={publish}
        undoLabel="Throw away"
        saveLabel="Publish"
        status={isNew ? 'New form, not on the site yet' : `Draft · ${changesLabel(changes)}, not on the site yet`}
      />
    </div>
  )
}
