'use client'

import Landing from '@/components/Landing'
import { useLocation } from '@/lib/locationContext'
import { useSiteNavigation } from '@/lib/useSiteNavigation'

// The home screen. Desktop is a short gateway (hero, five featured cards,
// zmanim); mobile is the full card index inline. Landing itself owns that
// split — see its own header comment.
//
// A plain render, no Suspense/useSearchParams boundary — that used to exist
// (via LandingConnected) purely to read `?at=map` for the now-retired
// embedded map band. Nothing under Landing reads the query string any more,
// so this prerenders for real with no fallback shell to flash first.
export default function HomeScreen() {
  const { coords } = useLocation()
  const { navigate, openFlow } = useSiteNavigation()

  return (
    <div className="flex-1">
      <Landing onNavigate={navigate} onOpenFlow={openFlow} coords={coords} />
    </div>
  )
}
