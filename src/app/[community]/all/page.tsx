import { Suspense } from 'react'
import type { Metadata } from 'next'
import AllCategoriesScreen from './AllCategoriesScreen'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'

// Self-referencing canonical — see [community]/page.tsx's comment.
export async function generateMetadata(props: PageProps<'/[community]/all'>): Promise<Metadata> {
  const { community } = await props.params
  return { alternates: { canonical: `${siteUrl()}${routes.allCategories(community)}` } }
}

// The full card index. Split off the desktop home screen so that screen can
// stay short; mobile still renders the same grid inline on its home screen, so
// in practice this is a desktop page — but it isn't gated to desktop, because a
// phone that lands on this URL should get a working page rather than a blank
// one.
export default function AllCategoriesPage() {
  return (
    <Suspense fallback={<div className="flex-1 pt-8" />}>
      <AllCategoriesScreen />
    </Suspense>
  )
}
