'use client'

import { useEffect, useRef, useState } from 'react'
import type { Hospital, NavigateFn } from '@/types'
import { distanceMiles } from '@/lib/geo'
import { ACCENT_PALETTE } from '@/components/map/ResourceMapView'

type Props = {
  hospitals: Hospital[]
  coords: { lat: number; lng: number } | null
  onNavigate: NavigateFn
  onFocusListing?: (mapPointId: string | null) => void
  /** The map point id currently isolated — e.g. tapped as a pin on the map —
   *  so the matching hospital button here can highlight + scroll into view. */
  focusedListingId?: string | null
  /** Hospitals' own pin/chip color on the map — painted on the focused
   *  button's highlight, same as CategoryRow does for listing categories. */
  accentColor?: string
  /** Reports the map point ids currently surviving this row's own filters —
   *  lets the map narrow to exactly what's shown here as filters change. */
  onVisibleIdsChange?: (ids: string[]) => void
}

type FilterKey = 'jewishChaplain' | 'bikurCholim' | 'prayerSpace' | 'shabbatAccommodations'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'jewishChaplain', label: 'Chaplain' },
  { key: 'bikurCholim', label: 'Bikkur Cholim' },
  { key: 'prayerSpace', label: 'Prayer space' },
  { key: 'shabbatAccommodations', label: 'Kosher & Shabbos' },
]

function ToggleButton({
  active,
  onClick,
  borderColor,
  children,
}: {
  active: boolean
  onClick: () => void
  borderColor: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={active ? undefined : { borderColor }}
      className={`rounded-full border-2 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
        active ? 'bg-[#df4c73] text-white border-[#df4c73]' : 'bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

// One hospital row — highlights and scrolls into view when it's the facility
// currently isolated on the map beside this list (e.g. a pin was just
// tapped), same as a tapped facility card does in CategoryRow.
function HospitalButton({
  hospital: h,
  focused,
  borderColor,
  accentColor,
  onClick,
}: {
  hospital: Hospital & { miles: number | null }
  focused: boolean
  borderColor: string
  /** Hospitals' own pin/chip color — used for the focused highlight instead
   *  of `borderColor` (which just cycles the general accent palette). Falls
   *  back to the app's general "#df4c73" selected-accent if not passed. */
  accentColor?: string
  onClick: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focused])
  const highlightHex = accentColor ?? '#df4c73'

  return (
    <button
      ref={ref}
      onClick={onClick}
      style={
        focused
          ? { borderColor: highlightHex, backgroundColor: `color-mix(in srgb, ${highlightHex} 10%, white)` }
          : { borderColor }
      }
      className="w-full flex items-center justify-between gap-3 rounded-lg border-2 bg-white px-2.5 py-2 text-left text-xs font-medium text-slate-900 transition-colors cursor-pointer"
    >
      <span>{h.name}</span>
      {h.miles != null && (
        <span className="shrink-0 text-[11px] font-medium text-slate-500">📍 {h.miles} mi</span>
      )}
    </button>
  )
}

/** The Hospital category's search + filters + list, inline in the home page's
 *  sidebar — mirrors HospitalsDirectory's own badges (Chaplain/Bikkur
 *  Cholim/Prayer space/Kosher & Shabbos), turned into real filter toggles. */
export default function HospitalRow({ hospitals, coords, onNavigate, onFocusListing, focusedListingId, accentColor, onVisibleIdsChange }: Props) {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<Set<FilterKey>>(new Set())

  const toggle = (key: FilterKey) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const q = search.trim().toLowerCase()
  const filtered = hospitals
    .filter((h) => !q || h.name.toLowerCase().includes(q))
    .filter((h) => [...active].every((key) => !!h.info?.[key]))
    .map((h) => ({ ...h, miles: coords ? distanceMiles(coords, { lat: h.latitude, lng: h.longitude }) : null }))
    .sort((a, b) => (a.miles != null && b.miles != null ? a.miles - b.miles : a.name.localeCompare(b.name)))

  // Keep the map in sync with whatever this row's own filters currently show
  // — keyed on a stable string, not the array (a fresh reference every
  // render), so this only reports when the actual visible set changes.
  const idsKey = filtered.map((h) => h.id).join(',')
  useEffect(() => {
    onVisibleIdsChange?.(filtered.map((h) => `hospital:${h.id}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => onNavigate('patient', 'find', { findView: 'hospitals' })}
          className="text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          View full page →
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search hospitals…"
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f, i) => (
          <ToggleButton key={f.key} active={active.has(f.key)} onClick={() => toggle(f.key)} borderColor={ACCENT_PALETTE[i % ACCENT_PALETTE.length]}>
            {f.label}
          </ToggleButton>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No hospitals match.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((h, i) => (
            <HospitalButton
              key={h.id}
              hospital={h}
              focused={focusedListingId === `hospital:${h.id}`}
              borderColor={ACCENT_PALETTE[i % ACCENT_PALETTE.length]}
              accentColor={accentColor}
              onClick={() => onFocusListing?.(`hospital:${h.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
