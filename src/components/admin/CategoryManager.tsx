'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATEGORY_CAPABILITY_KEYS, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { CategoryEditor } from './CategoryEditor'
import ListingEditorScreen from './ListingEditorScreen'
import CategoryPreview from './CategoryPreview'
import EruvimManager from './EruvimManager'
import { CardBackgroundField, CardBandImageField, IconField } from './CategoryFormFields'
import { getCategoryColor } from '@/lib/categoryColor'
import { CAPABILITY_LABELS } from './categoryEditorLogic'
import { AdminEmpty } from './AdminUI'

// ── The categories manager: Site's Category pages tab — the listing
// categories (Grocery Stores, Synagogues, …, each with its own detail fields
// and capabilities) and the fixed screens (Map, Zmanim, …). Forms have their
// own tab (FormsManager.tsx). Writes go through /api/admin/categories. ──

// The singleton pseudo-categories an admin can add/remove but never edit —
// there's nothing to configure, they just turn a fixed, code-driven screen on
// or off. See CategoryConfig.kind.
const SINGLETON_KIND_LABELS = {
  map: 'Map',
  zmanim: 'Zmanim',
  eruv: 'Eruv',
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


// editingId is opaque to the admin page's history plumbing — encoded here as
// 'cat:<id>', 'cat:new', or 'listing:<category id>' (adding a place).
const CAT_PREFIX = 'cat:'
const LISTING_PREFIX = 'listing:'

/** The category a save just moved to: see `justSaved` below. */
let savedHandOff: string | null = null

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
  const community = useCommunitySlug()
  const [categories, setCategories] = useState<CategoryConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingSingleton, setAddingSingleton] = useState<SingletonKind | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  // The category just saved, and how many saves there have been: its screen
  // starts again from the saved settings, and its Save bar says "Saved."
  // A save that moves to another address (made, or a new web address) lands
  // on that address's own page, a fresh one of these: it picks the id up.
  const [justSaved, setJustSaved] = useState<string | null>(() => savedHandOff)
  const [savedRound, setSavedRound] = useState(0)
  useEffect(() => {
    savedHandOff = null
  }, [])
  useEffect(() => {
    // Leaving it ends the "Saved.", so it isn't still saying so next time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (justSaved && editingId !== `${CAT_PREFIX}${justSaved}`) setJustSaved(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  const load = useCallback(async () => {
    setError(null)
    try {
      const catRes = await fetch(withCommunity('/api/admin/categories', community), { headers: { Authorization: `Bearer ${token}` } })
      const catBody = await parseOkJson<{ categories: CategoryConfig[] }>(catRes, 'Failed to load categories.')
      setCategories(catBody.categories)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  const entries = useMemo(
    () => (categories ? [...categories].sort((a, b) => a.pluralLabel.localeCompare(b.pluralLabel)) : null),
    [categories],
  )

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
        withCommunity('/api/admin/categories', community),
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
        withCommunity(`/api/admin/categories/${id}`, community),
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
        withCommunity(`/api/admin/categories/${id}`, community),
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
        siblings={categories}
        hasMapCategory={hasMap}
        onSaved={async (id) => {
          // Made: open it, saying so.
          await load()
          savedHandOff = id
          onOpenEditor(`${CAT_PREFIX}${id}`)
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
        // Saved: start again from what's now saved, staying on the screen.
        key={`${initial.id}:${savedRound}`}
        token={token}
        initial={initial}
        siblings={categories}
        hasMapCategory={hasMap}
        justSaved={justSaved === initial.id}
        onSaved={async (savedId) => {
          await load()
          setJustSaved(savedId)
          setSavedRound((r) => r + 1)
          if (savedId !== initial.id) {
            savedHandOff = savedId
            onOpenEditor(`${CAT_PREFIX}${savedId}`)
          }
        }}
        onCancel={onCloseEditor}
      />
    )
  }

  if (editingId?.startsWith(LISTING_PREFIX)) {
    const id = editingId.slice(LISTING_PREFIX.length)
    const category = categories?.find((c) => c.id === id) ?? null
    if (!category) return <p className="text-sm text-muted">Loading…</p>
    return (
      <ListingEditorScreen heading={`Add a ${category.label}`} category={category} adminSubmit={{ token }} onClose={onCloseEditor} />
    )
  }

  const missingSingletons = (Object.keys(SINGLETON_KIND_LABELS) as SingletonKind[]).filter(
    (kind) => !categories?.some((c) => c.kind === kind),
  )

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-4 flex-wrap">
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
        </div>
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {entries === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <AdminEmpty>Nothing here yet.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {entries.map((c) =>
            c.kind === 'listing' ? (
              <CategoryRow
                key={`cat:${c.id}`}
                category={c}
                confirmingDelete={confirmDeleteId === c.id}
                deleting={deletingId === c.id}
                toggling={togglingId === c.id}
                onEdit={() => onOpenEditor(`${CAT_PREFIX}${c.id}`)}
                onAddListing={() => onOpenEditor(`${LISTING_PREFIX}${c.id}`)}
                onAskDelete={() => setConfirmDeleteId(c.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteCategory(c.id)}
                onToggleActive={(active) => toggleCategoryActive(c.id, active)}
              />
            ) : (
              <SingletonRow
                key={`cat:${c.id}`}
                category={c}
                confirmingDelete={confirmDeleteId === c.id}
                deleting={deletingId === c.id}
                toggling={togglingId === c.id}
                onEdit={() => onOpenEditor(`${CAT_PREFIX}${c.id}`)}
                onAskDelete={() => setConfirmDeleteId(c.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => deleteCategory(c.id)}
                onToggleActive={(active) => toggleCategoryActive(c.id, active)}
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
// editor just to hide something. Shared by category and singleton rows.
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
  onAddListing,
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
  onAddListing: () => void
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
            onClick={onAddListing}
            title="Add a listing directly — publishes immediately, no review queue. Works even while this category is hidden."
            className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            + Add listing
          </button>
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
// The Eruv's also holds its eruvim (EruvimManager), which live in their own
// table rather than as listings.
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
  const community = useCommunitySlug()
  const [name, setName] = useState(category.pluralLabel)
  const [icon, setIcon] = useState(category.icon || '')
  const [iconImageUrl, setIconImageUrl] = useState(category.iconImageUrl ?? '')
  const [cardImageUrl, setCardImageUrl] = useState(category.cardImageUrl ?? '')
  const [cardBandImageUrl, setCardBandImageUrl] = useState(category.cardBandImageUrl ?? '')
  // Map only — kept as a string (not number|null) so the field can sit blank
  // mid-edit rather than snapping to 0. Parsed back to number|null on save.
  const [mapZoomRadius, setMapZoomRadius] = useState(
    category.kind === 'map' && category.mapZoomRadiusMiles != null ? String(category.mapZoomRadiusMiles) : '',
  )
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Live preview, same pattern as CategoryEditor's own (history entry so
  // Back/the preview's own Up button land here instead of skipping past to
  // the category list) — only for the two kinds CategoryPreview actually
  // knows how to render standalone content for (see its own kind switch).
  // Map's preview is the site's real map (a much bigger surface, already
  // reachable from the live site) and Hospitals is a whole chooser+detail
  // flow tied to real hospital data, not a single card of content — neither
  // fits this same "preview the draft" shape without a lot more scaffolding
  // than a Save/Cancel-only editor like this one has needed until now.
  const previewSupported = category.kind === 'eruv' || category.kind === 'zmanim'
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    if (!previewSupported) return
    function onPopState(e: PopStateEvent) {
      setPreviewing(!!(e.state as { editorPreview?: boolean } | null)?.editorPreview)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [previewSupported])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function closePreview() {
    history.back()
  }

  if (previewing) {
    const previewCategory: CategoryConfig = {
      ...category,
      label: name.trim() || category.label,
      pluralLabel: name.trim() || category.pluralLabel,
      icon: icon.trim() || category.icon,
      iconImageUrl: iconImageUrl.trim() || null,
      cardImageUrl: cardImageUrl.trim() || null,
      cardBandImageUrl: cardBandImageUrl.trim() || null,
    }
    return <CategoryPreview category={previewCategory} onClose={closePreview} />
  }

  async function save() {
    setErrors([])
    if (!name.trim()) {
      setErrors(['Name is required.'])
      return
    }
    setSaving(true)
    try {
      await fetchJson(
        withCommunity(`/api/admin/categories/${category.id}`, community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            label: name.trim(),
            pluralLabel: name.trim(),
            icon,
            iconImageUrl: iconImageUrl.trim() || null,
            cardImageUrl: cardImageUrl.trim() || null,
            cardBandImageUrl: cardBandImageUrl.trim() || null,
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
        />
        <CardBandImageField
          cardBandImageUrl={cardBandImageUrl}
          onCardBandImageUrl={setCardBandImageUrl}
          fallbackImageUrl={cardImageUrl}
          previewIcon={icon}
          previewColor={getCategoryColor([category], category.id)}
          token={token}
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
        {previewSupported && (
          <button
            onClick={openPreview}
            className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Preview
          </button>
        )}
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

      {/* The eruvim themselves, each saved on its own: what was the Eruvim
          tab until Oct 22, so everything about the Eruv page is here. */}
      {category.kind === 'eruv' && (
        <div className="mt-8 border-t border-slate-200 pt-6">
          <EruvimManager token={token} />
        </div>
      )}
    </div>
  )
}


