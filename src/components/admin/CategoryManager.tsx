'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CATEGORY_CAPABILITY_KEYS,
  DEFAULT_CATEGORY_ICON,
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
import type { FormConfig } from '@/lib/forms'
import FormEditor from './FormEditor'
import CategoryPreview from './CategoryPreview'

// ── The categories manager: one list mixing the two kinds of thing a
// community configures — Listing categories (Grocery Stores, Synagogues, …,
// each with its own detail fields and capabilities) and Forms (the fixed
// Request Support / Volunteer wizards). Edit either's presentation and fields,
// or create a new Listing category (forms are a fixed pair — see FormEditor).
// Mounted on /admin. Listing writes go through /api/admin/categories; form
// writes through /api/admin/forms. ──────────────────────────────────────────

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

const CAPABILITY_LABELS: Record<keyof CategoryCapabilities, string> = {
  add: 'Add button',
  edit: 'Edit button',
  report: 'Report button',
  directorySearch: 'Search bar',
  map: 'Map button',
}

type Entry =
  | { kind: 'category'; data: CategoryConfig }
  | { kind: 'form'; data: FormConfig }

function entryLabel(e: Entry): string {
  return e.kind === 'category' ? e.data.pluralLabel : e.data.title
}

// editingId is opaque to the admin page's history plumbing — encoded here as
// 'cat:<id>', 'cat:new', or 'form:<id>' so one string covers both kinds.
const CAT_PREFIX = 'cat:'
const FORM_PREFIX = 'form:'

export default function CategoryManager({
  token,
  editingId,
  onOpenEditor,
  onCloseEditor,
}: {
  token: string
  editingId: string | null
  onOpenEditor: (id: string) => void
  onCloseEditor: () => void
}) {
  const [categories, setCategories] = useState<CategoryConfig[] | null>(null)
  const [forms, setForms] = useState<FormConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [catRes, formRes] = await Promise.all([
        fetch('/api/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/forms', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const [catBody, formBody] = await Promise.all([catRes.json(), formRes.json()])
      if (!catRes.ok || !catBody.ok) throw new Error(catBody.errors?.join(' ') || 'Failed to load categories.')
      if (!formRes.ok || !formBody.ok) throw new Error(formBody.errors?.join(' ') || 'Failed to load forms.')
      setCategories(catBody.categories as CategoryConfig[])
      setForms(formBody.forms as FormConfig[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const entries = useMemo<Entry[] | null>(() => {
    if (!categories || !forms) return null
    const all: Entry[] = [
      ...categories.map((data): Entry => ({ kind: 'category', data })),
      ...forms.map((data): Entry => ({ kind: 'form', data })),
    ]
    return all.sort((a, b) => entryLabel(a).localeCompare(entryLabel(b)))
  }, [categories, forms])

  async function deleteCategory(id: string) {
    setError(null)
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Delete failed.')
      setConfirmDeleteId(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  if (editingId === `${CAT_PREFIX}new`) {
    return (
      <CategoryEditor
        token={token}
        initial={null}
        onSaved={() => {
          onCloseEditor()
          load()
        }}
        onCancel={onCloseEditor}
      />
    )
  }

  if (editingId?.startsWith(CAT_PREFIX)) {
    const id = editingId.slice(CAT_PREFIX.length)
    const initial = categories?.find((c) => c.id === id) ?? null
    if (!initial) return <p className="text-sm text-muted">Loading…</p>
    return (
      <CategoryEditor
        token={token}
        initial={initial}
        onSaved={() => {
          onCloseEditor()
          load()
        }}
        onCancel={onCloseEditor}
      />
    )
  }

  if (editingId?.startsWith(FORM_PREFIX)) {
    const id = editingId.slice(FORM_PREFIX.length)
    const form = forms?.find((f) => f.id === id) ?? null
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
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          Listing categories (Grocery Stores, Synagogues, …) and Forms (Request Support, Volunteer) —
          choose what each shows, and edit their fields or questions.
        </p>
        <button
          onClick={() => onOpenEditor(`${CAT_PREFIX}new`)}
          className="shrink-0 text-sm font-medium bg-primary text-white rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
        >
          + New category
        </button>
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {entries === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">Nothing here yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) =>
            e.kind === 'category' ? (
              <CategoryRow
                key={`cat:${e.data.id}`}
                category={e.data}
                confirmingDelete={confirmDeleteId === e.data.id}
                deleting={deletingId === e.data.id}
                onEdit={() => onOpenEditor(`${CAT_PREFIX}${e.data.id}`)}
                onAskDelete={() => setConfirmDeleteId(e.data.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteCategory(e.data.id)}
              />
            ) : (
              <FormRow key={`form:${e.data.id}`} form={e.data} onEdit={() => onOpenEditor(`${FORM_PREFIX}${e.data.id}`)} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ── List rows ─────────────────────────────────────────────────────────────────

const TYPE_BADGE = 'text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0'

function CategoryRow({
  category: c,
  confirmingDelete,
  deleting,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  category: CategoryConfig
  confirmingDelete: boolean
  deleting: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const caps = resolveCapabilities(c.capabilities)
  const on = [
    ...CATEGORY_CAPABILITY_KEYS.filter((k) => caps[k]).map((k) => CAPABILITY_LABELS[k]),
    ...(c.upvotesEnabled ? ['Upvotes'] : []),
  ]
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
            <span className={`${TYPE_BADGE} bg-blue-50 text-blue-600`}>Listing</span>
            <span>
              <span className="mr-1">{c.icon}</span>
              {c.pluralLabel}
            </span>
            <span className="font-normal text-xs text-muted">{c.id}</span>
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onEdit}
            className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            onClick={onAskDelete}
            className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
            <p className="text-sm text-red-800">
              Permanently delete <span className="font-semibold">{c.pluralLabel}</span> and every
              listing in it? This can’t be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onConfirmDelete}
                disabled={deleting}
                className="text-sm font-medium bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Deleting…' : 'Delete category & listings'}
              </button>
              <button
                onClick={onCancelDelete}
                disabled={deleting}
                className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormRow({ form: f, onEdit }: { form: FormConfig; onEdit: () => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
          <span className={`${TYPE_BADGE} bg-purple-50 text-purple-600`}>Form</span>
          <span>{f.title}</span>
          <span className="font-normal text-xs text-muted">{f.id}</span>
          {f.draft && (
            <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
              Unpublished draft
            </span>
          )}
        </p>
        <p className="text-xs text-muted mt-1">{f.steps.length} step{f.steps.length !== 1 ? 's' : ''}</p>
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        Edit
      </button>
    </div>
  )
}

// ── Editor ──────────────────────────────────────────────────────────────────

// Derive the singular from the plural name by dropping a trailing "s" (only when
// preceded by a non-"s", so "Class"/"Mikvah" stay put). Good enough for the
// "Add a …" phrasing across realistic category names.
function singularize(plural: string): string {
  const s = plural.trim()
  return /[^s]s$/i.test(s) ? s.slice(0, -1) : s
}

type Draft = {
  label: string
  pluralLabel: string
  description: string
  upvotesEnabled: boolean
  capabilities: CategoryCapabilities
  /** The editable fields (everything shown on a card). */
  fields: CategoryField[]
  /** Fields with renderAs 'hidden' (caveat notes) — not editable here, but
   *  preserved as-is and re-merged on save so editing a category never drops
   *  or exposes them. */
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
  const [previewing, setPreviewing] = useState(false)

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  // One "Name" field holds the plural (card title); the singular used in
  // "Add a …" phrasing is derived by dropping a trailing "s".
  function setName(name: string) {
    setDraft((d) => ({ ...d, pluralLabel: name, label: singularize(name) }))
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
    if (!draft.pluralLabel.trim()) errs.push('Category name is required.')
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

  if (previewing) {
    // A throwaway config built from the in-progress draft (never saved) — lets
    // the admin see the real directory page (listings, buttons, Add/Edit/
    // Report forms) update live as they edit fields.
    const previewCategory: CategoryConfig = {
      id: initial?.id ?? 'preview',
      label: draft.label || 'Listing',
      pluralLabel: draft.pluralLabel || draft.label || 'Preview',
      icon: initial?.icon ?? DEFAULT_CATEGORY_ICON,
      description: draft.description,
      detailFields: [...draft.fields.map(normalizeField), ...draft.hiddenFields],
      community: initial?.community ?? false,
      upvotesEnabled: draft.upvotesEnabled,
      capabilities: draft.capabilities,
    }
    return <CategoryPreview category={previewCategory} onClose={() => setPreviewing(false)} />
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
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Name *</span>
            <input value={draft.pluralLabel} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Schools" />
            <span className="block text-[11px] text-muted mt-1">Plural, as it appears on the card. The singular (for “Add a …”) is derived automatically.</span>
          </label>
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
            onClick={() => setPreviewing(true)}
            className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Preview
          </button>
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
