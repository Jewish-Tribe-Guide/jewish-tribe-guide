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
        <div className="mx-auto w-full sm:w-[28rem] text-left">
          <label htmlFor="hospital-select" className="block text-sm font-medium text-blue-100 mb-2">
            Select your hospital
          </label>
          <select
            id="hospital-select"
            value={selectedId}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md bg-white text-slate-900 px-4 py-3 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
