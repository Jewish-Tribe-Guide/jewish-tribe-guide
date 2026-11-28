'use client'

import { useState } from 'react'
import MobileSheet from '@/components/resources/MobileSheet'

// ── Places' filters on a phone (board l06, Nov 28) ──────────────────────────
// The four menus don't fit beside Add on a phone, so one Filters button
// (with how many are narrowing) opens them in a sheet, each under its name.
// What's picked there is a draft until "Show N places", which counts as
// you pick.

export type PlacesMenu = { key: string; name: string; value: string; options: { value: string; label: string; count?: number }[] }

/** A choice's label with its count: "Minyan times (13)". */
const text = (o: PlacesMenu['options'][number]) => (o.count === undefined ? o.label : `${o.label} (${o.count})`)

export function FiltersButton({ narrowing, onClick }: { narrowing: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={`flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-[10px] border pl-3 pr-3.5 text-[0.8125rem] font-semibold ${
        narrowing ? 'border-primary bg-blue-50 text-primary' : 'border-slate-300 bg-white text-slate-900'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
      </svg>
      {narrowing ? `Filters · ${narrowing}` : 'Filters'}
    </button>
  )
}

/** `menus` and `count` answer for a draft (`picked`, by menu key). */
export function PlacesFiltersSheet({
  start,
  menus,
  count,
  onShow,
  onClose,
}: {
  start: Record<string, string>
  menus: (picked: Record<string, string>) => PlacesMenu[]
  count: (picked: Record<string, string>) => number
  onShow: (picked: Record<string, string>) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState(start)
  const n = count(picked)
  return (
    <MobileSheet isOpen onClose={onClose} title="Filters">
      <div className="flex flex-col gap-3">
        {menus(picked).map((m) => {
          const narrowed = m.value !== m.options[0]?.value
          return (
            <label key={m.key} className="flex flex-col gap-1.5 text-[0.8125rem] font-semibold text-slate-900">
              {m.name}
              <select
                aria-label={m.name}
                value={m.value}
                onChange={(e) => setPicked((p) => ({ ...p, [m.key]: e.target.value }))}
                className={`h-12 w-full cursor-pointer rounded-[10px] border px-3 text-[0.9375rem] ${narrowed ? 'border-primary bg-blue-50 font-semibold text-primary' : 'border-slate-300 bg-white font-normal text-slate-900'}`}
              >
                {m.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {text(o)}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
        <button type="button" onClick={() => onShow(picked)} className="mt-1 flex h-12 w-full cursor-pointer items-center justify-center rounded-[10px] bg-primary text-[0.9375rem] font-semibold text-white hover:bg-primary-dark">
          Show {n} {n === 1 ? 'place' : 'places'}
        </button>
      </div>
    </MobileSheet>
  )
}
