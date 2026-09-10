import type { EruvRecord } from '@/types'
import DirectoryHeader from './DirectoryHeader'
import { CategoryBandFrame, CategoryBandBadge } from './CategoryBandFrame'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { ExternalIcon } from '@/components/icons'
import { community } from '@/community.config'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'

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
  /** This pseudo-category's own icon/color/photo — see CategoryConfig. Falls
   *  back to a neutral slate (matching getCategoryColor's own fallback) and
   *  no icon while categories are still loading, same as `title` above. */
  icon?: string
  color?: string
  bandImageUrl?: string | null
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

export default function EruvInfo({ eruvim, onUp, upLabel = 'All resources', title = 'Eruv Information', icon, color = '#64748b', bandImageUrl }: Props) {
  // Puts "‹ {title}" in SiteHeader on mobile — see GenericDirectory's
  // identical call, which this mirrors now that this screen has the same gap
  // it used to (its own mobile UpButton, no header title).
  useSetScreenHeader(true, title, onUp)
  const isMobile = useIsMobile()

  const banner = !isMobile && icon ? (
    <CategoryBandBadge color={color}>
      <CategoryGlyph categoryId={undefined} icon={icon} className="h-[55%] w-[55%]" />
    </CategoryBandBadge>
  ) : null

  return (
    <CategoryBandFrame color={color} imageUrl={bandImageUrl}>
      {/* Mobile used to have its own "‹ {upLabel}" row here — see
          GenericDirectory's identical comment on why it doesn't need one now
          that useSetScreenHeader puts the same "‹ {title}" in SiteHeader. */}
      <DirectoryHeader title={title} upLabel={upLabel} onUp={onUp} titleInHeader banner={banner} />
      <p className="mb-4 text-sm text-muted">
        Check the current status of the {community.region}-area eruvim before Shabbos.
      </p>

      <div className="space-y-3">
        {eruvim.map((eruv) => (
          <EruvCard key={eruv.id} eruv={eruv} />
        ))}
      </div>
    </CategoryBandFrame>
  )
}
