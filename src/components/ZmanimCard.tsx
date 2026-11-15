'use client'

import ZmanimBody from '@/components/ZmanimBody'
import type { TimesAsk } from '@/lib/ask'
import DirectoryHeader from '@/components/resources/DirectoryHeader'
import { CategoryBandFrame, HeroTitle } from '@/components/resources/CategoryBandFrame'
import { PinIcon } from '@/components/icons'
import { useZmanim } from '@/lib/useZmanim'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'
import { useNow } from '@/lib/useNow'

type Props = {
  /** Coordinates to compute zmanim for — the visitor's typed address, or the
   *  community's configured center. Timezone comes from community.config. */
  coords?: { lat: number; lng: number } | null
  /** Subtitle shown under the heading — the visitor's location or community name. */
  locationLabel: string
  onUp: () => void
  /** The category's own (admin-editable) name — falls back to the historical
   *  copy while categories are still loading. */
  title?: string
  /** This pseudo-category's own icon/color/photo — see CategoryConfig. Falls
   *  back to a neutral slate (matching getCategoryColor's own fallback) and
   *  no icon while categories are still loading, same as `title` above. */
  icon?: string
  color?: string
  bandImageUrl?: string | null
  /** The time a search asked for (`?time=candles`), picked out. */
  picked?: TimesAsk | null
}

export default function ZmanimCard({ coords, locationLabel, onUp, title = 'Zmanim & Shabbos', color = '#64748b', bandImageUrl, picked = null }: Props) {
  const { data, status } = useZmanim(coords)
  const now = useNow()

  // Puts "‹ {title}" in SiteHeader on mobile — see GenericDirectory's
  // identical call, which this mirrors now that this screen has the same gap
  // it used to (its own mobile UpButton, no header title).
  useSetScreenHeader(true, title, onUp)
  const isMobile = useIsMobile()

  // A computer's top is the category pages' photo with the title on it
  // (board H4; the user, Nov 15: this page still had the old band). A
  // phone's is the site header's ‹ {title} (useSetScreenHeader).
  return (
    <CategoryBandFrame
      color={color}
      imageUrl={bandImageUrl}
      hero={
        <HeroTitle
          title={title}
          line={
            <>
              <PinIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {locationLabel}
            </>
          }
        />
      }
    >
      {isMobile && <DirectoryHeader title={title} anchorLabel={locationLabel} titleInHeader />}
      {/* The photo's 44px, then the times, as a category's list sits under it. */}
      <div aria-hidden="true" className="hidden h-8 desktop:block" />

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        {/* ZmanimBody's sub-headings are h3s, written to sit under a caller's own
            h2. This page's only heading above them is the h1, so without this
            they skip a level (axe: heading-order). Screen-reader-only: the h1
            already says the same thing visibly. */}
        <h2 className="sr-only">Times and Shabbos</h2>
        <ZmanimBody data={data} status={status} now={now} picked={picked} />
      </section>
    </CategoryBandFrame>
  )
}
