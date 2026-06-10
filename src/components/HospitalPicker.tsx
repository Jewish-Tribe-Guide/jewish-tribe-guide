import type { Hospital } from '@/types'

type Props = {
  hospitals: Hospital[]
  selectedId: string
  onChange: (id: string) => void
}

// The patient-side anchor control (label + select). The surrounding branded
// header is provided by SiteHeader.
export default function HospitalPicker({ hospitals, selectedId, onChange }: Props) {
  return (
    <div className="w-full text-left">
      <label htmlFor="hospital-select" className="block text-sm font-medium text-slate-600 mb-2">
        Select your hospital
      </label>
      <select
        id="hospital-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[3.25rem] rounded-md bg-white text-slate-900 px-4 py-3 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {hospitals.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500 mt-2">
        We&apos;ll sort resources by distance and pre-fill your forms with this hospital.
      </p>
    </div>
  )
}
