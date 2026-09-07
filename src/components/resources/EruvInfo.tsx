import type { EruvRecord } from '@/types'
import Breadcrumb from '@/components/Breadcrumb'
import { ExternalIcon } from '@/components/icons'
import { community } from '@/community.config'
import { useSetScreenHeader } from '@/lib/headerVisibility'

type Props = {
  eruvim: EruvRecord[]
  onUp: () => void
  /** What `onUp` actually goes to — "Home" on mobile (the home grid IS the
   *  index there), "All resources" on desktop (a separate index page). See
   *  FindResources' upToAllResources, which this mirrors. */
  upLabel?: string
  /** The category's own (admin-editable) name — falls back to the historical
   *  copy while categories are still loading. */
  title?: string
}

function EruvCard({ eruv }: { eruv: EruvRecord }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
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

export default function EruvInfo({ eruvim, onUp, upLabel = 'All resources', title = 'Eruv Information' }: Props) {
  // Puts "‹ {title}" in SiteHeader on mobile — see GenericDirectory's
  // identical call, which this mirrors now that this screen has the same gap
  // it used to (its own mobile UpButton, no header title).
  useSetScreenHeader(true, title, onUp)

  return (
    <div>
      {/* Breadcrumb (desktop only) names the same destination the header's
          "‹ {title}" now covers on mobile — see Breadcrumb's own doc for why
          only one of the two ever shows at a time. */}
      <Breadcrumb upLabel={upLabel} onUp={onUp} title={title} />
      <h2 className="text-xl font-semibold text-slate-800 mb-1 sr-only desktop:not-sr-only">{title}</h2>
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
