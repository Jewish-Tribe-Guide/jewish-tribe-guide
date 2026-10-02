'use client'

import BrowseAll from '@/components/home/BrowseAll'
import { useActiveCommunity, useCommunityTimezone } from '@/lib/communityContext'
import { useAllListings } from '@/lib/useAllListings'
import { useLocation } from '@/lib/locationContext'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { useZmanim } from '@/lib/useZmanim'

/** The Browse page's client half: the clock, the minyanim and the zmanim its
 *  live lines read. */
export default function BrowseScreen() {
  const { community } = useActiveCommunity()
  const timezone = useCommunityTimezone()
  const { coords } = useLocation()
  const listings = useAllListings()
  const schedule = useMinyanSchedule(coords)
  // The same request the minyan schedule makes (same place, so one fetch).
  const zmanim = useZmanim(coords ?? community.mapCenter)
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 desktop:max-w-5xl desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]">
      <BrowseAll communitySlug={community.slug} listings={listings} schedule={schedule} zmanim={zmanim.data} timezone={timezone} coords={coords} center={community.mapCenter} />
    </main>
  )
}
