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
// each with its own detail fields and capabilities) and Forms (Request
// Support / Volunteer, plus any custom form an admin creates). Add/edit/
// delete either kind; a custom form's responses live in /admin's Responses
// tab (see ResponsesManager.tsx), not here. Mounted on /admin. Listing writes
// go through /api/admin/categories; form writes through /api/admin/forms. ──

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

const CAPABILITY_LABELS: Record<keyof CategoryCapabilities, string> = {
  add: 'Add button',
  edit: 'Edit button',
  report: 'Report button',
  directorySearch: 'Search bar',
  map: 'Map button',
}

// The two singleton pseudo-categories an admin can add/remove but never edit —
// there's nothing to configure, they just turn a fixed, code-driven screen on
// or off. See CategoryConfig.kind.
const SINGLETON_KIND_LABELS = { map: 'Map', zmanim: 'Zmanim' } as const

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
  const [addingSingleton, setAddingSingleton] = useState<'map' | 'zmanim' | null>(null)
  const [addingForm, setAddingForm] = useState(false)

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

  // Adds the singleton "Map" or "Zmanim" pseudo-category directly — there's
  // nothing to configure, so this skips the editor entirely. The DB's partial
  // unique index (category_kind_singleton) is the real guard against a second
  // one; hiding the button once one exists (see the render below) is just UX.
  async function addSingleton(kind: 'map' | 'zmanim') {
    setError(null)
    setAddingSingleton(kind)
    try {
      const label = SINGLETON_KIND_LABELS[kind]
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label, pluralLabel: label, kind }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not add it.')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it.')
    } finally {
      setAddingSingleton(null)
    }
  }

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

  // Creates a form directly (no editor step for the name — mirrors
  // addSingleton) then immediately opens the real editor on it, where the
  // admin renames it and adds questions. No client-side "new form" draft
  // state: FormEditor always assumes the row already exists.
  async function addForm() {
    setError(null)
    setAddingForm(true)
    try {
      const res = await fetch('/api/admin/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: 'New form' }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not create form.')
      await load()
      onOpenEditor(`${FORM_PREFIX}${body.form.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create form.')
    } finally {
      setAddingForm(false)
    }
  }

  // Delete state is shared with categories' confirm/deleting state, keyed by
  // `form:<id>` so a form and a category can never collide.
  async function deleteFormEntry(id: string) {
    setError(null)
    setDeletingId(`${FORM_PREFIX}${id}`)
    try {
      const res = await fetch(`/api/admin/forms/${id}`, {
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

  const hasMap = !!categories?.some((c) => c.kind === 'map')

  if (editingId === `${CAT_PREFIX}new`) {
    return (
      <CategoryEditor
        token={token}
        initial={null}
        hasMapCategory={hasMap}
        onSaved={() => {
          onCloseEditor()
          load()
        }}
        onCancel={onCloseEditor}
      />
    )
  }

  // Map/Zmanim rows never render an Edit button (see the list below), so this
  // only ever opens for a real listing category.
  if (editingId?.startsWith(CAT_PREFIX)) {
    const id = editingId.slice(CAT_PREFIX.length)
    const initial = categories?.find((c) => c.id === id && c.kind === 'listing') ?? null
    if (!initial) return <p className="text-sm text-muted">Loading…</p>
    return (
      <CategoryEditor
        token={token}
        initial={initial}
        hasMapCategory={hasMap}
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

  const hasZmanim = !!categories?.some((c) => c.kind === 'zmanim')

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm text-muted">
          Listing categories (Grocery Stores, Synagogues, …), Forms (Request Support, Volunteer), and
          the Map / Zmanim cards — choose what each shows, and edit their fields or questions.
        </p>
        <div className="flex shrink-0 gap-2">
          {!hasMap && (
            <button
              onClick={() => addSingleton('map')}
              disabled={addingSingleton === 'map'}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {addingSingleton === 'map' ? 'Adding…' : '+ Add Map'}
            </button>
          )}
          {!hasZmanim && (
            <button
              onClick={() => addSingleton('zmanim')}
              disabled={addingSingleton === 'zmanim'}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {addingSingleton === 'zmanim' ? 'Adding…' : '+ Add Zmanim'}
            </button>
          )}
          <button
            onClick={() => onOpenEditor(`${CAT_PREFIX}new`)}
            className="text-sm font-medium bg-primary text-white rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
          >
            + New category
          </button>
          <button
            onClick={addForm}
            disabled={addingForm}
            className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {addingForm ? 'Adding…' : '+ Add Form'}
          </button>
        </div>
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
            e.kind === 'category' && e.data.kind === 'listing' ? (
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
            ) : e.kind === 'category' ? (
              <SingletonRow
                key={`cat:${e.data.id}`}
                category={e.data}
                confirmingDelete={confirmDeleteId === e.data.id}
                deleting={deletingId === e.data.id}
                onAskDelete={() => setConfirmDeleteId(e.data.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteCategory(e.data.id)}
              />
            ) : (
              <FormRow
                key={`form:${e.data.id}`}
                form={e.data}
                confirmingDelete={confirmDeleteId === `${FORM_PREFIX}${e.data.id}`}
                deleting={deletingId === `${FORM_PREFIX}${e.data.id}`}
                onEdit={() => onOpenEditor(`${FORM_PREFIX}${e.data.id}`)}
                onAskDelete={() => setConfirmDeleteId(`${FORM_PREFIX}${e.data.id}`)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteFormEntry(e.data.id)}
              />
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

// A Map/Zmanim row — nothing to edit, just presence + a Delete button, reusing
// the exact same delete/confirm flow as a real listing category.
function SingletonRow({
  category: c,
  confirmingDelete,
  deleting,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  category: CategoryConfig
  confirmingDelete: boolean
  deleting: boolean
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const badgeLabel = c.kind === 'map' ? 'Map' : 'Zmanim'
  const description =
    c.kind === 'map'
      ? 'The sitewide Map — also unlocks the Map button on listing categories.'
      : 'The Zmanim & Shabbos card.'
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
            <span className={`${TYPE_BADGE} bg-emerald-50 text-emerald-600`}>{badgeLabel}</span>
            <span>{c.pluralLabel}</span>
          </p>
          <p className="text-xs text-muted mt-1">{description}</p>
        </div>
        <button
          onClick={onAskDelete}
          className="shrink-0 text-xs font-medium text-red-600 hover:underline cursor-pointer"
        >
          Delete
        </button>
      </div>

      {confirmingDelete && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
            <p className="text-sm text-red-800">
              Remove the <span className="font-semibold">{c.pluralLabel}</span> card from the site?
            </p>
            <div className="flex gap-2">
              <button
                onClick={onConfirmDelete}
                disabled={deleting}
                className="text-sm font-medium bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Removing…' : 'Remove'}
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

// 'support'/'volunteer' are wired directly into the home screen and their own
// wizard components — deleting them is blocked server-side (see formStore
// .deleteForm) and the Delete button is hidden here to match.
const PROTECTED_FORM_IDS = new Set(['support', 'volunteer'])

function FormRow({
  form: f,
  confirmingDelete,
  deleting,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  form: FormConfig
  confirmingDelete: boolean
  deleting: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const canDelete = !PROTECTED_FORM_IDS.has(f.id)
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onEdit}
            className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Edit
          </button>
          {canDelete && (
            <button
              onClick={onAskDelete}
              className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
            <p className="text-sm text-red-800">
              Permanently delete <span className="font-semibold">{f.title}</span> and every response to
              it? This can’t be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onConfirmDelete}
                disabled={deleting}
                className="text-sm font-medium bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Deleting…' : 'Delete form & responses'}
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
  hasAddress: boolean
  hasPhone: boolean
  upvotesEnabled: boolean
  capabilities: CategoryCapabilities
  /** The editable fields (everything shown on a card). */
  fields: CategoryField[]
  /** Fields with renderAs 'hidden' (caveat notes) — not editable here, but
   *  preserved as-is and re-merged on save so editing a category never drops
   *  or exposes them. */
  hiddenFields: CategoryField[]
  /** A button in the directory header linking out, e.g. "Other Mikvahs" →
   *  mikvah.org. Both blank means none. */
  externalLinkLabel: string
  externalLinkUrl: string
}

function toDraft(c: CategoryConfig | null): Draft {
  const all = (c?.detailFields ?? []).map((f) => ({ ...f }))
  return {
    label: c?.label ?? '',
    pluralLabel: c?.pluralLabel ?? '',
    description: c?.description ?? '',
    hasAddress: c?.hasAddress ?? true,
    hasPhone: c?.hasPhone ?? true,
    upvotesEnabled: !!c?.upvotesEnabled,
    capabilities: resolveCapabilities(c?.capabilities),
    fields: all.filter((f) => f.renderAs !== 'hidden'),
    hiddenFields: all.filter((f) => f.renderAs === 'hidden'),
    externalLinkLabel: c?.externalLink?.label ?? '',
    externalLinkUrl: c?.externalLink?.url ?? '',
  }
}

function CategoryEditor({
  token,
  initial,
  hasMapCategory,
  onSaved,
  onCancel,
}: {
  token: string
  initial: CategoryConfig | null
  /** Whether a Map pseudo-category currently exists — the "Map button"
   *  capability only makes sense (and is only offered) when there's a map for
   *  it to send this category's listings to. */
  hasMapCategory: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const isNew = initial === null
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [previewing, setPreviewing] = useState(false)
  // Set once a save attempt finds existing listings with data in a field the
  // admin just removed (or an address/phone toggle they just turned off) — a
  // confirmation gate before that data is wiped for real. Cleared on cancel or
  // once the confirmed save completes.
  const [pendingCleanup, setPendingCleanup] = useState<{
    address: number
    phone: number
    fields: Record<string, number>
    addressOff: boolean
    phoneOff: boolean
    removedKeys: string[]
  } | null>(null)

  // Preview gets its own history entry so browser/trackpad Back (and the
  // preview's own Up button, which calls closePreview) land back on this
  // editor instead of skipping past it to the category list.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      setPreviewing(!!(e.state as { editorPreview?: boolean } | null)?.editorPreview)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function closePreview() {
    history.back()
  }

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

  // Detail field keys that existed on the saved category but aren't in the
  // draft anymore — i.e. the admin removed them (not just renamed one, which
  // keeps the same key). Hidden fields are never offered for removal here, so
  // they're excluded from "before" on purpose.
  function removedFieldKeys(): string[] {
    if (!initial) return []
    const keptKeys = new Set(draft.fields.map((f) => f.key))
    return initial.detailFields.filter((f) => f.renderAs !== 'hidden' && !keptKeys.has(f.key)).map((f) => f.key)
  }

  function cancelCleanup() {
    setPendingCleanup(null)
  }

  async function save() {
    const errs = validate()
    if (errs.length) {
      setErrors(errs)
      return
    }
    setErrors([])

    // Editing an existing category, turning off address/phone or dropping a
    // field: check whether any existing listings actually have data there
    // before wiping it — skip the check once the admin has already confirmed
    // (pendingCleanup is set) so re-clicking Save doesn't loop.
    if (!isNew && !pendingCleanup) {
      const addressOff = initial!.hasAddress !== false && !draft.hasAddress
      const phoneOff = initial!.hasPhone !== false && !draft.hasPhone
      const removedKeys = removedFieldKeys()
      if (addressOff || phoneOff || removedKeys.length > 0) {
        setSaving(true)
        try {
          const res = await fetch(`/api/admin/categories/${initial!.id}/field-usage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ address: addressOff, phone: phoneOff, fieldKeys: removedKeys }),
          })
          const body = await res.json()
          if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not check existing listings.')
          const usage = body.usage as { address: number; phone: number; fields: Record<string, number> }
          const total = usage.address + usage.phone + Object.values(usage.fields).reduce((a, b) => a + b, 0)
          if (total > 0) {
            setPendingCleanup({ ...usage, addressOff, phoneOff, removedKeys })
            return
          }
        } catch (err) {
          setErrors([err instanceof Error ? err.message : 'Could not check existing listings.'])
          return
        } finally {
          setSaving(false)
        }
      }
    }

    setSaving(true)
    try {
      const payload = {
        label: draft.label,
        pluralLabel: draft.pluralLabel || draft.label,
        description: draft.description,
        hasAddress: draft.hasAddress,
        hasPhone: draft.hasPhone,
        upvotesEnabled: draft.upvotesEnabled,
        capabilities: draft.capabilities,
        externalLink:
          draft.externalLinkLabel.trim() && draft.externalLinkUrl.trim()
            ? { label: draft.externalLinkLabel.trim(), url: draft.externalLinkUrl.trim() }
            : null,
        // Apply the implied filter/tag rules, then re-merge the preserved hidden
        // fields so editing never drops them.
        fields: [...draft.fields.map(normalizeField), ...draft.hiddenFields],
        ...(pendingCleanup && {
          clearFields: {
            address: pendingCleanup.addressOff,
            phone: pendingCleanup.phoneOff,
            keys: pendingCleanup.removedKeys,
          },
        }),
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
      setPendingCleanup(null)
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
      kind: 'listing',
      hasAddress: draft.hasAddress,
      hasPhone: draft.hasPhone,
      upvotesEnabled: draft.upvotesEnabled,
      capabilities: draft.capabilities,
      externalLink:
        draft.externalLinkLabel.trim() && draft.externalLinkUrl.trim()
          ? { label: draft.externalLinkLabel.trim(), url: draft.externalLinkUrl.trim() }
          : null,
    }
    return <CategoryPreview category={previewCategory} onClose={closePreview} />
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
          <div className="pt-1 space-y-1.5">
            <span className="block text-xs font-medium text-slate-700">Every listing also has</span>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.hasAddress}
                onChange={(e) => set('hasAddress', e.target.checked)}
                className="rounded border-slate-300"
              />
              An address
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.hasPhone}
                onChange={(e) => set('hasPhone', e.target.checked)}
                className="rounded border-slate-300"
              />
              A phone number
            </label>
            <span className="block text-[11px] text-muted">
              On by default. Turn either off for listings that aren’t a physical place — like WhatsApp
              groups — and it disappears from the form and the card. With no address, distance sorting
              and the Map button don’t apply either.
            </span>
          </div>
          <div className="pt-1 space-y-1.5">
            <span className="block text-xs font-medium text-slate-700">External link (optional)</span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={draft.externalLinkLabel}
                onChange={(e) => set('externalLinkLabel', e.target.value)}
                className={`${inputClass} sm:w-1/3`}
                placeholder="Button text, e.g. Other Mikvahs"
              />
              <input
                value={draft.externalLinkUrl}
                onChange={(e) => set('externalLinkUrl', e.target.value)}
                className={`${inputClass} flex-1`}
                placeholder="https://…"
              />
            </div>
            <span className="block text-[11px] text-muted">
              Shown as its own button in this category’s directory, next to Map/Add — for pointing
              somewhere broader the site doesn’t curate itself. Not tied to any listing.
            </span>
          </div>
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
            {CATEGORY_CAPABILITY_KEYS.filter((k) => k !== 'map' || (hasMapCategory && draft.hasAddress)).map((k) => (
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
                  // Boolean fields make sense as an "audience" a field is
                  // scoped to (e.g. "Women's Tevillah") — a field can't be
                  // scoped to itself.
                  audienceOptions={draft.fields
                    .filter((other) => other.type === 'boolean' && other.key !== f.key)
                    .map((other) => ({ key: other.key, label: other.label }))}
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

        {pendingCleanup ? (
          <CleanupConfirm
            cleanup={pendingCleanup}
            initial={initial}
            saving={saving}
            onCancel={cancelCleanup}
            onConfirm={save}
          />
        ) : (
          <div className="flex gap-2">
            <button
              onClick={openPreview}
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
        )}
      </div>
    </div>
  )
}

// Blocks the save until the admin explicitly confirms wiping the field(s) they
// just removed (or turned off) from every existing listing in this category —
// irreversible, so it replaces the normal Save/Cancel row rather than being an
// easy-to-miss inline notice.
function CleanupConfirm({
  cleanup,
  initial,
  saving,
  onCancel,
  onConfirm,
}: {
  cleanup: { address: number; phone: number; fields: Record<string, number>; addressOff: boolean; phoneOff: boolean; removedKeys: string[] }
  initial: CategoryConfig | null
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const items: { label: string; count: number }[] = [
    ...(cleanup.addressOff && cleanup.address > 0 ? [{ label: 'Address', count: cleanup.address }] : []),
    ...(cleanup.phoneOff && cleanup.phone > 0 ? [{ label: 'Phone number', count: cleanup.phone }] : []),
    ...cleanup.removedKeys
      .filter((k) => (cleanup.fields[k] ?? 0) > 0)
      .map((k) => ({
        label: initial?.detailFields.find((f) => f.key === k)?.label ?? k,
        count: cleanup.fields[k],
      })),
  ]

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-amber-900">This will permanently clear data from existing listings</p>
      <ul className="text-sm text-amber-800 list-disc list-inside space-y-0.5">
        {items.map((it) => (
          <li key={it.label}>
            {it.label} — {it.count} listing{it.count !== 1 ? 's' : ''}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-700">This can&rsquo;t be undone. To keep the data, cancel and undo the removal above instead.</p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={saving}
          className="text-sm font-medium bg-red-600 text-white rounded-md px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Clear and save'}
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
  audienceOptions,
  onChange,
  onRemove,
  onMove,
}: {
  field: CategoryField
  index: number
  total: number
  canRequire: boolean
  /** The category's own boolean fields this one could be scoped to — see
   *  CategoryField.audienceKey. Empty when the category has no boolean
   *  fields yet. */
  audienceOptions: { key: string; label: string }[]
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

      {f.type === 'url' && (
        <>
          <label className="block sm:w-1/2">
            <span className={fieldLabel}>Button text</span>
            <input
              value={f.linkLabel ?? ''}
              onChange={(e) => onChange({ linkLabel: e.target.value })}
              className={inputClass}
              placeholder="e.g. Join Group"
            />
            <span className="block text-[11px] text-muted mt-0.5">Defaults to the detail&rsquo;s name if left blank.</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f.showInHeader}
              onChange={(e) => onChange({ showInHeader: e.target.checked })}
              className="rounded border-slate-300"
            />
            Show as a button on the card itself, not inside the details
          </label>
        </>
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

      {audienceOptions.length > 0 && (
        <label className="block sm:w-1/2">
          <span className={fieldLabel}>Only show when this filter is on (optional)</span>
          <select
            value={f.audienceKey ?? ''}
            onChange={(e) => onChange({ audienceKey: e.target.value || undefined })}
            className={inputClass}
          >
            <option value="">Always show</option>
            {audienceOptions.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <span className="block text-[11px] text-muted mt-0.5">
            When a visitor turns on that filter, cards hide every other audience-scoped detail —
            useful for things like separate men&rsquo;s/women&rsquo;s hours so they don&rsquo;t all show
            at once.
          </span>
        </label>
      )}

      {canRequire && (
        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
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
