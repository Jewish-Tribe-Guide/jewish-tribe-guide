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
import { Basics, CategoryEditor } from './CategoryEditor'
import NewPagePicker from './NewPagePicker'
import { useReadyMade } from './useReadyMade'
import { pageToCopy } from '@/lib/readyMade'
import CategoryPreview from './CategoryPreview'
import DeletePage from './DeletePage'
import { CardBandImageField, IconField } from './CategoryFormFields'
import { AdminBack, AdminBox, AdminEmpty, AdminPreviewButton, AdminRow, AdminSwitch } from './AdminUI'
import CategoryIcon from '@/components/CategoryIcon'
import { PreviewBeside } from './SitePreview'
import SaveBar, { LEAVE_QUESTION, useLeaveGuard } from './SaveBar'
import { useIsDesktop } from '@/lib/useIsMobile'
import { getCategoryColor } from '@/lib/categoryColor'
import { DEFAULT_CATEGORY_ICON, bandImageFor } from '@/lib/categories'
import Link from 'next/link'
import { useScreenHistory } from './useScreenHistory'
import { screenFromSearch } from '@/lib/editorScreenUrl'
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

  // Candle Lighting, and an Eruv with no row yet: the page's own switch and
  // nothing else (neither has anything to change, Nov 3). The Map's old
  // address is the list: it has no page (board 1).
  const listedScreen = LISTED_SCREENS.find((sc) => `${SCREEN_PREFIX}${sc.kind}` === editingId)
  if (listedScreen) {
    const screen = listedScreen
    if (!categories) return <p className="text-sm text-muted">Loading…</p>
    const st = screenState(categories, screen)
    // The Eruv has its name, icon and photo to keep once it has a row.
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

  const catId = editingId?.startsWith(CAT_PREFIX) ? editingId.slice(CAT_PREFIX.length) : null
  if (catId !== null && categories?.find((c) => c.id === catId)?.kind !== 'map') {
    const id = catId
    const initial = categories?.find((c) => c.id === id) ?? null
    if (!initial) return <p className="text-sm text-muted">Loading…</p>
    // An old address of the Eruv or Candle Lighting (the Map's is the list).
    if (initial.kind !== 'listing') {
      const screen = LISTED_SCREENS.find((sc) => sc.kind === initial.kind)
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

/** A page's "On the site" switch, laid out as a category page's (board
 *  21b): on a phone, a box with "On the site" over its count and the switch
 *  on the right; on a computer, the count, then the switch and its words. */
function OnTheSite({ on, onChange, places }: { on: boolean; onChange: (on: boolean) => void; places?: { count: number; href: string } }) {
  return (
    <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-[10px] px-4 py-2.5 min-h-[52px] md:-mt-3 md:bg-transparent md:border-0 md:p-0 md:min-h-0">
      <span className="flex-1 min-w-0 flex flex-col gap-px">
        <span aria-hidden="true" className="md:hidden text-[15px] font-semibold text-slate-900">On the site</span>
        {places && (
          <Link href={places.href} className="self-start text-[13px] text-slate-600 md:text-sm md:font-semibold md:text-primary hover:underline">
            {places.count} {places.count === 1 ? 'place' : 'places'}
          </Link>
        )}
      </span>
      <span className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-900">
        <span aria-hidden="true" className="max-md:hidden md:order-last">On the site</span>
        <AdminSwitch checked={on} onChange={onChange} label="On the site" />
      </span>
    </div>
  )
}

// The Eruv's page (and an old link to the Map's or Candle Lighting's): no
// fields to change, since it's a fixed, code-driven screen, just its name,
// icon and banner photo. Laid out as every category page is (Nov 9, the
// user: "the same formatting as other category pages"): On the site with its
// count, Basics, the page beside on a computer and Preview on a phone, the
// save bar at the bottom, and Delete. The Eruv's eruvim are in Places, like
// any listing (Nov 9: this page held a second, older editor for them until
// then); its count opens them there, as a category page's does.
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
  const saved = useMemo(
    () => ({
      name: category.pluralLabel,
      icon: category.icon || '',
      iconImageUrl: category.iconImageUrl ?? '',
      cardImageUrl: category.cardImageUrl ?? '',
      cardBandImageUrl: category.cardBandImageUrl ?? '',
    }),
    [category],
  )
  const [draft, setDraft] = useState(saved)
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }))
    setJustSaved(false)
  }
  const [bannerOriginal, setBannerOriginal] = useState<File | string | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const changes = (Object.keys(draft) as (keyof typeof draft)[]).filter((k) => draft[k].trim() !== saved[k].trim()).length
  useLeaveGuard(changes > 0)
  const wide = useIsDesktop('(max-width: 1023px)')

  // The preview full size is in the address (`?preview=1`, editorScreenUrl.ts),
  // written through Next's router: until Nov 9 it was a history.pushState
  // entry, which after a reload drew nothing on Back (AGENTS.md).
  const previewSupported = category.kind === 'eruv'
  const screens = useScreenHistory()
  const [previewing, setPreviewing] = useState(() => previewSupported && typeof window !== 'undefined' && !!screenFromSearch(window.location.search).preview)

  useEffect(() => {
    if (!previewSupported) return
    function onPopState() {
      setPreviewing(!!screenFromSearch(window.location.search).preview)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [previewSupported])

  function openPreview() {
    setPreviewing(true)
    void screens.push({ preview: true })
  }

  function closePreview() {
    setPreviewing(false)
    void screens.back()
  }

  // How many eruvim it has, for the On the site row's link to them in Places.
  const [eruvCount, setEruvCount] = useState<number | null>(null)
  useEffect(() => {
    if (category.kind !== 'eruv') return
    let live = true
    fetchJson<{ eruvim?: { active: boolean }[] }>(withCommunity('/api/admin/eruvim', community), { headers: { Authorization: `Bearer ${token}` } }, 'Failed to load the eruvim.')
      .then((d) => live && setEruvCount(d.eruvim?.filter((e) => e.active).length ?? 0))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [category.kind, community, token])

  const previewCategory: CategoryConfig = {
    ...category,
    label: draft.name.trim() || category.label,
    pluralLabel: draft.name.trim() || category.pluralLabel,
    icon: draft.icon.trim() || category.icon,
    iconImageUrl: draft.iconImageUrl.trim() || null,
    cardImageUrl: draft.cardImageUrl.trim() || null,
    cardBandImageUrl: draft.cardBandImageUrl.trim() || null,
  }

  if (previewing) return <CategoryPreview category={previewCategory} onClose={closePreview} />

  function leave() {
    if (changes > 0 && !window.confirm(LEAVE_QUESTION)) return
    onCancel()
  }

  async function save() {
    setErrors([])
    if (!draft.name.trim()) {
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
            label: draft.name.trim(),
            pluralLabel: draft.name.trim(),
            icon: draft.icon,
            iconImageUrl: draft.iconImageUrl.trim() || null,
            cardImageUrl: draft.cardImageUrl.trim() || null,
            cardBandImageUrl: draft.cardBandImageUrl.trim() || null,
          }),
        },
        'Save failed.',
      )
      setJustSaved(true)
      onSaved()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Save failed.'])
    } finally {
      setSaving(false)
    }
  }

  const banner = bandImageFor(previewCategory)
  const name = draft.name.trim() || category.pluralLabel

  return (
    <div>
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <AdminBack back={{ label: 'Category pages', onClick: leave }} title={name} />
          {/* On a phone the page beside has no room: Preview opens it full
              size (board 21b). */}
          {previewSupported && !wide && <AdminPreviewButton onClick={openPreview} />}
          {onToggleActive && (
            <OnTheSite
              on={category.active !== false}
              onChange={onToggleActive}
              places={eruvCount !== null ? { count: eruvCount, href: `${adminBase(community)}/places?category=${encodeURIComponent(category.id)}` } : undefined}
            />
          )}

          <AdminBox title="Basics" foldOnPhone summary={`${name} · ${banner ? 'Banner photo' : 'No banner photo'}`}>
            <Basics
              name={draft.name}
              onName={(v) => set('name', v)}
              icon={
                <CategoryIcon
                  icon={draft.icon || DEFAULT_CATEGORY_ICON}
                  categoryId={category.id}
                  iconImageUrl={draft.iconImageUrl.trim() || undefined}
                  color={getCategoryColor([category], category.id)}
                  className="h-11 w-11 text-2xl"
                  sizePx={44}
                />
              }
              iconFields={<IconField icon={draft.icon} onChange={(v) => set('icon', v)} iconImageUrl={draft.iconImageUrl} onIconImageUrl={(v) => set('iconImageUrl', v)} token={token} />}
              banner={banner}
              bannerFields={
                <CardBandImageField
                  cardBandImageUrl={draft.cardBandImageUrl}
                  cardImageUrl={draft.cardImageUrl}
                  onChange={(band, card) => {
                    set('cardBandImageUrl', band)
                    set('cardImageUrl', card)
                  }}
                  token={token}
                  originalSource={bannerOriginal}
                  onOriginalSourceChange={setBannerOriginal}
                />
              }
            />
          </AdminBox>

          {onDeleted && <DeletePage token={token} category={category} onDeleted={onDeleted} />}

          {errors.length > 0 && (
            <ul className="bg-red-50 border border-red-200 rounded-[10px] p-3 text-sm text-red-700 list-disc list-inside space-y-0.5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        {/* The page beside, on a computer only, as a category page has it. */}
        {previewSupported && wide && (
          <aside aria-label="Preview" className="shrink-0 sticky top-8 self-start flex w-[340px] flex-col gap-3">
            <PreviewBeside onOpen={openPreview} device="computer" shownWidth={340}>
              {() => <CategoryPreview inline view="page" category={previewCategory} onClose={() => {}} />}
            </PreviewBeside>
          </aside>
        )}
      </div>

      <SaveBar
        changes={changes}
        saving={saving}
        saved={justSaved && changes === 0}
        onUndo={() => {
          setDraft(saved)
          setErrors([])
        }}
        onSave={() => void save()}
      />
    </div>
  )
}


