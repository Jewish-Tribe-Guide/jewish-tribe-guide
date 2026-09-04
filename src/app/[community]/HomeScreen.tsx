'use client'

import { Suspense } from 'react'
import Landing from '@/components/Landing'
import LandingConnected from '@/components/LandingConnected'
import { useLocation } from '@/lib/locationContext'
import { useSiteNavigation } from '@/lib/useSiteNavigation'

// The home screen. Desktop is a short gateway (hero, three featured cards, the
// embedded map band, zmanim); mobile is the full card index inline. Landing
// itself owns that split — see its own header comment.
export default function HomeScreen() {
  const { coords, liveTracking, controls } = useLocation()
  const { navigate, openFlow } = useSiteNavigation()

  const landingProps = { onNavigate: navigate, onOpenFlow: openFlow, coords, liveTracking, controls }

  return (
    <div className="flex-1">
      {/* The fallback IS Landing — a full, real render of the home screen with
          no `?at=map`, which is what a plain visit looks like. Nothing in
          this fallback's own tree calls useSearchParams, so it prerenders
          for real instead of shipping as an empty shell; only
          LandingConnected, which supplies the "just collapsed the fullscreen
          map" scroll behavior once hydrated, needs the boundary. */}
      <Suspense fallback={<Landing {...landingProps} scrollTo={null} />}>
        <LandingConnected {...landingProps} />
      </Suspense>
    </div>
  )
}
