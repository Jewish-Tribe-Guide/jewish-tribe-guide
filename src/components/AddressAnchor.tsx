'use client'

import AddressInput from '@/components/intake/AddressInput'

type Props = {
  value: string
  onChange: (address: string) => void
  onCoords: (coords: { lat: number; lng: number } | null) => void
}

// The community-side anchor: an address autocomplete (mirrors the intake address
// fields). The chosen address + coordinates anchor the directory's distance
// sorting, the way the hospital picker anchors it for patients.
export default function AddressAnchor({ value, onChange, onCoords }: Props) {
  return (
    <div className="w-full text-left">
      <label className="block text-sm font-medium text-slate-600 mb-2">
        Enter your address
      </label>
      {/* address-anchor-lg scopes the ::part(input) override in globals.css that
          bumps the autocomplete field to the same height as the hospital picker. */}
      <div className="address-anchor-lg">
        <AddressInput
          value={value}
          onChange={onChange}
          onCoords={onCoords}
          placeholder="Start typing your address…"
        />
      </div>
      <p className="text-xs text-slate-500 mt-2">
        We&apos;ll sort community resources by distance from here.
      </p>
    </div>
  )
}
