'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FormConfig, FormContent, FormStep } from '@/lib/forms'
import FormStepEditor from './FormStepEditor'
import FormPreview from './FormPreview'

// ── The forms manager: edit the Request Support and Volunteer wizards' title,
// chrome text, and questions. Mounted on /admin. Unlike categories, forms are a
// fixed pair (no create/delete) — the schema seeds exactly 'support' and
// 'volunteer'. Edits save as a draft; nothing reaches a real visitor until the
// admin explicitly publishes (see the draft/publish notes in formStore.ts). ──

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

export default function FormManager({
  token,
  editingId,
  onOpenEditor,
  onCloseEditor,
}: {
  token: string
  /** Form id being edited ('support' | 'volunteer'), or null when showing the
   *  list. Owned by the admin page so Back walks editor → list → moderation
   *  tab in one stack, same as CategoryManager. */
  editingId: string | null
  onOpenEditor: (id: string) => void
  onCloseEditor: () => void
}) {
  const [forms, setForms] = useState<FormConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/forms', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Failed to load.')
      setForms(body.forms as FormConfig[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  if (editingId) {
    const form = forms?.find((f) => f.id === editingId) ?? null
    if (!form) return <p className="text-sm text-muted">Loading…</p>
    return (
      <FormEditor
        token={token}
        form={form}
        onDone={() => {
          onCloseEditor()
          load()
        }}
        onCancel={onCloseEditor}
      />
    )
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        Edit the questions in the Request Support and Volunteer forms — add, reorder, or retitle
        steps. Changes save as a draft; nothing reaches visitors until you publish.
      </p>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {forms === null ? (
        <p className="text-sm text-muted">Loading forms…</p>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <div key={f.id} className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 text-sm">
                  {f.title}
                  <span className="ml-2 font-normal text-xs text-muted">{f.id}</span>
                  {f.draft && (
                    <span className="ml-2 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                      Unpublished draft
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted mt-1">{f.steps.length} step{f.steps.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => onOpenEditor(f.id)}
                className="shrink-0 text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Editor ──────────────────────────────────────────────────────────────────

function toContent(f: FormConfig): FormContent {
  // Continue an existing draft if there is one; otherwise start from what's
  // currently published.
  return f.draft ?? {
    title: f.title,
    submitLabel: f.submitLabel,
    successTitle: f.successTitle,
    successMessage: f.successMessage,
    steps: f.steps,
  }
}

function FormEditor({
  token,
  form,
  onDone,
  onCancel,
}: {
  token: string
  form: FormConfig
  onDone: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<FormContent>(() => toContent(form))
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [savedNotice, setSavedNotice] = useState(false)

  function set<K extends keyof FormContent>(key: K, value: FormContent[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setSavedNotice(false)
  }

  function updateStep(i: number, patch: Partial<FormStep>) {
    setDraft((d) => ({ ...d, steps: d.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }))
    setSavedNotice(false)
  }

  function addStep() {
    setDraft((d) => ({
      ...d,
      steps: [...d.steps, { id: '', kind: 'text', question: '' }],
    }))
    setSavedNotice(false)
  }

  function removeStep(i: number) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }))
    setSavedNotice(false)
  }

  function moveStep(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const j = i + dir
      if (j < 0 || j >= d.steps.length) return d
      const next = [...d.steps]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...d, steps: next }
    })
    setSavedNotice(false)
  }

  function validate(): string[] {
    const errs: string[] = []
    if (!draft.title.trim()) errs.push('Form title is required.')
    if (draft.steps.length === 0) errs.push('The form needs at least one step.')
    draft.steps.forEach((s, i) => {
      const n = i + 1
      if (!s.question.trim()) errs.push(`Step ${n}: needs a question.`)
      if (!s.id.trim()) errs.push(`Step ${n}: couldn't derive an id — check the question isn't just symbols.`)
      const needsOptions = (s.kind === 'single' || s.kind === 'multi') && !s.optionsSource
      if (needsOptions && !(s.options && s.options.length > 0))
        errs.push(`Step ${n} (“${s.question || 'untitled'}”): needs at least one choice.`)
    })
    return errs
  }

  async function saveDraft(): Promise<boolean> {
    const errs = validate()
    if (errs.length) {
      setErrors(errs)
      return false
    }
    setErrors([])
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/forms/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Save failed.')
      setSavedNotice(true)
      return true
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Save failed.'])
      return false
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    setPublishing(true)
    try {
      const ok = await saveDraft()
      if (!ok) return
      const res = await fetch(`/api/admin/forms/${form.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Publish failed.')
      onDone()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Publish failed.'])
    } finally {
      setPublishing(false)
    }
  }

  async function discard() {
    setDiscarding(true)
    setErrors([])
    try {
      const res = await fetch(`/api/admin/forms/${form.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not discard the draft.')
      setDraft({
        title: form.title,
        submitLabel: form.submitLabel,
        successTitle: form.successTitle,
        successMessage: form.successMessage,
        steps: form.steps,
      })
      setSavedNotice(false)
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Could not discard the draft.'])
    } finally {
      setDiscarding(false)
    }
  }

  if (previewing) {
    return <FormPreview content={draft} onClose={() => setPreviewing(false)} />
  }

  const busy = saving || publishing || discarding

  return (
    <div>
      <button
        onClick={onCancel}
        className="text-sm text-muted hover:text-slate-700 underline mb-4 cursor-pointer"
      >
        ← Back to forms
      </button>

      <h2 className="text-lg font-semibold text-slate-900 mb-1">Edit “{form.title}”</h2>
      <p className="text-xs text-muted mb-4">
        {form.draft ? 'Continuing an unpublished draft.' : 'Editing a copy — publishing replaces the live form.'}
      </p>

      <div className="space-y-6">
        {/* Chrome text */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Title</span>
            <input value={draft.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Submit button label</span>
            <input value={draft.submitLabel} onChange={(e) => set('submitLabel', e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Success screen title</span>
            <input value={draft.successTitle} onChange={(e) => set('successTitle', e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Success screen message</span>
            <textarea rows={2} value={draft.successMessage} onChange={(e) => set('successMessage', e.target.value)} className={inputClass} />
          </label>
        </section>

        {/* Steps */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Questions</h3>
            <button onClick={addStep} className="text-xs font-medium text-primary hover:underline cursor-pointer">+ Add step</button>
          </div>
          <div className="space-y-2">
            {draft.steps.map((s, i) => (
              <FormStepEditor
                key={i}
                step={s}
                index={i}
                total={draft.steps.length}
                onChange={(patch) => updateStep(i, patch)}
                onRemove={() => removeStep(i)}
                onMove={(dir) => moveStep(i, dir)}
              />
            ))}
          </div>
        </section>
      </div>

      {errors.length > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-red-700">{e}</p>
          ))}
        </div>
      )}
      {savedNotice && errors.length === 0 && (
        <p className="mt-4 text-sm text-green-700">Draft saved.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-6">
        <button
          onClick={() => setPreviewing(true)}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Preview
        </button>
        <button
          onClick={saveDraft}
          disabled={busy}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <button
          onClick={publish}
          disabled={busy}
          className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
        {form.draft && (
          <button
            onClick={discard}
            disabled={busy}
            className="text-sm font-medium text-red-600 hover:underline cursor-pointer ml-auto disabled:opacity-60"
          >
            {discarding ? 'Discarding…' : 'Discard draft'}
          </button>
        )}
      </div>
    </div>
  )
}
