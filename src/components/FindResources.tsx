'use client'

import { useEffect, useState } from 'react'
import AboutYourHospital from '@/components/tabs/AboutYourHospital'
import { eruvInfo } from '@/data/resources'
import ResourceLoader from '@/components/resources/ResourceLoader'
import ListingForm from '@/components/resources/ListingForm'
import ReportListing from '@/components/resources/ReportListing'
import CategoryForm from '@/components/resources/CategoryForm'
import EruvInfo from '@/components/resources/EruvInfo'
import ZmanimCard from '@/components/ZmanimCard'
import UpButton from '@/components/UpButton'
import AnchorBar from '@/components/AnchorBar'
import type { AnchorControls } from '@/components/AnchorBar'
import type { DirectoryResource, DirectoryAnchor } from '@/types'
import { useCategories } from '@/lib/useCategories'
import { hospitals } from '@/data/hospitals'

const ADD_CATEGORY = '__add_category__'

// Non-category items in the directory (hand-curated, not part of the DB pipeline).
// Synagogues are now a DB category (see scripts/seed-synagogues.mjs) and no longer
// appear here — they route through ResourceLoader automatically.
type SpecialItem = { id: string; label: string; icon: string; description: string }
const SPECIAL_ITEMS: SpecialItem[] = [
  { id: 'about-hospital', label: 'About Your Hospital', icon: '🏥', description: 'Chaplain, kosher meals, Jewish medical staff, prayer space, and Shabbat accommodations' },
  { id: 'eruv', label: 'Eruv Information', icon: '🗺️', description: 'Eruv status, maps, and contacts for Shabbat' },
  { id: 'zmanim', label: 'Zmanim & Shabbos', icon: '🕯️', description: 'Hebrew date, daily zmanim, candle lighting, and havdalah' },
]

// The history shape page.tsx stamps on every pushState/replaceState call, plus
// the two extra fields FindResources adds when navigating inside Find mode.
type FindNavState = {
  mode?: string
  findView?: string
  findAction?: string
  /** Search text carried in from the landing page's search bar. */
  findQuery?: string
}

// A pending add/edit/report action on a listing within the current category.
type ListingAction =
  | { mode: 'create' }
  | { mode: 'edit'; listing: DirectoryResource }
  | { mode: 'report'; listing: DirectoryResource }

type Props = {
  anchor: DirectoryAnchor
  anchorControls: AnchorControls
  /** Hierarchical Up from the Find index → the audience home screen. */
  onUp: () => void
}

export default function FindResources({ anchor, anchorControls, onUp }: Props) {
  const isHospital = anchor.kind === 'hospital'
  // Eruv, Zmanim, and Synagogues are city-wide resources — relevant to community
  // members too. They're data-keyed to a hospital, so in address mode we fall back
  // to the first hospital as a Philadelphia-area representative.
  const fallbackHospital = hospitals[0]
  const hospitalId = anchor.kind === 'hospital' ? anchor.hospitalId : fallbackHospital.id
  // The label shown as page subtitle in Synagogues / Zmanim / Eruv:
  //   patient mode → hospital name (data is keyed to this hospital)
  //   community mode → the typed address (so the user isn't confused by a hospital name)
  const locationLabel = anchor.kind === 'hospital' ? anchor.hospitalName : anchor.label

  // ── History-backed internal navigation ──────────────────────────────────────
  // Initialize from the current history state so that browser-forward navigation
  // (or a page.tsx audience-switch) re-opens the right sub-view automatically.
  const [view, setView] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const s = window.history.state as FindNavState | null
    return s?.findView ?? null
  })
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return ''
    return (window.history.state as FindNavState | null)?.findQuery ?? ''
  })
  const [action, setAction] = useState<ListingAction | null>(null)
  const categories = useCategories()
  // The listing id most recently opened for edit/report — restored as expanded
  // when the user presses Back from the form to the category list.
  const [reopenItemId, setReopenItemId] = useState<string | null>(null)

  // Keep internal view/action in sync when the browser's back/forward buttons
  // are used. page.tsx has its own popstate listener for audience/mode; this one
  // only fires when mode is still 'find', so the two listeners never conflict.
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const s = e.state as FindNavState | null
      if (s?.mode !== 'find') return
      setView(s.findView ?? null)
      setAction(null) // edit/report listings can't be serialized into history
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Audience derived from the anchor — needed to stamp complete history states
  // without reading window.history.state (which can carry stale values).
  const audienceKey = anchor.kind === 'hospital' ? 'patient' : 'community'

  // Navigate forward to a sub-view. Always pushes a new history entry so that
  // browser-back returns exactly one screen. (In-app Up navigation is handled
  // separately by goToIndex/goToCategoryList, which push the parent screen.)
  function navigateTo(next: string) {
    setAction(null)
    setView(next)
    history.pushState({ audience: audienceKey, mode: 'find', findView: next }, '')
  }

  // Open a listing action (create/edit/report form). Pushes its own history
  // entry so browser-back from the form lands on the category list, not the index.
  function openAction(act: ListingAction) {
    setAction(act)
    // Remember which listing was opened so we can re-expand its card on Back.
    if (act.mode === 'edit' || act.mode === 'report') {
      setReopenItemId(act.listing.id)
    }
    // Include the current view so popstate can restore it when going back to
    // the category list (edit/report listing objects can't be serialized).
    history.pushState({ audience: audienceKey, mode: 'find', findView: view, findAction: 'open' }, '')
  }

  // Hierarchical "Up" navigation (not history.back()). Each Up pushes the parent
  // screen as a new history entry, so the on-screen Up button is decoupled from
  // the browser/trackpad Back button, which stays temporal.

  // Up from a category / special view / add-category form → the Find index.
  const goToIndex = () => {
    setAction(null)
    setView(null)
    history.pushState({ audience: audienceKey, mode: 'find', findView: null }, '')
  }

  // Up from a listing form / report form → the category list it was opened from
  // (view is still the category id; reopenItemId re-expands the relevant card).
  const goToCategoryList = () => {
    setAction(null)
    history.pushState({ audience: audienceKey, mode: 'find', findView: view }, '')
  }

  // ── Special (non-category) detail views ─────────────────────────────────────────
  if (view === 'about-hospital') {
    return <AboutYourHospital hospitalId={hospitalId} hospitalName={locationLabel} onUp={goToIndex} />
  }
  if (view === 'eruv') {
    const eruv = eruvInfo[hospitalId as keyof typeof eruvInfo]
    if (!eruv)
      return (
        <div>
          <UpButton label="All resources" onClick={goToIndex} />
          <p className="text-muted text-sm">No eruv information available for this hospital.</p>
        </div>
      )
    return <EruvInfo eruv={eruv} onUp={goToIndex} />
  }
  if (view === 'zmanim') {
    // Address mode: pass raw coords so the API skips the hospital lookup entirely.
    // Patient mode: pass hospitalId as before.
    if (anchor.kind === 'address') {
      return (
        <ZmanimCard
          key={anchor.label}
          coords={anchor.coords}
          locationLabel={locationLabel}
          onUp={goToIndex}
        />
      )
    }
    return (
      <ZmanimCard
        key={hospitalId}
        hospitalId={hospitalId}
        locationLabel={locationLabel}
        onUp={goToIndex}
      />
    )
  }
  if (view === ADD_CATEGORY) {
    return <CategoryForm onUp={goToIndex} onSubmitted={goToIndex} />
  }

  // ── Database-backed categories (with add / edit / report) ───────────────────────
  const category = view ? categories?.find((c) => c.id === view) : undefined
  if (category) {
    if (action?.mode === 'create') {
      return <ListingForm category={category} mode="create" onUp={goToCategoryList} onSubmitted={goToCategoryList} />
    }
    if (action?.mode === 'edit') {
      return <ListingForm category={category} mode="edit" existing={action.listing} onUp={goToCategoryList} onSubmitted={goToCategoryList} />
    }
    if (action?.mode === 'report') {
      return <ReportListing listing={action.listing} upLabel={category.pluralLabel} onUp={goToCategoryList} onSubmitted={goToCategoryList} />
    }
    return (
      <ResourceLoader
        category={category}
        anchor={anchor}
        reopenItemId={reopenItemId}
        onUp={goToIndex}
        onAdd={() => openAction({ mode: 'create' })}
        onEdit={(listing) => openAction({ mode: 'edit', listing })}
        onReport={(listing) => openAction({ mode: 'report', listing })}
      />
    )
  }

  // ── Index ─────────────────────────────────────────────────────────────────────
  const categoryItems = (categories ?? []).map((c) => ({
    id: c.id,
    label: c.pluralLabel,
    icon: c.icon,
    description: c.description,
  }))
  // 'About Your Hospital' is patient-only. The other specials (Synagogues, Eruv,
  // Zmanim) are Philadelphia community resources and show in both modes.
  const specialItems = isHospital
    ? SPECIAL_ITEMS
    : SPECIAL_ITEMS.filter((item) => item.id !== 'about-hospital')
  const allItems = [...specialItems, ...categoryItems]

  const q = query.trim().toLowerCase()
  const visibleItems = allItems
    .sort((a, b) => a.label.localeCompare(b.label))
    .filter(
      (item) => !q || item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    )

  return (
    <div>
      <UpButton label="Home" onClick={onUp} />

      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-800">Find Resources</h2>
        <AnchorBar {...anchorControls} label="Calculating distances from" />
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search resources…"
          aria-label="Search resources"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-muted shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {categories === null ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : visibleItems.length === 0 ? (
        <p className="text-muted text-sm">No resources match "{query}".</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className="flex items-center gap-3 p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-primary hover:shadow-md transition-all text-left cursor-pointer group h-full"
            >
              <span className="text-xl shrink-0" aria-hidden="true">{item.icon}</span>
              <p className="text-lg font-semibold text-slate-900 group-hover:text-primary transition-colors">
                {item.label}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Suggest a new category */}
      <button
        onClick={() => navigateTo(ADD_CATEGORY)}
        className="w-full flex items-center justify-center gap-2 mt-5 px-4 py-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
      >
        <span aria-hidden="true">➕</span>
        Don&apos;t see the right category? Suggest a new one
      </button>
    </div>
  )
}
