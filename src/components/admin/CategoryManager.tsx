'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { adminBase } from '@/lib/adminNav'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { MapFoldIcon } from '@/components/icons'
import { CategoryEditor } from './CategoryEditor'
import NewPagePicker from './NewPagePicker'
import { useReadyMade } from './useReadyMade'
import { pageToCopy } from '@/lib/readyMade'
import CategoryPreview from './CategoryPreview'
import EruvimManager from './EruvimManager'
import DeletePage from './DeletePage'
import { CardBandImageField, IconField } from './CategoryFormFields'
import { AdminBack, AdminBox, AdminEmpty, AdminRow, AdminSwitch } from './AdminUI'
import { ERUV_SCREEN, SITE_SCREENS, screenState, type SiteScreen } from '@/lib/siteScreens'

// ── The categories manager: Site's Category pages tab (the Category pages
// redesign's board 1) — one list of every page by name: the categories that
// hold places (Grocery Stores, Synagogues, …, each with its own fields), the
// Eruv, Candle Lighting and the Map. Each row opens its page, where it's
// switched on or off and deleted. Writes go through /api/admin/categories. ──


// editingId is opaque to the admin page's history plumbing — encoded here as
// 'cat:<id>', 'cat:new' (the ready-made pages), 'cat:new:own' or
// 'cat:new:<ready-made id>', and 'screen:<kind>' for the Eruv, Candle Lighting
// and the Map, which may have no row yet. Places are added from Places (Nov
// 3), which offers hidden categories too; an old 'listing:<id>' address lands
// on the list.
const CAT_PREFIX = 'cat:'
const NEW_PREFIX = 'cat:new:'
const OWN_PAGE = 'own'
const SCREEN_PREFIX = 'screen:'

/** The line under a screen's row, where a category's says its places. */
const SCREEN_LINES: Record<SiteScreen['kind'], string> = { eruv: 'Eruv page', zmanim: 'Times page', map: 'Map page' }

/** The category a save just moved to: see `justSaved` below. */
let savedHandOff: string | null = null

export default function CategoryManager({
  token,
  editingId: rawEditingId,
  onOpenEditor,
  onCloseEditor,
}: {
  token: string
  editingId: string | null
  onOpenEditor: (id: string) => void
  onCloseEditor: () => void
}) {
  // A page's own address without the prefix (/categories/restaurant) opens
  // it too; it used to fall through to the list.
  const editingId = rawEditingId && !rawEditingId.includes(':') ? `${CAT_PREFIX}${rawEditingId}` : rawEditingId
  const community = useCommunitySlug()
  const [categories, setCategories] = useState<CategoryConfig[] | null>(null)
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
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
      const catRes = await fetch(withCommunity('/api/admin/categories?counts=1', community), { headers: { Authorization: `Bearer ${token}` } })
      const catBody = await parseOkJson<{ categories: CategoryConfig[]; placeCounts?: Record<string, number> }>(catRes, 'Failed to load categories.')
      setCategories(catBody.categories)
      setPlaceCounts(catBody.placeCounts ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  // Every page in one list by name (board 1): the categories that hold
  // places, and the Eruv, Candle Lighting and the Map, with or without a row
  // yet (switching one on makes it).
  const entries = useMemo(() => {
    if (!categories) return null
    const screens = [ERUV_SCREEN, ...SITE_SCREENS].map((screen) => {
      const st = screenState(categories, screen)
      return { key: `${SCREEN_PREFIX}${screen.kind}`, label: st.row?.pluralLabel ?? screen.label, on: st.on, line: SCREEN_LINES[screen.kind], glyph: screen.kind }
    })
    return [
      ...categories
        .filter((c) => c.kind === 'listing')
        .map((c) => {
          const n = placeCounts[c.id] ?? 0
          return { key: `${CAT_PREFIX}${c.id}`, label: c.pluralLabel, on: c.active !== false, line: `${n} ${n === 1 ? 'place' : 'places'}`, glyph: c.id, icon: c.icon }
        }),
      ...screens,
    ].sort((a, b) => a.label.localeCompare(b.label))
  }, [categories, placeCounts])

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

  const deleted = () => {
    onCloseEditor()
    void load()
  }

  // + New category page (board 2): pick a page to start from, or start
  // empty (board 3). 'cat:new:own' is the empty one, 'cat:new:<id>' a copy.
  if (editingId === `${CAT_PREFIX}new`) {
    return (
      <NewPagePicker
        token={token}
        own={categories}
        onBack={onCloseEditor}
        onPick={(page) => onOpenEditor(`${NEW_PREFIX}${page.id}`)}
        onOpenOwn={(id) => onOpenEditor(`${CAT_PREFIX}${id}`)}
        onMakeOwn={() => onOpenEditor(`${NEW_PREFIX}${OWN_PAGE}`)}
      />
    )
  }
  if (editingId?.startsWith(NEW_PREFIX)) {
    const from = editingId.slice(NEW_PREFIX.length)
    return <NewPageEditor key={from} token={token} from={from} categories={categories} onSaved={async (id) => {
      // Made: open it, saying so.
      await load()
      savedHandOff = id
      onOpenEditor(`${CAT_PREFIX}${id}`)
    }} onCancel={() => onOpenEditor(`${CAT_PREFIX}new`)} />
  }

  // The Map, Candle Lighting, and an Eruv with no row yet: the page's own
  // switch and nothing else (neither has anything to change, Nov 3).
  if (editingId?.startsWith(SCREEN_PREFIX)) {
    const screen = [ERUV_SCREEN, ...SITE_SCREENS].find((sc) => `${SCREEN_PREFIX}${sc.kind}` === editingId)
    if (!categories || !screen) return <p className="text-sm text-muted">Loading…</p>
    const st = screenState(categories, screen)
    // The Eruv has its eruvim to keep once it has a row.
    if (screen.kind === 'eruv' && st.row) {
      return <SingletonEditor token={token} category={st.row} onToggleActive={(on) => void switchScreen(screen, on)} onSaved={() => void load()} onCancel={onCloseEditor} onDeleted={deleted} />
    }
    return (
      <div className="flex flex-col gap-4">
        <AdminBack back={{ label: 'Category pages', onClick: onCloseEditor }} title={st.row?.pluralLabel ?? screen.label} />
        {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}
        <OnTheSite on={st.on} onChange={(on) => void switchScreen(screen, on)} />
      </div>
    )
  }

  if (editingId?.startsWith(CAT_PREFIX)) {
    const id = editingId.slice(CAT_PREFIX.length)
    const initial = categories?.find((c) => c.id === id) ?? null
    if (!initial) return <p className="text-sm text-muted">Loading…</p>
    // An old address of the Eruv, the Map or Candle Lighting.
    if (initial.kind !== 'listing') {
      const screen = [ERUV_SCREEN, ...SITE_SCREENS].find((sc) => sc.kind === initial.kind)
      if (screen?.kind === 'eruv') {
        return <SingletonEditor token={token} category={initial} onToggleActive={(on) => void switchScreen(screen, on)} onSaved={() => void load()} onCancel={onCloseEditor} onDeleted={deleted} />
      }
      return (
        <div className="flex flex-col gap-4">
          <AdminBack back={{ label: 'Category pages', onClick: onCloseEditor }} title={initial.pluralLabel} />
          {screen && <OnTheSite on={initial.active !== false} onChange={(on) => void switchScreen(screen, on)} />}
        </div>
      )
    }
    return (
      <CategoryEditor
        // Saved: start again from what's now saved, staying on the screen.
        key={`${initial.id}:${savedRound}`}
        token={token}
        initial={initial}
        siblings={categories}
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
        onDeleted={deleted}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminBack
        phoneOnly
        back={{ label: 'Site', href: `${adminBase(community)}/site` }}
        title="Category pages"
        right={
          <button
            type="button"
            onClick={() => onOpenEditor(`${CAT_PREFIX}new`)}
            className="shrink-0 min-h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold text-primary hover:bg-slate-50 cursor-pointer"
          >
            + New category page
          </button>
        }
      />

      {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}

      {entries === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <AdminEmpty>Nothing here yet.</AdminEmpty>
      ) : (
        <AdminBox>
          {entries.map((e) => (
            <AdminRow
              key={e.key}
              onClick={() => onOpenEditor(e.key)}
              icon={e.glyph === 'map' ? <MapFoldIcon className="h-5 w-5" /> : <CategoryGlyph categoryId={e.glyph} icon={'icon' in e ? (e.icon ?? '') : ''} className="h-5 w-5" />}
              name={e.label}
              line={e.line}
              aside={!e.on && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Hidden</span>}
            />
          ))}
        </AdminBox>
      )}
    </div>
  )
}

/** A new page's editor: empty, or a copy of a ready-made page once the
 *  ready-made pages have loaded (opened straight from its address too). */
function NewPageEditor({
  token,
  from,
  categories,
  onSaved,
  onCancel,
}: {
  token: string
  from: string
  categories: CategoryConfig[] | null
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const community = useCommunitySlug()
  const { pages, error } = useReadyMade(token, community)
  const own = from === OWN_PAGE
  const source = own ? null : (pages?.filter((p) => p.category.id === from).sort((a, b) => Number(b.community === community) - Number(a.community === community))[0]?.category ?? null)
  if (!own && !source) {
    if (error) return <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
    return <p className="text-sm text-muted">{pages ? 'No ready-made page here.' : 'Loading…'}</p>
  }
  return <CategoryEditor token={token} initial={null} seed={source && pageToCopy(source)} siblings={categories} onSaved={onSaved} onCancel={onCancel} backLabel="What kind of places?" />
}

/** A page's "On the site" switch, in its own box. */
function OnTheSite({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-[10px] px-4 py-2.5 min-h-[52px]">
      <span aria-hidden="true" className="flex-1 text-[15px] font-semibold text-slate-900">On the site</span>
      <AdminSwitch checked={on} onChange={onChange} label="On the site" />
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
  onToggleActive,
  onDeleted,
}: {
  token: string
  category: CategoryConfig
  onSaved: () => void
  onCancel: () => void
  /** The page's "On the site" switch, saved at once. */
  onToggleActive?: (on: boolean) => void
  onDeleted?: () => void
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
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: 'Category pages', onClick: onCancel }} title={category.pluralLabel} />
      {onToggleActive && <OnTheSite on={category.active !== false} onChange={onToggleActive} />}

      <AdminBox title="Basics">
        <div className="flex flex-col gap-4 p-4">
          <label className="block">
            <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <IconField icon={icon} onChange={setIcon} iconImageUrl={iconImageUrl} onIconImageUrl={setIconImageUrl} token={token} />
          <div>
            <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">Banner photo</span>
            <CardBandImageField
              cardBandImageUrl={cardBandImageUrl}
              cardImageUrl={cardImageUrl}
              onChange={(band, card) => {
                setCardBandImageUrl(band)
                setCardImageUrl(card)
              }}
              token={token}
            />
          </div>
        </div>
      </AdminBox>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
          {errors.map((e) => (
            <p key={e} className="text-sm text-red-700">{e}</p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
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
        <div className="mt-4 border-t border-slate-200 pt-6">
          <EruvimManager token={token} />
        </div>
      )}

      {onDeleted && <DeletePage token={token} category={category} onDeleted={onDeleted} />}
    </div>
  )
}


