import type { EruvRecord } from '@/types'
import UpButton from '@/components/UpButton'
import { ExternalIcon } from '@/components/icons'
import { community } from '@/community.config'

type Props = {
  eruvim: EruvRecord[]
  onUp: () => void
  /** The category's own (admin-editable) name — falls back to the historical
   *  copy while categories are still loading. */
  title?: string
}

function EruvCard({ eruv }: { eruv: EruvRecord }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm sm:border-2 sm:border-slate-300 sm:shadow-none">
      <h3 className="text-sm font-semibold text-slate-900">{eruv.name}</h3>
      <p className="text-xs text-muted mb-2">{eruv.area}</p>
      <p className="text-sm text-slate-700">{eruv.notes}</p>

      <a
        href={eruv.statusLink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
      >
        Check status &amp; boundary map
        <ExternalIcon />
      </a>
    </div>
  )
}

export default function EruvInfo({ eruvim, onUp, title = 'Eruv Information' }: Props) {
  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />
      <h2 className="text-xl font-semibold text-slate-800 mb-1">{title}</h2>
      <p className="mb-4 text-sm text-muted">
        Check the current status of the {community.region}-area eruvim before Shabbos.
      </p>

      <div className="space-y-3">
        {eruvim.map((eruv) => (
          <EruvCard key={eruv.id} eruv={eruv} />
        ))}
      </div>
    </div>
  )
}
