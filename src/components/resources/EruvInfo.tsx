import type { EruvRecord } from '@/types'
import UpButton from '@/components/UpButton'

type Props = {
  eruv: EruvRecord
  onUp: () => void
}

export default function EruvInfo({ eruv, onUp }: Props) {
  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />
      <h2 className="text-xl font-semibold text-slate-800 mb-4">Eruv Information</h2>

      <div className="space-y-3">
        {/* Status & Map */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Links</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={eruv.statusLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary-dark transition-colors"
            >
              Check Eruv Status
            </a>
            <a
              href={eruv.mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium border border-primary text-primary rounded-md px-4 py-2 hover:bg-primary hover:text-white transition-colors"
            >
              View Boundary Map
            </a>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">About This Eruv</h3>
          <p className="text-sm text-slate-800">{eruv.notes}</p>
        </div>

        {/* Community Contact */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-4 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Community Contact</h3>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm">
            <span className="font-medium text-slate-900">{eruv.contact.name}</span>
            <span className="hidden sm:inline text-slate-300">·</span>
            <a
              href={`tel:${eruv.contact.phone.replace(/\D/g, '')}`}
              className="text-primary hover:underline"
            >
              {eruv.contact.phone}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
