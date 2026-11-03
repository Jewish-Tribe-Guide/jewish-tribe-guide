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
import { AdminBox, AdminEmpty, AdminSwitch } from './AdminUI'
import { ERUV_SCREEN, screenState, siteScreenState, type SiteScreen } from '@/lib/siteScreens'

// ── The categories manager: Site's Category pages tab — the categories that
// hold places (Grocery Stores, Synagogues, …, each with its own detail fields
// and capabilities), and the Eruv among them, with the Map and Candle
// Lighting as bare switches above (the user, Oct 31 and Nov 3: neither has
// anything to change). Writes go through /api/admin/categories. ──


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
  const [switching, setSwitching] = useState<string | null>(null)
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

  // The categories that hold places, and the Eruv in its place among them by
  // name — with or without a row yet (switching it on makes one).
  const entries = useMemo(() => {
    if (!categories) return null
    const eruv = screenState(categories, ERUV_SCREEN)
    return [
      ...categories.filter((c) => c.kind === 'listing').map((c) => ({ key: `cat:${c.id}`, label: c.pluralLabel, category: c, eruv: null })),
      { key: 'eruv', label: eruv.row?.pluralLabel ?? ERUV_SCREEN.label, category: null, eruv },
    ].sort((a, b) => a.label.localeCompare(b.label))
  }, [categories])

  // On makes the screen's row the first time and shows it after that; off
  // hides the row, so its name and photo are still there when it comes back.
  async function switchScreen(screen: SiteScreen, on: boolean) {
    if (switching) return
    const row = categories?.find((c) => c.kind === screen.kind)
    setError(null)
    setSwitching(screen.kind)
    try {
      await fetchJson(
        withCommunity(row ? `/api/admin/categories/${row.id}` : '/api/admin/categories', community),
        {
          method: row ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(row ? { active: on } : { label: screen.label, pluralLabel: screen.label, kind: screen.kind, icon: screen.icon }),
        },
        'Could not change it.',
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change it.')
    } finally {
      setSwitching(null)
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

  const hasMap = !!categories?.some((c) => c.kind === 'map' && c.active !== false)

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
    // — everything else is a real category.
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

  return (
    <div>
      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {categories && (
        <div className="mb-4">
          <AdminBox title="On the site">
            {siteScreenState(categories).map(({ screen, row, on }) => (
              <div key={screen.kind} data-testid={`site-screen-${screen.kind}`} className="flex items-center gap-3 pr-4 border-b border-slate-100 last:border-b-0">
                <span className="flex-1 min-w-0 pl-4 py-2.5 min-h-[52px] flex items-center text-[15px] font-semibold text-slate-900">{row?.pluralLabel ?? screen.label}</span>
                <AdminSwitch checked={on} label={row?.pluralLabel ?? screen.label} onChange={(next) => void switchScreen(screen, next)} />
              </div>
            ))}
          </AdminBox>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => onOpenEditor(`${CAT_PREFIX}new`)}
          className="text-sm font-medium bg-primary text-white rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
        >
          + New category
        </button>
      </div>

      {entries === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <AdminEmpty>Nothing here yet.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {entries.map(({ key, label, category: c, eruv }) => eruv ? (
            <EruvRow
              key={key}
              label={label}
              on={eruv.on}
              toggling={switching === 'eruv'}
              onEdit={eruv.row ? () => onOpenEditor(`${CAT_PREFIX}${eruv.row!.id}`) : null}
              onToggleActive={(on) => void switchScreen(ERUV_SCREEN, on)}
            />
          ) : c && (
            <CategoryRow
              key={key}
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
          ))}
        </div>
      )}
    </div>
  )
}

// ── List rows ─────────────────────────────────────────────────────────────────

const TYPE_BADGE = 'text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0'

// Flips public visibility right from the list — no need to open the full
// editor just to hide something.
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

// The Eruv among the categories: shown or hidden like them, and Edit opens
// its eruvim. No places to add and nothing to delete — hiding it is how it
// goes. Before it has a row, showing it makes one, and Edit waits for that.
function EruvRow({
  label,
  on,
  toggling,
  onEdit,
  onToggleActive,
}: {
  label: string
  on: boolean
  toggling: boolean
  onEdit: (() => void) | null
  onToggleActive: (active: boolean) => void
}) {
  return (
    <div data-testid="category-row-eruv" className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
          <span className={`${TYPE_BADGE} bg-slate-100 text-slate-600`}>Eruv</span>
          <span>{label}</span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <VisibilityToggle active={on} toggling={toggling} onToggle={onToggleActive} />
          {onEdit && (
            <button
              onClick={onEdit}
              className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
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
    <div data-testid={`category-row-${c.id}`} className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
      {/* On a phone the buttons go under the name, not squeezed beside it. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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

// A lightweight editor for Map/Zmanim/Eruv — no fields to change (it's
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
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Live preview, same pattern as CategoryEditor's own (history entry so
  // Back/the preview's own Up button land here instead of skipping past to
  // the category list). Only the Eruv opens this screen from the list now
  // (Nov 3); the Map and Candle Lighting are switches with nothing to edit,
  // so an old link to either still lands here but has nothing to preview.
  const previewSupported = category.kind === 'eruv'
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
        This is a fixed, code-driven card — only its name, icon and home-screen appearance are editable here.
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


