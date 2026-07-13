'use client'

import { useMemo, useState } from 'react'
import UpButton from '@/components/UpButton'
import ResourceMap, { type MapPoint } from './ResourceMap'
import CategoryFilter, { type FilterOption } from './CategoryFilter'
import NearbyList from './NearbyList'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { DEFAULT_CATEGORY_ICON } from '@/lib/categories'
import { useWatchPosition } from '@/lib/useWatchPosition'
import { hospitals } from '@/data/hospitals'
import type { LatLng } from '@/lib/googleMapsLinks'
import { listingSearchText } from '@/lib/searchListing'

const HOSPITALS_ID = '__hospitals__'
const HOSPITAL_COLOR = '#dc2626'
const HOSPITAL_ICON = '🏥'

const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#db2777', // pink
  '#ca8a04', // amber
  '#4f46e5', // indigo
  '#0d9488', // teal
  '#65a30d', // lime
]

type Props = {
  onUp: () => void
  /** Initial location from the header's "Set location" control, if already set. */
  userLocation?: LatLng | null
  /** Pre-select a single category filter on arrival (from a category's "Map" button). */
  initialCategory?: string
  /** Pre-fill the map's own search box on arrival — set when the directory the
   *  visitor came from had an active search (e.g. "insomnia cookies" within
   *  Food Establishments). */
  initialQuery?: string
  /** Open a specific listing's detail card in its category directory. */
  onViewListing?: (categoryId: string, listingId: string) => void
}

type Tab = 'map' | 'nearby'

export default function ResourceMapView({ onUp, userLocation, initialCategory, initialQuery, onViewListing }: Props) {
  const listings = useAllListings()
  const categories = useCategories()
  const { position: livePosition, tracking, error: geoError, start, stop } = useWatchPosition()

  // Live GPS takes priority over the one-shot header location.
  const activeLocation: LatLng | null = livePosition ?? userLocation ?? null

  const [tab, setTab] = useState<Tab>('map')
  // follow = map pans with every GPS tick. Turns off automatically when the
  // user manually drags the map (we detect this via the Re-center button press,
  // which flips it back on).
  const [follow, setFollow] = useState(true)

  // When tracking starts, flip into follow mode and show the map.
  const handleStart = () => {
    setFollow(true)
    setTab('map')
    start()
  }

  const colorById = useMemo(() => {
    const map = new Map<string, string>()
    ;(categories ?? []).forEach((c, i) => map.set(c.id, PALETTE[i % PALETTE.length]))
    return map
  }, [categories])

  const allPoints = useMemo(() => {
    const out: (MapPoint & { filterId: string; searchText: string })[] = []

    for (const h of hospitals) {
      out.push({
        filterId: HOSPITALS_ID,
        id: `hospital:${h.id}`,
        lat: h.latitude,
        lng: h.longitude,
        name: h.name,
        color: HOSPITAL_COLOR,
        glyph: HOSPITAL_ICON,
        categoryLabel: 'Hospital',
        searchText: h.name.toLowerCase(),
      })
    }

    const catById = new Map((categories ?? []).map((c) => [c.id, c]))
    for (const r of listings ?? []) {
      const lat = r.geo?.lat
      const lng = r.geo?.lng
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      const cat = catById.get(r.category)
      out.push({
        filterId: r.category,
        id: r.id,
        lat,
        lng,
        name: r.name,
        address: r.address || undefined,
        phone: r.phone,
        color: colorById.get(r.category) ?? '#64748b',
        glyph: cat?.icon ?? DEFAULT_CATEGORY_ICON,
        categoryLabel: cat?.label ?? r.category,
        // Same haystack the category directory searches against (name, address,
        // tags, detail fields) — so a query that matches in the directory
        // matches here too.
        searchText: listingSearchText(r, cat),
      })
    }
    return out
  }, [listings, categories, colorById])

  const options = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>()
    for (const p of allPoints) counts.set(p.filterId, (counts.get(p.filterId) ?? 0) + 1)

    const opts: FilterOption[] = []
    if (counts.get(HOSPITALS_ID)) {
      opts.push({ id: HOSPITALS_ID, label: 'Hospitals', icon: HOSPITAL_ICON, color: HOSPITAL_COLOR, count: counts.get(HOSPITALS_ID)! })
    }
    for (const c of categories ?? []) {
      const count = counts.get(c.id) ?? 0
      if (count === 0) continue
      opts.push({ id: c.id, label: c.pluralLabel, icon: c.icon, color: colorById.get(c.id) ?? '#64748b', count })
    }
    return opts
  }, [allPoints, categories, colorById])

  const [selected, setSelected] = useState<Set<string> | null>(
    initialCategory ? new Set([initialCategory]) : null,
  )
  const effectiveSelected = useMemo(
    () => selected ?? new Set(options.map((o) => o.id)),
    [selected, options],
  )

  // General text filter — pre-filled on arrival from a directory's active
  // search, but a normal editable box the visitor can change or clear here too.
  const [query, setQuery] = useState(initialQuery ?? '')
  const q = query.trim().toLowerCase()

  const visiblePoints = useMemo(() => {
    const tokens = q.split(/\s+/).filter(Boolean)
    return allPoints
      .filter((p) => effectiveSelected.has(p.filterId))
      .filter((p) => tokens.length === 0 || tokens.every((t) => p.searchText.includes(t)))
  }, [allPoints, effectiveSelected, q])

  const toggle = (id: string) => {
    const next = new Set(effectiveSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const showAll = () => setSelected(new Set(options.map((o) => o.id)))
  const hideAll = () => setSelected(new Set())

  const loading = listings === null || categories === null

  return (
    <div>
      <UpButton label="Home" onClick={onUp} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resource map</h1>
          <p className="mt-1 text-sm text-slate-500">
            Filter by category, then tap any pin or listing for directions.
          </p>
        </div>

        {/* Map / Nearby tab toggle */}
        {!loading && (
          <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setTab('map')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                tab === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setTab('nearby')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                tab === 'nearby' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Nearby
            </button>
          </div>
        )}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      {!loading && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1.5 text-xs text-muted">
            {visiblePoints.length} place{visiblePoints.length !== 1 ? 's' : ''} shown
            {q && (
              <>
                {' '}for &ldquo;{query.trim()}&rdquo; &middot;{' '}
                <button onClick={() => setQuery('')} className="text-primary hover:underline cursor-pointer">
                  clear
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {/* ── Live tracking bar ────────────────────────────────────────────────── */}
      {!loading && (
        <div className="mb-4">
          {tracking ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* Pulsing indicator */}
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-600 pl-2.5 pr-3 py-1.5 text-sm font-semibold text-white shadow-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                </span>
                Live — updating as you move
              </span>
              <button
                onClick={stop}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Stop tracking
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleStart}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 cursor-pointer"
              >
                <span aria-hidden="true">📍</span>
                Start live tracking
              </button>
              <p className="text-xs text-slate-400">
                Track your position as you walk — the nearest places update in real time.
              </p>
            </div>
          )}
          {geoError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{geoError}</p>
          )}
        </div>
      )}

      {/* ── Category filter chips ────────────────────────────────────────────── */}
      {!loading && options.length > 0 && (
        <div className="mb-4">
          <CategoryFilter
            options={options}
            selected={effectiveSelected}
            onToggle={toggle}
            onAll={showAll}
            onNone={hideAll}
          />
        </div>
      )}

      {/* ── Map view ────────────────────────────────────────────────────────── */}
      {tab === 'map' && (
        <div className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-2xl ring-1 ring-slate-900/5">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
              Loading map…
            </div>
          ) : (
            <ResourceMap
              points={visiblePoints}
              userLocation={activeLocation}
              follow={follow}
              onResumeFollow={() => setFollow(true)}
              onViewListing={onViewListing}
            />
          )}
        </div>
      )}

      {/* ── Nearby list view ─────────────────────────────────────────────────── */}
      {tab === 'nearby' && !loading && (
        <>
          {activeLocation ? (
            <p className="mb-3 text-xs text-slate-400">
              Sorted by distance from your location
              {tracking ? ', updating live as you move.' : '.'}
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-400">
              Start live tracking above to sort by distance.
            </p>
          )}
          <NearbyList points={visiblePoints} userLocation={activeLocation} onViewListing={onViewListing} />
        </>
      )}

      {!loading && visiblePoints.length === 0 && (
        <p className="mt-3 text-center text-sm text-slate-500">
          {q
            ? `No places match “${query.trim()}”. Try a different search or clear it.`
            : 'No places shown. Turn on a category above to see locations.'}
        </p>
      )}
    </div>
  )
}
