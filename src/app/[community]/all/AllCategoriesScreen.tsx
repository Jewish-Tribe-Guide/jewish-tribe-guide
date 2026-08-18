'use client'

import { useSearchParams } from 'next/navigation'
import AllCategories from '@/components/AllCategories'
import { useSiteNavigation } from '@/lib/useSiteNavigation'

// Which section to scroll to is a query param (/philly/all?section=Food) rather
// than a field in history state, so a link to one section of the index is
// shareable and survives a reload.
export default function AllCategoriesScreen() {
  const { navigate, openFlow, goHome } = useSiteNavigation()
  const params = useSearchParams()

  return (
    <div className="flex-1 pt-8">
      <AllCategories
        onNavigate={navigate}
        onOpenFlow={(kind, preselect) => openFlow(kind, preselect, 'all')}
        onUp={goHome}
        scrollToSection={params.get('section')}
      />
    </div>
  )
}
