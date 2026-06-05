import type { Hospital } from '@/types'

type Props = {
  hospitals: Hospital[]
  selectedId: string
  onChange: (id: string) => void
}

export default function HospitalPicker({ hospitals, selectedId, onChange }: Props) {
  return (
    <header className="bg-primary text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h1 className="text-5xl font-bold mb-4">Jewish Patient Connect</h1>
        <p className="text-blue-100 mb-6 text-xl">
          Connecting patients and families with Philadelphia Jewish community resources
        </p>
        <hr className="border-white/30 mb-6" aria-hidden="true" />
        <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
          <label htmlFor="hospital-select" className="text-sm font-medium text-blue-100 whitespace-nowrap">
            Select your hospital
          </label>
          <select
            id="hospital-select"
            value={selectedId}
            onChange={(e) => onChange(e.target.value)}
            className="w-full sm:w-80 rounded-md bg-white text-slate-900 px-3 py-2.5 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  )
}
