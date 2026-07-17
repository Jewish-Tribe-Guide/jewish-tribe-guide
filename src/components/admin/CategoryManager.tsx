'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CATEGORY_CAPABILITY_KEYS,
  FIELD_TYPE_SHAPE,
  FIELD_TYPES_BY_SHAPE,
  resolveCapabilities,
  slugifyFieldKey,
  type CategoryCapabilities,
  type CategoryConfig,
  type CategoryField,
  type FieldType,
} from '@/lib/categories'

// ── The category manager: list every category, edit its presentation, fields,
// and per-category UI capabilities, or create a new one. Mounted on /admin.
// All writes go through the admin-only /api/admin/categories routes. ──────────

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

const CAPABILITY_LABELS: Record<keyof CategoryCapabilities, string> = {
  add: 'Add button',
  edit: 'Edit button',
  report: 'Report button',
  directorySearch: 'Search bar',
}

export default function CategoryManager({ token }: { token: string }) {
  const [categories, setCategories] = useState<CategoryConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CategoryConfig | 'new' | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/categories', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Failed to load.')
      setCategories(body.categories as CategoryConfig[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  if (editing) {
    return (
      <CategoryEditor
        token={token}
        initial={editing === 'new' ? null : editing}
        onSaved={() => {
          setEditing(null)
          load()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          Choose what each category shows — its buttons, search bar, upvotes, and the fields (and
          filters) on its listings.
        </p>
        <button
          onClick={() => setEditing('new')}
          className="shrink-0 text-sm font-medium bg-primary text-white rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
        >
          + New category
        </button>
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {categories === null ? (
        <p className="text-sm text-muted">Loading categories…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted">No categories yet.</p>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => {
            const caps = resolveCapabilities(c.capabilities)
            const on = [
              ...CATEGORY_CAPABILITY_KEYS.filter((k) => caps[k]).map((k) => CAPABILITY_LABELS[k]),
              ...(c.upvotesEnabled ? ['Upvotes'] : []),
            ]
            return (
              <div
                key={c.id}
                className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">
                    <span className="mr-1">{c.icon}</span>
                    {c.pluralLabel}
                    <span className="ml-2 font-normal text-xs text-muted">{c.id}</span>
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {c.detailFields.length} field{c.detailFields.length !== 1 ? 's' : ''}
                    {c.detailFields.some((f) => f.filterable) &&
                      ` · ${c.detailFields.filter((f) => f.filterable).length} filter${c.detailFields.filter((f) => f.filterable).length !== 1 ? 's' : ''}`}
                    {on.length > 0 ? ` · ${on.join(', ')}` : ' · no buttons'}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(c)}
                  className="shrink-0 text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Editor ──────────────────────────────────────────────────────────────────

type Draft = {
  label: string
  pluralLabel: string
  description: string
  upvotesEnabled: boolean
  capabilities: CategoryCapabilities
  /** The editable fields (everything shown on a card). */
  fields: CategoryField[]
  /** Fields with renderAs 'hidden' (caveat notes, structured minyanim) — not
   *  editable here, but preserved as-is and re-merged on save so editing a
   *  category never drops or exposes them. */
  hiddenFields: CategoryField[]
}

function toDraft(c: CategoryConfig | null): Draft {
  const all = (c?.detailFields ?? []).map((f) => ({ ...f }))
  return {
    label: c?.label ?? '',
    pluralLabel: c?.pluralLabel ?? '',
    description: c?.description ?? '',
    upvotesEnabled: !!c?.upvotesEnabled,
    capabilities: resolveCapabilities(c?.capabilities),
    fields: all.filter((f) => f.renderAs !== 'hidden'),
    hiddenFields: all.filter((f) => f.renderAs === 'hidden'),
  }
}

function CategoryEditor({
  token,
  initial,
  onSaved,
  onCancel,
}: {
  token: string
  initial: CategoryConfig | null
  onSaved: () => void
  onCancel: () => void
}) {
  const isNew = initial === null
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function setCap(key: keyof CategoryCapabilities, value: boolean) {
    setDraft((d) => ({ ...d, capabilities: { ...d.capabilities, [key]: value } }))
  }

  function updateField(i: number, patch: Partial<CategoryField>) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    }))
  }

  function addField() {
    setDraft((d) => ({
      ...d,
      fields: [...d.fields, { key: '', label: '', type: 'text' as FieldType, renderAs: 'row' }],
    }))
  }

  function removeField(i: number) {
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, idx) => idx !== i) }))
  }

  function moveField(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const j = i + dir
      if (j < 0 || j >= d.fields.length) return d
      const next = [...d.fields]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...d, fields: next }
    })
  }

  function validate(): string[] {
    const errs: string[] = []
    if (!draft.label.trim()) errs.push('Category name is required.')
    // Seed the key set with the preserved hidden fields so a new visible field
    // can't collide with a caveat note / minyanim key.
    const keys = new Set<string>(draft.hiddenFields.map((f) => f.key))
    draft.fields.forEach((f, i) => {
      const n = i + 1
      if (!f.key.trim()) errs.push(`Field ${n}: needs a key.`)
      else if (keys.has(f.key)) errs.push(`Field ${n}: duplicate key "${f.key}".`)
      else keys.add(f.key)
      if (!f.label.trim()) errs.push(`Field ${n}: needs a label.`)
      if (f.type === 'select' && !(f.options && f.options.length > 0))
        errs.push(`Field ${n} ("${f.label || f.key}"): a choice field needs at least one option.`)
    })
    return errs
  }

  async function save() {
    const errs = validate()
    if (errs.length) {
      setErrors(errs)
      return
    }
    setErrors([])
    setSaving(true)
    try {
      const payload = {
        label: draft.label,
        pluralLabel: draft.pluralLabel || draft.label,
        description: draft.description,
        upvotesEnabled: draft.upvotesEnabled,
        capabilities: draft.capabilities,
        // Re-merge the preserved hidden fields so editing never drops them.
        fields: [...draft.fields, ...draft.hiddenFields],
      }
      const res = await fetch(
        isNew ? '/api/admin/categories' : `/api/admin/categories/${initial!.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        },
      )
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Save failed.')
      onSaved()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Save failed.'])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button
        onClick={onCancel}
        className="text-sm text-muted hover:text-slate-700 underline mb-4 cursor-pointer"
      >
        ← Back to categories
      </button>

      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        {isNew ? 'New category' : `Edit “${initial!.pluralLabel}”`}
        {!isNew && <span className="ml-2 text-xs font-normal text-muted">{initial!.id}</span>}
      </h2>

      <div className="space-y-6">
        {/* Presentation */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Name (singular) *</span>
              <input value={draft.label} onChange={(e) => set('label', e.target.value)} className={inputClass} placeholder="e.g. School" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Name (plural)</span>
              <input value={draft.pluralLabel} onChange={(e) => set('pluralLabel', e.target.value)} className={inputClass} placeholder="e.g. Schools" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Description</span>
            <input value={draft.description} onChange={(e) => set('description', e.target.value)} className={inputClass} placeholder="Shown under the card title" />
          </label>
        </section>

        {/* Capabilities */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">What this category shows</h3>
          <p className="text-xs text-muted mb-3">
            Turn an affordance off to hide it (and block that action on the server) for this category
            only. These sit under the site-wide switches — if something is off site-wide, it stays off
            here regardless.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {CATEGORY_CAPABILITY_KEYS.map((k) => (
              <label key={k} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={draft.capabilities[k]} onChange={(e) => setCap(k, e.target.checked)} className="rounded border-slate-300" />
                {CAPABILITY_LABELS[k]}
              </label>
            ))}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={draft.upvotesEnabled} onChange={(e) => set('upvotesEnabled', e.target.checked)} className="rounded border-slate-300" />
              Upvotes
            </label>
          </div>
        </section>

        {/* Fields */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-800">Fields</h3>
            <button onClick={addField} className="text-xs font-medium text-primary hover:underline cursor-pointer">
              + Add field
            </button>
          </div>
          <p className="text-xs text-muted mb-3">
            The details each listing holds. Tick <span className="font-medium">Filter</span> to add a
            filter control for that field on the category page.
          </p>
          {draft.fields.length === 0 ? (
            <p className="text-xs text-muted">No fields yet — listings will show just name, address, and phone.</p>
          ) : (
            <div className="space-y-3">
              {draft.fields.map((f, i) => (
                <FieldEditor
                  key={i}
                  field={f}
                  index={i}
                  total={draft.fields.length}
                  onChange={(patch) => updateField(i, patch)}
                  onRemove={() => removeField(i)}
                  onMove={(dir) => moveField(i, dir)}
                />
              ))}
            </div>
          )}
        </section>

        {errors.length > 0 && (
          <ul className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 list-disc list-inside space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving…' : isNew ? 'Create category' : 'Save changes'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── One field row ─────────────────────────────────────────────────────────────

function serializeOptions(options?: { value: string; label: string }[]): string {
  return (options ?? [])
    .map((o) => (o.label && o.label !== o.value ? `${o.value} | ${o.label}` : o.value))
    .join('\n')
}

function parseOptions(text: string): { value: string; label: string }[] {
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

function FieldEditor({
  field: f,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  field: CategoryField
  index: number
  total: number
  onChange: (patch: Partial<CategoryField>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  // Auto-fill the key from the label until the user types a key by hand.
  function onLabelChange(label: string) {
    const autoKey = !f.key || f.key === slugifyFieldKey(f.label)
    onChange(autoKey ? { label, key: slugifyFieldKey(label) } : { label })
  }

  // "Show as" is the primary choice; the Type list is filtered to the types that
  // fit the chosen shape. Each type maps to exactly one shape, so the current
  // shape is derived from the type — which also guarantees the type is always
  // present in its shape's filtered list.
  const showAs: 'badge' | 'row' = FIELD_TYPE_SHAPE[f.type]

  function onShowAsChange(next: 'badge' | 'row') {
    const options = FIELD_TYPES_BY_SHAPE[next]
    // Keep the current type if it still fits; otherwise fall back to the first.
    const type = options.some((t) => t.value === f.type) ? f.type : options[0].value
    onChange({ renderAs: next, type })
  }

  function onTypeChange(type: FieldType) {
    onChange({ type, renderAs: FIELD_TYPE_SHAPE[type] })
  }

  return (
    <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Label</span>
          <input value={f.label} onChange={(e) => onLabelChange(e.target.value)} className={inputClass} placeholder="e.g. Grades served" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Key</span>
          <input value={f.key} onChange={(e) => onChange({ key: slugifyFieldKey(e.target.value) })} className={inputClass} placeholder="grades" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Show as</span>
          <select value={showAs} onChange={(e) => onShowAsChange(e.target.value as 'badge' | 'row')} className={inputClass}>
            <option value="badge">Badge — a chip by the name</option>
            <option value="row">Row — a labeled line</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Type</span>
          <select value={f.type} onChange={(e) => onTypeChange(e.target.value as FieldType)} className={inputClass}>
            {FIELD_TYPES_BY_SHAPE[showAs].map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      {f.type === 'select' && (
        <label className="block mt-2">
          <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Options (one per line — “value | label”, or just value)</span>
          <textarea
            rows={3}
            value={serializeOptions(f.options)}
            onChange={(e) => onChange({ options: parseOptions(e.target.value) })}
            className={inputClass}
            placeholder={'Elementary\nMiddle\nHigh'}
          />
        </label>
      )}

      {f.type === 'tags' && (
        <label className="block mt-2">
          <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Tag group (shared vocabulary id)</span>
          <input value={f.tagGroup ?? ''} onChange={(e) => onChange({ tagGroup: e.target.value || undefined })} className={inputClass} placeholder="e.g. kosher_product" />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input type="checkbox" checked={!!f.required} onChange={(e) => onChange({ required: e.target.checked })} className="rounded border-slate-300" />
          Required
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input type="checkbox" checked={!!f.filterable} onChange={(e) => onChange({ filterable: e.target.checked })} className="rounded border-slate-300" />
          Filter
        </label>
        {f.filterable && (
          <>
            <input
              value={f.filterLabel ?? ''}
              onChange={(e) => onChange({ filterLabel: e.target.value || undefined })}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs w-40"
              placeholder="Filter label (optional)"
            />
            {f.type === 'select' && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={!!f.multiSelect} onChange={(e) => onChange({ multiSelect: e.target.checked })} className="rounded border-slate-300" />
                Multi-select
              </label>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move field up">↑</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move field down">↓</button>
          <button onClick={onRemove} className="text-xs text-red-600 hover:underline cursor-pointer">Remove</button>
        </div>
      </div>
    </div>
  )
}
