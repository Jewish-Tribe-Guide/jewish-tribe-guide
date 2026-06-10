'use client'

import type { Audience, Hospital } from '@/types'
import AddressInput from '@/components/intake/AddressInput'

export type AnchorControls = {
  audience: Audience
  hospitals: Hospital[]
  selectedHospitalId: string
  onHospitalChange: (id: string) => void
  address: string
  onAddressChange: (address: string) => void
  onCoords: (coords: { lat: number; lng: number } | null) => void
}

type Props = AnchorControls & {
  /** Short label shown before the control, e.g. "Distances from" or "Pre-filling for" */
  label: string
}

export default function AnchorBar({
  audience,
  hospitals,
  selectedHospitalId,
  onHospitalChange,
  address,
  onAddressChange,
  onCoords,
  label,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      {audience === 'patient' ? (
        <div className="relative">
          <select
            value={selectedHospitalId}
            onChange={(e) => onHospitalChange(e.target.value)}
            className="appearance-none text-sm text-slate-700 bg-white border border-slate-300 rounded-md pl-2.5 pr-6 py-1 cursor-pointer hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400"
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      ) : (
        <div className="w-56">
          <AddressInput
            value={address}
            onChange={onAddressChange}
            onCoords={onCoords}
            placeholder="Enter your address"
          />
        </div>
      )}
    </div>
  )
}
