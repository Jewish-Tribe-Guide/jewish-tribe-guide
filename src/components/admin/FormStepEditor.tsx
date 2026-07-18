'use client'

import {
  STEP_KINDS,
  STEP_KIND_HAS_OPTIONS,
  slugifyStepId,
  type FormStep,
  type StepCondition,
  type StepOption,
} from '@/lib/forms'

// ── One question in a form (see FormEditor). Mirrors CategoryManager's
// FieldEditor: the id auto-fills from the question text while blank, then
// freezes, so renaming a question later never orphans its stored answers or
// breaks another step's condition that points at it. ──────────────────────────

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

function serializeOptions(options?: StepOption[]): string {
  return (options ?? []).map((o) => (o.label && o.label !== o.value ? `${o.value} | ${o.label}` : o.value)).join('\n')
}

function parseOptions(text: string): StepOption[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split('|')
      const v = value.trim()
      const label = rest.join('|').trim()
      return { value: v, label: label || v }
    })
}

const OP_LABELS: Record<StepCondition['op'], string> = {
  includes: 'includes',
  notIncludes: "doesn't include",
  notEmpty: 'was answered',
  empty: 'was left blank',
}

const OP_NEEDS_VALUE = (op: StepCondition['op']): boolean => op === 'includes' || op === 'notIncludes'

export default function FormStepEditor({
  step: s,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  step: FormStep
  index: number
  total: number
  onChange: (patch: Partial<FormStep>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  function onQuestionChange(question: string) {
    onChange(!s.id ? { question, id: slugifyStepId(question) } : { question })
  }

  const hasOptions = STEP_KIND_HAS_OPTIONS(s.kind) && !s.optionsSource
  const hasPlaceholder = s.kind === 'text' || s.kind === 'tel' || s.kind === 'number' || s.kind === 'date' || s.kind === 'textarea'

  const conditions = s.when ?? []
  function updateCondition(i: number, patch: Partial<StepCondition>) {
    const next = conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    onChange({ when: next })
  }
  function addCondition() {
    onChange({ when: [...conditions, { field: '', op: 'includes', value: '' }] })
  }
  function removeCondition(i: number) {
    const next = conditions.filter((_, idx) => idx !== i)
    onChange({ when: next.length > 0 ? next : undefined })
  }

  const fieldLabel = 'block text-[11px] font-medium text-slate-600 mb-0.5'

  return (
    <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50 space-y-2">
      <label className="block">
        <span className={fieldLabel}>Question</span>
        <input value={s.question} onChange={(e) => onQuestionChange(e.target.value)} className={inputClass} placeholder="e.g. How many people are we feeding?" />
      </label>

      <div className="flex gap-2 flex-wrap">
        <label className="block sm:w-48">
          <span className={fieldLabel}>Type</span>
          <select value={s.kind} onChange={(e) => onChange({ kind: e.target.value as FormStep['kind'] })} className={inputClass}>
            {STEP_KINDS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block flex-1 min-w-[10rem]">
          <span className={fieldLabel}>Section (groups related questions under a heading)</span>
          <input value={s.section ?? ''} onChange={(e) => onChange({ section: e.target.value || undefined })} className={inputClass} placeholder="e.g. 🍽️ Meals" />
        </label>
      </div>

      <label className="block">
        <span className={fieldLabel}>Hint (shown under the question, optional)</span>
        <input value={s.hint ?? ''} onChange={(e) => onChange({ hint: e.target.value || undefined })} className={inputClass} />
      </label>

      {hasPlaceholder && (
        <label className="block">
          <span className={fieldLabel}>Placeholder</span>
          <input value={s.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} className={inputClass} />
        </label>
      )}

      {hasOptions && (
        <label className="block">
          <span className={fieldLabel}>Choices (one per line — “value | label”, or just value)</span>
          <textarea
            rows={3}
            value={serializeOptions(s.options)}
            onChange={(e) => onChange({ options: parseOptions(e.target.value) })}
            className={inputClass}
          />
        </label>
      )}

      {s.optionsSource && (
        <p className="text-[11px] text-muted italic">
          Choices for this step are generated automatically (the live hospital list) — nothing to edit here.
        </p>
      )}

      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer pt-0.5">
        <input type="checkbox" checked={!!s.optional} onChange={(e) => onChange({ optional: e.target.checked })} className="rounded border-slate-300" />
        Optional — visitor can skip it
      </label>

      {/* Condition builder — when every row holds, the step shows. */}
      <div className="border-t border-slate-200 pt-2 mt-1">
        <span className={fieldLabel}>Only show this step when…</span>
        {conditions.length === 0 && <p className="text-[11px] text-muted mb-1">Always shown.</p>}
        <div className="space-y-1.5">
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input
                value={c.field}
                onChange={(e) => updateCondition(i, { field: e.target.value })}
                placeholder="step id, e.g. needs"
                className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <select
                value={c.op}
                onChange={(e) => updateCondition(i, { op: e.target.value as StepCondition['op'] })}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {(Object.keys(OP_LABELS) as StepCondition['op'][]).map((op) => (
                  <option key={op} value={op}>{OP_LABELS[op]}</option>
                ))}
              </select>
              {OP_NEEDS_VALUE(c.op) && (
                <input
                  value={c.value ?? ''}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder="value"
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
              <button onClick={() => removeCondition(i)} className="text-xs text-red-600 hover:underline cursor-pointer">Remove</button>
            </div>
          ))}
        </div>
        <button onClick={addCondition} className="mt-1.5 text-xs font-medium text-primary hover:underline cursor-pointer">+ Add condition</button>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-2 mt-1">
        <button onClick={() => onMove(-1)} disabled={index === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move step up">↑</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move step down">↓</button>
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Remove</button>
      </div>
    </div>
  )
}
