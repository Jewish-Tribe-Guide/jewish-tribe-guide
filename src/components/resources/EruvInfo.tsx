import type { EruvRecord } from '@/types'
import UpButton from '@/components/UpButton'

type Props = {
  eruvim: EruvRecord[]
  onUp: () => void
}

function ExternalIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 5H5v10h10v-3M12 4h4v4M16 4l-7 7" />
    </svg>
  )
}

function EruvCard({ eruv }: { eruv: EruvRecord }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Status header */}
      <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">{eruv.name}</h3>
        </div>
        <p className="mt-0.5 pl-4 text-xs text-muted">{eruv.area}</p>
        <a
          href={eruv.statusLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Check current status
          <ExternalIcon />
        </a>
        <p className="mt-2 text-xs text-emerald-900/70">
          Status is posted on the eruv&rsquo;s site — always verify right before Shabbos.
        </p>
      </div>

      {/* Location tools */}
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row">
        {eruv.checkerLink && (
          <a
            href={eruv.checkerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Is my location in the eruv?
            <ExternalIcon />
          </a>
        )}
        {eruv.mapLink && (
          <a
            href={eruv.mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-white"
          >
            View boundary map
            <ExternalIcon />
          </a>
        )}
      </div>

      {/* Notes */}
      <div className="px-4 pb-4">
        <p className="text-sm text-slate-700">{eruv.notes}</p>
        {eruv.subscribeLink && (
          <a
            href={eruv.subscribeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Get status updates by email
            <ExternalIcon />
          </a>
        )}
      </div>
    </div>
  )
}

export default function EruvInfo({ eruvim, onUp }: Props) {
  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />
      <h2 className="text-xl font-semibold text-slate-800 mb-1">Eruv Information</h2>
      <p className="mb-4 text-sm text-muted">
        Check the current status of the Philadelphia-area eruvim before Shabbos.
      </p>

      <div className="space-y-4">
        {eruvim.map((eruv) => (
          <EruvCard key={eruv.id} eruv={eruv} />
        ))}
      </div>
    </div>
  )
}
