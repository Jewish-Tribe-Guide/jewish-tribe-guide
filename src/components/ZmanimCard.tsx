'use client'

import Breadcrumb from '@/components/Breadcrumb'
import ZmanimBody from '@/components/ZmanimBody'
import { useZmanim } from '@/lib/useZmanim'
import { useSetScreenHeader } from '@/lib/headerVisibility'

type Props = {
  /** Coordinates to compute zmanim for — the visitor's typed address, or the
   *  community's configured center. Timezone comes from community.config. */
  coords?: { lat: number; lng: number } | null
  /** Subtitle shown under the heading — the visitor's location or community name. */
  locationLabel: string
  onUp: () => void
  /** What `onUp` actually goes to — "Home" on mobile (the home grid IS the
   *  index there), "All resources" on desktop (a separate index page). See
   *  FindResources' upToAllResources, which this mirrors. */
  upLabel?: string
  /** The category's own (admin-editable) name — falls back to the historical
   *  copy while categories are still loading. */
  title?: string
}

export default function ZmanimCard({ coords, locationLabel, onUp, upLabel = 'All resources', title = 'Zmanim & Shabbos' }: Props) {
  const { data, status } = useZmanim(coords)

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

      {/* Heading */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800 sr-only desktop:not-sr-only">{title}</h2>
        <p className="text-sm text-muted mt-0.5">{locationLabel}</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <ZmanimBody data={data} status={status} />
      </section>
    </div>
  )
}
