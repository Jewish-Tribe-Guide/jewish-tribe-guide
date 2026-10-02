'use client'

import { PinnedList } from '@/components/home/PinnedPlaces'
import { useActiveCommunity } from '@/lib/communityContext'
import { useLocation } from '@/lib/locationContext'
import { useNow } from '@/lib/useNow'

/** The Pinned page's client half: distances from the visitor's location,
 *  else the community's centre, as on every list. */
export default function PinnedScreen() {
  const { community } = useActiveCommunity()
  const { coords } = useLocation()
  const now = useNow()
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 desktop:max-w-5xl desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]">
      <PinnedList communitySlug={community.slug} from={coords ?? community.mapCenter} now={now} />
    </main>
  )
}
