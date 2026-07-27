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
import { CATEGORY_TEMPLATES, type CategoryTemplate } from '@/lib/categoryTemplates'
import { Card as HomeCard, TINTS } from '@/components/home/sections'
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

// A starter palette for the icon picker — common, recognizable choices for a
// community directory, grouped for scanability. Not exhaustive: the text
// field next to it accepts any emoji, so this is a shortcut, not a limit.
const ICON_CHOICES: { group: string; options: { emoji: string; label: string }[] }[] = [
  {
    group: 'Places',
    options: [
      { emoji: '🏫', label: 'School' },
      { emoji: '🏥', label: 'Hospital' },
      { emoji: '🏨', label: 'Hotel' },
      { emoji: '🏠', label: 'House' },
      { emoji: '🏢', label: 'Building' },
      { emoji: '🕍', label: 'Synagogue' },
      { emoji: '💧', label: 'Water drop' },
      { emoji: '🏦', label: 'Bank' },
      { emoji: '📚', label: 'Library' },
    ],
  },
  {
    group: 'Food & shopping',
    options: [
      { emoji: '🍽️', label: 'Restaurant' },
      { emoji: '🛒', label: 'Grocery cart' },
      { emoji: '☕', label: 'Cafe' },
      { emoji: '🍞', label: 'Bakery' },
      { emoji: '🛍️', label: 'Shopping' },
    ],
  },
  {
    group: 'People & community',
    options: [
      { emoji: '🧑‍🤝‍🧑', label: 'People' },
      { emoji: '🤝', label: 'Handshake' },
      { emoji: '💛', label: 'Heart' },
      { emoji: '👶', label: 'Childcare' },
      { emoji: '🙏', label: 'Prayer' },
    ],
  },
  {
    group: 'Symbols & info',
    options: [
      { emoji: '✡️', label: 'Star of David' },
      { emoji: '🕯️', label: 'Candle' },
      { emoji: '🗺️', label: 'Map' },
      { emoji: '💬', label: 'Chat' },
      { emoji: '📅', label: 'Calendar' },
      { emoji: '☎️', label: 'Phone' },
      { emoji: '🌐', label: 'Website' },
      { emoji: '📋', label: 'Clipboard (default)' },
    ],
  },
]

const CAPABILITY_LABELS: Record<keyof CategoryCapabilities, string> = {
  add: 'Add button',
  edit: 'Edit button',
  report: 'Report button',
  directorySearch: 'Search bar',
  map: 'Map button',
}

// The singleton pseudo-categories an admin can add/remove but never edit —
// there's nothing to configure, they just turn a fixed, code-driven screen on
// or off. See CategoryConfig.kind.
const SINGLETON_KIND_LABELS = {
  map: 'Map',
  zmanim: 'Zmanim',
  eruv: 'Eruv Information',
  medical: 'Jewish Medical Resources',
} as const
type SingletonKind = keyof typeof SINGLETON_KIND_LABELS

// A fitting default icon for each — set at creation since there's no editor
// screen to pick one later.
const SINGLETON_ICONS: Record<SingletonKind, string> = {
  map: '🗺️',
  zmanim: '🕯️',
  eruv: '🧵',
  medical: '🏥',
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
  const [addingSingleton, setAddingSingleton] = useState<SingletonKind | null>(null)

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

  // Adds a singleton pseudo-category (Map, Zmanim, Eruv Information, Jewish
  // Medical Resources) directly — there's nothing to configure, so this skips
  // the editor entirely. The DB's partial unique index (category_kind_singleton)
  // is the real guard against a second one; hiding the button once one exists
  // (see the render below) is just UX.
  async function addSingleton(kind: SingletonKind) {
    setError(null)
    setAddingSingleton(kind)
    try {
      const label = SINGLETON_KIND_LABELS[kind]
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label, pluralLabel: label, kind, icon: SINGLETON_ICONS[kind] }),
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

  if (editingId?.startsWith(CAT_PREFIX)) {
    const id = editingId.slice(CAT_PREFIX.length)
    const initial = categories?.find((c) => c.id === id) ?? null
    if (!initial) return <p className="text-sm text-muted">Loading…</p>
    // Map/Zmanim/Eruv only offer the lightweight icon/background editor
    // (see SINGLETON_EDITABLE_KINDS) — everything else is a real category.
    if (initial.kind !== 'listing') {
      return (
        <SingletonEditor
          token={token}
          category={initial}
          onSaved={() => {
            onCloseEditor()
            load()
          }}
          onCancel={onCloseEditor}
        />
      )
    }
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

  if (editingId === `${FORM_PREFIX}new`) {
    return (
      <FormEditor
        token={token}
        form={null}
        onDone={() => {
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

  const missingSingletons = (Object.keys(SINGLETON_KIND_LABELS) as SingletonKind[]).filter(
    (kind) => !categories?.some((c) => c.kind === kind),
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm text-muted">
          Listing categories (Grocery Stores, Synagogues, …), Forms (Request Support, Volunteer), and
          the Map / Zmanim / Eruv Information / Jewish Medical Resources cards — choose what each
          shows, and edit their fields or questions.
        </p>
        <div className="flex shrink-0 gap-2 flex-wrap">
          {missingSingletons.map((kind) => (
            <button
              key={kind}
              onClick={() => addSingleton(kind)}
              disabled={addingSingleton === kind}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {addingSingleton === kind ? 'Adding…' : `+ Add ${SINGLETON_KIND_LABELS[kind]}`}
            </button>
          ))}
          <button
            onClick={() => onOpenEditor(`${CAT_PREFIX}new`)}
            className="text-sm font-medium bg-primary text-white rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
          >
            + New category
          </button>
          <button
            onClick={() => onOpenEditor(`${FORM_PREFIX}new`)}
            className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            + Add Form
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
                onEdit={() => onOpenEditor(`${CAT_PREFIX}${e.data.id}`)}
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

// The fixed copy for each singleton row's badge + description.
const SINGLETON_DESCRIPTIONS: Record<SingletonKind, string> = {
  map: 'The sitewide Map — also unlocks the Map button on listing categories.',
  zmanim: 'The Zmanim & Shabbos card.',
  eruv: 'The Eruv Information card.',
  medical: 'The Jewish Medical Resources card — per-hospital Jewish life.',
}

// A Map/Zmanim/Eruv/Medical row — nothing to edit but icon/background (see
// SingletonEditor), plus a Delete button, reusing the exact same delete/
// confirm flow as a real listing category.
const SINGLETON_EDITABLE_KINDS = new Set<SingletonKind>(['map', 'zmanim', 'eruv', 'medical'])

function SingletonRow({
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
  const kind = c.kind as SingletonKind
  const badgeLabel = SINGLETON_KIND_LABELS[kind]
  const description = SINGLETON_DESCRIPTIONS[kind]
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
        <div className="flex shrink-0 items-center gap-2">
          {SINGLETON_EDITABLE_KINDS.has(kind) && (
            <button
              onClick={onEdit}
              className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Edit
            </button>
          )}
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

// A lightweight editor for Map/Zmanim/Eruv/Medical — no fields to change (it's
// a fixed, code-driven screen), just the card's name, icon, and home-screen
// photo/text color, reusing the exact same fields as the full category editor.
function SingletonEditor({
  token,
  category,
  onSaved,
  onCancel,
}: {
  token: string
  category: CategoryConfig
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(category.pluralLabel)
  const [icon, setIcon] = useState(category.icon || '')
  const [cardImageUrl, setCardImageUrl] = useState(category.cardImageUrl ?? '')
  const [cardTextColor, setCardTextColor] = useState(category.cardTextColor || '#ffffff')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function save() {
    setErrors([])
    if (!name.trim()) {
      setErrors(['Name is required.'])
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          label: name.trim(),
          pluralLabel: name.trim(),
          icon,
          cardImageUrl: cardImageUrl.trim() || null,
          cardTextColor: cardImageUrl.trim() ? cardTextColor : null,
        }),
      })
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
      <h2 className="text-lg font-semibold text-slate-900 mb-1">
        Edit “{category.pluralLabel}”
        <span className="ml-2 text-xs font-normal text-muted">{category.id}</span>
      </h2>
      <p className="text-xs text-muted mb-4">
        This is a fixed, code-driven card — only its name, icon, and home-screen appearance are
        editable here.
      </p>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="block text-[11px] text-muted mt-1">The card&rsquo;s title on the home screen.</span>
        </label>
        <IconField icon={icon} onChange={setIcon} />
        <CardBackgroundField
          cardImageUrl={cardImageUrl}
          onCardImageUrl={setCardImageUrl}
          cardTextColor={cardTextColor}
          onCardTextColor={setCardTextColor}
          previewIcon={icon}
          previewTitle={name || category.pluralLabel}
        />
      </section>

      {errors.length > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
          {errors.map((e) => (
            <p key={e} className="text-sm text-red-700">{e}</p>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
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
          {/* Rendered (but hidden) even when this form can't be deleted, so
              every row's Edit button sits in the same spot — a row with no
              Delete button shouldn't shift Edit over to fill the gap. */}
          <button
            onClick={onAskDelete}
            className={`text-xs font-medium text-red-600 hover:underline cursor-pointer ${canDelete ? '' : 'invisible'}`}
            aria-hidden={!canDelete}
            tabIndex={canDelete ? 0 : -1}
          >
            Delete
          </button>
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
  /** One emoji shown on the card (home grid, map legend, admin list). */
  icon: string
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
  /** Whether the external-link button section is turned on — kept separate
   *  from the label/url text so unchecking hides the fields without losing
   *  whatever was typed (in case the admin re-checks it). */
  externalLinkEnabled: boolean
  /** A button in the directory header linking out, e.g. "Other Mikvahs" →
   *  mikvah.org. Both blank means none. */
  externalLinkLabel: string
  externalLinkUrl: string
  /** Photo shown as the home-screen card's background instead of the flat
   *  tint. Blank means none — the text color below is only used when this
   *  is set. */
  cardImageUrl: string
  /** Text color over the card image (a hex string). */
  cardTextColor: string
}

function toDraft(c: CategoryConfig | null): Draft {
  const all = (c?.detailFields ?? []).map((f) => ({ ...f }))
  return {
    label: c?.label ?? '',
    pluralLabel: c?.pluralLabel ?? '',
    icon: c?.icon ?? '',
    description: c?.description ?? '',
    hasAddress: c?.hasAddress ?? true,
    hasPhone: c?.hasPhone ?? true,
    upvotesEnabled: !!c?.upvotesEnabled,
    capabilities: resolveCapabilities(c?.capabilities),
    fields: all.filter((f) => f.renderAs !== 'hidden'),
    hiddenFields: all.filter((f) => f.renderAs === 'hidden'),
    externalLinkEnabled: !!c?.externalLink,
    externalLinkLabel: c?.externalLink?.label ?? '',
    externalLinkUrl: c?.externalLink?.url ?? '',
    cardImageUrl: c?.cardImageUrl ?? '',
    cardTextColor: c?.cardTextColor || '#ffffff',
  }
}

// The emoji field + curated browse panel — shared by the full category editor
// and SingletonEditor (Map/Zmanim/Eruv), which has nothing else to edit.
export function IconField({ icon, onChange }: { icon: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">Icon</span>
      <div className="flex gap-2">
        {/* inputClass bakes in w-full — wrap it rather than adding a competing
            w-16 to the same className, which Tailwind doesn't resolve by
            source order and would silently lose to w-full. */}
        <div className="w-16 shrink-0">
          <input
            value={icon}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} text-center text-lg`}
            placeholder={DEFAULT_CATEGORY_ICON}
            maxLength={4}
            aria-label="Icon"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-medium border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          {open ? 'Hide icons' : 'Browse icons…'}
        </button>
      </div>
      {/* A plain scrolling div, not a native <select> — the browser's own
          dropdown popup can't be restyled (comes out cramped regardless of
          how the closed control is sized) and its built-in overflow arrows
          only scroll one direction at a time. This scrolls like any other
          page content. */}
      {open && (
        <div className="mt-2 border border-slate-200 rounded-md p-2 max-h-52 overflow-y-auto space-y-2 bg-slate-50/60">
          {ICON_CHOICES.map((group) => (
            <div key={group.group}>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                {group.group}
              </span>
              <div className="flex flex-wrap gap-1">
                {group.options.map((o) => (
                  <button
                    key={o.emoji}
                    type="button"
                    onClick={() => { onChange(o.emoji); setOpen(false) }}
                    title={o.label}
                    className={`text-lg leading-none rounded-md px-2 py-1.5 transition-colors cursor-pointer ${
                      icon === o.emoji ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-white'
                    }`}
                  >
                    {o.emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <span className="block text-[11px] text-muted mt-1">
        Browse a curated list, or type/paste any emoji directly into the box. Used as the map
        marker, and as the card icon if no background photo is set.
      </span>
    </label>
  )
}

// The image-URL + text-color fields + live preview — shared by the full
// category editor and SingletonEditor.
export function CardBackgroundField({
  cardImageUrl,
  onCardImageUrl,
  cardTextColor,
  onCardTextColor,
  previewIcon,
  previewTitle,
}: {
  cardImageUrl: string
  onCardImageUrl: (value: string) => void
  cardTextColor: string
  onCardTextColor: (value: string) => void
  previewIcon: string
  previewTitle: string
}) {
  return (
    <div className="pt-1">
      <span className="block text-xs font-medium text-slate-700 mb-1">Home-screen card background (optional)</span>
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <input
            value={cardImageUrl}
            onChange={(e) => onCardImageUrl(e.target.value)}
            className={inputClass}
            placeholder="https://… (a photo instead of the flat tint)"
          />
          {cardImageUrl.trim() && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <span className="text-xs font-medium text-slate-700">Text color</span>
              <input
                type="color"
                value={cardTextColor}
                onChange={(e) => onCardTextColor(e.target.value)}
                className="h-8 w-14 rounded border border-slate-300 cursor-pointer"
              />
            </label>
          )}
          <span className="block text-[11px] text-muted">
            A pasted image URL, not an upload. A dark gradient is applied automatically so the
            title stays readable — the icon above stops showing once a photo is set (an emoji over
            a photo doesn&rsquo;t read as a clean icon). The color picker only affects the title
            text, not the photo.
          </span>
        </div>
        {/* A live preview using the exact same Card the home screen renders,
            so what's shown here is what visitors will see. */}
        <div className="w-32 shrink-0">
          <HomeCard
            card={{
              title: previewTitle,
              icon: previewIcon || undefined,
              cardImageUrl: cardImageUrl.trim() || null,
              cardTextColor: cardImageUrl.trim() ? cardTextColor : null,
              go: () => {},
            }}
            tint={TINTS[0]}
          />
        </div>
      </div>
    </div>
  )
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
  // The most recently applied template, if any — stays visible/pickable
  // afterward (see the render below) so switching to a different one is just
  // another click. Tracked so a *second* apply can tell "still the first
  // template's name/icon, safe to swap in the new one" apart from "the admin
  // already customized this," which should be left alone.
  const [lastAppliedTemplate, setLastAppliedTemplate] = useState<CategoryTemplate | null>(null)
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
  // The "+ Add audience group" mini-form's own draft state — separate from
  // `draft` since it's discarded on cancel and only ever produces a batch of
  // new fields, never edits an existing one.
  const [groupForm, setGroupForm] = useState<{
    audienceKey: string
    prefix: string
    phone: boolean
    email: boolean
    hours: boolean
    notes: boolean
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

  // Pre-fills the draft's fields/capabilities from a starter template — only
  // offered on a brand-new category (see the picker below); a category with
  // real listings already has data under specific field keys, so templates
  // don't retrofit onto those. Stays pickable after applying one, so trying a
  // different template is just another click — re-applying always replaces
  // fields/capabilities, but name/icon/description/card image are only
  // swapped in if they still match the *previous* template's own values (i.e.
  // the admin hasn't customized them); anything typed by hand, before or
  // after, is left alone.
  function applyTemplate(templateId: string) {
    const template = CATEGORY_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    setDraft((d) => ({
      ...d,
      pluralLabel: lastAppliedTemplate
        ? (d.pluralLabel === lastAppliedTemplate.pluralLabel ? template.pluralLabel : d.pluralLabel)
        : (d.pluralLabel || template.pluralLabel),
      label: lastAppliedTemplate
        ? (d.label === singularize(lastAppliedTemplate.pluralLabel) ? singularize(template.pluralLabel) : d.label)
        : (d.label || singularize(template.pluralLabel)),
      icon: lastAppliedTemplate
        ? (d.icon === (lastAppliedTemplate.icon ?? '') ? (template.icon ?? '') : d.icon)
        : (d.icon || template.icon || ''),
      description: lastAppliedTemplate
        ? (d.description === (lastAppliedTemplate.categoryDescription ?? '') ? (template.categoryDescription ?? '') : d.description)
        : (d.description || template.categoryDescription || ''),
      cardImageUrl: lastAppliedTemplate
        ? (d.cardImageUrl === (lastAppliedTemplate.cardImageUrl ?? '') ? (template.cardImageUrl ?? '') : d.cardImageUrl)
        : (d.cardImageUrl || template.cardImageUrl || ''),
      cardTextColor: lastAppliedTemplate
        ? (d.cardTextColor === (lastAppliedTemplate.cardTextColor ?? '#ffffff') ? (template.cardTextColor ?? '#ffffff') : d.cardTextColor)
        : (template.cardTextColor || d.cardTextColor),
      hasAddress: template.hasAddress ?? d.hasAddress,
      hasPhone: template.hasPhone ?? d.hasPhone,
      upvotesEnabled: template.upvotesEnabled ?? d.upvotesEnabled,
      capabilities: { ...d.capabilities, ...template.capabilities },
      fields: template.fields.map((f) => ({ ...f })),
    }))
    setLastAppliedTemplate(template)
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

  // Adds a standard Phone/Email/Hours/Notes set in one action, each tagged
  // with the chosen audienceKey — the quick way to set up a mikvah-style
  // "click the checkbox, see that audience's fields" group without adding
  // four fields one at a time. See the audience-group panel below.
  function addAudienceGroup() {
    if (!groupForm) return
    const { audienceKey, prefix, phone, email, hours, notes } = groupForm
    const p = prefix.trim()
    if (!audienceKey || !p) return

    const usedKeys = new Set([...draft.fields, ...draft.hiddenFields].map((f) => f.key))
    function nextKey(label: string): string {
      const base = slugifyFieldKey(label)
      let key = base
      for (let n = 2; usedKeys.has(key); n++) key = `${base}${n}`
      usedKeys.add(key)
      return key
    }

    // Full label (e.g. "Women's Phone") for the card, which doesn't group by
    // section; shortLabel (e.g. "Phone") for the intake form's collapsible
    // section, where the heading already says who it's for.
    const newFields: CategoryField[] = []
    if (hours) newFields.push({ key: nextKey(`${p} Hours`), label: `${p} Hours`, shortLabel: 'Hours', type: 'hours', renderAs: 'row', filterable: true, audienceKey })
    if (phone) newFields.push({ key: nextKey(`${p} Phone`), label: `${p} Phone`, shortLabel: 'Phone', type: 'tel', renderAs: 'row', filterable: false, audienceKey })
    if (email) newFields.push({ key: nextKey(`${p} Email`), label: `${p} Email`, shortLabel: 'Email', type: 'text', renderAs: 'row', filterable: false, audienceKey })
    if (notes) newFields.push({ key: nextKey(`${p} Notes`), label: `${p} Notes`, shortLabel: 'Notes', type: 'textarea', renderAs: 'row', filterable: false, audienceKey })
    if (newFields.length === 0) return

    setDraft((d) => ({ ...d, fields: [...d.fields, ...newFields] }))
    setGroupForm(null)
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
        icon: draft.icon,
        description: draft.description,
        hasAddress: draft.hasAddress,
        hasPhone: draft.hasPhone,
        upvotesEnabled: draft.upvotesEnabled,
        capabilities: draft.capabilities,
        externalLink:
          draft.externalLinkEnabled && draft.externalLinkLabel.trim() && draft.externalLinkUrl.trim()
            ? { label: draft.externalLinkLabel.trim(), url: draft.externalLinkUrl.trim() }
            : null,
        cardImageUrl: draft.cardImageUrl.trim() || null,
        cardTextColor: draft.cardImageUrl.trim() ? draft.cardTextColor : null,
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
      icon: draft.icon.trim() || DEFAULT_CATEGORY_ICON,
      description: draft.description,
      detailFields: [...draft.fields.map(normalizeField), ...draft.hiddenFields],
      kind: 'listing',
      hasAddress: draft.hasAddress,
      hasPhone: draft.hasPhone,
      upvotesEnabled: draft.upvotesEnabled,
      capabilities: draft.capabilities,
      externalLink:
        draft.externalLinkEnabled && draft.externalLinkLabel.trim() && draft.externalLinkUrl.trim()
          ? { label: draft.externalLinkLabel.trim(), url: draft.externalLinkUrl.trim() }
          : null,
      cardImageUrl: draft.cardImageUrl.trim() || null,
      cardTextColor: draft.cardImageUrl.trim() ? draft.cardTextColor : null,
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
        {isNew && CATEGORY_TEMPLATES.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
            <span className="block text-xs font-medium text-slate-700">Start from a template (optional)</span>
            {/* Compact chips rather than a card per template — hover (or a
                screen reader's accessible name) surfaces what makes each
                template's shape distinctive via `title`, so the list can grow
                without eating the whole screen. Stays visible after applying
                one (rather than disappearing once fields exist) so trying a
                different shape is just another click. */}
            <div className="flex flex-wrap gap-2">
              {CATEGORY_TEMPLATES.map((t) => {
                const active = lastAppliedTemplate?.id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    title={t.description}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border border-primary bg-primary/5 text-primary'
                        : 'border border-slate-300 text-slate-700 hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    {t.icon && <span aria-hidden="true">{t.icon}</span>}
                    {t.label}
                  </button>
                )
              })}
            </div>
            <span className="block text-[11px] text-muted">
              Hover a template to see what makes its shape distinctive. Applying one replaces the
              details below with its fields — everything stays fully editable, and picking a different
              template swaps in that one&rsquo;s fields instead.
            </span>
          </section>
        )}

        {/* Presentation — just the front card itself: what a visitor actually
            sees on the home screen. Icon and Description moved out (below) —
            neither renders on the card once a background photo is set (every
            built-in category has one today), so they belong with the other
            behind-the-scenes settings instead. */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Name *</span>
            <input value={draft.pluralLabel} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Schools" />
            <span className="block text-[11px] text-muted mt-1">
              Plural, as it appears on the card. The singular (for “Add a …”) is derived automatically.
            </span>
          </label>
          <CardBackgroundField
            cardImageUrl={draft.cardImageUrl}
            onCardImageUrl={(v) => set('cardImageUrl', v)}
            cardTextColor={draft.cardTextColor}
            onCardTextColor={(v) => set('cardTextColor', v)}
            previewIcon={draft.icon}
            previewTitle={draft.pluralLabel || 'Category'}
          />
        </section>

        {/* Capabilities */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">What this category shows</h3>
          <p className="text-xs text-muted mb-3">
            Turn an affordance off to hide it (and block that action on the server) for this category
            only. These sit under the site-wide switches — if something is off site-wide, it stays off
            here regardless.
          </p>
          <label className="block mb-3">
            <span className="block text-xs font-medium text-slate-700 mb-1">Description</span>
            <input value={draft.description} onChange={(e) => set('description', e.target.value)} className={inputClass} placeholder="e.g. Kosher and local grocery stores near the hospital" />
            <span className="block text-[11px] text-muted mt-1">
              Not shown to visitors directly — helps this category surface when someone searches for
              a word that&rsquo;s in here but not in the name.
            </span>
          </label>
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
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.externalLinkEnabled}
                onChange={(e) => set('externalLinkEnabled', e.target.checked)}
                className="rounded border-slate-300"
              />
              External link
            </label>
          </div>
          {draft.capabilities.map && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <IconField icon={draft.icon} onChange={(v) => set('icon', v)} />
              <span className="block text-[11px] text-muted mt-1">
                Used as this category&rsquo;s marker on the map.
              </span>
            </div>
          )}
          {draft.externalLinkEnabled && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
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
          )}
        </section>

        {/* Details */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-800">Details</h3>
            <div className="flex items-center gap-3">
              {draft.fields.some((f) => f.type === 'boolean') && (
                <button
                  onClick={() => setGroupForm({ audienceKey: '', prefix: '', phone: true, email: true, hours: true, notes: false })}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  + Add audience group
                </button>
              )}
              <button onClick={addField} className="text-xs font-medium text-primary hover:underline cursor-pointer">
                + Add detail
              </button>
            </div>
          </div>
          <p className="text-xs text-muted mb-3">
            What each listing shows, beyond its name, address, and phone.
          </p>

          <div className="pb-4 mb-4 border-b border-slate-100 space-y-1.5">
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

          {groupForm && (
            <div className="border border-primary/40 rounded-md p-3 mb-3 bg-primary/5 space-y-2.5">
              <p className="text-xs font-medium text-slate-700">
                Add a Phone/Email/Hours/Notes set, all scoped to one filter — e.g. pick &ldquo;Women&rsquo;s
                Tevillah&rdquo; and prefix &ldquo;Women&rsquo;s&rdquo; to add Women&rsquo;s Phone, Women&rsquo;s
                Email, and Women&rsquo;s Hours in one go.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="block sm:w-1/2">
                  <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Which filter</span>
                  <select
                    value={groupForm.audienceKey}
                    onChange={(e) => setGroupForm((g) => (g ? { ...g, audienceKey: e.target.value } : g))}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {draft.fields.filter((f) => f.type === 'boolean').map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:w-1/2">
                  <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Label prefix</span>
                  <input
                    value={groupForm.prefix}
                    onChange={(e) => setGroupForm((g) => (g ? { ...g, prefix: e.target.value } : g))}
                    className={inputClass}
                    placeholder="e.g. Women's"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {([['hours', 'Hours'], ['phone', 'Phone'], ['email', 'Email'], ['notes', 'Notes']] as const).map(([key, lbl]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupForm[key]}
                      onChange={(e) => setGroupForm((g) => (g ? { ...g, [key]: e.target.checked } : g))}
                      className="rounded border-slate-300"
                    />
                    {lbl}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addAudienceGroup}
                  disabled={!groupForm.audienceKey || !groupForm.prefix.trim()}
                  className="text-xs font-medium bg-primary text-white rounded px-3 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Add fields
                </button>
                <button
                  onClick={() => setGroupForm(null)}
                  className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

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

  // Choices textarea: kept as its own local, uncontrolled-feeling string
  // instead of round-tripping every keystroke through parseOptions →
  // serializeOptions. That round trip immediately trimmed each line and
  // dropped empty ones, so pressing Enter (a blank line) or typing a
  // trailing space in a multi-word choice got silently erased on the very
  // next render — Enter and Space effectively did nothing. Only parse (and
  // re-normalize) on blur, once the admin's done editing that line.
  const [choicesText, setChoicesText] = useState(() => serializeOptions(f.options))
  useEffect(() => {
    setChoicesText(serializeOptions(f.options))
    // Only resync from the field's own saved options when switching to a
    // genuinely different field (its stable `key`, not the array index,
    // which stays the same slot across a reorder) — not on every render,
    // which would fight the admin's in-progress typing above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.key])

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
            value={choicesText}
            onChange={(e) => setChoicesText(e.target.value)}
            onBlur={(e) => onChange({ options: parseOptions(e.target.value) })}
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

      {f.audienceKey && (
        <label className="block sm:w-1/2">
          <span className={fieldLabel}>Short label in that section (optional)</span>
          <input
            value={f.shortLabel ?? ''}
            onChange={(e) => onChange({ shortLabel: e.target.value || undefined })}
            className={inputClass}
            placeholder="e.g. Phone"
          />
          <span className="block text-[11px] text-muted mt-0.5">
            Shown instead of the full name in the intake form&rsquo;s collapsible section (e.g.
            &ldquo;Phone&rdquo; instead of &ldquo;Women&rsquo;s Phone&rdquo;, since the section heading
            already says who it&rsquo;s for). The card still uses the full name above.
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
