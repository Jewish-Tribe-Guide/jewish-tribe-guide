'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CATEGORY_CAPABILITY_KEYS,
  FIELD_TYPES,
  FIELD_TYPE_SHAPE,
  TYPE_HAS_SHAPE_CHOICE,
  TYPE_IS_FILTERABLE,
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
          Choose what each category shows — its buttons, search bar, upvotes, and the details (and
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
                    {(() => {
                      // Count only visible details (hidden ones aren't editable here).
                      const shown = c.detailFields.filter((f) => f.renderAs !== 'hidden')
                      const filters = shown.filter((f) => f.filterable).length
                      return (
                        `${shown.length} detail${shown.length !== 1 ? 's' : ''}` +
                        (filters > 0 ? ` · ${filters} filter${filters !== 1 ? 's' : ''}` : '')
                      )
                    })()}
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
      if (!f.label.trim()) errs.push(`Detail ${n}: needs a name.`)
      else if (keys.has(f.key)) errs.push(`Detail ${n}: another detail is already named “${f.label}”.`)
      else keys.add(f.key)
      if (f.type === 'select' && !(f.options && f.options.length > 0))
        errs.push(`Detail ${n} (“${f.label || 'unnamed'}”): a Choice needs at least one option.`)
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
        // Apply the implied filter/tag rules, then re-merge the preserved hidden
        // fields so editing never drops them.
        fields: [...draft.fields.map(normalizeField), ...draft.hiddenFields],
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

        {/* Details */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-800">Details</h3>
            <button onClick={addField} className="text-xs font-medium text-primary hover:underline cursor-pointer">
              + Add detail
            </button>
          </div>
          <p className="text-xs text-muted mb-3">
            What each listing shows, beyond its name, address, and phone.
          </p>
          {draft.fields.length === 0 ? (
            <p className="text-xs text-muted">No details yet — listings will show just name, address, and phone.</p>
          ) : (
            <div className="space-y-3">
              {draft.fields.map((f, i) => (
                <FieldEditor
                  key={i}
                  field={f}
                  index={i}
                  total={draft.fields.length}
                  // "Required" only matters if people can add or edit listings.
                  canRequire={draft.capabilities.add || draft.capabilities.edit}
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

// The editor only asks Name / Type / Show as / Required; the filter + tag rules
// are implied and applied here on save:
//   • Badge (Yes/No, Choice) → a filter. Row → display only, no filter.
//   • Choice filter → always multi-select.
//   • Hours → always the "Open now" filter.
//   • Tags → always chips + click-to-search (never a filter); their tag group is
//     derived from the name once, then frozen so a rename can't orphan tags.
function normalizeField(f: CategoryField): CategoryField {
  const out: CategoryField = { ...f }
  const isBadge = out.renderAs !== 'row'

  if (out.type === 'tags') {
    out.renderAs = 'badge'
    out.tagGroup = out.tagGroup || slugifyFieldKey(out.label)
    out.filterable = false
    out.multiSelect = undefined
  } else if (out.type === 'hours') {
    out.filterable = true
    out.multiSelect = undefined
  } else if (TYPE_IS_FILTERABLE(out.type)) {
    // Yes/No or Choice: the badge is the filter; a row is display-only.
    out.filterable = isBadge
    out.multiSelect = out.type === 'select' && isBadge ? true : undefined
  } else {
    out.filterable = false
    out.multiSelect = undefined
  }
  return out
}

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
  canRequire,
  onChange,
  onRemove,
  onMove,
}: {
  field: CategoryField
  index: number
  total: number
  canRequire: boolean
  onChange: (patch: Partial<CategoryField>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  // "Name" auto-fills the internal key only while it's still blank, then freezes,
  // so renaming a detail later never orphans its stored data.
  function onNameChange(name: string) {
    onChange(!f.key ? { label: name, key: slugifyFieldKey(name) } : { label: name })
  }

  // "Show as" is offered only for Yes/No and Choice — the types where badge-vs-row
  // is a real choice. Badge also means "this is a filter" (applied in
  // normalizeField); a row is display-only. Everything else has a fixed shape.
  const canChooseShape = TYPE_HAS_SHAPE_CHOICE(f.type)
  const showAs: 'badge' | 'row' = f.renderAs === 'row' ? 'row' : 'badge'

  function onTypeChange(type: FieldType) {
    // Reset to the type's natural shape; drop choices when leaving Choice.
    const patch: Partial<CategoryField> = { type, renderAs: FIELD_TYPE_SHAPE[type] }
    if (type !== 'select') patch.options = undefined
    onChange(patch)
  }

  const fieldLabel = 'block text-[11px] font-medium text-slate-600 mb-0.5'

  return (
    <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50 space-y-2">
      <label className="block">
        <span className={fieldLabel}>Name</span>
        <input value={f.label} onChange={(e) => onNameChange(e.target.value)} className={inputClass} placeholder="e.g. Grades served" />
      </label>

      <label className="block sm:w-1/2">
        <span className={fieldLabel}>Type</span>
        <select value={f.type} onChange={(e) => onTypeChange(e.target.value as FieldType)} className={inputClass}>
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      {f.type === 'select' && (
        <label className="block">
          <span className={fieldLabel}>Choices (one per line — “value | label”, or just value)</span>
          <textarea
            rows={3}
            value={serializeOptions(f.options)}
            onChange={(e) => onChange({ options: parseOptions(e.target.value) })}
            className={inputClass}
            placeholder={'Elementary\nMiddle\nHigh'}
          />
        </label>
      )}

      {canChooseShape && (
        <label className="block sm:w-1/2">
          <span className={fieldLabel}>Show as</span>
          <select value={showAs} onChange={(e) => onChange({ renderAs: e.target.value as 'badge' | 'row' })} className={inputClass}>
            <option value="badge">Badge — a chip, and a filter</option>
            <option value="row">Row — a labeled line</option>
          </select>
        </label>
      )}

      {canRequire && (
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer pt-0.5">
          <input type="checkbox" checked={!!f.required} onChange={(e) => onChange({ required: e.target.checked })} className="rounded border-slate-300" />
          Required when adding a listing
        </label>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-2 mt-1">
        <button onClick={() => onMove(-1)} disabled={index === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move detail up">↑</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move detail down">↓</button>
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Remove</button>
      </div>
    </div>
  )
}
