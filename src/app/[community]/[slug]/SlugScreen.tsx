'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { DirectoryResource } from '@/types'
import FindResources from '@/components/FindResources'
import FindResourcesConnected from '@/components/FindResourcesConnected'
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
  initialItemId,
}: {
  slug: string
  // 'view' is a fixed screen (hospitals/eruv/zmanim — see FIXED_VIEW_KINDS in
  // routes.ts). It renders through the same branch as 'category' below:
  // FindResources already dispatches those three slugs to their own screen
  // before falling through to a database-backed category.
  kind: 'category' | 'form' | 'view'
  /** The category's listings from the route; null means the read failed. */
  listings: DirectoryResource[] | null
  /** Mount with this listing already expanded — set by the [id] route (a
   *  single listing's own canonical URL), which has no `?item=` in its own
   *  address bar to read this from. A plain `/community/slug` visit has no
   *  such id, and falls back to the `?item=` query param inside
   *  FindResources, same as before this existed. */
  initialItemId?: string
}) {
  const { anchor } = useLocation()
  const { goHome, viewMapForCategory } = useSiteNavigation()

  if (kind === 'form') return <FormScreen slug={slug} goHome={goHome} />

  // Not read directly by this component — see FindResourcesConnected, which
  // is what actually supplies ?item=/?q=/?hospital=/?form= once hydrated.
  // Building the shared props once, rather than inline in both JSX spots
  // below, is what makes the fallback and the live render provably the same
  // component call with the same props (modulo the query-string ones).
  const findResourcesProps = {
    view: slug,
    listings,
    anchor,
    initialItemId,
    onUp: goHome,
    onViewMap: viewMapForCategory,
  }

  return (
    // max-w-6xl, not max-w-4xl: matches the header and home screen — this
    // was the one screen still narrower than the rest of the site for no
    // reason tied to its own content, and the desktop card grid (see
    // GenericDirectory) was being squeezed into that narrower box along
    // with everything else.
    <main className="flex flex-1 flex-col w-full max-w-6xl mx-auto px-4 pt-8 pb-24 sm:pt-8 sm:pb-8">
      {/* The fallback IS FindResources — a full, real render of this category
          with no query-string state, which is exactly what a plain
          /community/slug visit (no ?item=/?q=/etc.) looks like. That's what
          lets this prerender for real: nothing in this fallback's own tree
          calls useSearchParams, so it isn't deferred behind the boundary the
          way the whole thing used to be — only FindResourcesConnected,
          which supplies the query-string-driven refinements (an expanded
          card, an open form, …) once the page has hydrated, is. */}
      <Suspense fallback={<FindResources {...findResourcesProps} />}>
        <FindResourcesConnected {...findResourcesProps} />
      </Suspense>
    </main>
  )
}

// Reads ?need=/?from= — kept in its own component, rendered only for
// kind === 'form', rather than at SlugScreen's own top level: calling
// useSearchParams() there would poison the category/view branch's render
// too (see useSearchParams' own "Prerendering" docs — it defers the whole
// Client Component tree from the nearest Suspense boundary down, not just
// the part that reads it), even though a form and a category never share a
// request. Still covered by the outer Suspense boundary in page.tsx, same
// as before — forms aren't part of today's server-rendering fix.
function FormScreen({
  slug,
  goHome,
}: {
  slug: string
  goHome: () => void
}) {
  const params = useSearchParams()
  // Pre-checked needs arrive in the query string rather than history state,
  // so a link that opens the form with a need already selected is shareable.
  const preselect = params.get('need')?.split(',').filter(Boolean)

  // The two built-in forms have bespoke wizards; everything else is an
  // admin-created form rendered by the generic one.
  if (slug === 'support') return <SupportWizard preselect={preselect} onClose={goHome} />
  if (slug === 'volunteer') return <VolunteerWizard preselect={preselect} onClose={goHome} />
  return <GenericFormWizard formId={slug} onClose={goHome} />
}
