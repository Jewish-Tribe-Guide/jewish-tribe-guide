'use client'

import { useSearchParams } from 'next/navigation'
import type { DirectoryResource } from '@/types'
import FindResources from '@/components/FindResources'
import SupportWizard from '@/components/wizard/SupportWizard'
import VolunteerWizard from '@/components/wizard/VolunteerWizard'
import GenericFormWizard from '@/components/wizard/GenericFormWizard'
import { useLocation } from '@/lib/locationContext'
import { useSiteNavigation } from '@/lib/useSiteNavigation'

// The client half of the [slug] route. The server has already decided whether
// this slug is a category or a form (and 404'd if it was neither), so this only
// has to render the right one.
export default function SlugScreen({
  slug,
  kind,
  listings,
}: {
  slug: string
  // 'view' is a fixed screen (hospitals/eruv/zmanim — see FIXED_VIEW_KINDS in
  // routes.ts). It renders through the same branch as 'category' below:
  // FindResources already dispatches those three slugs to their own screen
  // before falling through to a database-backed category.
  kind: 'category' | 'form' | 'view'
  /** The category's listings from the route; null means the read failed. */
  listings: DirectoryResource[] | null
}) {
  const { anchor } = useLocation()
  const { goHome, viewAllCategories, viewMapForCategory } = useSiteNavigation()
  const params = useSearchParams()

  if (kind === 'form') {
    // Pre-checked needs arrive in the query string rather than history state,
    // so a link that opens the form with a need already selected is shareable.
    const preselect = params.get('need')?.split(',').filter(Boolean)

    // The two built-in forms have bespoke wizards; everything else is an
    // admin-created form rendered by the generic one.
    if (slug === 'support') return <SupportWizard preselect={preselect} onClose={goHome} />
    if (slug === 'volunteer') return <VolunteerWizard preselect={preselect} onClose={goHome} />
    return <GenericFormWizard formId={slug} onClose={goHome} />
  }

  return (
    <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 pt-8 pb-24 sm:pt-8 sm:pb-8">
      <FindResources
        view={slug}
        listings={listings}
        anchor={anchor}
        onUp={goHome}
        onViewAllCategories={() => viewAllCategories()}
        onViewMap={viewMapForCategory}
      />
    </main>
  )
}
