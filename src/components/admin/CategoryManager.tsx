'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { prefetchCategoryListings } from '@/lib/categoryListings'
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
import { AdminBack, AdminBox, AdminEmpty, AdminRow, AdminSwitch } from './AdminUI'
import { withEruvFields } from '@/lib/eruvFields'
import { LISTED_SCREENS, screenState, type SiteScreen } from '@/lib/siteScreens'

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

// The list of pages as last loaded, kept between screens. Each screen of
// Category pages is its own address, and a new address is a new
// CategoryManager, so every open waited for the list again before showing
// anything (the user, Nov 9: "Most noticable is clicking on a category page
// in admin"). The kept list shows at once; the screen still asks again, and
// what comes back replaces it.
let kept: { community: string; categories: CategoryConfig[]; placeCounts: Record<string, number> } | null = null

/** Tests: no list kept from the one before. */
export function forgetCategoryList(): void {
  kept = null
}

export default function CategoryManager({
  token,
  editingId: rawEditingId,
  onOpenEditor,
  onCloseEditor,
  prefetch,
}: {
  token: string
  editingId: string | null
  onOpenEditor: (id: string) => void
  onCloseEditor: () => void
  /** Loads a screen's address ahead of a click: a row's page, or (null)
   *  the list. */
  prefetch?: (id: string | null) => void
}) {
  // A page's own address without the prefix (/categories/restaurant) opens
  // it too; it used to fall through to the list.
  const editingId = rawEditingId && !rawEditingId.includes(':') ? `${CAT_PREFIX}${rawEditingId}` : rawEditingId
  const community = useCommunitySlug()
  const keptHere = kept?.community === community ? kept : null
  const [categories, setCategories] = useState<CategoryConfig[] | null>(keptHere?.categories ?? null)
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>(keptHere?.placeCounts ?? {})
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [listRound, setListRound] = useState(0)
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
      // A kept list that turns out stale (changed in another tab) starts
      // the open page again from what's saved, before anything's typed.
      if (keptHere && JSON.stringify(keptHere.categories) !== JSON.stringify(catBody.categories)) setListRound((r) => r + 1)
      setCategories(catBody.categories)
      setPlaceCounts(catBody.placeCounts ?? {})
      kept = { community, categories: catBody.categories, placeCounts: catBody.placeCounts ?? {} }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
    // keptHere: the list this screen opened with, read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, community])

  useLoadOnMount(load)

  // Opened from its address, with no list kept: the page's places are asked
  // for beside the list, not after it (categoryListings.ts). With a list
  // kept, the editor shows at once and asks itself.
  const openedId = editingId?.startsWith(CAT_PREFIX) && !editingId.startsWith(NEW_PREFIX) && editingId !== `${CAT_PREFIX}new` ? editingId.slice(CAT_PREFIX.length) : null
  const listKept = categories !== null
  useEffect(() => {
    if (openedId && !listKept) prefetchCategoryListings(openedId)
    // Only as the page opens: once the list is here, the editor has asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedId])

  // Every page in one list by name (board 1): the categories that hold
  // places, and the Eruv and Candle Lighting, with or without a row yet
  // (switching one on makes it).
  const entries = useMemo(() => {
    if (!categories) return null
    const screens = LISTED_SCREENS.map((screen) => {
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

  // The rows' pages, while the list shows, and the list from a page (Back
  // to it), so neither click waits on the server.
  const rowKeys = entries?.map((e) => e.key).join(' ') ?? ''
  useEffect(() => {
    if (!prefetch) return
    if (editingId) prefetch(null)
    else for (const key of rowKeys.split(' ').filter(Boolean)) prefetch(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKeys, editingId === null])

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

  // A page with fields: a page of places, or the Eruv's (Nov 9: its fields
  // and boxes, as every page's; eruvFields.ts).
  const editorFor = (initial: CategoryConfig) => (
    <CategoryEditor
      // Saved: start again from what's now saved, staying on the screen.
      key={`${initial.id}:${savedRound}:${listRound}`}
      token={token}
      initial={withEruvFields(initial)}
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

  // Candle Lighting, and an Eruv with no row yet: the page's own switch and
  // nothing else (neither has anything to change, Nov 3). The Map's old
  // address is the list: it has no page (board 1).
  const listedScreen = LISTED_SCREENS.find((sc) => `${SCREEN_PREFIX}${sc.kind}` === editingId)
  if (listedScreen) {
    const screen = listedScreen
    if (!categories) return <p className="text-sm text-muted">Loading…</p>
    const st = screenState(categories, screen)
    // The Eruv, once it has a row, is a page with fields.
    if (screen.kind === 'eruv' && st.row) return editorFor(st.row)
    return (
      <div className="flex flex-col gap-4">
        <AdminBack back={{ label: 'Category pages', onClick: onCloseEditor }} title={st.row?.pluralLabel ?? screen.label} />
        {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}
        <OnTheSite on={st.on} onChange={(on) => void switchScreen(screen, on)} />
      </div>
    )
  }

  const catId = editingId?.startsWith(CAT_PREFIX) ? editingId.slice(CAT_PREFIX.length) : null
  if (catId !== null && categories?.find((c) => c.id === catId)?.kind !== 'map') {
    const id = catId
    const initial = categories?.find((c) => c.id === id) ?? null
    if (!initial) return <p className="text-sm text-muted">Loading…</p>
    // An old address of the Eruv or Candle Lighting (the Map's is the list).
    if (initial.kind !== 'listing') {
      const screen = LISTED_SCREENS.find((sc) => sc.kind === initial.kind)
      if (screen?.kind === 'eruv') return editorFor(initial)
      return (
        <div className="flex flex-col gap-4">
          <AdminBack back={{ label: 'Category pages', onClick: onCloseEditor }} title={initial.pluralLabel} />
          {screen && <OnTheSite on={initial.active !== false} onChange={(on) => void switchScreen(screen, on)} />}
        </div>
      )
    }
    return editorFor(initial)
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
  const source = own ? null : (pages?.filter((p) => p.category.kind === 'listing' && p.category.id === from).sort((a, b) => Number(b.community === community) - Number(a.community === community))[0]?.category ?? null)
  if (!own && !source) {
    if (error) return <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
    return <p className="text-sm text-muted">{pages ? 'No ready-made page here.' : 'Loading…'}</p>
  }
  return <CategoryEditor token={token} initial={null} seed={source && pageToCopy(source)} siblings={categories} onSaved={onSaved} onCancel={onCancel} backLabel="What kind of places?" />
}

/** A page's "On the site" switch (Candle Lighting, an Eruv with no row
 *  yet), laid out as a category page's (board 21b): on a phone, a box with
 *  the switch on the right; on a computer, the switch and its words. */
function OnTheSite({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-[10px] px-4 py-2.5 min-h-[52px] md:-mt-3 md:bg-transparent md:border-0 md:p-0 md:min-h-0">
      <span aria-hidden="true" className="flex-1 min-w-0 md:hidden text-[15px] font-semibold text-slate-900">On the site</span>
      <span className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-900">
        <span aria-hidden="true" className="max-md:hidden md:order-last">On the site</span>
        <AdminSwitch checked={on} onChange={onChange} label="On the site" />
      </span>
    </div>
  )
}



