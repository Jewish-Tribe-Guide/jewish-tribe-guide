'use client'

import { useEffect, useRef, useState } from 'react'
import AddressInput from '@/components/intake/AddressInput'
import type { Audience, Hospital } from '@/types'

export type LocationControls = {
  hospitals: Hospital[]
  selectedHospitalId: string
  onHospitalChange: (id: string) => void
  address: string
  onAddressChange: (address: string) => void
  onCoords: (coords: { lat: number; lng: number } | null) => void
}

type Props = {
  audience: Audience | null
  controls: LocationControls
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 21c-4.4-3.9-7-7.4-7-10.8A7 7 0 0 1 12 3a7 7 0 0 1 7 7.2c0 3.4-2.6 6.9-7 10.8z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}

// Header pill that anchors all distance sorting: patients pick their hospital,
// community members type an address (powers the directory's proximity filtering).
export default function LocationControl({ audience, controls }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking anywhere outside the popover.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const hospital = controls.hospitals.find((h) => h.id === controls.selectedHospitalId)
  const label =
    audience === 'community'
      ? controls.address || 'Enter address'
      : audience === 'patient'
        ? hospital?.name ?? 'Choose hospital'
        : 'Set location'

  const showHospital = audience === 'patient' || audience === null
  const showAddress = audience === 'community' || audience === null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1.5 pl-2.5 pr-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md cursor-pointer"
      >
        <PinIcon className="h-4 w-4 shrink-0 text-primary" />
        <span className="hidden truncate md:block">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl shadow-slate-900/10">
          <p className="text-sm font-semibold text-slate-900">
            Where should distances be measured from?
          </p>

          {showHospital && (
            <div className="mt-3">
              <label htmlFor="location-hospital" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                {audience === null ? 'Patients — your hospital' : 'Your hospital'}
              </label>
              <div className="relative">
                <select
                  id="location-hospital"
                  value={controls.selectedHospitalId}
                  onChange={(e) => controls.onHospitalChange(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {controls.hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400"
                  fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {showAddress && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                {audience === null ? 'Community — your address' : 'Your address'}
              </label>
              <AddressInput
                value={controls.address}
                onChange={controls.onAddressChange}
                onCoords={controls.onCoords}
                placeholder="Enter your address"
              />
            </div>
          )}

          <button
            onClick={() => setOpen(false)}
            className="mt-4 w-full cursor-pointer rounded-lg bg-primary py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
