'use client'

import { useCallback, useMemo, useState } from 'react'
import { CATEGORY_CAPABILITY_KEYS, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import type { FormConfig } from '@/lib/forms'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import FormEditor from './FormEditor'
import { CategoryEditor } from './CategoryEditor'
import { CardBackgroundField, IconField } from './CategoryFormFields'
import { CAPABILITY_LABELS } from './categoryEditorLogic'

// ── The categories manager: one list mixing the two kinds of thing a
// community configures — Listing categories (Grocery Stores, Synagogues, …,
// each with its own detail fields and capabilities) and Forms (Request
// Support / Volunteer, plus any custom form an admin creates). Add/edit/
// delete either kind; a custom form's responses live in /admin's Responses
// tab (see ResponsesManager.tsx), not here. Mounted on /admin. Listing writes
// go through /api/admin/categories; form writes through /api/admin/forms. ──

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
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [catRes, formRes] = await Promise.all([
        fetch('/api/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/forms', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const catBody = await parseOkJson<{ categories: CategoryConfig[] }>(catRes, 'Failed to load categories.')
      const formBody = await parseOkJson<{ forms: FormConfig[] }>(formRes, 'Failed to load forms.')
      setCategories(catBody.categories)
      setForms(formBody.forms)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useLoadOnMount(load)

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
      await fetchJson(
        '/api/admin/categories',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ label, pluralLabel: label, kind, icon: SINGLETON_ICONS[kind] }),
        },
        'Could not add it.',
      )
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it.')
    } finally {
      setAddingSingleton(null)
    }
  }

  // Flips a category's (or singleton's) public visibility immediately — no
  // need to open the full editor. Same PATCH endpoint the editor itself
  // uses; `active` is just one more field in the patch.
  async function toggleCategoryActive(id: string, active: boolean) {
    setError(null)
    setTogglingId(id)
    try {
      await fetchJson(
        `/api/admin/categories/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ active }),
        },
        'Could not update visibility.',
      )
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update visibility.')
    } finally {
      setTogglingId(null)
    }
  }

  // Same idea as toggleCategoryActive, but forms have their own dedicated
  // endpoint (see /api/admin/forms/:id/active) since the main forms PATCH
  // only ever writes a draft, never the published row directly.
  async function toggleFormActive(id: string, active: boolean) {
    setError(null)
    setTogglingId(`${FORM_PREFIX}${id}`)
    try {
      await fetchJson(
        `/api/admin/forms/${id}/active`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ active }),
        },
        'Could not update visibility.',
      )
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update visibility.')
    } finally {
      setTogglingId(null)
    }
  }

  async function deleteCategory(id: string) {
    setError(null)
    setDeletingId(id)
    try {
      await fetchJson(
        `/api/admin/categories/${id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Delete failed.',
      )
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
      await fetchJson(
        `/api/admin/forms/${id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Delete failed.',
      )
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
                toggling={togglingId === e.data.id}
                onEdit={() => onOpenEditor(`${CAT_PREFIX}${e.data.id}`)}
                onAskDelete={() => setConfirmDeleteId(e.data.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteCategory(e.data.id)}
                onToggleActive={(active) => toggleCategoryActive(e.data.id, active)}
              />
            ) : e.kind === 'category' ? (
              <SingletonRow
                key={`cat:${e.data.id}`}
                category={e.data}
                confirmingDelete={confirmDeleteId === e.data.id}
                deleting={deletingId === e.data.id}
                toggling={togglingId === e.data.id}
                onEdit={() => onOpenEditor(`${CAT_PREFIX}${e.data.id}`)}
                onAskDelete={() => setConfirmDeleteId(e.data.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteCategory(e.data.id)}
                onToggleActive={(active) => toggleCategoryActive(e.data.id, active)}
              />
            ) : (
              <FormRow
                key={`form:${e.data.id}`}
                form={e.data}
                confirmingDelete={confirmDeleteId === `${FORM_PREFIX}${e.data.id}`}
                deleting={deletingId === `${FORM_PREFIX}${e.data.id}`}
                toggling={togglingId === `${FORM_PREFIX}${e.data.id}`}
                onEdit={() => onOpenEditor(`${FORM_PREFIX}${e.data.id}`)}
                onAskDelete={() => setConfirmDeleteId(`${FORM_PREFIX}${e.data.id}`)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteFormEntry(e.data.id)}
                onToggleActive={(active) => toggleFormActive(e.data.id, active)}
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

// Flips public visibility right from the list — no need to open the full
// editor just to hide something. Shared by category, singleton, and form
// rows alike, since they all patch the same `active` concept.
function VisibilityToggle({
  active,
  toggling,
  onToggle,
}: {
  active: boolean
  toggling: boolean
  onToggle: (active: boolean) => void
}) {
  return (
    <button
      onClick={() => onToggle(!active)}
      disabled={toggling}
      title={active ? 'Visible on the site — click to hide' : 'Hidden from the site — click to show'}
      className={`text-xs font-medium rounded px-3 py-1.5 border transition-colors disabled:opacity-60 cursor-pointer ${
        active
          ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
          : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
      }`}
    >
      {toggling ? '…' : active ? 'Visible' : 'Hidden'}
    </button>
  )
}

function CategoryRow({
  category: c,
  confirmingDelete,
  deleting,
  toggling,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleActive,
}: {
  category: CategoryConfig
  confirmingDelete: boolean
  deleting: boolean
  toggling: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onToggleActive: (active: boolean) => void
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
          <VisibilityToggle active={c.active !== false} toggling={toggling} onToggle={onToggleActive} />
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
  toggling,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleActive,
}: {
  category: CategoryConfig
  confirmingDelete: boolean
  deleting: boolean
  toggling: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onToggleActive: (active: boolean) => void
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
          <VisibilityToggle active={c.active !== false} toggling={toggling} onToggle={onToggleActive} />
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
export function SingletonEditor({
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
  const [iconImageUrl, setIconImageUrl] = useState(category.iconImageUrl ?? '')
  const [cardImageUrl, setCardImageUrl] = useState(category.cardImageUrl ?? '')
  const [cardTextColor, setCardTextColor] = useState(category.cardTextColor || '#ffffff')
  // Map only — kept as a string (not number|null) so the field can sit blank
  // mid-edit rather than snapping to 0. Parsed back to number|null on save.
  const [mapZoomRadius, setMapZoomRadius] = useState(
    category.kind === 'map' && category.mapZoomRadiusMiles != null ? String(category.mapZoomRadiusMiles) : '',
  )
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
      await fetchJson(
        `/api/admin/categories/${category.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            label: name.trim(),
            pluralLabel: name.trim(),
            icon,
            iconImageUrl: iconImageUrl.trim() || null,
            cardImageUrl: cardImageUrl.trim() || null,
            cardTextColor: cardImageUrl.trim() ? cardTextColor : null,
            ...(category.kind === 'map'
              ? { mapZoomRadiusMiles: mapZoomRadius.trim() === '' ? null : Number(mapZoomRadius) }
              : {}),
          }),
        },
        'Save failed.',
      )
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
        This is a fixed, code-driven card — only its name, icon, home-screen appearance
        {category.kind === 'map' ? ', and zoom behavior are' : ' are'} editable here.
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
        <IconField icon={icon} onChange={setIcon} iconImageUrl={iconImageUrl} onIconImageUrl={setIconImageUrl} token={token} />
        <CardBackgroundField
          cardImageUrl={cardImageUrl}
          onCardImageUrl={setCardImageUrl}
          cardTextColor={cardTextColor}
          onCardTextColor={setCardTextColor}
          previewIcon={icon}
          previewTitle={name || category.pluralLabel}
        />
        {category.kind === 'map' && (
          <label className="block pt-3 border-t border-slate-100">
            <span className="block text-xs font-medium text-slate-700 mb-1">Zoom radius</span>
            <span className="block text-[11px] text-muted mb-2">
              How far (in miles) a listing can be from the visitor — or the community center, if no
              location is set — and still count toward the map zooming out to fit everything when a
              category is selected or searched. A far-off listing (e.g. a delivery-only address) is
              still shown as a pin either way; this only keeps it from forcing the initial zoom out
              to include it. Leave blank for no limit.
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={mapZoomRadius}
                onChange={(e) => setMapZoomRadius(e.target.value)}
                placeholder="No limit"
                className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-sm text-muted">miles</span>
            </span>
          </label>
        )}
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

// 'support'/'volunteer' are wired directly into their own wizard components —
// deleting them is blocked server-side (see formStore.deleteForm) and the
// Delete button is hidden here to match. They can still be hidden/shown like
// any other form, via the normal VisibilityToggle below.
const PROTECTED_FORM_IDS = new Set(['support', 'volunteer'])

function FormRow({
  form: f,
  confirmingDelete,
  deleting,
  toggling,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleActive,
}: {
  form: FormConfig
  confirmingDelete: boolean
  deleting: boolean
  toggling: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onToggleActive: (active: boolean) => void
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
          <VisibilityToggle active={f.active !== false} toggling={toggling} onToggle={onToggleActive} />
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

