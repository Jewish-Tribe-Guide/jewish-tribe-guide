'use client'

import { useSearchParams } from 'next/navigation'
import Landing from '@/components/Landing'
import { useLocation } from '@/lib/locationContext'
import { useSiteNavigation } from '@/lib/useSiteNavigation'

// The home screen. Desktop is a short gateway (hero, three featured cards, the
// embedded map band, zmanim); mobile is the full card index inline. Landing
// itself owns that split — see its own header comment.
export default function HomeScreen() {
  const { coords, liveTracking } = useLocation()
  const { navigate, openFlow, viewAllCategories } = useSiteNavigation()
  const params = useSearchParams()

  return (
    <div className="flex-1">
      <Landing
        onNavigate={navigate}
        onOpenFlow={openFlow}
        onViewAllCategories={viewAllCategories}
        coords={coords}
        liveTracking={liveTracking}
        // Set when the visitor got here by collapsing the fullscreen map, so
        // the collapse reads as zooming out to the map band rather than being
        // dropped at the top of an unrelated page. A query param rather than
        // history state: it survives a reload, and it's visible in the URL
        // instead of hiding in an object only this app can read.
        scrollTo={params.get('at') === 'map' ? 'map' : null}
      />
    </div>
  )
}
