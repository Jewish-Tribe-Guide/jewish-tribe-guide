'use client'

import ZmanimBody from '@/components/ZmanimBody'
import DirectoryHeader from '@/components/resources/DirectoryHeader'
import { CategoryBandFrame, CategoryBandBadge } from '@/components/resources/CategoryBandFrame'
import { CategoryGlyph } from '@/lib/categoryIcons'
import { useZmanim } from '@/lib/useZmanim'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'

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
  /** This pseudo-category's own icon/color/photo — see CategoryConfig. Falls
   *  back to a neutral slate (matching getCategoryColor's own fallback) and
   *  no icon while categories are still loading, same as `title` above. */
  icon?: string
  color?: string
  cardImageUrl?: string | null
}

export default function ZmanimCard({ coords, locationLabel, onUp, upLabel = 'All resources', title = 'Zmanim & Shabbos', icon, color = '#64748b', cardImageUrl }: Props) {
  const { data, status } = useZmanim(coords)

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
    <CategoryBandFrame color={color} imageUrl={cardImageUrl}>
      {/* Mobile used to have its own "‹ {upLabel}" row here — see
          GenericDirectory's identical comment on why it doesn't need one now
          that useSetScreenHeader puts the same "‹ {title}" in SiteHeader. */}
      <DirectoryHeader title={title} anchorLabel={locationLabel} upLabel={upLabel} onUp={onUp} titleInHeader banner={banner} />

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <ZmanimBody data={data} status={status} />
      </section>
    </CategoryBandFrame>
  )
}
