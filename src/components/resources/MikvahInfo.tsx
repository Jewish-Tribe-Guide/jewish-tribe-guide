import type { MikvahEntry } from '@/types'

type Props = {
  items: MikvahEntry[]
  onBack: () => void
}

export default function MikvahInfo({ items, onBack }: Props) {
  const sorted = [...items].sort((a, b) => a.distance - b.distance)

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <h2 className="text-xl font-semibold text-slate-800 mb-4">Mikvah</h2>

      {sorted.length === 0 ? (
        <p className="text-muted text-sm">No mikvah listings for this hospital yet.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((m) => (
            <div key={m.id} className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-slate-900 text-sm">{m.name}</p>
                <span className="text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
                  {m.distance} mi
                </span>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex flex-col sm:flex-row sm:gap-2">
                  <dt className="text-xs font-medium text-muted w-20 shrink-0">Address</dt>
                  <dd className="text-slate-800">{m.address}</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:gap-2">
                  <dt className="text-xs font-medium text-muted w-20 shrink-0">Phone</dt>
                  <dd>
                    <a href={`tel:${m.phone.replace(/\D/g, '')}`} className="text-primary hover:underline text-sm">
                      {m.phone}
                    </a>
                  </dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:gap-2">
                  <dt className="text-xs font-medium text-muted w-20 shrink-0">Hours</dt>
                  <dd className="text-slate-800">{m.hours}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(m.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors"
                >
                  Directions
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
